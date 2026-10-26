-- Test Suite: Kos Contract Additional Fees & Line Items (Task KOS-4.1)
-- Date: 2026-10-26
-- Ref: docs/handoff/KOS-4.md § 4.1
--
-- File ini memvalidasi aturan biaya tambahan dan line_items pada kontrak kos:
-- 1. create_kos_contract: otorisasi ditolak untuk pemanggil tanpa hak (42501)
-- 2. create_kos_contract: kontrak tanpa biaya = perilaku lama (amount = sewa, line_items 1 baris)
-- 3. create_kos_contract: kontrak + Parkir 100.000 (siklus start_date) -> tagihan pertama sewa + 100.000
--    dengan line_items 2 baris; generator periode berikutnya menghasilkan tagihan yang sama; idempoten
-- 4. create_kos_contract: prorata + biaya -> keduanya diprorata, dibulatkan ke bawah ke ribuan,
--    line_items memuat sewa dan biaya prorata (jumlah persis sama dengan total tagihan)
-- 5. create_kos_contract: validasi biaya tidak valid (nama kosong, nominal negatif, >10 item, bukan array) ditolak
-- 6. generate_kos_contract_bills: otorisasi ditolak untuk role authenticated (42501)

BEGIN;

DO $$
DECLARE
  v_owner_kos       UUID := gen_random_uuid();
  v_user_unauth     UUID := gen_random_uuid();
  v_user_no_fee     UUID := gen_random_uuid();
  v_user_with_fee   UUID := gen_random_uuid();
  v_user_prorata    UUID := gen_random_uuid();
  v_tenant_kos      UUID;
  v_role_kos_id     UUID;
  v_room_no_fee_id  BIGINT;
  v_room_with_fee_id BIGINT;
  v_room_prorata_id BIGINT;
  v_room_inv_id     BIGINT;
  v_member_no_fee_id UUID;
  v_member_with_fee_id UUID;
  v_member_prorata_id UUID;
  v_res             JSONB;
  v_contract_rec    RECORD;
  v_bill_rec        RECORD;
  v_bill_count      INT;
  v_today           DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_cand_date       DATE;
  v_test_start_date DATE;
  v_next_month_gen  DATE;
  v_err_caught      BOOLEAN;
  v_sqlstate        TEXT;
  v_errmsg          TEXT;
  v_offset          INT;
  v_sum_line_items  NUMERIC;
  v_expected_prorata_total NUMERIC;
  v_expected_fee_prorata   NUMERIC;
  v_expected_rent_prorata  NUMERIC;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: KOS CONTRACT FEES & LINE ITEMS (KOS-4.1)';
  RAISE NOTICE '============================================================';

  -- ----------------------------------------------------------------------------
  -- SETUP FIXTURES
  -- ----------------------------------------------------------------------------
  -- 1. auth.users wajib ada sebelum relasi tenant_members (FK)
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_kos,     'owner_fees@test.invalid',     'authenticated', 'authenticated'),
    (v_user_unauth,   'unauth_fees@test.invalid',    'authenticated', 'authenticated'),
    (v_user_no_fee,   'nofee_fees@test.invalid',     'authenticated', 'authenticated'),
    (v_user_with_fee, 'withfee_fees@test.invalid',   'authenticated', 'authenticated'),
    (v_user_prorata,  'prorata_fees@test.invalid',   'authenticated', 'authenticated');

  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES ('Kos Fees Test Suite', 'kos', v_owner_kos, '{"rent_grace_days": 10, "default_rent_price": 1500000}'::jsonb)
  RETURNING id INTO v_tenant_kos;

  SELECT id INTO v_role_kos_id FROM public.tenant_roles WHERE tenant_id = v_tenant_kos AND is_base_role = true LIMIT 1;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Tanpa Biaya', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_no_fee_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Dgn Parkir', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_with_fee_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Prorata Fee', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_prorata_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Validasi Fee', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_inv_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_no_fee, 'Penyewa No Fee', 'approved', false, v_room_no_fee_id, v_role_kos_id)
  RETURNING id INTO v_member_no_fee_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_with_fee, 'Penyewa With Fee', 'approved', false, v_room_with_fee_id, v_role_kos_id)
  RETURNING id INTO v_member_with_fee_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_prorata, 'Penyewa Prorata Fee', 'approved', false, v_room_prorata_id, v_role_kos_id)
  RETURNING id INTO v_member_prorata_id;

  -- Cari tanggal 19 pada bulan berdurasi 31 hari dalam 12 bulan terakhir (aturan validasi K9)
  FOR v_offset IN 0..11 LOOP
    v_cand_date := (date_trunc('month', v_today - (v_offset || ' month')::interval) + interval '18 days')::date;
    IF EXTRACT(DAY FROM (date_trunc('month', v_cand_date) + interval '1 month' - interval '1 day'))::INT = 31 THEN
      v_test_start_date := v_cand_date;
      EXIT;
    END IF;
  END LOOP;

  IF v_test_start_date IS NULL THEN
    RAISE EXCEPTION 'Setup gagal: tidak ditemukan bulan 31 hari dalam 12 bulan terakhir';
  END IF;

  v_next_month_gen := (date_trunc('month', v_test_start_date) + interval '1 month' + interval '10 days')::date;

  RAISE NOTICE 'Fixture tanggal: start_date=%, next_month_gen=%',
    v_test_start_date, v_next_month_gen;


  -- ----------------------------------------------------------------------------
  -- UJI 1: create_kos_contract ditolak untuk user tanpa izin (SEC-1.1 / 42501)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 1] Menguji otorisasi pemanggil create_kos_contract...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_unauth, 'role', 'authenticated')::text, true);

  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos, v_room_no_fee_id, v_member_no_fee_id, 'No Fee', 1500000, v_test_start_date, NULL, 10
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: User tanpa izin diizinkan membuat kontrak!';
  END IF;
  RAISE NOTICE '-> OK: Akses create_kos_contract ditolak untuk user tanpa izin (42501).';


  -- ----------------------------------------------------------------------------
  -- UJI 2: Kontrak tanpa biaya = perilaku lama (amount = sewa, line_items 1 baris)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 2] Menguji kontrak tanpa biaya tambahan (perilaku lama)...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  v_res := public.create_kos_contract(
    v_tenant_kos,
    v_room_no_fee_id,
    v_member_no_fee_id,
    'Penyewa No Fee',
    1500000,
    v_test_start_date,
    NULL,
    10,
    'Kontrak tanpa biaya'
  );

  SELECT * INTO v_contract_rec FROM public.kos_contracts WHERE id = (v_res->>'contract_id')::uuid;
  IF v_contract_rec.additional_fees <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: additional_fees di kos_contracts bukan empty array, aktual: %', v_contract_rec.additional_fees;
  END IF;

  SELECT * INTO v_bill_rec FROM public.billing_items WHERE contract_id = v_contract_rec.id;
  IF v_bill_rec.amount <> 1500000 THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: amount tagihan pertama bukan 1500000, aktual: %', v_bill_rec.amount;
  END IF;

  IF jsonb_array_length(v_bill_rec.metadata->'line_items') <> 1 THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: line_items tanpa biaya harus tepat 1 baris, aktual: %', jsonb_array_length(v_bill_rec.metadata->'line_items');
  END IF;

  IF (v_bill_rec.metadata->'line_items'->0->>'name') <> 'Sewa' THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: nama item pertama bukan Sewa, aktual: %', v_bill_rec.metadata->'line_items'->0->>'name';
  END IF;

  IF (v_bill_rec.metadata->'line_items'->0->>'amount')::numeric <> 1500000 THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: amount line_item Sewa bukan 1500000, aktual: %', v_bill_rec.metadata->'line_items'->0->>'amount';
  END IF;

  SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
  INTO v_sum_line_items
  FROM jsonb_array_elements(v_bill_rec.metadata->'line_items') AS elem;

  IF v_sum_line_items <> v_bill_rec.amount THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: sum line_items (%) tidak sama dengan amount (%)', v_sum_line_items, v_bill_rec.amount;
  END IF;
  RAISE NOTICE '-> OK: Kontrak tanpa biaya mempertahankan perilaku lama dengan line_items 1 baris Sewa.';


  -- ----------------------------------------------------------------------------
  -- UJI 3: Kontrak + Parkir 100.000 (siklus start_date)
  --        Tagihan pertama sewa + 100.000 dengan line_items 2 baris;
  --        Periode berikutnya sama; generator idempoten
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 3] Menguji kontrak dengan biaya Parkir 100.000 (siklus start_date)...';
  v_res := public.create_kos_contract(
    v_tenant_kos,
    v_room_with_fee_id,
    v_member_with_fee_id,
    'Penyewa With Fee',
    1500000,
    v_test_start_date,
    NULL,
    10,
    'Kontrak plus parkir',
    'start_date',
    '[{"name": "Parkir", "amount": 100000}]'::jsonb
  );

  SELECT * INTO v_contract_rec FROM public.kos_contracts WHERE id = (v_res->>'contract_id')::uuid;
  IF jsonb_array_length(v_contract_rec.additional_fees) <> 1 THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: additional_fees di kos_contracts bukan 1 item, aktual: %', v_contract_rec.additional_fees;
  END IF;

  SELECT * INTO v_bill_rec FROM public.billing_items WHERE contract_id = v_contract_rec.id;
  IF v_bill_rec.amount <> 1600000 THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: amount tagihan pertama bukan 1600000, aktual: %', v_bill_rec.amount;
  END IF;

  IF jsonb_array_length(v_bill_rec.metadata->'line_items') <> 2 THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: line_items tagihan pertama bukan 2 baris, aktual: %', jsonb_array_length(v_bill_rec.metadata->'line_items');
  END IF;

  IF (v_bill_rec.metadata->'line_items'->0->>'name') <> 'Sewa' OR (v_bill_rec.metadata->'line_items'->0->>'amount')::numeric <> 1500000 THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: baris Sewa tagihan pertama salah, aktual: %', v_bill_rec.metadata->'line_items'->0;
  END IF;

  IF (v_bill_rec.metadata->'line_items'->1->>'name') <> 'Parkir' OR (v_bill_rec.metadata->'line_items'->1->>'amount')::numeric <> 100000 THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: baris Parkir tagihan pertama salah, aktual: %', v_bill_rec.metadata->'line_items'->1;
  END IF;

  SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
  INTO v_sum_line_items
  FROM jsonb_array_elements(v_bill_rec.metadata->'line_items') AS elem;

  IF v_sum_line_items <> v_bill_rec.amount THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: sum line_items (%) tidak sama dengan amount (%)', v_sum_line_items, v_bill_rec.amount;
  END IF;
  RAISE NOTICE '-> OK: Tagihan pertama terbit 1.600.000 dengan 2 line_items (Sewa 1.500.000 + Parkir 100.000).';

  -- Jalankan generator bulan berikutnya sebagai postgres/service_role
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  PERFORM public.generate_kos_contract_bills(v_next_month_gen, v_tenant_kos);

  -- Verifikasi tagihan periode 1 (bulan berikutnya)
  SELECT * INTO v_bill_rec
  FROM public.billing_items
  WHERE contract_id = v_contract_rec.id
    AND service_start = (v_test_start_date + interval '1 month')::date;

  IF v_bill_rec.id IS NULL THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: Tagihan bulan berikutnya (periode 1) tidak terbit!';
  END IF;

  IF v_bill_rec.amount <> 1600000 THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: amount tagihan bulan berikutnya bukan 1600000, aktual: %', v_bill_rec.amount;
  END IF;

  IF jsonb_array_length(v_bill_rec.metadata->'line_items') <> 2 THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: line_items tagihan bulan berikutnya bukan 2 baris, aktual: %', jsonb_array_length(v_bill_rec.metadata->'line_items');
  END IF;

  SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
  INTO v_sum_line_items
  FROM jsonb_array_elements(v_bill_rec.metadata->'line_items') AS elem;

  IF v_sum_line_items <> v_bill_rec.amount THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: sum line_items periode 1 (%) tidak sama dengan amount (%)', v_sum_line_items, v_bill_rec.amount;
  END IF;

  -- Uji idempoten generator
  SELECT count(*) INTO v_bill_count FROM public.billing_items WHERE contract_id = v_contract_rec.id;
  PERFORM public.generate_kos_contract_bills(v_next_month_gen, v_tenant_kos);
  IF (SELECT count(*) FROM public.billing_items WHERE contract_id = v_contract_rec.id) <> v_bill_count THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: Eksekusi berulang generator menduplikasi tagihan!';
  END IF;
  RAISE NOTICE '-> OK: Periode berikutnya terbit 1.600.000 dengan 2 line_items dan idempoten.';


  -- ----------------------------------------------------------------------------
  -- UJI 4: Prorata + biaya -> keduanya diprorata, dibulatkan ke bawah ke ribuan
  --        Masuk tgl 19 pada bulan 31 hari (13 hari terpakai dari 31 hari)
  --        Rent 1.500.000, Parkir 100.000 -> total 1.600.000
  --        Total prorata = floor(1.600.000 * 13 / 31 / 1000) * 1000 = 670.000
  --        Parkir prorata = floor(100.000 * 13 / 31) = 41.935
  --        Sewa prorata = 670.000 - 41.935 = 628.065
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 4] Menguji kontrak prorata dengan biaya Parkir 100.000...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  v_expected_prorata_total := floor((1600000.0 * 13.0 / 31.0) / 1000.0) * 1000.0; -- 670000
  v_expected_fee_prorata   := floor(100000.0 * 13.0 / 31.0);                     -- 41935
  v_expected_rent_prorata  := v_expected_prorata_total - v_expected_fee_prorata;   -- 628065

  v_res := public.create_kos_contract(
    v_tenant_kos,
    v_room_prorata_id,
    v_member_prorata_id,
    'Penyewa Prorata Fee',
    1500000,
    v_test_start_date,
    NULL,
    10,
    'Kontrak prorata plus parkir',
    'month_start_prorata',
    '[{"name": "Parkir", "amount": 100000}]'::jsonb
  );

  SELECT * INTO v_contract_rec FROM public.kos_contracts WHERE id = (v_res->>'contract_id')::uuid;

  SELECT * INTO v_bill_rec FROM public.billing_items WHERE contract_id = v_contract_rec.id;
  IF v_bill_rec.amount <> v_expected_prorata_total THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: amount tagihan prorata bukan %, aktual: %', v_expected_prorata_total, v_bill_rec.amount;
  END IF;

  IF (v_bill_rec.metadata->>'prorata')::boolean <> true THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: metadata prorata bukan true, aktual: %', v_bill_rec.metadata->>'prorata';
  END IF;

  IF (v_bill_rec.metadata->>'prorata_days')::int <> 13 THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: metadata prorata_days bukan 13, aktual: %', v_bill_rec.metadata->>'prorata_days';
  END IF;

  IF (v_bill_rec.metadata->>'days_in_month')::int <> 31 THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: metadata days_in_month bukan 31, aktual: %', v_bill_rec.metadata->>'days_in_month';
  END IF;

  IF jsonb_array_length(v_bill_rec.metadata->'line_items') <> 2 THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: line_items prorata bukan 2 baris, aktual: %', jsonb_array_length(v_bill_rec.metadata->'line_items');
  END IF;

  IF (v_bill_rec.metadata->'line_items'->0->>'name') <> 'Sewa'
     OR (v_bill_rec.metadata->'line_items'->0->>'amount')::numeric <> v_expected_rent_prorata THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: baris Sewa prorata bukan %, aktual: %', v_expected_rent_prorata, v_bill_rec.metadata->'line_items'->0;
  END IF;

  IF (v_bill_rec.metadata->'line_items'->1->>'name') <> 'Parkir'
     OR (v_bill_rec.metadata->'line_items'->1->>'amount')::numeric <> v_expected_fee_prorata THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: baris Parkir prorata bukan %, aktual: %', v_expected_fee_prorata, v_bill_rec.metadata->'line_items'->1;
  END IF;

  SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
  INTO v_sum_line_items
  FROM jsonb_array_elements(v_bill_rec.metadata->'line_items') AS elem;

  IF v_sum_line_items <> v_bill_rec.amount THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: sum line_items prorata (%) tidak sama dengan amount (%)', v_sum_line_items, v_bill_rec.amount;
  END IF;
  RAISE NOTICE '-> OK: Tagihan prorata terbit Rp% dengan line_items Sewa=Rp% dan Parkir=Rp% (jumlah cocok persis).',
    v_expected_prorata_total, v_expected_rent_prorata, v_expected_fee_prorata;

  -- Generator untuk periode 1 (tgl 1 bulan berikutnya) harus bernominal penuh
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  PERFORM public.generate_kos_contract_bills(v_next_month_gen, v_tenant_kos);

  SELECT * INTO v_bill_rec
  FROM public.billing_items
  WHERE contract_id = v_contract_rec.id
    AND service_start = (date_trunc('month', v_test_start_date) + interval '1 month')::date;

  IF v_bill_rec.id IS NULL THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: Tagihan periode 1 prorata tidak terbit dari generator!';
  END IF;

  IF v_bill_rec.amount <> 1600000 THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: Tagihan periode 1 prorata bukan nominal penuh 1600000, aktual: %', v_bill_rec.amount;
  END IF;

  SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
  INTO v_sum_line_items
  FROM jsonb_array_elements(v_bill_rec.metadata->'line_items') AS elem;

  IF v_sum_line_items <> v_bill_rec.amount THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: sum line_items periode 1 prorata (%) tidak sama dengan amount (%)', v_sum_line_items, v_bill_rec.amount;
  END IF;
  RAISE NOTICE '-> OK: Generator periode 1 prorata terbit tgl 1 dengan nominal penuh Rp1.600.000.';


  -- ----------------------------------------------------------------------------
  -- UJI 5: Biaya tidak valid (nama kosong, nominal negatif, > 10 item, bukan array) ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 5] Menguji validasi biaya tambahan tidak valid...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  -- 5a: Nama biaya kosong
  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos, v_room_inv_id, NULL, 'Penyewa Inv 1', 1500000, v_test_start_date, NULL, 10, NULL, 'start_date',
      '[{"name": "   ", "amount": 100000}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg LIKE '%Nama biaya tambahan tidak boleh kosong%' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 5a GAGAL: Nama biaya tambahan kosong tidak ditolak!';
  END IF;

  -- 5b: Nominal biaya negatif
  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos, v_room_inv_id, NULL, 'Penyewa Inv 2', 1500000, v_test_start_date, NULL, 10, NULL, 'start_date',
      '[{"name": "Parkir", "amount": -50000}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg LIKE '%tidak boleh negatif%' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 5b GAGAL: Nominal biaya tambahan negatif tidak ditolak!';
  END IF;

  -- 5c: Lebih dari 10 item (> 10)
  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos, v_room_inv_id, NULL, 'Penyewa Inv 3', 1500000, v_test_start_date, NULL, 10, NULL, 'start_date',
      '[
        {"name":"Item 1","amount":10000},
        {"name":"Item 2","amount":10000},
        {"name":"Item 3","amount":10000},
        {"name":"Item 4","amount":10000},
        {"name":"Item 5","amount":10000},
        {"name":"Item 6","amount":10000},
        {"name":"Item 7","amount":10000},
        {"name":"Item 8","amount":10000},
        {"name":"Item 9","amount":10000},
        {"name":"Item 10","amount":10000},
        {"name":"Item 11","amount":10000}
      ]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg LIKE '%maksimal 10 item%' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 5c GAGAL: Biaya tambahan lebih dari 10 item tidak ditolak!';
  END IF;

  -- 5d: Bukan JSON array
  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos, v_room_inv_id, NULL, 'Penyewa Inv 4', 1500000, v_test_start_date, NULL, 10, NULL, 'start_date',
      '{"name": "Parkir", "amount": 100000}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg LIKE '%Biaya tambahan harus berupa array JSON%' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 5d GAGAL: Biaya tambahan bukan array JSON tidak ditolak!';
  END IF;

  -- 5e: Item bukan objek
  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos, v_room_inv_id, NULL, 'Penyewa Inv 5', 1500000, v_test_start_date, NULL, 10, NULL, 'start_date',
      '["Parkir"]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg LIKE '%harus berupa objek%' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 5e GAGAL: Item biaya tambahan bukan objek tidak ditolak!';
  END IF;
  RAISE NOTICE '-> OK: Semua input biaya tambahan tidak valid berhasil ditolak.';


  -- ----------------------------------------------------------------------------
  -- UJI 6: generate_kos_contract_bills ditolak untuk role authenticated (42501)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 6] Menguji generate_kos_contract_bills ditolak untuk authenticated...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_err_caught := false;
  BEGIN
    PERFORM public.generate_kos_contract_bills(v_today, v_tenant_kos);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;

  -- Kembalikan role ke postgres (Wajib di akhir DO block)
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: Role authenticated diizinkan memanggil generate_kos_contract_bills!';
  END IF;
  RAISE NOTICE '-> OK: generate_kos_contract_bills ditolak untuk role authenticated (42501).';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SELURUH UJI KOS-4.1 BERHASIL (100%% LULUS)';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
