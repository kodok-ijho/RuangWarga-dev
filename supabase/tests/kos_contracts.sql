-- Test Suite: Kos Contracts Schema & Synchronization Matrix (Task KOS-2.1)
-- Date: 2026-10-24
-- Ref: docs/handoff/KOS-2.md § KOS-2.1
--
-- File ini memvalidasi aturan integritas kontrak kos dan status kamar:
-- 1. Kontrak aktif -> kamar otomatis occupied dengan metadata tenant_member_id dan contract_*
-- 2. Dua kontrak aktif di kamar yang sama ditolak (unique constraint unit_id where active)
-- 3. Penyewa yang sama memiliki 2 kontrak aktif di tenant yang sama ditolak (unique constraint member_id where active)
-- 4. Kontrak aktif diakhiri (status = 'ended') -> kamar otomatis kembali vacant
-- 5. Update manual kamar kos ke 'occupied' tanpa kontrak aktif ditolak oleh guard trigger
-- 6. Approval anggota kos tidak mengubah status kamar (tetap vacant)
-- 7. Kontrak aktif di kamar 'inactive' ditolak
-- 8. Validasi assert backfill: tidak ada kamar kos occupied tanpa kontrak aktif

BEGIN;

DO $$
DECLARE
  v_owner_kos       UUID := gen_random_uuid();
  v_user_1          UUID := gen_random_uuid();
  v_user_2          UUID := gen_random_uuid();
  v_tenant_kos      UUID;
  v_role_kos_id     UUID;
  v_member_1_id     UUID;
  v_member_2_id     UUID;
  v_room_1_id       BIGINT;
  v_room_2_id       BIGINT;
  v_room_inactive_id BIGINT;
  v_contract_1_id   UUID;
  v_contract_2_id   UUID;
  v_unit_status     TEXT;
  v_unit_metadata   JSONB;
  v_err_caught      BOOLEAN;
  v_orphaned_rooms  INT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: KOS CONTRACTS & ROOM STATUS (KOS-2.1)';
  RAISE NOTICE '============================================================';

  -- ----------------------------------------------------------------------------
  -- SETUP FIXTURES
  -- ----------------------------------------------------------------------------
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_kos, 'ownerkos_k2@test.invalid', 'authenticated', 'authenticated'),
    (v_user_1,    'user1_k2@test.invalid',    'authenticated', 'authenticated'),
    (v_user_2,    'user2_k2@test.invalid',    'authenticated', 'authenticated');

  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES ('Kos Melati Harmoni Test', 'kos', v_owner_kos, '{"default_rent_price": 1500000, "rent_grace_days": 10}'::jsonb)
  RETURNING id INTO v_tenant_kos;

  SELECT id INTO v_role_kos_id FROM public.tenant_roles WHERE tenant_id = v_tenant_kos AND is_base_role = true LIMIT 1;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES
    (v_tenant_kos, 'Kamar 01', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_1_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES
    (v_tenant_kos, 'Kamar 02', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_2_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES
    (v_tenant_kos, 'Kamar Gudang', 'inactive', '{}'::jsonb) RETURNING id INTO v_room_inactive_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_1, 'Dhani Mahasiswa', 'approved', false, v_room_1_id, v_role_kos_id)
  RETURNING id INTO v_member_1_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_2, 'Budi Pekerja', 'approved', false, v_room_2_id, v_role_kos_id)
  RETURNING id INTO v_member_2_id;

  -- ----------------------------------------------------------------------------
  -- UJI 1: Kontrak aktif -> kamar otomatis occupied & metadata tersinkron
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 1] Menambahkan kontrak aktif baru...';
  INSERT INTO public.kos_contracts (
    tenant_id, unit_id, member_id, tenant_name, rent_price, start_date, grace_days, status
  ) VALUES (
    v_tenant_kos, v_room_1_id, v_member_1_id, 'Dhani Mahasiswa', 1500000, '2026-10-19', 10, 'active'
  ) RETURNING id INTO v_contract_1_id;

  SELECT status, metadata INTO v_unit_status, v_unit_metadata
  FROM public.tenant_units WHERE id = v_room_1_id;

  IF v_unit_status <> 'occupied' THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: status kamar seharusnya occupied, aktual: %', v_unit_status;
  END IF;
  IF (v_unit_metadata->>'tenant_member_id')::uuid <> v_member_1_id THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: tenant_member_id tidak sesuai di metadata kamar';
  END IF;
  IF (v_unit_metadata->>'contract_id')::uuid <> v_contract_1_id THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: contract_id tidak tersimpan di metadata kamar';
  END IF;
  RAISE NOTICE '-> OK: Kamar otomatis occupied dan metadata tersinkron.';

  -- ----------------------------------------------------------------------------
  -- UJI 2: Dua kontrak aktif di kamar yang sama harus ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 2] Mencoba membuat kontrak aktif kedua di Kamar 01...';
  v_err_caught := false;
  BEGIN
    INSERT INTO public.kos_contracts (
      tenant_id, unit_id, member_id, tenant_name, rent_price, start_date, grace_days, status
    ) VALUES (
      v_tenant_kos, v_room_1_id, v_member_2_id, 'Budi Pekerja', 1500000, '2026-10-20', 10, 'active'
    );
  EXCEPTION WHEN unique_violation THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: Kamar yang sama diizinkan memiliki dua kontrak aktif!';
  END IF;
  RAISE NOTICE '-> OK: Dua kontrak aktif di kamar yang sama ditolak (unique constraint).';

  -- ----------------------------------------------------------------------------
  -- UJI 3: Penyewa yang sama di dua kamar ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 3] Mencoba membuat kontrak aktif kedua untuk Dhani di Kamar 02...';
  v_err_caught := false;
  BEGIN
    INSERT INTO public.kos_contracts (
      tenant_id, unit_id, member_id, tenant_name, rent_price, start_date, grace_days, status
    ) VALUES (
      v_tenant_kos, v_room_2_id, v_member_1_id, 'Dhani Mahasiswa', 1500000, '2026-10-20', 10, 'active'
    );
  EXCEPTION WHEN unique_violation THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: Penyewa yang sama diizinkan memiliki dua kontrak aktif!';
  END IF;
  RAISE NOTICE '-> OK: Penyewa di dua kamar aktif ditolak.';

  -- ----------------------------------------------------------------------------
  -- UJI 4: Kontrak aktif diakhiri (ended) -> kamar otomatis vacant
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 4] Mengakhiri kontrak Dhani...';
  UPDATE public.kos_contracts
  SET status = 'ended', ended_at = now(), end_reason = 'checkout'
  WHERE id = v_contract_1_id;

  SELECT status, metadata INTO v_unit_status, v_unit_metadata
  FROM public.tenant_units WHERE id = v_room_1_id;

  IF v_unit_status <> 'vacant' THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: status kamar seharusnya vacant setelah kontrak berakhir, aktual: %', v_unit_status;
  END IF;
  IF v_unit_metadata ? 'tenant_member_id' THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: metadata tenant_member_id harus dibersihkan setelah kontrak berakhir';
  END IF;
  IF (v_unit_metadata->>'previous_tenant_member_id')::uuid <> v_member_1_id THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: previous_tenant_member_id tidak dicatat';
  END IF;
  RAISE NOTICE '-> OK: Kamar otomatis vacant dan riwayat penyewa sebelumnya tercatat.';

  -- ----------------------------------------------------------------------------
  -- UJI 5: Update manual kamar ke occupied tanpa kontrak aktif ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 5] Mencoba mengupdate kamar langsung ke occupied dari browser...';
  v_err_caught := false;
  BEGIN
    UPDATE public.tenant_units
    SET status = 'occupied'
    WHERE id = v_room_2_id;
  EXCEPTION WHEN raise_exception THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 5 GAGAL: Kamar diizinkan diubah ke occupied tanpa kontrak aktif!';
  END IF;
  RAISE NOTICE '-> OK: Update manual kamar ke occupied ditolak oleh guard trigger.';

  -- ----------------------------------------------------------------------------
  -- UJI 6: Approval anggota tidak mengubah status kamar (tetap vacant)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 6] Menguji approval anggota baru di Kamar 02...';
  -- Buat member baru berstatus pending
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, gen_random_uuid(), 'Calon Penghuni Baru', 'pending', false, v_room_2_id, v_role_kos_id);

  -- Setujui anggota
  UPDATE public.tenant_members
  SET status = 'approved'
  WHERE tenant_id = v_tenant_kos AND full_name = 'Calon Penghuni Baru';

  SELECT status INTO v_unit_status
  FROM public.tenant_units WHERE id = v_room_2_id;

  IF v_unit_status <> 'vacant' THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: Approval anggota tidak boleh mengubah status kamar, aktual: %', v_unit_status;
  END IF;
  RAISE NOTICE '-> OK: Approval anggota tidak mengubah kamar menjadi occupied.';

  -- ----------------------------------------------------------------------------
  -- UJI 7: Kontrak aktif di kamar inactive ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 7] Mencoba membuat kontrak pada kamar inactive...';
  v_err_caught := false;
  BEGIN
    INSERT INTO public.kos_contracts (
      tenant_id, unit_id, member_id, tenant_name, rent_price, start_date, grace_days, status
    ) VALUES (
      v_tenant_kos, v_room_inactive_id, v_member_2_id, 'Budi Pekerja', 1500000, '2026-10-20', 10, 'active'
    );
  EXCEPTION WHEN raise_exception THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 7 GAGAL: Pembuatan kontrak di kamar inactive diizinkan!';
  END IF;
  RAISE NOTICE '-> OK: Kontrak di kamar inactive ditolak.';

  -- ----------------------------------------------------------------------------
  -- UJI 8: Assert backfill integritas (tidak ada kamar kos occupied tanpa kontrak)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 8] Memeriksa assert integritas: kamar kos occupied tanpa kontrak aktif...';
  SELECT count(*) INTO v_orphaned_rooms
  FROM public.tenant_units u
  JOIN public.tenants t ON t.id = u.tenant_id
  WHERE t.type = 'kos' AND u.status = 'occupied'
    AND NOT EXISTS (
      SELECT 1 FROM public.kos_contracts c
      WHERE c.unit_id = u.id AND c.status = 'active'
    );

  IF v_orphaned_rooms > 0 THEN
    RAISE EXCEPTION 'Uji 8 GAGAL: Ditemukan % kamar kos occupied tanpa kontrak aktif!', v_orphaned_rooms;
  END IF;
  RAISE NOTICE '-> OK: Seluruh kamar occupied memiliki kontrak aktif.';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SELURUH UJI KOS-2.1 BERHASIL (100%% LULUS)';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
