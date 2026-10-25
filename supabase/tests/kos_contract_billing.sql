-- Test Suite: Kos Contract Billing & Recurring Cycle (Task KOS-2.2 & KOS-2F.1)
-- Date: 2026-10-24
-- Ref: docs/handoff/KOS-2.md § KOS-2.2 & docs/handoff/KOS-2F.md § 2F.1
--
-- File ini memvalidasi aturan penagihan berkala:
-- 1. create_kos_contract: otorisasi ditolak untuk user tanpa hak akses generate_billing
-- 2. create_kos_contract: atomik, menerbitkan tagihan pertama (periode 0, Dhani 19 Okt -> due 29 Okt)
-- 3. generate_kos_contract_bills: terbit otomatis pada service_start (19 Nov -> due 29 Nov)
-- 4. generate_kos_contract_bills: anchor 31 Jan (28 Feb, 31 Mar) tidak bergeser permanen
-- 5. generate_kos_contract_bills: dijalankan 2x idempoten (tidak ada duplikasi tagihan)
-- 6. generate_kos_contract_bills: mengejar ketertinggalan tagihan beberapa bulan (catch-up)
-- 7. Kontrak 'ended' (checkout): penagihan berhenti, tidak ada periode baru setelah end_date
-- 8. Kontrak durasi tetap N bulan (mis. 6 bulan) berhenti di bulan ke-6
-- 9. Tenant dengan status langganan read_only dilewati dari penagihan otomatis
-- 10. generate_kos_contract_bills: ditolak untuk role authenticated (K1)
-- 11. auto_generate_kos_billing: ditolak untuk warga biasa & tenant lain (K2)
-- 12. auto_generate_kos_billing: tenant_id NULL ditolak untuk non-platform admin (K2)
-- 13. run_auto_billing: run kedua di hari yang sama tanpa tagihan baru tidak menambah billing_auto_runs (K4)
-- 14. checkout_kos_room: checkout sebelum start_date menghasilkan end_date = start_date (K7)
-- 15. create_kos_contract: menolak start_date 13 bulan lalu atau 4 bulan ke depan (K9)

BEGIN;

DO $$
DECLARE
  v_owner_kos       UUID := gen_random_uuid();
  v_user_dhani      UUID := gen_random_uuid();
  v_user_unauth     UUID := gen_random_uuid();
  v_user_budi       UUID := gen_random_uuid();
  v_user_jan        UUID := gen_random_uuid();
  v_tenant_kos      UUID;
  v_tenant_readonly UUID;
  v_role_kos_id     UUID;
  v_member_dhani_id UUID;
  v_member_budi_id  UUID;
  v_member_jan_id   UUID;
  v_room_dhani_id   BIGINT;
  v_room_budi_id    BIGINT;
  v_room_jan_id     BIGINT;
  v_room_ro_id      BIGINT;
  v_room_checkout_id BIGINT;
  v_dhani_contract  JSONB;
  v_budi_contract   JSONB;
  v_jan_contract    JSONB;
  v_checkout_contract JSONB;
  v_checkout_rec    RECORD;
  v_bill_rec        RECORD;
  v_bill_count      INT;
  v_gen_res         JSONB;
  v_err_caught      BOOLEAN;
  v_sqlstate        TEXT;
  v_errmsg          TEXT;
  v_runs_before     INT;
  v_runs_after      INT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: KOS CONTRACT BILLING (KOS-2.2)';
  RAISE NOTICE '============================================================';

  -- ----------------------------------------------------------------------------
  -- SETUP FIXTURES
  -- ----------------------------------------------------------------------------
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_kos,   'owner_bill@test.invalid',   'authenticated', 'authenticated'),
    (v_user_dhani,  'dhani_bill@test.invalid',   'authenticated', 'authenticated'),
    (v_user_unauth, 'unauth_bill@test.invalid',  'authenticated', 'authenticated'),
    (v_user_budi,   'budi_bill@test.invalid',    'authenticated', 'authenticated'),
    (v_user_jan,    'jan_bill@test.invalid',     'authenticated', 'authenticated');

  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES ('Kos Harmoni Billing Test', 'kos', v_owner_kos, '{"rent_grace_days": 10, "default_rent_price": 1500000}'::jsonb)
  RETURNING id INTO v_tenant_kos;

  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES ('Kos ReadOnly Test', 'kos', v_owner_kos, '{"rent_grace_days": 10, "default_rent_price": 1000000}'::jsonb)
  RETURNING id INTO v_tenant_readonly;

  -- Set tenant_readonly menjadi status expired/past_due (read_only)
  UPDATE public.tenant_subscriptions
  SET status = 'past_due'
  WHERE tenant_id = v_tenant_readonly;

  SELECT id INTO v_role_kos_id FROM public.tenant_roles WHERE tenant_id = v_tenant_kos AND is_base_role = true LIMIT 1;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES
    (v_tenant_kos, 'Kamar Dhani', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_dhani_id;
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES
    (v_tenant_kos, 'Kamar Budi', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_budi_id;
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES
    (v_tenant_kos, 'Kamar Jan', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_jan_id;
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES
    (v_tenant_readonly, 'Kamar RO', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_ro_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_dhani, 'Dhani Mahasiswa', 'approved', false, v_room_dhani_id, v_role_kos_id)
  RETURNING id INTO v_member_dhani_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_budi, 'Budi 6 Bulan', 'approved', false, v_room_budi_id, v_role_kos_id)
  RETURNING id INTO v_member_budi_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_jan, 'Joko Akhir Bulan', 'approved', false, v_room_jan_id, v_role_kos_id)
  RETURNING id INTO v_member_jan_id;

  -- ----------------------------------------------------------------------------
  -- UJI 1: create_kos_contract ditolak untuk user tanpa izin
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 1] Menguji otorisasi pemanggil create_kos_contract...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_unauth, 'role', 'authenticated')::text, true);

  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos, v_room_dhani_id, v_member_dhani_id, 'Dhani', 1500000, '2026-10-19'::date, NULL, 10
    );
  EXCEPTION WHEN raise_exception THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: User tanpa izin diizinkan membuat kontrak!';
  END IF;
  RAISE NOTICE '-> OK: Akses ditolak untuk user tanpa hak generate_billing.';

  -- Beralih ke auth owner / service_role
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  -- ----------------------------------------------------------------------------
  -- UJI 2: create_kos_contract contoh Dhani (masuk 19 Okt 2026 -> tagihan pertama terbit, due 29 Okt)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 2] Membuat kontrak Dhani masuk 19 Okt 2026 (tenggat 10 hari)...';
  v_dhani_contract := public.create_kos_contract(
    v_tenant_kos,
    v_room_dhani_id,
    v_member_dhani_id,
    'Dhani Mahasiswa',
    1500000,
    '2026-10-19'::date,
    NULL, -- Bulanan berjalan terus
    10,
    'Kontrak sewa mahasiswa'
  );

  SELECT * INTO v_bill_rec
  FROM public.billing_items
  WHERE contract_id = (v_dhani_contract->>'contract_id')::uuid;

  IF v_bill_rec.service_start <> '2026-10-19'::date THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: service_start tagihan pertama bukan 2026-10-19, aktual: %', v_bill_rec.service_start;
  END IF;
  IF v_bill_rec.service_end <> '2026-11-18'::date THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: service_end tagihan pertama bukan 2026-11-18, aktual: %', v_bill_rec.service_end;
  END IF;
  IF v_bill_rec.due_date <> '2026-10-29'::date THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: due_date tagihan pertama bukan 2026-10-29, aktual: %', v_bill_rec.due_date;
  END IF;
  IF v_bill_rec.amount <> 1500000 THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: amount tagihan pertama bukan 1500000';
  END IF;
  RAISE NOTICE '-> OK: Tagihan pertama terbit: 19 Okt - 18 Nov, jatuh tempo 29 Okt.';

  -- ----------------------------------------------------------------------------
  -- UJI 3: generate_kos_contract_bills pada 19 Nov 2026 (periode kedua terbit, due 29 Nov)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 3] Menjalankan penagihan harian pada 19 Nov 2026...';
  v_gen_res := public.generate_kos_contract_bills('2026-11-19'::date, v_tenant_kos);

  SELECT * INTO v_bill_rec
  FROM public.billing_items
  WHERE contract_id = (v_dhani_contract->>'contract_id')::uuid
    AND service_start = '2026-11-19'::date;

  IF v_bill_rec.service_end <> '2026-12-18'::date THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: service_end tagihan kedua bukan 2026-12-18, aktual: %', v_bill_rec.service_end;
  END IF;
  IF v_bill_rec.due_date <> '2026-11-29'::date THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: due_date tagihan kedua bukan 2026-11-29, aktual: %', v_bill_rec.due_date;
  END IF;
  RAISE NOTICE '-> OK: Tagihan kedua terbit: 19 Nov - 18 Des, jatuh tempo 29 Nov.';

  -- ----------------------------------------------------------------------------
  -- UJI 4: Anchor 31 Jan (28 Feb, 31 Mar tidak bergeser permanen)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 4] Menguji anchor tanggal 31 Jan 2026...';
  v_jan_contract := public.create_kos_contract(
    v_tenant_kos,
    v_room_jan_id,
    v_member_jan_id,
    'Joko Akhir Bulan',
    2000000,
    '2026-01-31'::date,
    NULL,
    5
  );

  -- Jalankan generator pada 31 Mar 2026 (harus menghasilkan periode Feb dan Mar)
  PERFORM public.generate_kos_contract_bills('2026-03-31'::date, v_tenant_kos);

  -- Periode 1: Feb
  SELECT * INTO v_bill_rec FROM public.billing_items
  WHERE contract_id = (v_jan_contract->>'contract_id')::uuid AND service_start = '2026-02-28'::date;
  IF v_bill_rec.service_start IS NULL THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: Tagihan periode Februari (start 2026-02-28) tidak terbit';
  END IF;

  -- Periode 2: Mar (harus kembali ke 31 Mar, bukan 28 Mar!)
  SELECT * INTO v_bill_rec FROM public.billing_items
  WHERE contract_id = (v_jan_contract->>'contract_id')::uuid AND service_start = '2026-03-31'::date;
  IF v_bill_rec.service_start IS NULL THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: Tagihan periode Maret tidak terbit pada 2026-03-31 (terdistorsi berantai!)';
  END IF;
  RAISE NOTICE '-> OK: Tanggal 31 Jan menghasilkan start 28 Feb dan 31 Mar (anchor stabil).';

  -- ----------------------------------------------------------------------------
  -- UJI 5: Idempoten (dijalankan 2x tidak ganda)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 5] Menguji idempoten generator...';
  SELECT count(*) INTO v_bill_count FROM public.billing_items;

  PERFORM public.generate_kos_contract_bills('2026-11-19'::date, v_tenant_kos);
  PERFORM public.generate_kos_contract_bills('2026-11-19'::date, v_tenant_kos);

  IF (SELECT count(*) FROM public.billing_items) <> v_bill_count THEN
    RAISE EXCEPTION 'Uji 5 GAGAL: Eksekusi ulang menyebabkan duplikasi tagihan!';
  END IF;
  RAISE NOTICE '-> OK: Eksekusi berulang tidak menduplikasi tagihan.';

  -- ----------------------------------------------------------------------------
  -- UJI 6: Mengejar ketertinggalan (catch-up 3 bulan)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 6] Menjalankan penagihan mengejar 3 bulan (19 Jan 2027)...';
  PERFORM public.generate_kos_contract_bills('2027-01-19'::date, v_tenant_kos);

  -- Dhani harus memiliki tagihan untuk: 19 Okt, 19 Nov, 19 Des, 19 Jan (4 tagihan)
  SELECT count(*) INTO v_bill_count
  FROM public.billing_items
  WHERE contract_id = (v_dhani_contract->>'contract_id')::uuid;

  IF v_bill_count <> 4 THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: Seharusnya terdapat 4 tagihan untuk Dhani, aktual: %', v_bill_count;
  END IF;
  RAISE NOTICE '-> OK: Catch-up berhasil menerbitkan seluruh tagihan tertinggal.';

  -- ----------------------------------------------------------------------------
  -- UJI 7: Kontrak 6 bulan berhenti di bulan ke-6
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 7] Menguji kontrak berjangka tetap (6 bulan)...';
  v_budi_contract := public.create_kos_contract(
    v_tenant_kos,
    v_room_budi_id,
    v_member_budi_id,
    'Budi 6 Bulan',
    1200000,
    '2026-01-01'::date,
    6, -- 6 bulan: 01 Jan 2026 s.d. 30 Jun 2026
    10
  );

  -- Jalankan generator hingga akhir tahun 2026 (31 Des 2026)
  PERFORM public.generate_kos_contract_bills('2026-12-31'::date, v_tenant_kos);

  SELECT count(*) INTO v_bill_count
  FROM public.billing_items
  WHERE contract_id = (v_budi_contract->>'contract_id')::uuid;

  IF v_bill_count <> 6 THEN
    RAISE EXCEPTION 'Uji 7 GAGAL: Kontrak 6 bulan seharusnya hanya menghasilkan 6 tagihan, aktual: %', v_bill_count;
  END IF;
  RAISE NOTICE '-> OK: Kontrak 6 bulan berhenti tepat pada 6 periode.';

  -- ----------------------------------------------------------------------------
  -- UJI 8: Kontrak ended saat checkout kamar -> berhenti menagih
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 8] Menguji checkout kamar dan penghentian tagihan...';
  -- Checkout Dhani pada 25 Des 2026
  PERFORM public.checkout_kos_room(
    v_tenant_kos,
    v_room_dhani_id,
    '2026-12-25'::date,
    'Pindah ke luar kota',
    true
  );

  -- Cek status kontrak Dhani
  IF (SELECT status FROM public.kos_contracts WHERE id = (v_dhani_contract->>'contract_id')::uuid) <> 'ended' THEN
    RAISE EXCEPTION 'Uji 8 GAGAL: Kontrak Dhani tidak berstatus ended setelah checkout!';
  END IF;

  -- Jalankan generator pada masa depan (Maret 2027)
  PERFORM public.generate_kos_contract_bills('2027-03-31'::date, v_tenant_kos);

  -- Tagihan yang terbit tidak boleh bertambah lagi setelah checkout
  SELECT count(*) INTO v_bill_count
  FROM public.billing_items
  WHERE contract_id = (v_dhani_contract->>'contract_id')::uuid;

  IF v_bill_count > 4 THEN
    RAISE EXCEPTION 'Uji 8 GAGAL: Kontrak yang sudah ended masih diterbitkan tagihan baru!';
  END IF;
  RAISE NOTICE '-> OK: Kontrak ended berhenti ditagih.';

  -- ----------------------------------------------------------------------------
  -- UJI 9: Tenant read_only dilewati dari penagihan otomatis
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 9] Menguji proteksi tenant read_only...';
  -- Buat kontrak di tenant read_only langsung lewat insert (karena create_kos_contract memblokir tenant read_only)
  INSERT INTO public.kos_contracts (
    tenant_id, unit_id, tenant_name, rent_price, start_date, status, grace_days
  ) VALUES (
    v_tenant_readonly, v_room_ro_id, 'Penyewa RO', 1000000, '2026-01-01'::date, 'active', 10
  );

  v_gen_res := public.generate_kos_contract_bills('2026-10-24'::date, v_tenant_readonly);
  IF (v_gen_res->>'generated_count')::int <> 0 THEN
    RAISE EXCEPTION 'Uji 9 GAGAL: Tenant berstatus read_only tidak dilewati dari penagihan!';
  END IF;
  RAISE NOTICE '-> OK: Tenant read_only dilewati dari penagihan otomatis.';

  -- ----------------------------------------------------------------------------
  -- UJI 10: generate_kos_contract_bills ditolak untuk role authenticated (K1)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 10] Menguji execute privilege generate_kos_contract_bills ditolak untuk authenticated...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_err_caught := false;
  BEGIN
    PERFORM public.generate_kos_contract_bills('2026-10-25'::date, v_tenant_kos);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 10 GAGAL: authenticated diizinkan memanggil generate_kos_contract_bills!';
  END IF;
  RAISE NOTICE '-> OK: generate_kos_contract_bills ditolak untuk role authenticated (42501).';

  -- ----------------------------------------------------------------------------
  -- UJI 11: auto_generate_kos_billing ditolak untuk warga biasa & tenant lain (K2)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 11] Menguji otorisasi pemanggil auto_generate_kos_billing...';

  -- 11a. Warga biasa di tenant terkait (v_user_dhani)
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_dhani, 'role', 'authenticated')::text, true);

  v_err_caught := false;
  BEGIN
    PERFORM public.auto_generate_kos_billing('2026-10', v_tenant_kos);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 11a GAGAL: Warga biasa diizinkan memanggil auto_generate_kos_billing!';
  END IF;

  -- 11b. Pengguna di luar tenant (v_user_unauth)
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_unauth, 'role', 'authenticated')::text, true);

  v_err_caught := false;
  BEGIN
    PERFORM public.auto_generate_kos_billing('2026-10', v_tenant_kos);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 11b GAGAL: Pengguna tenant lain diizinkan memanggil auto_generate_kos_billing!';
  END IF;
  RAISE NOTICE '-> OK: auto_generate_kos_billing ditolak untuk warga biasa dan tenant lain (42501).';

  -- ----------------------------------------------------------------------------
  -- UJI 12: auto_generate_kos_billing(periode, NULL) oleh owner bukan platform admin (K2)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 12] Menguji auto_generate_kos_billing(periode, NULL) oleh owner bukan platform admin...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  v_err_caught := false;
  BEGIN
    PERFORM public.auto_generate_kos_billing('2026-10', NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 12 GAGAL: auto_generate_kos_billing(NULL) diizinkan untuk non-platform admin!';
  END IF;

  -- Format periode tidak sesuai regex '^\d{4}-\d{2}$'
  v_err_caught := false;
  BEGIN
    PERFORM public.auto_generate_kos_billing('2026-1', v_tenant_kos);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 12 format GAGAL: Format periode salah tidak ditolak!';
  END IF;
  RAISE NOTICE '-> OK: auto_generate_kos_billing(NULL) ditolak (42501) dan format periode divalidasi.';

  -- ----------------------------------------------------------------------------
  -- UJI 13: run_auto_billing run kedua tanpa tagihan baru tidak menambah billing_auto_runs (K4)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 13] Menguji run_auto_billing tidak menulis billing_auto_runs bila v_created = 0...';
  -- Mode service_role
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  -- Pastikan run pada tanggal ini (2026-11-20) sudah dieksekusi sekali
  PERFORM public.run_auto_billing('2026-11-20'::date);
  SELECT count(*) INTO v_runs_before FROM public.billing_auto_runs WHERE tenant_id = v_tenant_kos;

  -- Run kedua pada hari yang sama: semua kontrak kos sudah ditagih, sehingga v_created = 0
  PERFORM public.run_auto_billing('2026-11-20'::date);
  SELECT count(*) INTO v_runs_after FROM public.billing_auto_runs WHERE tenant_id = v_tenant_kos;

  IF v_runs_after <> v_runs_before THEN
    RAISE EXCEPTION 'Uji 13 GAGAL: run_auto_billing kedua menambah baris billing_auto_runs saat v_created = 0! (before: %, after: %)', v_runs_before, v_runs_after;
  END IF;
  RAISE NOTICE '-> OK: run_auto_billing kedua tanpa tagihan baru tidak menambah baris billing_auto_runs.';

  -- ----------------------------------------------------------------------------
  -- UJI 14: checkout dengan tanggal sebelum start_date -> sukses, end_date = start_date (K7)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 14] Menguji checkout dengan tanggal sebelum start_date...';
  -- Buat unit baru untuk pengetesan checkout dini
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Checkout Dini', 'vacant', '{}'::jsonb)
  RETURNING id INTO v_room_checkout_id;

  -- Jalankan sebagai owner kos
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  v_checkout_contract := public.create_kos_contract(
    v_tenant_kos,
    v_room_checkout_id,
    NULL,
    'Penyewa Dini',
    1000000,
    '2026-10-20'::date,
    NULL,
    10
  );

  -- Lakukan checkout dengan tanggal 2026-10-15 (lebih awal dari start_date 2026-10-20)
  PERFORM public.checkout_kos_room(
    v_tenant_kos,
    v_room_checkout_id,
    '2026-10-15'::date,
    'Checkout sebelum tanggal mulai sewa',
    true
  );

  SELECT status, end_date INTO v_checkout_rec
  FROM public.kos_contracts
  WHERE id = (v_checkout_contract->>'contract_id')::uuid;

  IF v_checkout_rec.status <> 'ended' THEN
    RAISE EXCEPTION 'Uji 14 GAGAL: status kontrak bukan ended!';
  END IF;
  IF v_checkout_rec.end_date <> '2026-10-20'::date THEN
    RAISE EXCEPTION 'Uji 14 GAGAL: end_date bukan start_date (2026-10-20), aktual: %', v_checkout_rec.end_date;
  END IF;
  RAISE NOTICE '-> OK: Checkout sebelum start_date sukses dan end_date terkunci di start_date (2026-10-20).';

  -- ----------------------------------------------------------------------------
  -- UJI 15: create_kos_contract menolak start_date 13 bulan lalu atau 4 bulan ke depan (K9)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 15] Menguji create_kos_contract menolak start_date di luar rentang wajar...';
  -- 15a: 13 bulan lalu
  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos,
      v_room_checkout_id,
      NULL,
      'Penyewa 13 Bulan Lalu',
      1000000,
      ((now() AT TIME ZONE 'Asia/Jakarta')::date - interval '13 month')::date,
      NULL,
      10
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg LIKE '%12 bulan ke belakang%' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 15a GAGAL: create_kos_contract dengan start_date 13 bulan lalu tidak ditolak!';
  END IF;

  -- 15b: 4 bulan ke depan
  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos,
      v_room_checkout_id,
      NULL,
      'Penyewa 4 Bulan Depan',
      1000000,
      ((now() AT TIME ZONE 'Asia/Jakarta')::date + interval '4 month')::date,
      NULL,
      10
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg LIKE '%3 bulan ke depan%' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 15b GAGAL: create_kos_contract dengan start_date 4 bulan ke depan tidak ditolak!';
  END IF;
  RAISE NOTICE '-> OK: create_kos_contract menolak start_date 13 bulan lalu dan 4 bulan ke depan.';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SELURUH UJI KOS-2.2 & KOS-2F.1 BERHASIL (100%% LULUS)';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
