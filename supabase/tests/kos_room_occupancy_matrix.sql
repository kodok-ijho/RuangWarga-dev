-- Test Suite: Kos Room Occupancy on Approval Matrix (Task KOS-1F.6a)
-- Date: 2026-10-21
-- Ref: docs/handoff/KOS-1F.md § KOS-1F.6a
--
-- File ini memvalidasi trigger trg_sync_kos_room_occupancy pada public.tenant_members:
-- 1. Kasus 1: Anggota pending dengan Kamar A disetujui -> Kamar A status 'occupied', metadata.tenant_member_id = anggota
-- 2. Kasus 2: Anggota kedua disetujui di Kamar A yang sudah occupied -> metadata.tenant_member_id tetap anggota pertama
-- 3. Kasus 3: Kamar inactive tidak berubah meskipun anggota disetujui
-- 4. Kasus 4: Tenant rt_rw -> unit tetap 'active' (tidak terpengaruh aturan kos)
-- 5. Kasus 5: checkout_kos_room dipanggil -> kamar vacant, lalu persetujuan ulang anggota lain -> occupied lagi

BEGIN;

DO $$
DECLARE
  -- Identitas Pengguna Auth
  v_owner_kos      UUID := gen_random_uuid();
  v_owner_rtrw     UUID := gen_random_uuid();
  v_user_1         UUID := gen_random_uuid();
  v_user_2         UUID := gen_random_uuid();
  v_user_3         UUID := gen_random_uuid();
  v_user_rtrw      UUID := gen_random_uuid();

  -- Identitas Tenant
  v_tenant_kos     UUID;
  v_tenant_rtrw    UUID;

  -- Unit IDs (tipe BIGINT)
  v_room_a_id      BIGINT;
  v_room_b_id      BIGINT;
  v_house_1_id     BIGINT;

  -- Base Roles
  v_role_kos_id    UUID;
  v_role_rtrw_id   UUID;

  -- Member IDs
  v_member_1_id    UUID;
  v_member_2_id    UUID;
  v_member_3_id    UUID;
  v_member_rtrw_id UUID;

  -- Variabel assertion
  v_unit_status    TEXT;
  v_assigned_mem   UUID;
  v_checkout_res   JSONB;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: KOS ROOM OCCUPANCY MATRIX (KOS-1F.6a)';
  RAISE NOTICE '============================================================';

  -- ==============================================================================
  -- 1. SETUP DATA UJI (FIXTURES)
  -- ==============================================================================
  RAISE NOTICE '[SETUP] Mempersiapkan auth users, tenant kos & rtrw, unit, dan roles...';

  -- 1.1 Auth Users
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_kos,  'ownerkos_test@test.invalid',  'authenticated', 'authenticated'),
    (v_owner_rtrw, 'ownerrtrw_test@test.invalid', 'authenticated', 'authenticated'),
    (v_user_1,     'user1_test@test.invalid',     'authenticated', 'authenticated'),
    (v_user_2,     'user2_test@test.invalid',     'authenticated', 'authenticated'),
    (v_user_3,     'user3_test@test.invalid',     'authenticated', 'authenticated'),
    (v_user_rtrw,  'userrtrw_test@test.invalid',  'authenticated', 'authenticated');

  -- 1.2 Tenant Kos & RT/RW (Owner member dibuat otomatis oleh trigger trg_tenant_owner_member)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kos Harapan Bangsa', 'kos', v_owner_kos)
  RETURNING id INTO v_tenant_kos;

  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('RT 05 Kompleks Harmoni', 'rt_rw', v_owner_rtrw)
  RETURNING id INTO v_tenant_rtrw;

  -- 1.3 Ambil Base Role
  SELECT id INTO v_role_kos_id FROM public.tenant_roles WHERE tenant_id = v_tenant_kos AND is_base_role = true LIMIT 1;
  SELECT id INTO v_role_rtrw_id FROM public.tenant_roles WHERE tenant_id = v_tenant_rtrw AND is_base_role = true LIMIT 1;

  -- 1.4 Kamar di Tenant Kos
  -- Kamar A (vacant)
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar 101', 'vacant', '{}'::jsonb)
  RETURNING id INTO v_room_a_id;

  -- Kamar B (inactive)
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar 102', 'inactive', '{}'::jsonb)
  RETURNING id INTO v_room_b_id;

  -- Rumah di Tenant RT/RW (active)
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_rtrw, 'Blok A/1', 'active', '{}'::jsonb)
  RETURNING id INTO v_house_1_id;

  -- ==============================================================================
  -- KASUS 1: Anggota pending dengan Kamar A disetujui -> Kamar A 'occupied', tenant_member_id = anggota
  -- ==============================================================================
  RAISE NOTICE '[KASUS 1] Menguji persetujuan anggota pending pada Kamar A (vacant)...';

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_user_1, 'Penyewa Pertama', 'pending', false, v_room_a_id, v_role_kos_id)
  RETURNING id INTO v_member_1_id;

  -- Sebelum disetujui: status kamar tetap vacant
  SELECT status INTO v_unit_status FROM public.tenant_units WHERE id = v_room_a_id;
  IF v_unit_status <> 'vacant' THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: status kamar sebelum approval harus vacant, didapat %', v_unit_status;
  END IF;

  -- Setujui anggota 1
  UPDATE public.tenant_members
  SET status = 'approved'
  WHERE id = v_member_1_id;

  -- Verifikasi Kamar A menjadi occupied dan mencatat tenant_member_id
  SELECT status, (metadata->>'tenant_member_id')::uuid
  INTO v_unit_status, v_assigned_mem
  FROM public.tenant_units
  WHERE id = v_room_a_id;

  IF v_unit_status <> 'occupied' THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: status kamar setelah approval harus occupied, didapat %', v_unit_status;
  END IF;

  IF v_assigned_mem <> v_member_1_id THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: metadata tenant_member_id harus %, didapat %', v_member_1_id, v_assigned_mem;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 1 berhasil (Kamar A occupied dan tercatat member_id)!';

  -- ==============================================================================
  -- KASUS 2: Anggota kedua disetujui di Kamar A yang sudah occupied -> tenant_member_id tetap anggota pertama
  -- ==============================================================================
  RAISE NOTICE '[KASUS 2] Menguji anggota kedua yang disetujui di Kamar A yang sudah occupied...';

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_user_2, 'Penyewa Kedua', 'pending', false, v_room_a_id, v_role_kos_id)
  RETURNING id INTO v_member_2_id;

  -- Setujui anggota kedua
  UPDATE public.tenant_members
  SET status = 'approved'
  WHERE id = v_member_2_id;

  -- Verifikasi Kamar A tetap occupied dan tenant_member_id TIDAK ditimpa (tetap member 1)
  SELECT status, (metadata->>'tenant_member_id')::uuid
  INTO v_unit_status, v_assigned_mem
  FROM public.tenant_units
  WHERE id = v_room_a_id;

  IF v_unit_status <> 'occupied' THEN
    RAISE EXCEPTION 'KASUS 2 GAGAL: status kamar harus tetap occupied, didapat %', v_unit_status;
  END IF;

  IF v_assigned_mem <> v_member_1_id THEN
    RAISE EXCEPTION 'KASUS 2 GAGAL: tenant_member_id ditimpa! Seharusnya tetap %, didapat %', v_member_1_id, v_assigned_mem;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 2 berhasil (Kamar A tidak tertimpa oleh penyewa kedua)!';

  -- ==============================================================================
  -- KASUS 3: Kamar inactive tidak berubah meskipun anggota disetujui
  -- ==============================================================================
  RAISE NOTICE '[KASUS 3] Menguji persetujuan anggota pada Kamar B (inactive)...';

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_user_3, 'Penyewa Ketiga', 'pending', false, v_room_b_id, v_role_kos_id)
  RETURNING id INTO v_member_3_id;

  -- Setujui anggota ketiga
  UPDATE public.tenant_members
  SET status = 'approved'
  WHERE id = v_member_3_id;

  -- Verifikasi Kamar B tetap inactive
  SELECT status INTO v_unit_status FROM public.tenant_units WHERE id = v_room_b_id;
  IF v_unit_status <> 'inactive' THEN
    RAISE EXCEPTION 'KASUS 3 GAGAL: kamar inactive berubah status menjadi %', v_unit_status;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 3 berhasil (Kamar inactive tetap inactive)!';

  -- ==============================================================================
  -- KASUS 4: Tenant rt_rw -> unit tetap 'active'
  -- ==============================================================================
  RAISE NOTICE '[KASUS 4] Menguji persetujuan anggota pada tenant RT/RW...';

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_rtrw, v_user_rtrw, 'Warga Baru', 'pending', false, v_house_1_id, v_role_rtrw_id)
  RETURNING id INTO v_member_rtrw_id;

  -- Setujui warga RT/RW
  UPDATE public.tenant_members
  SET status = 'approved'
  WHERE id = v_member_rtrw_id;

  -- Verifikasi unit Rumah tetap berstatus active dan tidak berubah jadi occupied
  SELECT status INTO v_unit_status FROM public.tenant_units WHERE id = v_house_1_id;
  IF v_unit_status <> 'active' THEN
    RAISE EXCEPTION 'KASUS 4 GAGAL: unit RT/RW berubah status menjadi %', v_unit_status;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 4 berhasil (Unit RT/RW tetap active, tidak berubah jadi occupied)!';

  -- ==============================================================================
  -- KASUS 5: checkout_kos_room dipanggil -> kamar vacant, lalu persetujuan ulang anggota lain -> occupied lagi
  -- ==============================================================================
  RAISE NOTICE '[KASUS 5] Menguji alur checkout_kos_room lalu persetujuan ulang...';

  -- Kosongkan Kamar A via RPC checkout_kos_room
  SELECT public.checkout_kos_room(v_tenant_kos, v_room_a_id) INTO v_checkout_res;

  SELECT status, metadata->>'tenant_member_id'
  INTO v_unit_status, v_assigned_mem
  FROM public.tenant_units
  WHERE id = v_room_a_id;

  IF v_unit_status <> 'vacant' THEN
    RAISE EXCEPTION 'KASUS 5 GAGAL: status kamar setelah checkout harus vacant, didapat %', v_unit_status;
  END IF;

  -- Persetujuan ulang: ubah unit_id anggota 2 ke Kamar A yang sekarang sudah vacant
  -- Karena status sudah approved dan unit_id berubah ke Kamar A, trigger harus menembak dan membuat Kamar A occupied lagi
  UPDATE public.tenant_members
  SET unit_id = v_room_a_id
  WHERE id = v_member_2_id;

  SELECT status, (metadata->>'tenant_member_id')::uuid
  INTO v_unit_status, v_assigned_mem
  FROM public.tenant_units
  WHERE id = v_room_a_id;

  IF v_unit_status <> 'occupied' THEN
    RAISE EXCEPTION 'KASUS 5 GAGAL: setelah relokasi/persetujuan ulang, status kamar harus occupied, didapat %', v_unit_status;
  END IF;

  IF v_assigned_mem <> v_member_2_id THEN
    RAISE EXCEPTION 'KASUS 5 GAGAL: metadata tenant_member_id harus %, didapat %', v_member_2_id, v_assigned_mem;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 5 berhasil (checkout -> vacant, lalu re-assign -> occupied kembali)!';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SELURUH TEST KOS ROOM OCCUPANCY MATRIX BERHASIL!';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
