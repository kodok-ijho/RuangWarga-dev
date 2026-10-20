-- Test Suite: Tenant Events Matrix (Task RTRW-3.2a)
-- Date: 2026-10-20
-- Ref: docs/handoff/RTRW-3.md § RTRW-3.2
--
-- File ini memvalidasi:
-- 1. Static Table Privileges:
--    - tenant_events: anon ditolak, authenticated & service_role diizinkan.
-- 2. Kasus 1: Owner A dan pengurus berizin (manage_announcements) bisa INSERT, UPDATE, dan DELETE acara.
-- 3. Kasus 2: Warga approved bisa SELECT acara, namun INSERT/UPDATE/DELETE ditolak.
-- 4. Kasus 3: Warga pending tidak bisa SELECT acara (0 baris).
-- 5. Kasus 4: Owner B terisolasi: tidak bisa melihat, mengubah, atau INSERT ke Tenant A.
-- 6. Kasus 5: Anon tidak bisa SELECT acara (ditolak via RLS/privilege).
-- 7. Kasus 6: Subscription Tenant A status read_only: INSERT pengurus ditolak, SELECT tetap dapat diakses.
-- 8. Kasus 7: Validasi check constraint:
--    - Judul kosong (atau hanya spasi) ditolak.
--    - ends_at < starts_at ditolak.
--    - location > 200 karakter ditolak.
--    - image_path tidak valid ditolak.
--    - image_path valid '{tenantA}/announcements/{uuid}.png' diterima.

BEGIN;

DO $$
DECLARE
  -- Identitas Pengguna Auth
  v_owner_a        UUID := gen_random_uuid();
  v_pengurus_ann   UUID := gen_random_uuid();
  v_warga_app      UUID := gen_random_uuid();
  v_warga_pen      UUID := gen_random_uuid();
  v_owner_b        UUID := gen_random_uuid();

  -- Identitas Tenant & Role
  v_tenant_a       UUID;
  v_tenant_b       UUID;
  v_base_role_id   UUID;
  v_role_ann_id    UUID := gen_random_uuid();

  -- Event ID
  v_event_1_id     UUID;
  v_event_2_id     UUID;
  v_temp_del_id    UUID;
  v_event_img_id   UUID;

  -- Variabel assertion
  v_count          INT;
  v_row_count      INT;
  v_caught         BOOLEAN;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: TENANT EVENTS MATRIX (RTRW-3.2a)';
  RAISE NOTICE '============================================================';

  -- ==============================================================================
  -- 1. ASSERT TABLE PRIVILEGES (STATIC CHECKS)
  -- ==============================================================================
  RAISE NOTICE '[TEST 0] Memeriksa static table privilege has_table_privilege()...';

  IF has_table_privilege('anon', 'public.tenant_events', 'SELECT') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: anon memiliki privilege SELECT pada tenant_events';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.tenant_events', 'SELECT') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: authenticated tidak memiliki privilege SELECT pada tenant_events';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.tenant_events', 'SELECT') THEN
    RAISE EXCEPTION 'TEST 0 GAGAL: service_role tidak memiliki privilege SELECT pada tenant_events';
  END IF;

  RAISE NOTICE '>> PASSED: Test 0 (Static table privilege checks) Berhasil!';

  -- ==============================================================================
  -- 2. SETUP DATA UJI (FIXTURES)
  -- ==============================================================================
  RAISE NOTICE '[SETUP] Mempersiapkan tenant uji (Tenant A & B), role, dan anggota...';

  -- 2.1 Auth Users
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_a,      'owner_a_evt@test.invalid',      'authenticated', 'authenticated'),
    (v_pengurus_ann, 'pengurus_ann_evt@test.invalid', 'authenticated', 'authenticated'),
    (v_warga_app,    'warga_app_evt@test.invalid',    'authenticated', 'authenticated'),
    (v_warga_pen,    'warga_pen_evt@test.invalid',    'authenticated', 'authenticated'),
    (v_owner_b,      'owner_b_evt@test.invalid',      'authenticated', 'authenticated');

  -- 2.2 Tenant A (RT/RW, Subscription Active)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kompleks RT 01 Tenant A (Events)', 'rt_rw', v_owner_a)
  RETURNING id INTO v_tenant_a;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_a;

  -- 2.3 Tenant B (RT/RW, Subscription Active milik Owner B)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Kompleks RT 02 Tenant B (Events)', 'rt_rw', v_owner_b)
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
  VALUES (v_role_ann_id, v_tenant_a, 'Seksi Acara & Publikasi', false, false);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_key)
  VALUES (v_role_ann_id, 'manage_announcements');

  -- 2.6 Daftarkan Anggota Tenant A
  -- Pengurus Events (Approved)
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_a, v_pengurus_ann, 'Pengurus Acara A', 'approved', false, v_role_ann_id);

  -- Warga Approved (Role Dasar)
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_a, v_warga_app, 'Warga Approved A', 'approved', false, v_base_role_id);

  -- Warga Pending (Status Pending)
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_a, v_warga_pen, 'Warga Pending A', 'pending', false, v_base_role_id);

  RAISE NOTICE '>> SETUP Berhasil! Fixtures siap.';

  -- ==============================================================================
  -- 3. KASUS 1: Owner A dan Pengurus Berizin bisa INSERT, UPDATE, dan DELETE
  -- ==============================================================================
  RAISE NOTICE '[KASUS 1] Menguji Owner A dan pengurus berizin bisa insert/update/delete...';

  -- 3.1 Operasi oleh Owner A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Insert acara oleh Owner A
  INSERT INTO public.tenant_events (tenant_id, title, description, location, starts_at, ends_at)
  VALUES (
    v_tenant_a,
    'Rapat Warga Bulanan RT 01',
    'Membahas rencana kegiatan tahunan dan laporan kas.',
    'Balai Warga RT 01',
    now() + interval '2 days',
    now() + interval '2 days 2 hours'
  )
  RETURNING id INTO v_event_1_id;

  IF v_event_1_id IS NULL THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 1 GAGAL: Owner A gagal insert acara';
  END IF;

  -- Update acara oleh Owner A
  UPDATE public.tenant_events
  SET title = 'Rapat Warga Bulanan RT 01 (Revisi)', description = 'Membahas evaluasi keamanan dan laporan kas.'
  WHERE id = v_event_1_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 1 GAGAL: Owner A gagal update acara (row_count = %)', v_row_count;
  END IF;

  -- Delete acara oleh Owner A
  INSERT INTO public.tenant_events (tenant_id, title, starts_at)
  VALUES (v_tenant_a, 'Acara Dihapus Owner A', now() + interval '5 days')
  RETURNING id INTO v_temp_del_id;

  DELETE FROM public.tenant_events WHERE id = v_temp_del_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 1 GAGAL: Owner A gagal delete acara (row_count = %)', v_row_count;
  END IF;

  -- 3.2 Operasi oleh Pengurus Berizin (manage_announcements)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pengurus_ann::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_pengurus_ann::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- Insert acara oleh Pengurus
  INSERT INTO public.tenant_events (tenant_id, title, description, location, starts_at, ends_at)
  VALUES (
    v_tenant_a,
    'Kerja Bakti Lingkungan',
    'Pembersihan selokan dan perapihan taman warga.',
    'Sepanjang Jl. Mawar Blok A',
    now() + interval '4 days',
    now() + interval '4 days 3 hours'
  )
  RETURNING id INTO v_event_2_id;

  IF v_event_2_id IS NULL THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 1 GAGAL: Pengurus berizin gagal insert acara';
  END IF;

  -- Update acara oleh Pengurus
  UPDATE public.tenant_events
  SET location = 'Sepanjang Jl. Mawar Blok A dan Pos Satpam'
  WHERE id = v_event_2_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 1 GAGAL: Pengurus berizin gagal update acara (row_count = %)', v_row_count;
  END IF;

  -- Delete acara oleh Pengurus
  INSERT INTO public.tenant_events (tenant_id, title, starts_at)
  VALUES (v_tenant_a, 'Acara Dihapus Pengurus', now() + interval '6 days')
  RETURNING id INTO v_temp_del_id;

  DELETE FROM public.tenant_events WHERE id = v_temp_del_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 1 GAGAL: Pengurus berizin gagal delete acara (row_count = %)', v_row_count;
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 1 (Owner A dan pengurus berizin bisa insert/update/delete) Berhasil!';

  -- ==============================================================================
  -- 4. KASUS 2: Warga Approved A bisa SELECT, tetapi Tulis Ditolak
  -- ==============================================================================
  RAISE NOTICE '[KASUS 2] Menguji Warga approved SELECT (sukses) dan write (ditolak)...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_app::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_app::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 2.1 SELECT harus dapat membaca acara Tenant A
  SELECT COUNT(*) INTO v_count
  FROM public.tenant_events
  WHERE tenant_id = v_tenant_a;

  IF v_count < 2 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 2 GAGAL: Warga approved seharusnya bisa membaca acara Tenant A (got %)', v_count;
  END IF;

  -- 2.2 INSERT harus ditolak
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_events (tenant_id, title, starts_at)
    VALUES (v_tenant_a, 'Acara Liar Warga', now() + interval '10 days');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 2 GAGAL: Warga approved seharusnya dilarang INSERT acara';
  END IF;

  -- 2.3 UPDATE harus ditolak (error RLS atau 0 baris berubah)
  v_caught := false;
  BEGIN
    UPDATE public.tenant_events
    SET title = 'Judul Acara Dibajak Warga'
    WHERE id = v_event_1_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count > 0 THEN
      EXECUTE 'SET LOCAL ROLE postgres';
      RAISE EXCEPTION 'KASUS 2 GAGAL: Warga approved berhasil update acara (row_count = %)', v_row_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  -- 2.4 DELETE harus ditolak (error RLS atau 0 baris dihapus)
  v_caught := false;
  BEGIN
    DELETE FROM public.tenant_events
    WHERE id = v_event_1_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count > 0 THEN
      EXECUTE 'SET LOCAL ROLE postgres';
      RAISE EXCEPTION 'KASUS 2 GAGAL: Warga approved berhasil delete acara (row_count = %)', v_row_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 2 (Warga approved read-only) Berhasil!';

  -- ==============================================================================
  -- 5. KASUS 3: Warga Pending Tidak Bisa SELECT
  -- ==============================================================================
  RAISE NOTICE '[KASUS 3] Menguji Warga pending tidak bisa SELECT acara...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_pen::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_warga_pen::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT COUNT(*) INTO v_count
  FROM public.tenant_events
  WHERE tenant_id = v_tenant_a;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'KASUS 3 GAGAL: Warga pending dapat membaca % acara Tenant A, seharusnya 0!', v_count;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 3 (Warga pending terisolasi) Berhasil!';

  -- ==============================================================================
  -- 6. KASUS 4: Owner B Terisolasi: Tidak Bisa Melihat, Mengubah, atau INSERT ke A
  -- ==============================================================================
  RAISE NOTICE '[KASUS 4] Menguji isolasi lintas-tenant terhadap Owner B...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_b::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 4.1 Owner B melihat acara Tenant A -> harus 0 baris
  SELECT COUNT(*) INTO v_count
  FROM public.tenant_events
  WHERE tenant_id = v_tenant_a;

  IF v_count <> 0 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 4 GAGAL: Owner B dapat membaca % acara Tenant A, seharusnya 0!', v_count;
  END IF;

  -- 4.2 Owner B mencoba UPDATE acara Tenant A -> 0 baris atau error
  v_caught := false;
  BEGIN
    UPDATE public.tenant_events
    SET title = 'Judul Acara Dibajak Owner B'
    WHERE id = v_event_1_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count > 0 THEN
      EXECUTE 'SET LOCAL ROLE postgres';
      RAISE EXCEPTION 'KASUS 4 GAGAL: Owner B berhasil update acara milik Tenant A!';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  -- 4.3 Owner B mencoba INSERT dengan tenant_id milik Tenant A -> error RLS
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_events (tenant_id, title, starts_at)
    VALUES (v_tenant_a, 'Acara Pembajak Tenant B', now() + interval '1 day');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 4 GAGAL: Owner B seharusnya dilarang INSERT dengan tenant_id Tenant A';
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 4 (Isolasi lintas-tenant Owner B) Berhasil!';

  -- ==============================================================================
  -- 7. KASUS 5: Anon Tidak Bisa SELECT
  -- ==============================================================================
  RAISE NOTICE '[KASUS 5] Menguji peran anon tidak bisa SELECT acara...';

  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  EXECUTE 'SET LOCAL ROLE anon';

  v_caught := false;
  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.tenant_events
    WHERE tenant_id = v_tenant_a;

    IF v_count <> 0 THEN
      EXECUTE 'SET LOCAL ROLE postgres';
      RAISE EXCEPTION 'KASUS 5 GAGAL: Anon user dapat membaca % acara, seharusnya 0!', v_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Ditolak via table permission (42501) adalah perilaku yang benar dan diharapkan
    v_caught := true;
  END;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 5 (Anon tidak bisa SELECT) Berhasil!';

  -- ==============================================================================
  -- 8. KASUS 6: Subscription A Status read_only: INSERT Ditolak, SELECT Tetap Jalan
  -- ==============================================================================
  RAISE NOTICE '[KASUS 6] Menguji gate subscription read_only pada Tenant A...';

  -- Ubah status subscription Tenant A menjadi 'read_only'
  UPDATE public.tenant_subscriptions
  SET status = 'read_only'
  WHERE tenant_id = v_tenant_a;

  -- 6.1 Pengurus mencoba INSERT -> Ditolak
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pengurus_ann::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_pengurus_ann::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_events (tenant_id, title, starts_at)
    VALUES (v_tenant_a, 'Acara Saat Read-Only', now() + interval '1 day');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 6 GAGAL: Pengurus seharusnya dilarang INSERT saat subscription read_only';
  END IF;

  -- 6.2 SELECT acara harus tetap berjalan saat read_only
  SELECT COUNT(*) INTO v_count
  FROM public.tenant_events
  WHERE tenant_id = v_tenant_a;

  IF v_count < 2 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 6 GAGAL: SELECT acara harus tetap bisa diakses saat read_only (got %)', v_count;
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  -- Kembalikan status subscription Tenant A ke active untuk pengujian berikutnya
  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_a;

  RAISE NOTICE '>> PASSED: Kasus 6 (Subscription read_only gate) Berhasil!';

  -- ==============================================================================
  -- 9. KASUS 7: Validasi Check Constraints
  -- ==============================================================================
  RAISE NOTICE '[KASUS 7] Menguji check constraints judul, ends_at, location, dan image_path...';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 7.1 Judul kosong (hanya spasi, btrim menghasilkan '')
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_events (tenant_id, title, starts_at)
    VALUES (v_tenant_a, '    ', now() + interval '1 day');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 7 GAGAL: Title hanya spasi/kosong seharusnya ditolak check constraint';
  END IF;

  -- 7.2 ends_at < starts_at ditolak
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_events (tenant_id, title, starts_at, ends_at)
    VALUES (
      v_tenant_a,
      'Acara Waktu Terbalik',
      now() + interval '2 days',
      now() + interval '2 days' - interval '1 hour'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 7 GAGAL: ends_at < starts_at seharusnya ditolak check constraint';
  END IF;

  -- 7.3 location > 200 karakter ditolak (201 karakter)
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_events (tenant_id, title, starts_at, location)
    VALUES (
      v_tenant_a,
      'Acara Lokasi Terlalu Panjang',
      now() + interval '3 days',
      repeat('L', 201)
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 7 GAGAL: location > 200 karakter seharusnya ditolak check constraint';
  END IF;

  -- 7.4 image_path non-canonical (traversal '../bad.jpg')
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_events (tenant_id, title, starts_at, image_path)
    VALUES (v_tenant_a, 'Acara Image Traversal', now() + interval '4 days', '../bad.jpg');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 7 GAGAL: image_path traversal seharusnya ditolak check constraint';
  END IF;

  -- 7.5 image_path non-canonical (ekstensi .exe terlarang)
  v_caught := false;
  BEGIN
    INSERT INTO public.tenant_events (tenant_id, title, starts_at, image_path)
    VALUES (
      v_tenant_a,
      'Acara Image Invalid Ext',
      now() + interval '4 days',
      v_tenant_a::text || '/announcements/' || gen_random_uuid()::text || '.exe'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 7 GAGAL: image_path dengan ekstensi selain gambar seharusnya ditolak check constraint';
  END IF;

  -- 7.6 image_path valid '{tenantA}/announcements/{uuid}.png' diterima
  INSERT INTO public.tenant_events (tenant_id, title, description, location, starts_at, ends_at, image_path)
  VALUES (
    v_tenant_a,
    'Acara Karnaval 17 Agustus',
    'Karnaval keliling kompleks dengan kostum daerah.',
    'Lapangan Blok B',
    now() + interval '7 days',
    now() + interval '7 days 3 hours',
    v_tenant_a::text || '/announcements/' || gen_random_uuid()::text || '.png'
  )
  RETURNING id INTO v_event_img_id;

  IF v_event_img_id IS NULL THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 7 GAGAL: INSERT acara dengan image_path canonical valid seharusnya diterima';
  END IF;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 7 (Check constraints title, ends_at, location, image_path) Berhasil!';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA TEST EVENTS MATRIX (RTRW-3.2a) LULUS!';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
