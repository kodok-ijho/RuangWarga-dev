-- Test Suite: Kos Contract Prorata Billing Cycle (Task KOS-3.1)
-- Date: 2026-10-25
-- Ref: docs/handoff/KOS-3.md § 3.1
--
-- File ini memvalidasi aturan penagihan berkala dengan opsi prorata:
-- 1. create_kos_contract: otorisasi ditolak untuk user tanpa hak generate_billing (42501)
-- 2. create_kos_contract: nilai billing_cycle tidak valid ditolak
-- 3. create_kos_contract: default tanpa parameter -> billing_cycle = 'start_date', perilaku lama
-- 4. create_kos_contract: prorata masuk tgl 19 bulan 31 hari, Rp1.500.000 -> tagihan pertama Rp629.000,
--    service_end akhir bulan; generator bulan berikutnya -> service 1 s.d. akhir bulan, Rp1.500.000;
--    dijalankan 2x idempoten (tidak ada duplikasi)
-- 5. create_kos_contract: prorata masuk tanggal 1 -> dinormalkan menjadi 'start_date', nominal penuh
-- 6. create_kos_contract: prorata durasi 2 bulan -> end_date akhir bulan ke-2 setelah bulan masuk,
--    tidak ada tagihan setelahnya
-- 7. generate_kos_contract_bills: otorisasi ditolak untuk role authenticated (42501)

BEGIN;

DO $$
DECLARE
  v_owner_kos       UUID := gen_random_uuid();
  v_user_dhani      UUID := gen_random_uuid();
  v_user_unauth     UUID := gen_random_uuid();
  v_user_budi       UUID := gen_random_uuid();
  v_user_tgl1       UUID := gen_random_uuid();
  v_user_2bln       UUID := gen_random_uuid();
  v_tenant_kos      UUID;
  v_role_kos_id     UUID;
  v_room_default_id BIGINT;
  v_room_prorata_id BIGINT;
  v_room_tgl1_id    BIGINT;
  v_room_2bln_id    BIGINT;
  v_room_inv_id     BIGINT;
  v_member_dhani_id UUID;
  v_member_budi_id  UUID;
  v_member_tgl1_id  UUID;
  v_member_2bln_id  UUID;
  v_res             JSONB;
  v_contract_rec    RECORD;
  v_bill_rec        RECORD;
  v_bill_count      INT;
  v_today           DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_cand_date       DATE;
  v_test_start_date DATE;
  v_next_month_gen  DATE;
  v_start_tgl1      DATE;
  v_expected_end_2bln DATE;
  v_err_caught      BOOLEAN;
  v_sqlstate        TEXT;
  v_errmsg          TEXT;
  v_offset          INT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: KOS CONTRACT PRORATA (KOS-3.1)';
  RAISE NOTICE '============================================================';

  -- ----------------------------------------------------------------------------
  -- SETUP FIXTURES
  -- ----------------------------------------------------------------------------
  -- 1. auth.users wajib ada sebelum relasi tenant_members (FK)
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_kos,   'owner_prorata@test.invalid',   'authenticated', 'authenticated'),
    (v_user_dhani,  'dhani_prorata@test.invalid',   'authenticated', 'authenticated'),
    (v_user_unauth, 'unauth_prorata@test.invalid',  'authenticated', 'authenticated'),
    (v_user_budi,   'budi_prorata@test.invalid',    'authenticated', 'authenticated'),
    (v_user_tgl1,   'tgl1_prorata@test.invalid',    'authenticated', 'authenticated'),
    (v_user_2bln,   'dur2_prorata@test.invalid',    'authenticated', 'authenticated');

  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES ('Kos Prorata Test Suite', 'kos', v_owner_kos, '{"rent_grace_days": 10, "default_rent_price": 1500000}'::jsonb)
  RETURNING id INTO v_tenant_kos;

  SELECT id INTO v_role_kos_id FROM public.tenant_roles WHERE tenant_id = v_tenant_kos AND is_base_role = true LIMIT 1;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Default', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_default_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Prorata 19', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_prorata_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Tgl 1', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_tgl1_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar 2 Bulan', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_2bln_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Invalid', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_inv_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_dhani, 'Dhani Default', 'approved', false, v_room_default_id, v_role_kos_id)
  RETURNING id INTO v_member_dhani_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_budi, 'Budi Prorata 19', 'approved', false, v_room_prorata_id, v_role_kos_id)
  RETURNING id INTO v_member_budi_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_tgl1, 'Siti Masuk Tgl 1', 'approved', false, v_room_tgl1_id, v_role_kos_id)
  RETURNING id INTO v_member_tgl1_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_2bln, 'Rian Kontrak 2 Bulan', 'approved', false, v_room_2bln_id, v_role_kos_id)
  RETURNING id INTO v_member_2bln_id;

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
  v_start_tgl1 := date_trunc('month', v_test_start_date)::date;

  RAISE NOTICE 'Fixture tanggal: start_date=%, next_month_gen=%, start_tgl1=%',
    v_test_start_date, v_next_month_gen, v_start_tgl1;


  -- ----------------------------------------------------------------------------
  -- UJI 1: create_kos_contract ditolak untuk user tanpa izin (SEC-1.1 / 42501)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 1] Menguji otorisasi pemanggil create_kos_contract...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_unauth, 'role', 'authenticated')::text, true);

  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos, v_room_default_id, v_member_dhani_id, 'Dhani', 1500000, v_test_start_date, NULL, 10
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
  -- UJI 2: Nilai billing_cycle tidak valid ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 2] Menguji validasi nilai billing_cycle tidak valid...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  -- 2a: String sembarang
  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos, v_room_inv_id, NULL, 'Penyewa Invalid', 1500000, v_test_start_date, NULL, 10, NULL, 'invalid_cycle'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg LIKE '%Siklus tagihan tidak valid%' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 2a GAGAL: billing_cycle tidak valid tidak ditolak!';
  END IF;

  -- 2b: Nilai NULL eksplisit
  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos, v_room_inv_id, NULL, 'Penyewa Invalid', 1500000, v_test_start_date, NULL, 10, NULL, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg LIKE '%Siklus tagihan tidak valid%' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 2b GAGAL: billing_cycle NULL tidak ditolak!';
  END IF;
  RAISE NOTICE '-> OK: Nilai siklus tidak valid berhasil ditolak.';


  -- ----------------------------------------------------------------------------
  -- UJI 3: Default tanpa parameter -> billing_cycle = 'start_date', perilaku lama
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 3] Menguji create_kos_contract tanpa argumen billing_cycle (default)...';
  v_res := public.create_kos_contract(
    v_tenant_kos,
    v_room_default_id,
    v_member_dhani_id,
    'Dhani Default',
    1500000,
    v_test_start_date,
    NULL,
    10,
    'Kontrak default tanpa parameter siklus'
  );

  IF (v_res->>'billing_cycle') <> 'start_date' THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: billing_cycle kembalian bukan start_date, aktual: %', v_res->>'billing_cycle';
  END IF;

  SELECT * INTO v_contract_rec FROM public.kos_contracts WHERE id = (v_res->>'contract_id')::uuid;
  IF v_contract_rec.billing_cycle <> 'start_date' THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: billing_cycle di tabel kos_contracts bukan start_date, aktual: %', v_contract_rec.billing_cycle;
  END IF;

  SELECT * INTO v_bill_rec FROM public.billing_items WHERE contract_id = v_contract_rec.id;
  IF v_bill_rec.amount <> 1500000 THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: amount tagihan pertama bukan nominal penuh 1500000, aktual: %', v_bill_rec.amount;
  END IF;
  IF v_bill_rec.service_start <> v_test_start_date THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: service_start bukan %, aktual: %', v_test_start_date, v_bill_rec.service_start;
  END IF;
  IF v_bill_rec.metadata ? 'prorata' AND (v_bill_rec.metadata->>'prorata')::boolean = true THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: tagihan default tidak boleh memiliki metadata prorata!';
  END IF;
  RAISE NOTICE '-> OK: Default tanpa parameter menghasilkan start_date dengan nominal penuh.';


  -- ----------------------------------------------------------------------------
  -- UJI 4: Prorata masuk tgl 19 bulan 31 hari, Rp1.500.000 -> tagihan pertama Rp629.000
  --        Generator bulan berikutnya -> service 1 s.d. akhir bulan, Rp1.500.000
  --        Dijalankan dua kali idempoten
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 4] Menguji kontrak prorata masuk tgl 19 pada bulan 31 hari...';
  v_res := public.create_kos_contract(
    v_tenant_kos,
    v_room_prorata_id,
    v_member_budi_id,
    'Budi Prorata 19',
    1500000,
    v_test_start_date,
    NULL,
    10,
    'Kontrak prorata masuk tgl 19',
    'month_start_prorata'
  );

  IF (v_res->>'billing_cycle') <> 'month_start_prorata' THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: billing_cycle kembalian bukan month_start_prorata, aktual: %', v_res->>'billing_cycle';
  END IF;

  SELECT * INTO v_contract_rec FROM public.kos_contracts WHERE id = (v_res->>'contract_id')::uuid;
  IF v_contract_rec.billing_cycle <> 'month_start_prorata' THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: billing_cycle di tabel kos_contracts bukan month_start_prorata, aktual: %', v_contract_rec.billing_cycle;
  END IF;

  -- Verifikasi tagihan periode 0 (prorata)
  SELECT * INTO v_bill_rec FROM public.billing_items WHERE contract_id = v_contract_rec.id;
  IF v_bill_rec.amount <> 629000 THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: amount tagihan prorata bukan 629000 (13/31 * 1.500.000 dibulatkan ke bawah ke ribuan), aktual: %', v_bill_rec.amount;
  END IF;
  IF v_bill_rec.service_start <> v_test_start_date THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: service_start bukan %, aktual: %', v_test_start_date, v_bill_rec.service_start;
  END IF;
  IF v_bill_rec.service_end <> (date_trunc('month', v_test_start_date) + interval '1 month' - interval '1 day')::date THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: service_end bukan akhir bulan masuk, aktual: %', v_bill_rec.service_end;
  END IF;
  IF v_bill_rec.due_date <> (v_test_start_date + 10) THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: due_date bukan start_date + grace_days (10), aktual: %', v_bill_rec.due_date;
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
  RAISE NOTICE '-> OK: Tagihan pertama prorata terbit Rp629.000 (13/31 hari) dengan metadata lengkap.';

  -- Jalankan generator bulan berikutnya sebagai postgres/service_role
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  PERFORM public.generate_kos_contract_bills(v_next_month_gen, v_tenant_kos);

  -- Verifikasi tagihan periode 1 (bulan berikutnya)
  SELECT * INTO v_bill_rec
  FROM public.billing_items
  WHERE contract_id = v_contract_rec.id
    AND service_start = (date_trunc('month', v_test_start_date) + interval '1 month')::date;

  IF v_bill_rec.id IS NULL THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: Tagihan bulan berikutnya (periode 1) tidak terbit!';
  END IF;
  IF v_bill_rec.amount <> 1500000 THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: Tagihan bulan berikutnya bukan nominal penuh 1500000, aktual: %', v_bill_rec.amount;
  END IF;
  IF v_bill_rec.service_end <> (date_trunc('month', v_test_start_date) + interval '2 month' - interval '1 day')::date THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: service_end tagihan bulan berikutnya bukan akhir bulan, aktual: %', v_bill_rec.service_end;
  END IF;
  RAISE NOTICE '-> OK: Tagihan bulan berikutnya terbit tgl 1 s.d. akhir bulan dengan nominal penuh Rp1.500.000.';

  -- Uji idempoten: panggil generate_kos_contract_bills kedua kali
  SELECT count(*) INTO v_bill_count FROM public.billing_items WHERE contract_id = v_contract_rec.id;
  PERFORM public.generate_kos_contract_bills(v_next_month_gen, v_tenant_kos);
  IF (SELECT count(*) FROM public.billing_items WHERE contract_id = v_contract_rec.id) <> v_bill_count THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: Eksekusi berulang generator menduplikasi tagihan!';
  END IF;
  RAISE NOTICE '-> OK: Eksekusi generator kedua idempoten (tidak ada duplikasi).';


  -- ----------------------------------------------------------------------------
  -- UJI 5: Prorata masuk tanggal 1 dinormalkan menjadi 'start_date', nominal penuh
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 5] Menguji kontrak opsi prorata dengan start_date tanggal 1...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  v_res := public.create_kos_contract(
    v_tenant_kos,
    v_room_tgl1_id,
    v_member_tgl1_id,
    'Siti Masuk Tgl 1',
    1500000,
    v_start_tgl1,
    NULL,
    10,
    'Kontrak masuk tgl 1 dengan opsi month_start_prorata',
    'month_start_prorata'
  );

  IF (v_res->>'billing_cycle') <> 'start_date' THEN
    RAISE EXCEPTION 'Uji 5 GAGAL: Masuk tgl 1 tidak dinormalkan ke start_date di hasil return, aktual: %', v_res->>'billing_cycle';
  END IF;

  SELECT * INTO v_contract_rec FROM public.kos_contracts WHERE id = (v_res->>'contract_id')::uuid;
  IF v_contract_rec.billing_cycle <> 'start_date' THEN
    RAISE EXCEPTION 'Uji 5 GAGAL: Masuk tgl 1 tidak dinormalkan ke start_date di tabel kos_contracts, aktual: %', v_contract_rec.billing_cycle;
  END IF;

  SELECT * INTO v_bill_rec FROM public.billing_items WHERE contract_id = v_contract_rec.id;
  IF v_bill_rec.amount <> 1500000 THEN
    RAISE EXCEPTION 'Uji 5 GAGAL: Tagihan masuk tgl 1 bukan nominal penuh 1500000, aktual: %', v_bill_rec.amount;
  END IF;
  IF v_bill_rec.metadata ? 'prorata' AND (v_bill_rec.metadata->>'prorata')::boolean = true THEN
    RAISE EXCEPTION 'Uji 5 GAGAL: Kontrak ternormalisasi start_date tidak boleh memiliki metadata prorata!';
  END IF;
  RAISE NOTICE '-> OK: Masuk tanggal 1 dinormalkan ke start_date dengan nominal penuh.';


  -- ----------------------------------------------------------------------------
  -- UJI 6: Prorata durasi 2 bulan -> end_date akhir bulan ke-2 setelah bulan masuk
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 6] Menguji kontrak prorata dengan durasi tetap 2 bulan...';
  v_expected_end_2bln := (date_trunc('month', v_test_start_date)::date + interval '3 month' - interval '1 day')::date;

  v_res := public.create_kos_contract(
    v_tenant_kos,
    v_room_2bln_id,
    v_member_2bln_id,
    'Rian Kontrak 2 Bulan',
    1500000,
    v_test_start_date,
    2, -- Durasi 2 bulan kalender setelah bulan masuk prorata
    10,
    'Kontrak prorata 2 bulan',
    'month_start_prorata'
  );

  IF (v_res->>'end_date')::date <> v_expected_end_2bln THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: end_date kembalian bukan %, aktual: %', v_expected_end_2bln, v_res->>'end_date';
  END IF;

  SELECT * INTO v_contract_rec FROM public.kos_contracts WHERE id = (v_res->>'contract_id')::uuid;
  IF v_contract_rec.end_date <> v_expected_end_2bln THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: end_date di database bukan %, aktual: %', v_expected_end_2bln, v_contract_rec.end_date;
  END IF;

  -- Jalankan generator hingga 5 bulan ke depan
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  PERFORM public.generate_kos_contract_bills(
    (date_trunc('month', v_test_start_date)::date + interval '5 month')::date,
    v_tenant_kos
  );

  -- Harus tepat ada 3 tagihan (periode 0 prorata, periode 1 bulan penuh, periode 2 bulan penuh)
  SELECT count(*) INTO v_bill_count FROM public.billing_items WHERE contract_id = v_contract_rec.id;
  IF v_bill_count <> 3 THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: Kontrak prorata 2 bulan seharusnya menghasilkan tepat 3 tagihan, aktual: %', v_bill_count;
  END IF;

  -- Pastikan tidak ada tagihan dengan service_start setelah end_date
  IF EXISTS (
    SELECT 1 FROM public.billing_items
    WHERE contract_id = v_contract_rec.id AND service_start > v_expected_end_2bln
  ) THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: Ditemukan tagihan baru setelah masa sewa end_date berakhir!';
  END IF;
  RAISE NOTICE '-> OK: Kontrak prorata 2 bulan memiliki end_date tepat di akhir bulan ke-2 dan berhenti menagih.';


  -- ----------------------------------------------------------------------------
  -- UJI 7: generate_kos_contract_bills ditolak untuk role authenticated (42501)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 7] Menguji generate_kos_contract_bills ditolak untuk authenticated...';
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

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 7 GAGAL: Role authenticated diizinkan memanggil generate_kos_contract_bills!';
  END IF;
  RAISE NOTICE '-> OK: generate_kos_contract_bills ditolak untuk role authenticated (42501).';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SELURUH UJI KOS-3.1 BERHASIL (100%% LULUS)';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
