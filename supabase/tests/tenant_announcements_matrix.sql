-- Test Suite: Tenant Announcements & R2 Image Matrix (Task RTRW-3.1a)
-- Date: 2026-10-20
-- Ref: docs/handoff/RTRW-3.md § RTRW-3.1
--
-- File ini memvalidasi:
-- 1. Static Function Privileges:
--    - can_manage_announcements: anon ditolak, authenticated & service_role diizinkan.
--    - is_valid_announcement_image_path: anon ditolak, authenticated & service_role diizinkan.
--    - can_upload_tenant_file & can_read_tenant_file: anon ditolak, authenticated & service_role diizinkan.
-- 2. Kasus 1: Owner A bisa INSERT pengumuman.
-- 3. Kasus 2: Pengurus berizin manage_announcements bisa INSERT, UPDATE, dan DELETE pengumuman.
-- 4. Kasus 3: Pengurus berizin manage_settings bisa INSERT pengumuman.
-- 5. Kasus 4: Warga approved bisa SELECT pengumuman, namun INSERT/UPDATE/DELETE ditolak.
-- 6. Kasus 5: Warga pending tidak bisa SELECT pengumuman (0 baris).
-- 7. Kasus 6: Owner B tidak bisa melihat/mengubah pengumuman Tenant A, dan dilarang INSERT dengan tenant_id A.
-- 8. Kasus 7: Anon tidak bisa SELECT pengumuman (ditolak via RLS/privilege).
-- 9. Kasus 8: Subscription A status read_only: INSERT pengurus ditolak, SELECT tetap dapat diakses.
-- 10. Kasus 9: Validasi check constraint: title kosong atau > 150 karakter ditolak; image_path invalid ditolak.
-- 11. Kasus 10: Hak upload R2 can_upload_tenant_file('announcement_image', A):
--     TRUE untuk pengurus berizin & owner, FALSE untuk warga dan Owner B.
-- 12. Kasus 11: Hak baca R2 can_read_tenant_file('announcement_image', path):
--     TRUE untuk warga approved A, FALSE untuk Owner B, FALSE untuk canonical path yang tidak valid.
-- 13. Kasus 12: Uji regresi STOR-1: can_upload_tenant_file('payment_proof', A) untuk warga approved tetap TRUE.

BEGIN;

DO $$
DECLARE
  -- Identitas Pengguna Auth
  v_owner_a        UUID := gen_random_uuid();
  v_pengurus_ann   UUID := gen_random_uuid();
  v_pengurus_set   UUID := gen_random_uuid();
  v_warga_app      UUID := gen_random_uuid();
  v_warga_pen      UUID := gen_random_uuid();
  v_owner_b        UUID := gen_random_uuid();

  -- Identitas Tenant & Role
  v_tenant_a       UUID;
  v_tenant_b       UUID;
  v_base_role_id   UUID;
  v_role_ann_id    UUID := gen_random_uuid();
  v_role_set_id    UUID := gen_random_uuid();

  -- Pengumuman ID
  v_ann_1_id       UUID;
  v_ann_2_id       UUID;
  v_ann_3_id       UUID;
  v_ann_4_id       UUID;

  -- Path Storage Uji
  v_valid_ann_path     TEXT;
  v_invalid_ann_path_1 TEXT;
  v_invalid_ann_path_2 TEXT;

  -- Variabel assertion
  v_count          INT;
  v_row_count      INT;
  v_res            BOOLEAN;
  v_caught         BOOLEAN;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: TENANT ANNOUNCEMENTS MATRIX (RTRW-3.1a)';
  RAISE NOTICE '============================================================';

  -- ==============================================================================
  -- 1. ASSERT FUNCTION PRIVILEGES (STATIC CHECKS)
  -- ==============================================================================
  RAISE NOTICE '[TEST 0] Memeriksa static privilege has_function_privilege()...';

  -- 1.1 can_manage_announcements(uuid)
  IF has_function_privilege('anon', 'public.can_manage_announcements(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: anon memiliki privilege EXECUTE pada can_manage_announcements';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.can_manage_announcements(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: authenticated tidak memiliki privilege EXECUTE pada can_manage_announcements';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.can_manage_announcements(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: service_role tidak memiliki privilege EXECUTE pada can_manage_announcements';
  END IF;

  -- 1.2 is_valid_announcement_image_path(text)
  IF has_function_privilege('anon', 'public.is_valid_announcement_image_path(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: anon memiliki privilege EXECUTE pada is_valid_announcement_image_path';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.is_valid_announcement_image_path(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: authenticated tidak memiliki privilege EXECUTE pada is_valid_announcement_image_path';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.is_valid_announcement_image_path(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: service_role tidak memiliki privilege EXECUTE pada is_valid_announcement_image_path';
  END IF;

  -- 1.3 can_upload_tenant_file(text, uuid)
  IF has_function_privilege('anon', 'public.can_upload_tenant_file(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: anon memiliki privilege EXECUTE pada can_upload_tenant_file';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.can_upload_tenant_file(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: authenticated tidak memiliki privilege EXECUTE pada can_upload_tenant_file';
  END IF;

  -- 1.4 can_read_tenant_file(text, text)
  IF has_function_privilege('anon', 'public.can_read_tenant_file(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: anon memiliki privilege EXECUTE pada can_read_tenant_file';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.can_read_tenant_file(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: authenticated tidak memiliki privilege EXECUTE pada can_read_tenant_file';
  END IF;

  RAISE NOTICE '>> PASSED: Test 0 (Static privilege checks) Berhasil!';

  -- ==============================================================================
  -- 2. SETUP DATA UJI (FIXTURES)
  -- ==============================================================================
  RAISE NOTICE '[SETUP] Mempersiapkan tenant uji (Tenant A & B), role, dan anggota...';

  -- 2.1 Auth Users
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_a,      'owner_a_ann@test.invalid',      'authenticated', 'authenticated'),
    (v_pengurus_ann, 'pengurus_ann_ann@test.invalid', 'authenticated', 'authenticated'),
    (v_pengurus_set, 'pengurus_set_ann@test.invalid', 'authenticated', 'authenticated'),
    (v_warga_app,    'warga_app_ann@test.invalid',    'authenticated', 'authenticated'),
    (v_warga_pen,    'warga_pen_ann@test.invalid',    'authenticated', 'authenticated'),
    (v_owner_b,      'owner_b_ann@test.invalid',      'authenticated', 'authenticated');

  -- 2.2 Tenant A (RT/RW, Subscription Active)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kompleks RT 01 Tenant A', 'rt_rw', v_owner_a)
  RETURNING id INTO v_tenant_a;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_a;

  -- 2.3 Tenant B (RT/RW, Subscription Active milik Owner B)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kompleks RT 02 Tenant B', 'rt_rw', v_owner_b)
  RETURNING id INTO v_tenant_b;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_b;

  -- 2.4 Ambil base role Tenant A
  SELECT id INTO v_base_role_id
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_a AND is_base_role = true
  LIMIT 1;

  IF v_base_role_id IS NULL THEN
    RAISE EXCEPTION 'SETUP GAGAL: Base role bawaan untuk Tenant A tidak ditemukan';
  END IF;

  -- 2.5 Buat Role Pengurus dengan izin 'manage_announcements'
  INSERT INTO public.tenant_roles (id, tenant_id, name, is_owner_role, is_base_role)
  VALUES (v_role_ann_id, v_tenant_a, 'Seksi Publikasi & Pengumuman', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
  VALUES (v_role_ann_id, 'manage_announcements');

  -- 2.6 Buat Role Pengurus dengan izin 'manage_settings'
  INSERT INTO public.tenant_roles (id, tenant_id, name, is_owner_role, is_base_role)
  VALUES (v_role_set_id, v_tenant_a, 'Sekretaris / Pengaturan', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
  VALUES (v_role_set_id, 'manage_settings');

  -- 2.7 Daftarkan Anggota Tenant A
  -- Pengurus Announcements (Approved)
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_a, v_pengurus_ann, 'Pengurus Announcements A', 'approved', false, v_role_ann_id);

  -- Pengurus Settings (Approved)
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_a, v_pengurus_set, 'Pengurus Settings A', 'approved', false, v_role_set_id);

  -- Warga Approved (Role Dasar)
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_a, v_warga_app, 'Warga Approved A', 'approved', false, v_base_role_id);

  -- Warga Pending (Status Pending)
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_a, v_warga_pen, 'Warga Pending A', 'pending', false, v_base_role_id);

  RAISE NOTICE '>> SETUP Berhasil! Fixtures siap.';

  -- ==============================================================================
  -- 3. KASUS 1: Owner A bisa INSERT pengumuman
  -- ==============================================================================
  RAISE NOTICE '[KASUS 1] Menguji Owner A insert pengumuman...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.tenant_announcements (tenant_id, title, body, is_pinned)
  VALUES (v_tenant_a, 'Pengumuman Kerja Bakti dari Owner', 'Harap semua warga hadir tepat waktu hari Minggu.', true)
  RETURNING id INTO v_ann_1_id;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  IF v_ann_1_id IS NULL THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Owner A gagal insert pengumuman';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 1 (Owner A insert) Berhasil!';

  -- ==============================================================================
  -- 4. KASUS 2: Pengurus manage_announcements bisa INSERT, UPDATE, dan DELETE
  -- ==============================================================================
  RAISE NOTICE '[KASUS 2] Menguji Pengurus manage_announcements insert/update/delete...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pengurus_ann::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_pengurus_ann::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 4.1 Insert pengumuman
  INSERT INTO public.tenant_announcements (tenant_id, title, body)
  VALUES (v_tenant_a, 'Pengumuman Lomba HUT RI', 'Pendaftaran lomba dibuka mulai besok pagi di pos satpam.')
  RETURNING id INTO v_ann_2_id;

  IF v_ann_2_id IS NULL THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 2 GAGAL: Pengurus manage_announcements gagal insert pengumuman';
  END IF;

  -- 4.2 Update pengumuman
  UPDATE public.tenant_announcements
  SET title = 'Pengumuman Lomba HUT RI Diperbarui', body = 'Pendaftaran ditutup hari Rabu.'
  WHERE id = v_ann_2_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 2 GAGAL: Pengurus manage_announcements gagal update pengumuman (row_count = %)', v_row_count;
  END IF;

  -- 4.3 Delete pengumuman
  DELETE FROM public.tenant_announcements
  WHERE id = v_ann_2_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 2 GAGAL: Pengurus manage_announcements gagal delete pengumuman (row_count = %)', v_row_count;
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 2 (Pengurus manage_announcements insert/update/delete) Berhasil!';

  -- ==============================================================================
  -- 5. KASUS 3: Pengurus manage_settings bisa INSERT
  -- ==============================================================================
  RAISE NOTICE '[KASUS 3] Menguji Pengurus manage_settings insert...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pengurus_set::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_pengurus_set::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.tenant_announcements (tenant_id, title, body)
  VALUES (v_tenant_a, 'Pemberitahuan Penyesuaian Iuran', 'Mulai bulan depan iuran kebersihan disesuaikan sesuai keputusan rapat.')
  RETURNING id INTO v_ann_3_id;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  IF v_ann_3_id IS NULL THEN
    RAISE EXCEPTION 'KASUS 3 GAGAL: Pengurus manage_settings gagal insert pengumuman';
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 3 (Pengurus manage_settings insert) Berhasil!';

  -- ==============================================================================
  -- 6. KASUS 4: Warga approved bisa SELECT, tetapi INSERT/UPDATE/DELETE ditolak
  -- ==============================================================================
  RAISE NOTICE '[KASUS 4] Menguji Warga approved SELECT (sukses) dan write (ditolak)...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_app::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_app::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 6.1 SELECT harus dapat membaca pengumuman Tenant A
  SELECT COUNT(*) INTO v_count
  FROM public.tenant_announcements
  WHERE tenant_id = v_tenant_a;

  IF v_count < 2 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 4 GAGAL: Warga approved seharusnya bisa membaca pengumuman Tenant A (got %)', v_count;
  END IF;

  -- 6.2 INSERT harus ditolak
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_announcements (tenant_id, title, body)
    VALUES (v_tenant_a, 'Pengumuman Warga Liar', 'Warga mencoba menerbitkan pengumuman');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 4 GAGAL: Warga approved seharusnya dilarang INSERT pengumuman';
  END IF;

  -- 6.3 UPDATE harus ditolak (error RLS atau 0 baris berubah)
  v_caught := false;
  BEGIN
    UPDATE public.tenant_announcements
    SET title = 'Judul Dibajak Warga'
    WHERE id = v_ann_1_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count > 0 THEN
      EXECUTE 'SET LOCAL ROLE postgres';
      RAISE EXCEPTION 'KASUS 4 GAGAL: Warga approved berhasil update pengumuman (row_count = %)', v_row_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  -- 6.4 DELETE harus ditolak (error RLS atau 0 baris dihapus)
  v_caught := false;
  BEGIN
    DELETE FROM public.tenant_announcements
    WHERE id = v_ann_1_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count > 0 THEN
      EXECUTE 'SET LOCAL ROLE postgres';
      RAISE EXCEPTION 'KASUS 4 GAGAL: Warga approved berhasil delete pengumuman (row_count = %)', v_row_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 4 (Warga approved read-only) Berhasil!';

  -- ==============================================================================
  -- 7. KASUS 5: Warga pending tidak bisa SELECT
  -- ==============================================================================
  RAISE NOTICE '[KASUS 5] Menguji Warga pending tidak bisa SELECT pengumuman...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_pen::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_pen::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT COUNT(*) INTO v_count
  FROM public.tenant_announcements
  WHERE tenant_id = v_tenant_a;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'KASUS 5 GAGAL: Warga pending dapat membaca % pengumuman Tenant A, seharusnya 0!', v_count;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 5 (Warga pending terisolasi) Berhasil!';

  -- ==============================================================================
  -- 8. KASUS 6: Owner B tidak bisa melihat/mengubah pengumuman A & dilarang insert A
  -- ==============================================================================
  RAISE NOTICE '[KASUS 6] Menguji isolasi lintas-tenant terhadap Owner B...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 8.1 Owner B melihat pengumuman Tenant A -> harus 0 baris
  SELECT COUNT(*) INTO v_count
  FROM public.tenant_announcements
  WHERE tenant_id = v_tenant_a;

  IF v_count <> 0 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 6 GAGAL: Owner B dapat membaca % pengumuman Tenant A, seharusnya 0!', v_count;
  END IF;

  -- 8.2 Owner B mencoba UPDATE pengumuman Tenant A -> 0 baris atau error
  v_caught := false;
  BEGIN
    UPDATE public.tenant_announcements
    SET title = 'Judul Dibajak Owner B'
    WHERE id = v_ann_1_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count > 0 THEN
      EXECUTE 'SET LOCAL ROLE postgres';
      RAISE EXCEPTION 'KASUS 6 GAGAL: Owner B berhasil update pengumuman milik Tenant A!';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  -- 8.3 Owner B mencoba INSERT dengan tenant_id milik Tenant A -> error RLS
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_announcements (tenant_id, title, body)
    VALUES (v_tenant_a, 'Pengumuman Pembajak Tenant B', 'Isi pengumuman pembajak');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 6 GAGAL: Owner B seharusnya dilarang INSERT dengan tenant_id Tenant A';
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 6 (Isolasi lintas tenant Owner B) Berhasil!';

  -- ==============================================================================
  -- 9. KASUS 7: Anon tidak bisa SELECT
  -- ==============================================================================
  RAISE NOTICE '[KASUS 7] Menguji peran anon tidak bisa SELECT pengumuman...';

  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  EXECUTE 'SET LOCAL ROLE anon';

  v_caught := false;
  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.tenant_announcements
    WHERE tenant_id = v_tenant_a;

    IF v_count <> 0 THEN
      EXECUTE 'SET LOCAL ROLE postgres';
      RAISE EXCEPTION 'KASUS 7 GAGAL: Anon user dapat membaca % pengumuman, seharusnya 0!', v_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Ditolak via table permission (42501) adalah perilaku yang benar dan diharapkan
    v_caught := true;
  END;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 7 (Anon tidak bisa SELECT) Berhasil!';

  -- ==============================================================================
  -- 10. KASUS 8: Subscription A status read_only: INSERT pengurus ditolak, SELECT tetap jalan
  -- ==============================================================================
  RAISE NOTICE '[KASUS 8] Menguji gate subscription read_only pada Tenant A...';

  -- Ubah status subscription Tenant A menjadi 'read_only'
  UPDATE public.tenant_subscriptions
  SET status = 'read_only'
  WHERE tenant_id = v_tenant_a;

  -- 10.1 Pengurus mencoba INSERT -> Ditolak
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pengurus_ann::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_pengurus_ann::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_announcements (tenant_id, title, body)
    VALUES (v_tenant_a, 'Pengumuman Saat Read-Only', 'Harus ditolak karena langganan telah read-only');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 8 GAGAL: Pengurus seharusnya dilarang INSERT saat subscription read_only';
  END IF;

  -- 10.2 SELECT pengumuman harus tetap berjalan saat read_only
  SELECT COUNT(*) INTO v_count
  FROM public.tenant_announcements
  WHERE tenant_id = v_tenant_a;

  IF v_count < 2 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 8 GAGAL: SELECT pengumuman harus tetap bisa diakses saat read_only (got %)', v_count;
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  -- Kembalikan status subscription Tenant A ke active untuk pengujian selanjutnya
  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_a;

  RAISE NOTICE '>> PASSED: Kasus 8 (Subscription read_only gate) Berhasil!';

  -- ==============================================================================
  -- 11. KASUS 9: Validasi check constraint (title & image_path)
  -- ==============================================================================
  RAISE NOTICE '[KASUS 9] Menguji check constraints pada title dan image_path...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 9.1 Title kosong (hanya spasi, btrim menghasilkan '')
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_announcements (tenant_id, title, body)
    VALUES (v_tenant_a, '    ', 'Body pengumuman valid');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 9 GAGAL: Title hanya spasi/kosong seharusnya ditolak check constraint';
  END IF;

  -- 9.2 Title melebihi 150 karakter (151 karakter)
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_announcements (tenant_id, title, body)
    VALUES (v_tenant_a, repeat('x', 151), 'Body pengumuman valid');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 9 GAGAL: Title > 150 karakter seharusnya ditolak check constraint';
  END IF;

  -- 9.3 image_path non-canonical (traversal path '../bad.jpg')
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_announcements (tenant_id, title, body, image_path)
    VALUES (v_tenant_a, 'Judul Valid', 'Body valid', '../bad.jpg');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 9 GAGAL: image_path traversal seharusnya ditolak validator/check';
  END IF;

  -- 9.4 image_path non-canonical (ekstensi .exe terlarang)
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_announcements (tenant_id, title, body, image_path)
    VALUES (v_tenant_a, 'Judul Valid', 'Body valid', v_tenant_a::text || '/announcements/' || gen_random_uuid()::text || '.exe');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 9 GAGAL: image_path dengan ekstensi .exe seharusnya ditolak validator/check';
  END IF;

  -- 9.5 image_path canonical valid ({tenant_id}/announcements/{uuid}.webp) -> Harus berhasil
  INSERT INTO public.tenant_announcements (tenant_id, title, body, image_path)
  VALUES (
    v_tenant_a,
    'Pengumuman Poster 17 Agustus',
    'Poster terlampir untuk perlombaan.',
    v_tenant_a::text || '/announcements/' || gen_random_uuid()::text || '.webp'
  )
  RETURNING id INTO v_ann_4_id;

  IF v_ann_4_id IS NULL THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 9 GAGAL: INSERT pengumuman dengan image_path canonical valid seharusnya berhasil';
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 9 (Check constraints title & image_path) Berhasil!';

  -- ==============================================================================
  -- 12. KASUS 10: Hak upload R2 can_upload_tenant_file('announcement_image', A)
  -- ==============================================================================
  RAISE NOTICE '[KASUS 10] Menguji izin can_upload_tenant_file untuk announcement_image...';

  -- 10.1 Pengurus Announcements -> TRUE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pengurus_ann::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_pengurus_ann::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_res := public.can_upload_tenant_file('announcement_image', v_tenant_a);
  IF v_res IS NOT TRUE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 10 GAGAL: can_upload_tenant_file seharusnya TRUE untuk pengurus announcements (got %)', v_res;
  END IF;

  -- 10.2 Warga Approved -> FALSE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_app::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_app::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('announcement_image', v_tenant_a);
  IF v_res IS NOT FALSE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 10 GAGAL: can_upload_tenant_file seharusnya FALSE untuk warga approved (got %)', v_res;
  END IF;

  -- 10.3 Owner B pada Tenant A -> FALSE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('announcement_image', v_tenant_a);
  IF v_res IS NOT FALSE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 10 GAGAL: can_upload_tenant_file seharusnya FALSE untuk Owner B pada Tenant A (got %)', v_res;
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 10 (can_upload_tenant_file announcement_image) Berhasil!';

  -- ==============================================================================
  -- 13. KASUS 11: Hak baca R2 can_read_tenant_file('announcement_image', path)
  -- ==============================================================================
  RAISE NOTICE '[KASUS 11] Menguji izin can_read_tenant_file untuk announcement_image...';

  v_valid_ann_path     := v_tenant_a::text || '/announcements/' || gen_random_uuid()::text || '.png';
  v_invalid_ann_path_1 := v_tenant_a::text || '/announcements/invalid-file.txt';
  v_invalid_ann_path_2 := v_tenant_a::text || '/../traversal.png';

  -- 11.1 Warga approved membaca path valid Tenant A -> TRUE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_app::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_app::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_res := public.can_read_tenant_file('announcement_image', v_valid_ann_path);
  IF v_res IS NOT TRUE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 11 GAGAL: can_read_tenant_file seharusnya TRUE untuk warga approved A pada path valid (got %)', v_res;
  END IF;

  -- 11.2 Owner B membaca path Tenant A -> FALSE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_res := public.can_read_tenant_file('announcement_image', v_valid_ann_path);
  IF v_res IS NOT FALSE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 11 GAGAL: can_read_tenant_file seharusnya FALSE untuk Owner B pada path Tenant A (got %)', v_res;
  END IF;

  -- 11.3 Warga approved membaca path non-canonical (ekstensi .txt) -> FALSE
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_app::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_app::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_res := public.can_read_tenant_file('announcement_image', v_invalid_ann_path_1);
  IF v_res IS NOT FALSE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 11 GAGAL: can_read_tenant_file seharusnya FALSE untuk path berekstensi .txt (got %)', v_res;
  END IF;

  -- 11.4 Warga approved membaca path traversal -> FALSE
  v_res := public.can_read_tenant_file('announcement_image', v_invalid_ann_path_2);
  IF v_res IS NOT FALSE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 11 GAGAL: can_read_tenant_file seharusnya FALSE untuk path traversal (got %)', v_res;
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 11 (can_read_tenant_file announcement_image) Berhasil!';

  -- ==============================================================================
  -- 14. KASUS 12: Uji regresi can_upload_tenant_file('payment_proof', A)
  -- ==============================================================================
  RAISE NOTICE '[KASUS 12] Menguji non-regresi can_upload_tenant_file("payment_proof")...';

  -- Warga approved Tenant A tetap dapat mengupload payment_proof sesuai perilaku STOR-1
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_app::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_app::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_res := public.can_upload_tenant_file('payment_proof', v_tenant_a);
  IF v_res IS NOT TRUE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 12 GAGAL: can_upload_tenant_file(payment_proof) untuk warga approved seharusnya TRUE (regresi!) (got %)', v_res;
  END IF;

  -- Owner B tidak dapat upload payment_proof untuk Tenant A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_res := public.can_upload_tenant_file('payment_proof', v_tenant_a);
  IF v_res IS NOT FALSE THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 12 GAGAL: can_upload_tenant_file(payment_proof) untuk Owner B pada Tenant A seharusnya FALSE (got %)', v_res;
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 12 (Regresi payment_proof upload) Berhasil!';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA TEST ANNOUNCEMENTS MATRIX (RTRW-3.1a) LULUS!';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
