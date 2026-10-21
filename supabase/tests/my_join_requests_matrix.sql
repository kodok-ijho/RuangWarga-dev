-- Test Suite: My Join Requests Matrix (Task KOS-1.4a)
-- Date: 2026-10-21
-- Ref: docs/handoff/KOS-1.md § KOS-1.4a
--
-- File ini memvalidasi:
-- 1. Hak Eksekusi Fungsi (Privilege Check):
--    - anon ditolak (REVOKE EXECUTE)
--    - authenticated & service_role diizinkan (GRANT EXECUTE)
-- 2. Kasus 1: User A pending di Tenant X -> 1 baris berisi nama Tenant X dan label unit
-- 3. Kasus 2: User A approved di Tenant Y -> tidak muncul di get_my_join_requests()
-- 4. Kasus 3: User B login -> tidak melihat permohonan User A (isolasi data)
-- 5. Kasus 4: User A rejected di Tenant Z -> muncul di get_my_join_requests()
-- 6. Kasus 5: anon mencoba memanggil -> ditolak via privilege

BEGIN;

DO $$
DECLARE
  -- Identitas Pengguna Auth
  v_user_a         UUID := gen_random_uuid();
  v_user_b         UUID := gen_random_uuid();
  v_owner_x        UUID := gen_random_uuid();
  v_owner_y        UUID := gen_random_uuid();
  v_owner_z        UUID := gen_random_uuid();

  -- Identitas Tenant
  v_tenant_x       UUID;
  v_tenant_y       UUID;
  v_tenant_z       UUID;

  -- Unit ID
  v_unit_x_id      BIGINT;

  -- Base role
  v_role_x_id      UUID;
  v_role_y_id      UUID;
  v_role_z_id      UUID;

  -- Variabel assertion
  v_count          INT;
  v_member_id      UUID;
  v_tenant_id      UUID;
  v_tenant_name    TEXT;
  v_tenant_type    TEXT;
  v_unit_label     TEXT;
  v_status         TEXT;
  v_requested_at   TIMESTAMPTZ;
  v_caught         BOOLEAN;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: MY JOIN REQUESTS MATRIX (KOS-1.4a)';
  RAISE NOTICE '============================================================';

  -- ==============================================================================
  -- 1. ASSERT FUNCTION PRIVILEGES (STATIC CHECKS)
  -- ==============================================================================
  RAISE NOTICE '[TEST 1] Memeriksa hak eksekusi fungsi get_my_join_requests()...';

  IF has_function_privilege('anon', 'public.get_my_join_requests()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: anon memiliki privilege EXECUTE pada get_my_join_requests()';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_my_join_requests()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: authenticated tidak memiliki privilege EXECUTE pada get_my_join_requests()';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.get_my_join_requests()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: service_role tidak memiliki privilege EXECUTE pada get_my_join_requests()';
  END IF;

  RAISE NOTICE '>> PASSED: Test 1 (Static privilege checks) Berhasil!';

  -- ==============================================================================
  -- 2. SETUP DATA UJI (FIXTURES)
  -- ==============================================================================
  RAISE NOTICE '[SETUP] Mempersiapkan user auth, tenant, unit, dan membership...';

  -- 2.1 Auth Users
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_user_a,  'usera_join@test.invalid',  'authenticated', 'authenticated'),
    (v_user_b,  'userb_join@test.invalid',  'authenticated', 'authenticated'),
    (v_owner_x, 'ownerx_join@test.invalid', 'authenticated', 'authenticated'),
    (v_owner_y, 'ownery_join@test.invalid', 'authenticated', 'authenticated'),
    (v_owner_z, 'ownerz_join@test.invalid', 'authenticated', 'authenticated');

  -- 2.2 Tenants
  -- Tenant X (Kos)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kos Melati Indah', 'kos', v_owner_x)
  RETURNING id INTO v_tenant_x;

  -- Tenant Y (RT/RW)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kompleks Mawar Asri', 'rt_rw', v_owner_y)
  RETURNING id INTO v_tenant_y;

  -- Tenant Z (Kelas)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Bimbel Prestasi', 'kelas', v_owner_z)
  RETURNING id INTO v_tenant_z;

  -- 2.3 Unit di Tenant X
  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_x, 'Kamar 101', 'vacant')
  RETURNING id INTO v_unit_x_id;

  -- 2.4 Ambil base role tiap tenant
  SELECT id INTO v_role_x_id FROM public.tenant_roles WHERE tenant_id = v_tenant_x AND is_base_role = true LIMIT 1;
  SELECT id INTO v_role_y_id FROM public.tenant_roles WHERE tenant_id = v_tenant_y AND is_base_role = true LIMIT 1;
  SELECT id INTO v_role_z_id FROM public.tenant_roles WHERE tenant_id = v_tenant_z AND is_base_role = true LIMIT 1;

  -- 2.5 Daftarkan Membership
  -- User A: pending di Tenant X (dengan unit Kamar 101)
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_x, v_user_a, 'User A Pending', 'pending', false, v_unit_x_id, v_role_x_id);

  -- User A: approved di Tenant Y (anggota aktif tanpa unit)
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_y, v_user_a, 'User A Approved', 'approved', false, v_role_y_id);

  -- User A: rejected di Tenant Z
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_z, v_user_a, 'User A Ditolak', 'rejected', false, v_role_z_id);

  RAISE NOTICE '>> SETUP Berhasil! Fixtures siap.';

  -- ==============================================================================
  -- 3. KASUS 1 & 2: User A memanggil get_my_join_requests()
  -- ==============================================================================
  RAISE NOTICE '[KASUS 1 & 2] Menguji User A melihat request pending dan rejected, tapi BUKAN approved...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Hitung total baris yang dikembalikan
  SELECT COUNT(*) INTO v_count FROM public.get_my_join_requests();

  IF v_count <> 2 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 1 & 2 GAGAL: Jumlah request tidak sesuai (diharapkan 2, aktual = %)', v_count;
  END IF;

  -- Periksa data request pending di Tenant X
  SELECT member_id, tenant_id, tenant_name, tenant_type, unit_label, status, requested_at
  INTO v_member_id, v_tenant_id, v_tenant_name, v_tenant_type, v_unit_label, v_status, v_requested_at
  FROM public.get_my_join_requests()
  WHERE tenant_id = v_tenant_x;

  IF v_tenant_name <> 'Kos Melati Indah' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 1 GAGAL: tenant_name salah (aktual = %)', v_tenant_name;
  END IF;

  IF v_tenant_type <> 'kos' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 1 GAGAL: tenant_type salah (aktual = %)', v_tenant_type;
  END IF;

  IF v_unit_label <> 'Kamar 101' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 1 GAGAL: unit_label salah (aktual = %)', v_unit_label;
  END IF;

  IF v_status <> 'pending' THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 1 GAGAL: status salah (aktual = %)', v_status;
  END IF;

  -- Pastikan Tenant Y (approved) TIDAK muncul
  SELECT COUNT(*) INTO v_count
  FROM public.get_my_join_requests()
  WHERE tenant_id = v_tenant_y;

  IF v_count <> 0 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 2 GAGAL: Keanggotaan approved muncul di get_my_join_requests()';
  END IF;

  -- Pastikan Tenant Z (rejected) muncul
  SELECT COUNT(*) INTO v_count
  FROM public.get_my_join_requests()
  WHERE tenant_id = v_tenant_z AND status = 'rejected';

  IF v_count <> 1 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 4 GAGAL: Permohonan rejected di Tenant Z tidak muncul';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 1, 2, 4 Berhasil!';

  -- ==============================================================================
  -- 4. KASUS 3: User B login dan tidak melihat permohonan User A
  -- ==============================================================================
  RAISE NOTICE '[KASUS 3] Menguji User B tidak melihat request milik User A...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT COUNT(*) INTO v_count FROM public.get_my_join_requests();

  IF v_count <> 0 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 3 GAGAL: User B melihat request milik user lain (count = %)', v_count;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 3 Berhasil! User B terisolasi penuh.';

  -- ==============================================================================
  -- 5. KASUS 5: anon mencoba memanggil -> ditolak via privilege
  -- ==============================================================================
  RAISE NOTICE '[KASUS 5] Menguji role anon ditolak saat mengeksekusi fungsi...';

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  v_caught := false;
  BEGIN
    PERFORM * FROM public.get_my_join_requests();
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := true;
  END;

  EXECUTE 'SET LOCAL ROLE postgres';

  IF NOT v_caught THEN
    RAISE EXCEPTION 'KASUS 5 GAGAL: Role anon tidak melempar insufficient_privilege saat memanggil get_my_join_requests()';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 5 Berhasil! Anon ditolak hak eksekusi.';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SELURUH PENGUJIAN MY JOIN REQUESTS MATRIX LOLOS DENGAN BAIK!';
  RAISE NOTICE '============================================================';
END;
$$;

ROLLBACK;
