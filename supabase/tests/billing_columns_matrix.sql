-- Test Suite: Billing Columns & Subscription/Listing Protection Matrix
-- Task: SEC-2.5 (Ref: docs/handoff/SEC-2.md, SEC-2.1)
-- Versi diperbaiki Claude saat apply SEC-2 ke dev (2026-10-10): disesuaikan dengan skema aktual
-- (tenants.owner_id wajib + FK auth.users, trigger handle_new_tenant membuat subscription & member owner,
--  tenant_members tanpa kolom role/email, listing_payments.status bertipe text).
--
-- Skenario:
-- T1  Owner tenant TIDAK BISA update tenant_subscriptions (0 baris).
-- T2  Pemasang listing TIDAK BISA ubah expires_at langsung (SQLSTATE 42501).
-- T2B Pemasang listing TIDAK BISA set is_featured langsung (SQLSTATE 42501).
-- T3  Pemasang listing BISA ubah status ke 'rented_or_sold'.
-- T4  INSERT listing_payments non-privileged dipaksa status='pending', amount=harga katalog, paid_at=NULL.
-- T5  Owner TIDAK BISA update listing_payments menjadi 'paid' (0 baris).
--
-- Jalankan sebagai postgres (SQL Editor / MCP). Semua data uji di-ROLLBACK.
-- Hasil lulus: NOTICE 'SEC2_MATRIX_ALL_PASSED [T1 T2 T2B T3 T4 T5]'. Gagal: EXCEPTION 'TEST x GAGAL'.

BEGIN;

DO $$
DECLARE
  v_owner_user_id UUID := gen_random_uuid();
  v_tenant_id UUID := gen_random_uuid();
  v_member_owner_id UUID;
  v_sub_id UUID;
  v_listing_id UUID;
  v_payment_id UUID;
  v_rows_updated INTEGER;
  v_caught_error BOOLEAN;
  v_sqlstate TEXT;
  v_errmsg TEXT;
  v_check_status text;
  v_pay_status text;
  v_pay_amount NUMERIC(12,2);
  v_pay_paid_at TIMESTAMPTZ;
  v_expected_price NUMERIC(12,2);
  v_results text := '';
BEGIN
  -- Setup (postgres)
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_owner_user_id, 'sec2-matrix-' || v_owner_user_id || '@example.test', 'authenticated', 'authenticated');

  INSERT INTO public.listing_pricing (listing_type, is_featured, duration_days, price)
  VALUES ('room_vacancy', false, 30, 15000.00)
  ON CONFLICT (listing_type, is_featured, duration_days) DO UPDATE SET price = 15000.00;
  SELECT price INTO v_expected_price FROM public.listing_pricing
  WHERE listing_type = 'room_vacancy' AND is_featured = false AND duration_days = 30;

  -- handle_new_tenant otomatis membuat subscription trial + member owner
  INSERT INTO public.tenants (id, name, type, owner_id, address)
  VALUES (v_tenant_id, 'Kompleks Uji Keamanan SEC-2', 'kos', v_owner_user_id, 'Jl. Uji No. 10');
  SELECT id INTO v_sub_id FROM public.tenant_subscriptions WHERE tenant_id = v_tenant_id;
  SELECT id INTO v_member_owner_id FROM public.tenant_members WHERE tenant_id = v_tenant_id AND user_id = v_owner_user_id;
  IF v_sub_id IS NULL OR v_member_owner_id IS NULL THEN
    RAISE EXCEPTION 'SETUP GAGAL: sub %, member %', v_sub_id, v_member_owner_id;
  END IF;
  UPDATE public.tenant_members SET status = 'approved' WHERE id = v_member_owner_id;

  INSERT INTO public.public_listings (tenant_id, posted_by, type, title, contact_phone, status, is_featured, expires_at)
  VALUES (v_tenant_id, v_member_owner_id, 'room_vacancy', 'Kamar Kos Uji', '081234567890', 'active', false, now() + interval '30 days')
  RETURNING id INTO v_listing_id;

  -- TODO(PAY-1.7): hapus policy sementara ini setelah policy SELECT public_listings dipulihkan (F9).
  -- Tanpa policy SELECT, UPDATE pemilik listing mengenai 0 baris sehingga trigger tidak pernah teruji.
  CREATE POLICY "tmp_sec2_matrix_select" ON public.public_listings FOR SELECT USING (true);

  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- T1
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.tenant_subscriptions SET status = 'active', current_period_end = now() + interval '10 years' WHERE id = v_sub_id;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  PERFORM set_config('role', 'postgres', true);
  SELECT status::text INTO v_check_status FROM public.tenant_subscriptions WHERE id = v_sub_id;
  IF v_rows_updated > 0 OR v_check_status <> 'trial' THEN RAISE EXCEPTION 'TEST 1 GAGAL: rows %, status %', v_rows_updated, v_check_status; END IF;
  v_results := v_results || 'T1 ';

  -- T2
  PERFORM set_config('role', 'authenticated', true);
  v_caught_error := false; v_sqlstate := NULL; v_rows_updated := NULL;
  BEGIN
    UPDATE public.public_listings SET expires_at = now() + interval '1 year' WHERE id = v_listing_id;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_caught_error := true; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'postgres', true);
  IF NOT v_caught_error OR v_sqlstate <> '42501' THEN RAISE EXCEPTION 'TEST 2 GAGAL: caught %, sqlstate %, rows %, err %', v_caught_error, v_sqlstate, v_rows_updated, v_errmsg; END IF;
  v_results := v_results || 'T2 ';

  -- T2B
  PERFORM set_config('role', 'authenticated', true);
  v_caught_error := false; v_sqlstate := NULL;
  BEGIN
    UPDATE public.public_listings SET is_featured = true WHERE id = v_listing_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught_error := true; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'postgres', true);
  IF NOT v_caught_error OR v_sqlstate <> '42501' THEN RAISE EXCEPTION 'TEST 2B GAGAL: caught %, sqlstate %, err %', v_caught_error, v_sqlstate, v_errmsg; END IF;
  v_results := v_results || 'T2B ';

  -- T3
  PERFORM set_config('role', 'authenticated', true);
  v_caught_error := false; v_sqlstate := NULL;
  BEGIN
    UPDATE public.public_listings SET status = 'rented_or_sold' WHERE id = v_listing_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught_error := true; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'postgres', true);
  SELECT status::text INTO v_check_status FROM public.public_listings WHERE id = v_listing_id;
  IF v_caught_error OR v_check_status <> 'rented_or_sold' THEN RAISE EXCEPTION 'TEST 3 GAGAL: caught %, sqlstate %, err %, status %', v_caught_error, v_sqlstate, v_errmsg, v_check_status; END IF;
  v_results := v_results || 'T3 ';

  -- T4
  PERFORM set_config('role', 'authenticated', true);
  v_caught_error := false;
  BEGIN
    INSERT INTO public.listing_payments (listing_id, amount, status, is_featured, duration_days, paid_at)
    VALUES (v_listing_id, 100.00, 'paid', false, 30, now()) RETURNING id INTO v_payment_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught_error := true; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'postgres', true);
  IF v_caught_error THEN RAISE EXCEPTION 'TEST 4 GAGAL: sqlstate %, err %', v_sqlstate, v_errmsg; END IF;
  SELECT status, amount, paid_at INTO v_pay_status, v_pay_amount, v_pay_paid_at FROM public.listing_payments WHERE id = v_payment_id;
  IF v_pay_status <> 'pending' OR v_pay_amount <> v_expected_price OR v_pay_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 4 GAGAL: status %, amount % (harus %), paid_at %', v_pay_status, v_pay_amount, v_expected_price, v_pay_paid_at;
  END IF;
  v_results := v_results || 'T4 ';

  -- T5
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.listing_payments SET status = 'paid', paid_at = now() WHERE id = v_payment_id;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  PERFORM set_config('role', 'postgres', true);
  SELECT status INTO v_pay_status FROM public.listing_payments WHERE id = v_payment_id;
  IF v_rows_updated > 0 OR v_pay_status <> 'pending' THEN RAISE EXCEPTION 'TEST 5 GAGAL: rows %, status %', v_rows_updated, v_pay_status; END IF;
  v_results := v_results || 'T5 ';

  RAISE NOTICE 'SEC2_MATRIX_ALL_PASSED [%] amount=%', trim(v_results), v_pay_amount;
END;
$$;

ROLLBACK;
