-- Test Suite: Billing Columns & Subscription/Listing Protection Matrix
-- Task: SEC-2.5 (Ref: docs/handoff/SEC-2.md, SEC-2.1)
-- Date: 2026-10-09
--
-- File ini memvalidasi proteksi database terhadap bypass pembayaran:
-- 1. Owner tenant TIDAK BISA update tenant_subscriptions (status='active', current_period_end).
-- 2. Pemasang listing TIDAK BISA update expires_at atau is_featured langsung (SQLSTATE 42501).
-- 3. Pemasang listing BISA update status ke 'rented_or_sold'.
-- 4. INSERT listing_payments oleh pemanggil non-privileged dipaksa status='pending' dan nominal resmi.

BEGIN;

DO $$
DECLARE
  -- Identitas pengujian
  v_owner_user_id UUID := gen_random_uuid();
  v_other_user_id UUID := gen_random_uuid();
  v_tenant_id UUID := gen_random_uuid();
  v_member_owner_id UUID;
  v_sub_id UUID;
  v_listing_id UUID;
  v_payment_id UUID;

  -- Variabel pengujian
  v_rows_updated INTEGER;
  v_caught_error BOOLEAN;
  v_sqlstate TEXT;
  v_errmsg TEXT;
  v_check_status public.subscription_status;
  v_pay_status public.payment_status;
  v_pay_amount NUMERIC(12,2);
  v_pay_paid_at TIMESTAMPTZ;
  v_expected_price NUMERIC(12,2);
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: BILLING COLUMNS PROTECTION MATRIX (SEC-2.5)';
  RAISE NOTICE '============================================================';

  -- ------------------------------------------------------------
  -- Setup Data Awal (Privileged Setup via postgres / service_role)
  -- ------------------------------------------------------------
  -- 1. Pastikan harga catalog listing_pricing ada untuk room_vacancy standar 30 hari
  INSERT INTO public.listing_pricing (listing_type, is_featured, duration_days, price)
  VALUES ('room_vacancy', false, 30, 15000.00)
  ON CONFLICT (listing_type, is_featured, duration_days) DO UPDATE
  SET price = 15000.00;

  SELECT price INTO v_expected_price
  FROM public.listing_pricing
  WHERE listing_type = 'room_vacancy' AND is_featured = false AND duration_days = 30;

  -- 2. Buat tenant uji
  INSERT INTO public.tenants (id, name, type, address)
  VALUES (v_tenant_id, 'Kompleks Uji Keamanan SEC-2', 'kos', 'Jl. Uji Keamanan No. 10')
  ON CONFLICT (id) DO NOTHING;

  -- 3. Buat tenant_member untuk owner
  INSERT INTO public.tenant_members (id, tenant_id, user_id, role, status, email, full_name)
  VALUES (gen_random_uuid(), v_tenant_id, v_owner_user_id, 'admin', 'approved', 'owner@example.com', 'Owner Uji SEC2')
  RETURNING id INTO v_member_owner_id;

  -- 4. Buat subscription awal (status = 'trial')
  INSERT INTO public.tenant_subscriptions (id, tenant_id, status, trial_started_at, trial_ends_at, current_period_start, current_period_end)
  VALUES (gen_random_uuid(), v_tenant_id, 'trial', now(), now() + interval '14 days', now(), now() + interval '14 days')
  RETURNING id INTO v_sub_id;

  -- 5. Buat listing awal (status = 'active', expires_at = now() + 30 days, is_featured = false)
  INSERT INTO public.public_listings (id, tenant_id, posted_by, type, title, contact_phone, status, is_featured, expires_at)
  VALUES (gen_random_uuid(), v_tenant_id, v_member_owner_id, 'room_vacancy', 'Kamar Kos Bersih Nyaman', '081234567890', 'active', false, now() + interval '30 days')
  RETURNING id INTO v_listing_id;

  RAISE NOTICE 'Setup data selesai. Tenant: %, Sub: %, Listing: %', v_tenant_id, v_sub_id, v_listing_id;


  -- ============================================================
  -- SKENARIO 1: Owner Tenant UPDATE tenant_subscriptions
  -- ============================================================
  RAISE NOTICE '[TEST 1] Owner tenant mencoba UPDATE status langganan ke active secara langsung...';

  -- Set claims sebagai authenticated owner tenant
  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Eksekusi update langsung oleh owner tenant
  UPDATE public.tenant_subscriptions
  SET status = 'active',
      current_period_end = now() + interval '10 years'
  WHERE id = v_sub_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- Reset role ke postgres untuk verifikasi
  PERFORM set_config('role', 'postgres', true);

  SELECT status INTO v_check_status
  FROM public.tenant_subscriptions
  WHERE id = v_sub_id;

  IF v_rows_updated > 0 OR v_check_status != 'trial' THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: Owner berhasil meng-update tenant_subscriptions! (rows: %, status: %)',
      v_rows_updated, v_check_status;
  END IF;

  RAISE NOTICE 'TEST 1 LULUS: Update tenant_subscriptions oleh owner ditolak (0 rows diupdate, status tetap trial).';


  -- ============================================================
  -- SKENARIO 2: Pemasang listing UPDATE expires_at langsung
  -- ============================================================
  RAISE NOTICE '[TEST 2] Pemasang listing mencoba UPDATE expires_at = now() + 1 year langsung...';

  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  v_caught_error := false;
  v_sqlstate := NULL;

  BEGIN
    UPDATE public.public_listings
    SET expires_at = now() + interval '1 year'
    WHERE id = v_listing_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught_error := true;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;

  PERFORM set_config('role', 'postgres', true);

  IF NOT v_caught_error OR v_sqlstate != '42501' THEN
    RAISE EXCEPTION 'TEST 2 GAGAL: Update expires_at tidak melempar 42501! (caught: %, sqlstate: %, err: %)',
      v_caught_error, v_sqlstate, v_errmsg;
  END IF;

  RAISE NOTICE 'TEST 2 LULUS: Manipulasi expires_at langsung dicegat trigger dengan SQLSTATE 42501.';


  -- ============================================================
  -- SKENARIO 2B: Pemasang listing UPDATE is_featured langsung
  -- ============================================================
  RAISE NOTICE '[TEST 2B] Pemasang listing mencoba UPDATE is_featured = true langsung...';

  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  v_caught_error := false;
  v_sqlstate := NULL;

  BEGIN
    UPDATE public.public_listings
    SET is_featured = true
    WHERE id = v_listing_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught_error := true;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;

  PERFORM set_config('role', 'postgres', true);

  IF NOT v_caught_error OR v_sqlstate != '42501' THEN
    RAISE EXCEPTION 'TEST 2B GAGAL: Update is_featured tidak melempar 42501! (caught: %, sqlstate: %, err: %)',
      v_caught_error, v_sqlstate, v_errmsg;
  END IF;

  RAISE NOTICE 'TEST 2B LULUS: Manipulasi is_featured langsung dicegat trigger dengan SQLSTATE 42501.';


  -- ============================================================
  -- SKENARIO 3: Pemasang listing UPDATE status ke 'rented_or_sold'
  -- ============================================================
  RAISE NOTICE '[TEST 3] Pemasang listing UPDATE status ke rented_or_sold...';

  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  v_caught_error := false;
  v_sqlstate := NULL;

  BEGIN
    UPDATE public.public_listings
    SET status = 'rented_or_sold'
    WHERE id = v_listing_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught_error := true;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;

  PERFORM set_config('role', 'postgres', true);

  IF v_caught_error THEN
    RAISE EXCEPTION 'TEST 3 GAGAL: Update status ke rented_or_sold gagal! (sqlstate: %, err: %)',
      v_sqlstate, v_errmsg;
  END IF;

  SELECT status INTO v_check_status
  FROM public.public_listings
  WHERE id = v_listing_id;

  IF v_check_status::text != 'rented_or_sold' THEN
    RAISE EXCEPTION 'TEST 3 GAGAL: Status listing di database bukan rented_or_sold melainkan %', v_check_status;
  END IF;

  RAISE NOTICE 'TEST 3 LULUS: Transisi status ke rented_or_sold berhasil diperbarui.';


  -- ============================================================
  -- SKENARIO 4: INSERT listing_payments dipaksa status='pending'
  -- ============================================================
  RAISE NOTICE '[TEST 4] Pemasang listing mencoba INSERT listing_payments dengan status=paid dan amount palsu...';

  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);

  v_caught_error := false;

  BEGIN
    INSERT INTO public.listing_payments (
      listing_id,
      amount,
      status,
      is_featured,
      duration_days,
      paid_at
    )
    VALUES (
      v_listing_id,
      100.00,                      -- Mencoba bayar Rp 100 padahal tarif Rp 15.000
      'paid',                      -- Mencoba klaim sudah bayar
      false,
      30,
      now()                        -- Mencoba set paid_at
    )
    RETURNING id INTO v_payment_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught_error := true;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;

  PERFORM set_config('role', 'postgres', true);

  IF v_caught_error THEN
    RAISE EXCEPTION 'TEST 4 GAGAL: Insert listing_payments melempar exception tak terduga! (sqlstate: %, err: %)',
      v_sqlstate, v_errmsg;
  END IF;

  SELECT status, amount, paid_at
  INTO v_pay_status, v_pay_amount, v_pay_paid_at
  FROM public.listing_payments
  WHERE id = v_payment_id;

  IF v_pay_status != 'pending' THEN
    RAISE EXCEPTION 'TEST 4 GAGAL: status listing_payment tidak dipaksa ke pending! Nilai aktual: %', v_pay_status;
  END IF;

  IF v_pay_amount != v_expected_price THEN
    RAISE EXCEPTION 'TEST 4 GAGAL: amount listing_payment (%) tidak disesuaikan dengan harga resmi catalog (%)!',
      v_pay_amount, v_expected_price;
  END IF;

  IF v_pay_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 4 GAGAL: paid_at tidak di-reset ke NULL! Nilai aktual: %', v_pay_paid_at;
  END IF;

  RAISE NOTICE 'TEST 4 LULUS: Trigger berhasil memaksa status=pending, amount=%, paid_at=NULL.', v_pay_amount;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA SKENARIO TEST SEC-2.5 SELESAI DENGAN SUKSES!';
  RAISE NOTICE '============================================================';
END;
$$;

ROLLBACK;
