-- Test Suite: Push Notifications Infrastructure (Task KOS-5.3a)
-- Date: 2026-10-27
-- Ref: docs/handoff/KOS-5.md § 5.3
--
-- File ini memvalidasi fitur langganan Web Push & ringkasan harian:
-- 1. Insert auth.users untuk User A dan User B
-- 2. save_push_subscription oleh User A tersimpan dengan user_id A
-- 3. User B tidak bisa membaca (RLS SELECT) milik User A
-- 4. User B tidak bisa menghapus (RLS DELETE maupun RPC delete_push_subscription) milik User A
-- 5. Upsert endpoint sama berhasil memperbarui kunci (p256dh, auth, user_agent)
-- 6. Upsert endpoint sama oleh user berbeda memperbarui kepemilikan user_id
-- 7. Endpoint tidak valid (non-https, NULL, kosong) dan panggilan tanpa login ditolak
-- 8. Direct INSERT dan UPDATE pada push_subscriptions ditolak untuk role authenticated
-- 9. push_daily_summaries terisolasi dari role authenticated (hanya service_role)
-- 10. delete_push_subscription milik sendiri berhasil
-- 11. Mengembalikan role ke postgres di akhir transaksi

BEGIN;

DO $$
DECLARE
  v_user_a          UUID := gen_random_uuid();
  v_user_b          UUID := gen_random_uuid();
  v_tenant_dummy    UUID := gen_random_uuid();
  v_count           INT;
  v_deleted         INT;
  v_res             JSONB;
  v_rec             RECORD;
  v_err_caught      BOOLEAN;
  v_sqlstate        TEXT;
  v_errmsg          TEXT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: PUSH NOTIFICATIONS (KOS-5.3a)';
  RAISE NOTICE '============================================================';

  -- ----------------------------------------------------------------------------
  -- SETUP FIXTURES
  -- ----------------------------------------------------------------------------
  -- 1. auth.users wajib ada sebelum relasi FK push_subscriptions
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_user_a, 'user_a_push@test.invalid', 'authenticated', 'authenticated'),
    (v_user_b, 'user_b_push@test.invalid', 'authenticated', 'authenticated');

  RAISE NOTICE '-> Fixtures auth.users User A dan User B berhasil dibuat.';


  -- ----------------------------------------------------------------------------
  -- UJI 1: save_push_subscription oleh User A tersimpan dengan user_id A
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 1] Menguji save_push_subscription oleh User A...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_res := public.save_push_subscription(
    'https://fcm.googleapis.com/fcm/send/token-user-a-device1',
    'p256dh_sample_key_user_a_12345',
    'auth_sample_token_user_a_67890',
    'Mozilla/5.0 (Android; Mobile)'
  );

  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: save_push_subscription tidak mengembalikan success = true';
  END IF;

  -- Verifikasi row terbaca oleh User A dengan user_id yang sesuai
  SELECT * INTO v_rec
  FROM public.push_subscriptions
  WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/token-user-a-device1';

  IF v_rec.id IS NULL OR v_rec.user_id <> v_user_a THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: Langganan tidak tersimpan dengan user_id User A';
  END IF;

  IF v_rec.p256dh <> 'p256dh_sample_key_user_a_12345' OR v_rec.auth <> 'auth_sample_token_user_a_67890' THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: Kunci enkripsi tidak tersimpan secara akurat';
  END IF;

  RAISE NOTICE '-> OK: Langganan User A tersimpan dengan benar dan berelasi ke user_id A.';


  -- ----------------------------------------------------------------------------
  -- UJI 2: User B tidak bisa membaca milik User A (RLS SELECT)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 2] Menguji isolasi RLS SELECT User B terhadap data User A...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_count
  FROM public.push_subscriptions
  WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/token-user-a-device1';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: User B dapat melihat push_subscriptions milik User A via SELECT';
  END IF;

  RAISE NOTICE '-> OK: User B tidak dapat membaca langganan milik User A.';


  -- ----------------------------------------------------------------------------
  -- UJI 3: User B tidak bisa menghapus milik User A (RLS DELETE & RPC)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 3] Menguji proteksi penghapusan oleh User B...';

  -- 3a. Direct DELETE oleh User B
  DELETE FROM public.push_subscriptions
  WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/token-user-a-device1';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> 0 THEN
    RAISE EXCEPTION 'Uji 3a GAGAL: Direct DELETE oleh User B menghapus baris milik User A';
  END IF;

  -- 3b. RPC delete_push_subscription oleh User B
  v_res := public.delete_push_subscription('https://fcm.googleapis.com/fcm/send/token-user-a-device1');
  IF (v_res->>'deleted')::int <> 0 THEN
    RAISE EXCEPTION 'Uji 3b GAGAL: RPC delete_push_subscription oleh User B menghapus baris milik User A';
  END IF;

  -- Verifikasi sebagai postgres bahwa baris User A masih utuh
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  SELECT count(*) INTO v_count
  FROM public.push_subscriptions
  WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/token-user-a-device1'
    AND user_id = v_user_a;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Uji 3c GAGAL: Langganan User A hilang setelah percobaan hapus oleh User B';
  END IF;

  RAISE NOTICE '-> OK: Percobaan hapus oleh User B (direct DELETE maupun RPC) gagal dan data User A tetap aman.';


  -- ----------------------------------------------------------------------------
  -- UJI 4: Upsert endpoint sama memperbarui kunci
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 4] Menguji upsert endpoint sama memperbarui kunci...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- User A memperbarui kunci pada endpoint yang sama (mis. browser rotate subscription keys)
  v_res := public.save_push_subscription(
    'https://fcm.googleapis.com/fcm/send/token-user-a-device1',
    'p256dh_UPDATED_KEY_12345',
    'auth_UPDATED_TOKEN_67890',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  );

  SELECT * INTO v_rec
  FROM public.push_subscriptions
  WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/token-user-a-device1';

  IF v_rec.p256dh <> 'p256dh_UPDATED_KEY_12345'
     OR v_rec.auth <> 'auth_UPDATED_TOKEN_67890'
     OR v_rec.user_agent <> 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' THEN
    RAISE EXCEPTION 'Uji 4a GAGAL: Upsert tidak memperbarui kolom p256dh, auth, atau user_agent';
  END IF;

  -- 4b. Pergantian akun di perangkat yang sama (User B login di browser yang sama)
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_res := public.save_push_subscription(
    'https://fcm.googleapis.com/fcm/send/token-user-a-device1',
    'p256dh_USER_B_KEY',
    'auth_USER_B_TOKEN',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  );

  -- Verifikasi kepemilikan kini beralih ke User B
  SELECT * INTO v_rec
  FROM public.push_subscriptions
  WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/token-user-a-device1';

  IF v_rec.user_id <> v_user_b OR v_rec.p256dh <> 'p256dh_USER_B_KEY' THEN
    RAISE EXCEPTION 'Uji 4b GAGAL: Upsert oleh User B tidak mengalihkan user_id ke User B';
  END IF;

  RAISE NOTICE '-> OK: Upsert endpoint sama berhasil memperbarui kunci dan mengalihkan kepemilikan akun.';


  -- ----------------------------------------------------------------------------
  -- UJI 5: Endpoint tidak valid ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 5] Menguji penolakan endpoint tidak valid dan tanpa login...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 5a. Endpoint bukan HTTPS (misal HTTP biasa)
  v_err_caught := false;
  BEGIN
    PERFORM public.save_push_subscription(
      'http://insecure.endpoint.example/push/123',
      'p256dh_valid_test_key',
      'auth_valid_test_key'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 5a GAGAL: Endpoint http:// seharusnya ditolak';
  END IF;

  -- 5b. Endpoint NULL
  v_err_caught := false;
  BEGIN
    PERFORM public.save_push_subscription(
      NULL,
      'p256dh_valid_test_key',
      'auth_valid_test_key'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 5b GAGAL: Endpoint NULL seharusnya ditolak';
  END IF;

  -- 5c. Endpoint terlalu pendek (< 10 karakter)
  v_err_caught := false;
  BEGIN
    PERFORM public.save_push_subscription(
      'https://a',
      'p256dh_valid_test_key',
      'auth_valid_test_key'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 5c GAGAL: Endpoint terlalu pendek seharusnya ditolak';
  END IF;

  -- 5d. Pemanggilan tanpa sesi login (auth.uid() NULL)
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';

  v_err_caught := false;
  BEGIN
    PERFORM public.save_push_subscription(
      'https://fcm.googleapis.com/fcm/send/valid-endpoint',
      'p256dh_valid_test_key',
      'auth_valid_test_key'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 5d GAGAL: Pemanggilan save_push_subscription tanpa login tidak melempar 42501';
  END IF;

  RAISE NOTICE '-> OK: Validasi endpoint (protokol HTTPS, panjang) dan pemeriksaan auth.uid() bekerja dengan tepat.';


  -- ----------------------------------------------------------------------------
  -- UJI 6: Direct INSERT dan UPDATE pada push_subscriptions ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 6] Menguji penolakan direct INSERT/UPDATE oleh authenticated...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 6a. Direct INSERT ditolak (permission denied)
  v_err_caught := false;
  BEGIN
    INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (v_user_b, 'https://fcm.googleapis.com/fcm/direct-insert', 'k', 'a');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 6a GAGAL: Direct INSERT oleh role authenticated diizinkan (seharusnya ditolak 42501)';
  END IF;

  -- 6b. Direct UPDATE ditolak (permission denied)
  v_err_caught := false;
  BEGIN
    UPDATE public.push_subscriptions
    SET p256dh = 'tampered_key'
    WHERE user_id = v_user_b;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 6b GAGAL: Direct UPDATE oleh role authenticated diizinkan (seharusnya ditolak 42501)';
  END IF;

  RAISE NOTICE '-> OK: Role authenticated tidak dapat melakukan INSERT atau UPDATE langsung ke tabel push_subscriptions.';


  -- ----------------------------------------------------------------------------
  -- UJI 7: push_daily_summaries terisolasi dari role authenticated
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 7] Menguji proteksi tabel push_daily_summaries...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 7a. SELECT ditolak untuk authenticated
  v_err_caught := false;
  BEGIN
    SELECT count(*) INTO v_count FROM public.push_daily_summaries;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 7a GAGAL: SELECT pada push_daily_summaries diizinkan untuk authenticated';
  END IF;

  -- 7b. INSERT ditolak untuk authenticated
  v_err_caught := false;
  BEGIN
    INSERT INTO public.push_daily_summaries (tenant_id, summary_date)
    VALUES (v_tenant_dummy, CURRENT_DATE);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 7b GAGAL: INSERT pada push_daily_summaries diizinkan untuk authenticated';
  END IF;

  RAISE NOTICE '-> OK: Tabel push_daily_summaries sepenuhnya terproteksi dari akses authenticated (hanya service_role).';


  -- ----------------------------------------------------------------------------
  -- UJI 8: delete_push_subscription milik sendiri berhasil
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 8] Menguji delete_push_subscription milik sendiri...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_res := public.delete_push_subscription('https://fcm.googleapis.com/fcm/send/token-user-a-device1');

  IF (v_res->>'success')::boolean IS NOT TRUE OR (v_res->>'deleted')::int <> 1 THEN
    RAISE EXCEPTION 'Uji 8 GAGAL: delete_push_subscription tidak berhasil menghapus 1 baris';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.push_subscriptions
  WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/token-user-a-device1';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Uji 8 GAGAL: Baris masih ada setelah dihapus oleh pemiliknya';
  END IF;

  RAISE NOTICE '-> OK: delete_push_subscription berhasil menghapus langganan milik sendiri.';


  -- ----------------------------------------------------------------------------
  -- TEARDOWN & RESTORE ROLE
  -- ----------------------------------------------------------------------------
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SELURUH UJI PUSH NOTIFICATIONS (KOS-5.3a) BERHASIL (100%% LULUS)';
  RAISE NOTICE '============================================================';

END $$;

ROLLBACK;
