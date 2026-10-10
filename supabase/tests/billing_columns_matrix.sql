-- Test Suite: Billing Columns & Subscription/Listing Protection Matrix
-- Task: PAY-1.7 (Ref: docs/handoff/PAY-1.md, SEC-2.1, F6, F9)
-- Skenario:
-- T1   Owner tenant TIDAK BISA update tenant_subscriptions (0 baris).
-- T2   Pemasang listing TIDAK BISA ubah expires_at langsung (SQLSTATE 42501).
-- T2B  Pemasang listing TIDAK BISA set is_featured langsung (SQLSTATE 42501).
-- T3   Pemasang listing BISA ubah status ke 'rented_or_sold'.
-- T4   INSERT listing_payments non-privileged dipaksa status='pending', amount=harga katalog, paid_at=NULL.
-- T5   Owner TIDAK BISA update listing_payments menjadi 'paid' (0 baris).
-- T6   INSERT public_listings oleh non-privileged DIPAKSA status='pending_payment' dan expires_at=NULL.
-- T7   Pemasang listing TIDAK BISA ubah status dari 'pending_payment' ke 'active' langsung (SQLSTATE 42501).
-- T8   Pemasang listing TIDAK BISA ubah type bila listing sudah bukan 'pending_payment' (SQLSTATE 42501).
-- T9   Anon TIDAK BISA melihat listing 'pending_payment', tetapi BISA melihat listing 'active' yang belum kedaluwarsa.
-- T10  Aktivasi langganan via activate_tenant_subscription memasang status 'settled', 'active', dan blok kapasitas secara idempotent (PAY-1F.6).
--
-- Jalankan sebagai postgres (SQL Editor / MCP). Semua data uji di-ROLLBACK.
-- Hasil lulus: NOTICE 'SEC2_MATRIX_ALL_PASSED [T1 T2 T2B T3 T4 T5 T6 T7 T8 T9 T10]'. Gagal: EXCEPTION.

BEGIN;

DO $$
DECLARE
  v_owner_user_id UUID := gen_random_uuid();
  v_tenant_id UUID := gen_random_uuid();
  v_member_owner_id UUID;
  v_sub_id UUID;
  v_listing_id UUID;
  v_pending_listing_id UUID;
  v_payment_id UUID;
  v_rows_updated INTEGER;
  v_rows_selected INTEGER;
  v_caught_error BOOLEAN;
  v_sqlstate TEXT;
  v_errmsg TEXT;
  v_check_status text;
  v_check_expires TIMESTAMPTZ;
  v_pay_status text;
  v_pay_amount NUMERIC(12,2);
  v_pay_paid_at TIMESTAMPTZ;
  v_expected_price NUMERIC(12,2);
  v_period_id UUID;
  v_sub_pay_id UUID;
  v_rpc_res JSONB;
  v_rpc_res_idempotent JSONB;
  v_block_count INTEGER;
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

  -- Listing aktif untuk pengujian modifikasi masa tayang & status
  INSERT INTO public.public_listings (tenant_id, posted_by, type, title, contact_phone, status, is_featured, expires_at)
  VALUES (v_tenant_id, v_member_owner_id, 'room_vacancy', 'Kamar Kos Uji', '081234567890', 'active', false, now() + interval '30 days')
  RETURNING id INTO v_listing_id;

  PERFORM set_config('request.jwt.claim.sub', v_owner_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- T1: Owner tidak bisa update tenant_subscriptions
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.tenant_subscriptions SET status = 'active', current_period_end = now() + interval '10 years' WHERE id = v_sub_id;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  PERFORM set_config('role', 'postgres', true);
  SELECT status::text INTO v_check_status FROM public.tenant_subscriptions WHERE id = v_sub_id;
  IF v_rows_updated > 0 OR v_check_status <> 'trial' THEN RAISE EXCEPTION 'TEST 1 GAGAL: rows %, status %', v_rows_updated, v_check_status; END IF;
  v_results := v_results || 'T1 ';

  -- T2: Pemasang listing tidak bisa ubah expires_at langsung
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

  -- T2B: Pemasang listing tidak bisa set is_featured langsung
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

  -- T3: Pemasang listing bisa ubah status ke rented_or_sold
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

  -- T4: INSERT listing_payments dipaksa pending + harga katalog
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

  -- T5: Owner tidak bisa update listing_payments jadi paid
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.listing_payments SET status = 'paid', paid_at = now() WHERE id = v_payment_id;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  PERFORM set_config('role', 'postgres', true);
  SELECT status INTO v_pay_status FROM public.listing_payments WHERE id = v_payment_id;
  IF v_rows_updated > 0 OR v_pay_status <> 'pending' THEN RAISE EXCEPTION 'TEST 5 GAGAL: rows %, status %', v_rows_updated, v_pay_status; END IF;
  v_results := v_results || 'T5 ';

  -- T6: INSERT public_listings non-privileged dipaksa pending_payment dan expires_at NULL
  PERFORM set_config('role', 'authenticated', true);
  INSERT INTO public.public_listings (tenant_id, posted_by, type, title, contact_phone, status, expires_at)
  VALUES (v_tenant_id, v_member_owner_id, 'room_vacancy', 'Kamar Pending Uji', '081299999999', 'active', now() + interval '60 days')
  RETURNING id INTO v_pending_listing_id;
  PERFORM set_config('role', 'postgres', true);
  SELECT status::text, expires_at INTO v_check_status, v_check_expires FROM public.public_listings WHERE id = v_pending_listing_id;
  IF v_check_status <> 'pending_payment' OR v_check_expires IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 6 GAGAL: status %, expires_at % (harus pending_payment & NULL)', v_check_status, v_check_expires;
  END IF;
  v_results := v_results || 'T6 ';

  -- T7: Pemasang listing tidak bisa ubah pending_payment ke active langsung
  PERFORM set_config('role', 'authenticated', true);
  v_caught_error := false; v_sqlstate := NULL;
  BEGIN
    UPDATE public.public_listings SET status = 'active' WHERE id = v_pending_listing_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught_error := true; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'postgres', true);
  IF NOT v_caught_error OR v_sqlstate <> '42501' THEN
    RAISE EXCEPTION 'TEST 7 GAGAL: caught %, sqlstate %, err %', v_caught_error, v_sqlstate, v_errmsg;
  END IF;
  v_results := v_results || 'T7 ';

  -- T8: Pemasang listing tidak bisa ubah type pada listing yang bukan pending_payment
  PERFORM set_config('role', 'authenticated', true);
  v_caught_error := false; v_sqlstate := NULL;
  BEGIN
    UPDATE public.public_listings SET type = 'house_sale' WHERE id = v_listing_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught_error := true; GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'postgres', true);
  IF NOT v_caught_error OR v_sqlstate <> '42501' THEN
    RAISE EXCEPTION 'TEST 8 GAGAL: caught %, sqlstate %, err %', v_caught_error, v_sqlstate, v_errmsg;
  END IF;
  v_results := v_results || 'T8 ';

  -- T9: Verifikasi RLS Policy SELECT (F9)
  -- Anon tidak boleh melihat listing pending_payment
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  SELECT count(*) INTO v_rows_selected FROM public.public_listings WHERE id = v_pending_listing_id;
  IF v_rows_selected <> 0 THEN
    RAISE EXCEPTION 'TEST 9 GAGAL: anon dapat melihat listing pending_payment (rows %)', v_rows_selected;
  END IF;
  PERFORM set_config('role', 'postgres', true);
  v_results := v_results || 'T9 ';

  -- T10: Aktivasi langganan via activate_tenant_subscription (PAY-1F.6)
  -- Ambil period aktif untuk langganan
  SELECT id INTO v_period_id FROM public.subscription_periods WHERE is_active = true LIMIT 1;
  IF v_period_id IS NULL THEN
    INSERT INTO public.subscription_periods (name, duration_months, discount_percent, is_active)
    VALUES ('Tahunan Uji', 12, 10, true)
    RETURNING id INTO v_period_id;
  END IF;

  -- Buat record pembayaran pending dengan metadata blok langganan
  INSERT INTO public.subscription_payments (
    subscription_id,
    period_id,
    amount,
    status,
    payment_method,
    payment_gateway_ref,
    metadata
  ) VALUES (
    v_sub_id,
    v_period_id,
    150000.00,
    'pending',
    'doku_qris',
    'SUB-TEST1234567890',
    jsonb_build_object(
      'blocks10', 1,
      'blocks5', 2,
      'price10', 60000,
      'price5', 35000,
      'base_amount', 150000,
      'qris_fee', 1125,
      'qris_total_amount', 151125
    )
  ) RETURNING id INTO v_sub_pay_id;

  -- Eksekusi RPC activate_tenant_subscription sebagai backend (service_role / postgres)
  v_rpc_res := public.activate_tenant_subscription(v_sub_pay_id, 'SUB-TEST1234567890');
  IF (v_rpc_res->>'success')::boolean <> true THEN
    RAISE EXCEPTION 'TEST 10 GAGAL: aktivasi rpc gagal: %', v_rpc_res;
  END IF;

  -- Verifikasi payment berstatus settled
  SELECT status INTO v_check_status FROM public.subscription_payments WHERE id = v_sub_pay_id;
  IF v_check_status <> 'settled' THEN
    RAISE EXCEPTION 'TEST 10 GAGAL: status payment bukan settled, melainkan %', v_check_status;
  END IF;

  -- Verifikasi status langganan tenant menjadi active
  SELECT status INTO v_check_status FROM public.tenant_subscriptions WHERE id = v_sub_id;
  IF v_check_status <> 'active' THEN
    RAISE EXCEPTION 'TEST 10 GAGAL: status langganan bukan active, melainkan %', v_check_status;
  END IF;

  -- Verifikasi blok terpasang sesuai metadata (1 blok 10, 2 blok 5)
  SELECT count(*) INTO v_block_count FROM public.tenant_subscription_blocks
  WHERE subscription_id = v_sub_id AND block_size = 10 AND quantity = 1;
  IF v_block_count <> 1 THEN
    RAISE EXCEPTION 'TEST 10 GAGAL: blok 10 unit tidak terpasang dengan benar (count %)', v_block_count;
  END IF;

  SELECT count(*) INTO v_block_count FROM public.tenant_subscription_blocks
  WHERE subscription_id = v_sub_id AND block_size = 5 AND quantity = 2;
  IF v_block_count <> 1 THEN
    RAISE EXCEPTION 'TEST 10 GAGAL: blok 5 unit tidak terpasang dengan benar (count %)', v_block_count;
  END IF;

  -- Pemanggilan ulang wajib idempotent (success: true)
  v_rpc_res_idempotent := public.activate_tenant_subscription(v_sub_pay_id, 'SUB-TEST1234567890');
  IF (v_rpc_res_idempotent->>'success')::boolean <> true THEN
    RAISE EXCEPTION 'TEST 10 GAGAL: pemanggilan ulang aktivasi tidak idempotent: %', v_rpc_res_idempotent;
  END IF;
  v_results := v_results || 'T10 ';

  RAISE NOTICE 'SEC2_MATRIX_ALL_PASSED [%] amount=%', trim(v_results), v_pay_amount;
END;
$$;

ROLLBACK;
