-- Test Suite: Auto Billing Automation Matrix (Task BILL-AUTO-1.1)
-- Date: 2026-10-18
-- Ref: docs/handoff/BILL-AUTO-1.md
--
-- File ini memvalidasi:
-- 1. Static & Runtime Function Privileges: anon dan authenticated dilarang mengeksekusi
--    run_auto_billing() dan generate_auto_bills_for_tenant() (SQLSTATE 42501); hanya service_role.
-- 2. Penerbitan Tagihan Otomatis RT/RW pada tanggal terbit (billing_issue_day) untuk Tenant A:
--    - Hanya unit aktif yang dibuatkan tagihan (unit inactive dilewati).
--    - Nominal tagihan = jumlah komponen IPL (amount = 150000).
--    - Jatuh tempo (due_date) sesuai due_day (2026-11-10).
--    - metadata memuat bill_type = 'ipl' dan auto_generated = true.
--    - member_id terisi untuk unit yang memiliki penghuni approved, NULL untuk unit tanpa penghuni.
-- 3. Isolasi & Ketahanan Data Rusak:
--    - Tenant B dengan billing_issue_day string '99999999999' tidak menyebabkan integer overflow.
--    - Tenant C dengan billing_issue_day 15 tidak ikut tertagih pada tanggal 1.
--    - Isolasi unit: tagihan Tenant A tidak menggunakan unit milik Tenant B atau C.
-- 4. Cabang Kos: Penerbitan Tagihan Otomatis Kos untuk kamar terisi (Tenant D):
--    - Hanya kamar berstatus 'occupied' dengan kontrak aktif yang ditagih (nominal 1.000.000, jatuh tempo 2026-11-05).
--    - Kamar berstatus 'vacant' dilewati.
--    - Riwayat billing_auto_runs mencatat created_count = 1, error NULL.
-- 5. Idempotensi: Panggilan ulang pada periode yang sama tidak membuat tagihan ganda (skipped_count = 2).
-- 6. Pengabaian Tanggal Bukan Hari Terbit: Panggilan di luar billing_issue_day mengabaikan tenant.
-- 7. Subscription Read-Only Gate: Tenant dengan status subscription 'read_only' tidak diproses.
-- 8. Toggle Auto-Billing Gate: Tenant dengan auto_billing_enabled = false tidak diproses.
-- 9. Penanganan Error Komponen IPL Belum Diatur pada generate_auto_bills_for_tenant.
-- 10. RLS dan Hak Akses billing_auto_runs: Owner dapat membaca riwayat; non-anggota diblokir; non-privileged dilarang INSERT.
-- 11. Runtime Privilege Rejection (SQLSTATE 42501) untuk anon & authenticated.

BEGIN;

DO $$
DECLARE
  -- Identitas Pengguna
  v_owner_id        UUID := gen_random_uuid();
  v_warga_id        UUID := gen_random_uuid();
  v_warga_member_id UUID := gen_random_uuid();
  v_stranger_id     UUID := gen_random_uuid();
  v_owner_b_id      UUID := gen_random_uuid();
  v_owner_c_id      UUID := gen_random_uuid();
  v_owner_d_id      UUID := gen_random_uuid();

  -- Identitas Tenant & RBAC
  v_tenant_id    UUID; -- Tenant A (RT/RW)
  v_tenant_b_id  UUID; -- Tenant B (RT/RW, billing_issue_day invalid)
  v_tenant_c_id  UUID; -- Tenant C (RT/RW, billing_issue_day 15)
  v_tenant_d_id  UUID; -- Tenant D (Kos)
  v_base_role_id UUID;

  -- Unit ID
  v_unit_1  BIGINT; -- Tenant A Unit 1 (aktif, berpenghuni)
  v_unit_2  BIGINT; -- Tenant A Unit 2 (aktif, kosong)
  v_unit_3  BIGINT; -- Tenant A Unit 3 (inaktif)
  v_unit_b1 BIGINT; -- Tenant B Unit 1 (aktif)
  v_unit_c1 BIGINT; -- Tenant C Unit 1 (aktif)
  v_unit_d1 BIGINT; -- Tenant D Kamar 1 (occupied)
  v_unit_d2 BIGINT; -- Tenant D Kamar 2 (vacant)

  -- Variabel Pengujian & Assertions
  v_processed    INT;
  v_count        INT;
  v_runs_before  INT;
  v_runs_after   INT;
  v_bills_before INT;
  v_bills_after  INT;
  v_bill_rec     RECORD;
  v_run_rec      RECORD;
  v_res          JSONB;
  v_caught       BOOLEAN;
  v_sqlstate     TEXT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: AUTO BILLING MATRIX (BILL-AUTO-1.1)';
  RAISE NOTICE '============================================================';

  -- ==============================================================================
  -- 1. ASSERT FUNCTION PRIVILEGES (STATIC CHECK)
  -- ==============================================================================
  RAISE NOTICE '[TEST 1] Memeriksa static privilege has_function_privilege()...';

  -- 1.1 run_auto_billing(date)
  IF has_function_privilege('anon', 'public.run_auto_billing(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: anon memiliki privilege EXECUTE pada run_auto_billing(date)';
  END IF;

  IF has_function_privilege('authenticated', 'public.run_auto_billing(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: authenticated memiliki privilege EXECUTE pada run_auto_billing(date)';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.run_auto_billing(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: service_role tidak memiliki privilege EXECUTE pada run_auto_billing(date)';
  END IF;

  -- 1.2 generate_auto_bills_for_tenant(uuid, text)
  IF has_function_privilege('anon', 'public.generate_auto_bills_for_tenant(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: anon memiliki privilege EXECUTE pada generate_auto_bills_for_tenant';
  END IF;

  IF has_function_privilege('authenticated', 'public.generate_auto_bills_for_tenant(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: authenticated memiliki privilege EXECUTE pada generate_auto_bills_for_tenant';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.generate_auto_bills_for_tenant(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 1 GAGAL: service_role tidak memiliki privilege EXECUTE pada generate_auto_bills_for_tenant';
  END IF;

  RAISE NOTICE '>> PASSED: Test 1 (Static privilege checks) Berhasil!';

  -- ==============================================================================
  -- 2. SETUP DATA UJI (FIXTURES)
  -- ==============================================================================
  RAISE NOTICE '[SETUP] Mempersiapkan tenant uji (Tenant A, B, C, D), unit, dan settings...';

  -- 2.1 Auth Users
  INSERT INTO auth.users (id, email) VALUES
    (v_owner_id,    'owner_autobill@test.invalid'),
    (v_warga_id,    'warga_autobill@test.invalid'),
    (v_stranger_id, 'stranger_autobill@test.invalid'),
    (v_owner_b_id,  'owner_b_autobill@test.invalid'),
    (v_owner_c_id,  'owner_c_autobill@test.invalid'),
    (v_owner_d_id,  'owner_d_autobill@test.invalid');

  -- 2.2 Tenant A (RT/RW) dengan settings auto-billing:
  --     auto_billing_enabled = true, billing_issue_day = 1, due_day = 10
  --     ipl_components: Keamanan (100.000) + Kebersihan (50.000) = 150.000
  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES (
    'RT 05 Auto Billing Test',
    'rt_rw',
    v_owner_id,
    jsonb_build_object(
      'auto_billing_enabled', true,
      'billing_issue_day', 1,
      'due_day', 10,
      'ipl_components', jsonb_build_array(
        jsonb_build_object('name', 'Keamanan', 'amount', 100000),
        jsonb_build_object('name', 'Kebersihan', 'amount', 50000)
      )
    )
  ) RETURNING id INTO v_tenant_id;

  -- Pastikan subscription Tenant A aktif
  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_id;

  -- Dapatkan base role Tenant A
  SELECT id INTO v_base_role_id
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_id AND is_base_role = true
  LIMIT 1;

  -- 2.3 Buat 3 Unit Tenant A: 2 aktif (A-01, A-02), 1 tidak aktif (A-03)
  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_id, 'A-01', 'active')
  RETURNING id INTO v_unit_1;

  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_id, 'A-02', 'active')
  RETURNING id INTO v_unit_2;

  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_id, 'A-03', 'inactive')
  RETURNING id INTO v_unit_3;

  -- 2.4 Daftarkan warga approved pada unit A-01 (unit A-02 dibiarkan tanpa penghuni untuk uji member_id NULL)
  INSERT INTO public.tenant_members (id, tenant_id, user_id, unit_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_warga_member_id, v_tenant_id, v_warga_id, v_unit_1, 'Warga A-01', 'approved', false, v_base_role_id);

  -- 2.5 Tenant B (RT/RW dengan billing_issue_day string besar '99999999999' untuk uji ketahanan overflow)
  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES (
    'RT B Overflow Test',
    'rt_rw',
    v_owner_b_id,
    jsonb_build_object(
      'auto_billing_enabled', true,
      'billing_issue_day', '99999999999',
      'due_day', 10,
      'ipl_components', jsonb_build_array(
        jsonb_build_object('name', 'Iuran Warga', 'amount', 50000)
      )
    )
  ) RETURNING id INTO v_tenant_b_id;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_b_id;

  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_b_id, 'B-01', 'active')
  RETURNING id INTO v_unit_b1;

  -- 2.6 Tenant C (RT/RW dengan billing_issue_day 15 untuk uji tanggal terbit berbeda)
  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES (
    'RT C Issue Day 15',
    'rt_rw',
    v_owner_c_id,
    jsonb_build_object(
      'auto_billing_enabled', true,
      'billing_issue_day', 15,
      'due_day', 20,
      'ipl_components', jsonb_build_array(
        jsonb_build_object('name', 'Iuran Warga', 'amount', 50000)
      )
    )
  ) RETURNING id INTO v_tenant_c_id;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_c_id;

  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_c_id, 'C-01', 'active')
  RETURNING id INTO v_unit_c1;

  -- 2.7 Tenant D (Kos: auto_billing_enabled=true, billing_issue_day=1, billing_due_day=5)
  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES (
    'Kos Berkah Auto Billing Test',
    'kos',
    v_owner_d_id,
    jsonb_build_object(
      'auto_billing_enabled', true,
      'billing_issue_day', 1,
      'billing_due_day', 5
    )
  ) RETURNING id INTO v_tenant_d_id;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_d_id;

  -- Kamar 1: status 'occupied' dengan kontrak aktif (2026-10-01 s.d. 2027-03-31, sewa 1.000.000)
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (
    v_tenant_d_id,
    'Kamar 101',
    'occupied',
    jsonb_build_object(
      'contract_start', '2026-10-01',
      'contract_end', '2027-03-31',
      'rent_price', 1000000
    )
  ) RETURNING id INTO v_unit_d1;

  -- Kamar 2: status 'vacant' (kamar kosong)
  INSERT INTO public.tenant_units (tenant_id, label, status)
  VALUES (v_tenant_d_id, 'Kamar 102', 'vacant')
  RETURNING id INTO v_unit_d2;

  RAISE NOTICE '>> SETUP Berhasil! Fixtures siap.';

  -- ==============================================================================
  -- 3. KASUS 1: Penerbitan Tagihan pada Hari Terbit (2026-11-01)
  --    (Menguji RT/RW Tenant A, Ketahanan Data Rusak Tenant B, Isolasi Tenant C, & Kos Tenant D)
  -- ==============================================================================
  RAISE NOTICE '[KASUS 1] Menjalankan run_auto_billing("2026-11-01")...';

  -- Rekam kondisi sebelum eksekusi untuk Tenant A
  SELECT COUNT(*) INTO v_runs_before FROM public.billing_auto_runs WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_bills_before FROM public.billing_items WHERE tenant_id = v_tenant_id AND period = '2026-11';

  -- Eksekusi run_auto_billing (nilai kembalian disimpan tetapi tidak diasersi sebagai angka pasti)
  v_processed := public.run_auto_billing('2026-11-01');

  -- 3.1 Validasi Tenant A (RT/RW)
  SELECT COUNT(*) INTO v_runs_after FROM public.billing_auto_runs WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_bills_after FROM public.billing_items WHERE tenant_id = v_tenant_id AND period = '2026-11';

  IF (v_runs_after - v_runs_before) <> 1 THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Riwayat run tenant A tidak bertambah 1 (sebelum: %, sesudah: %)', v_runs_before, v_runs_after;
  END IF;

  IF (v_bills_after - v_bills_before) <> 2 THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Tagihan tenant A tidak bertambah 2 (sebelum: %, sesudah: %)', v_bills_before, v_bills_after;
  END IF;

  -- Validasi tagihan Unit 1 (aktif, memiliki penghuni)
  SELECT * INTO v_bill_rec
  FROM public.billing_items
  WHERE tenant_id = v_tenant_id AND unit_id = v_unit_1 AND period = '2026-11';

  IF v_bill_rec.id IS NULL THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Tagihan untuk Unit 1 tidak ditemukan';
  END IF;

  IF v_bill_rec.amount <> 150000 THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Nominal Unit 1 salah (got %, expected 150000)', v_bill_rec.amount;
  END IF;

  IF v_bill_rec.due_date <> '2026-11-10'::date THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Jatuh tempo Unit 1 salah (got %, expected 2026-11-10)', v_bill_rec.due_date;
  END IF;

  IF v_bill_rec.status <> 'unpaid' THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Status tagihan Unit 1 harus unpaid (got %)', v_bill_rec.status;
  END IF;

  IF (v_bill_rec.metadata->>'bill_type') <> 'ipl' THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: metadata.bill_type Unit 1 bukan ipl (got %)', v_bill_rec.metadata->>'bill_type';
  END IF;

  IF (v_bill_rec.metadata->>'auto_generated')::boolean <> true THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: metadata.auto_generated Unit 1 harus true';
  END IF;

  IF v_bill_rec.member_id IS DISTINCT FROM v_warga_member_id THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: member_id Unit 1 salah (got %, expected %)', v_bill_rec.member_id, v_warga_member_id;
  END IF;

  -- Validasi tagihan Unit 2 (aktif, tanpa penghuni)
  SELECT * INTO v_bill_rec
  FROM public.billing_items
  WHERE tenant_id = v_tenant_id AND unit_id = v_unit_2 AND period = '2026-11';

  IF v_bill_rec.id IS NULL THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Tagihan untuk Unit 2 tidak ditemukan';
  END IF;

  IF v_bill_rec.amount <> 150000 THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Nominal Unit 2 salah (got %, expected 150000)', v_bill_rec.amount;
  END IF;

  IF v_bill_rec.member_id IS NOT NULL THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: member_id Unit 2 harus NULL (got %)', v_bill_rec.member_id;
  END IF;

  IF (v_bill_rec.metadata->>'auto_generated')::boolean <> true THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: metadata.auto_generated Unit 2 harus true';
  END IF;

  -- Validasi Unit 3 (inactive, TIDAK boleh ada tagihan)
  SELECT COUNT(*) INTO v_count
  FROM public.billing_items
  WHERE tenant_id = v_tenant_id AND unit_id = v_unit_3 AND period = '2026-11';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Unit 3 (inactive) tidak boleh dibuatkan tagihan, ditemukan %', v_count;
  END IF;

  -- Validasi pencatatan billing_auto_runs Tenant A
  SELECT * INTO v_run_rec
  FROM public.billing_auto_runs
  WHERE tenant_id = v_tenant_id AND period = '2026-11'
  ORDER BY run_at DESC
  LIMIT 1;

  IF v_run_rec.id IS NULL THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Riwayat billing_auto_runs Tenant A tidak tercatat';
  END IF;

  IF v_run_rec.created_count <> 2 OR v_run_rec.skipped_count <> 0 OR v_run_rec.error IS NOT NULL THEN
    RAISE EXCEPTION 'KASUS 1 GAGAL: Data billing_auto_runs Tenant A tidak valid (created=%, skipped=%, error=%)',
      v_run_rec.created_count, v_run_rec.skipped_count, v_run_rec.error;
  END IF;

  -- 3.2 Uji Isolasi dan Ketahanan Data Rusak (Tenant B & Tenant C)
  RAISE NOTICE '[KASUS 1 - ISOLASI & DATA RUSAK] Memeriksa Tenant B (overflow issue day) dan Tenant C (issue day 15)...';

  -- Tenant B (issue_day '99999999999') tidak boleh punya billing_auto_runs dan tagihan periode 2026-11
  SELECT COUNT(*) INTO v_count FROM public.billing_auto_runs WHERE tenant_id = v_tenant_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'KASUS ISOLASI/DATA RUSAK GAGAL: Tenant B memiliki % baris billing_auto_runs (harus 0)', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.billing_items WHERE tenant_id = v_tenant_b_id AND period = '2026-11';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'KASUS ISOLASI/DATA RUSAK GAGAL: Tenant B memiliki % billing_items periode 2026-11 (harus 0)', v_count;
  END IF;

  -- Tenant C (issue_day 15) tidak boleh punya billing_auto_runs dan tagihan periode 2026-11
  SELECT COUNT(*) INTO v_count FROM public.billing_auto_runs WHERE tenant_id = v_tenant_c_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'KASUS ISOLASI/DATA RUSAK GAGAL: Tenant C memiliki % baris billing_auto_runs (harus 0)', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.billing_items WHERE tenant_id = v_tenant_c_id AND period = '2026-11';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'KASUS ISOLASI/DATA RUSAK GAGAL: Tenant C memiliki % billing_items periode 2026-11 (harus 0)', v_count;
  END IF;

  -- Isolasi unit: Tidak ada tagihan Tenant A yang menggunakan unit milik Tenant B atau Tenant C
  SELECT COUNT(*) INTO v_count
  FROM public.billing_items
  WHERE tenant_id = v_tenant_id
    AND unit_id IN (v_unit_b1, v_unit_c1);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'KASUS ISOLASI/DATA RUSAK GAGAL: Tagihan tenant A menggunakan unit milik tenant B/C (count: %)', v_count;
  END IF;

  -- 3.3 Uji Vertikal Kos (Tenant D)
  RAISE NOTICE '[KASUS 1 - KOS] Memeriksa Tenant D (Kos: Kamar 1 occupied vs Kamar 2 vacant)...';

  -- Tenant D punya tepat 1 tagihan periode 2026-11 untuk kamar 1 (occupied)
  SELECT COUNT(*) INTO v_count
  FROM public.billing_items
  WHERE tenant_id = v_tenant_d_id AND period = '2026-11';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'KASUS KOS GAGAL: Tenant D diharapkan memiliki tepat 1 tagihan periode 2026-11, ditemukan %', v_count;
  END IF;

  SELECT * INTO v_bill_rec
  FROM public.billing_items
  WHERE tenant_id = v_tenant_d_id AND unit_id = v_unit_d1 AND period = '2026-11';

  IF v_bill_rec.id IS NULL THEN
    RAISE EXCEPTION 'KASUS KOS GAGAL: Tagihan kamar 1 (occupied) Tenant D tidak ditemukan';
  END IF;

  IF v_bill_rec.amount <> 1000000 THEN
    RAISE EXCEPTION 'KASUS KOS GAGAL: Nominal tagihan kamar 1 salah (got %, expected 1000000)', v_bill_rec.amount;
  END IF;

  IF v_bill_rec.due_date <> '2026-11-05'::date THEN
    RAISE EXCEPTION 'KASUS KOS GAGAL: Jatuh tempo kamar 1 salah (got %, expected 2026-11-05)', v_bill_rec.due_date;
  END IF;

  -- Kamar 2 (vacant) tidak boleh dibuatkan tagihan
  SELECT COUNT(*) INTO v_count
  FROM public.billing_items
  WHERE tenant_id = v_tenant_d_id AND unit_id = v_unit_d2 AND period = '2026-11';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'KASUS KOS GAGAL: Kamar 2 (vacant) tidak boleh dibuatkan tagihan, ditemukan %', v_count;
  END IF;

  -- Riwayat billing_auto_runs Tenant D: created_count = 1, error NULL
  SELECT * INTO v_run_rec
  FROM public.billing_auto_runs
  WHERE tenant_id = v_tenant_d_id AND period = '2026-11'
  ORDER BY run_at DESC
  LIMIT 1;

  IF v_run_rec.id IS NULL THEN
    RAISE EXCEPTION 'KASUS KOS GAGAL: Riwayat billing_auto_runs Tenant D tidak ditemukan';
  END IF;

  IF v_run_rec.created_count <> 1 OR v_run_rec.error IS NOT NULL THEN
    RAISE EXCEPTION 'KASUS KOS GAGAL: Data billing_auto_runs Tenant D tidak valid (created=%, skipped=%, error=%)',
      v_run_rec.created_count, v_run_rec.skipped_count, v_run_rec.error;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 1 (Penerbitan tagihan unit aktif, Kos, & Isolasi Data Rusak) Berhasil!';

  -- ==============================================================================
  -- 4. KASUS 2: Uji Idempotensi (Panggilan Ulang pada Periode Sama)
  -- ==============================================================================
  RAISE NOTICE '[KASUS 2] Menguji idempotensi: memanggil ulang run_auto_billing("2026-11-01")...';

  SELECT COUNT(*) INTO v_runs_before FROM public.billing_auto_runs WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_bills_before FROM public.billing_items WHERE tenant_id = v_tenant_id AND period = '2026-11';

  v_processed := public.run_auto_billing('2026-11-01');

  SELECT COUNT(*) INTO v_runs_after FROM public.billing_auto_runs WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_bills_after FROM public.billing_items WHERE tenant_id = v_tenant_id AND period = '2026-11';

  -- Riwayat run Tenant A harus bertambah 1
  IF (v_runs_after - v_runs_before) <> 1 THEN
    RAISE EXCEPTION 'KASUS 2 GAGAL: Riwayat run tenant A tidak bertambah 1 pada panggilan ulang (sebelum: %, sesudah: %)', v_runs_before, v_runs_after;
  END IF;

  -- Jumlah total tagihan Tenant A tidak boleh bertambah (0 duplikat)
  IF (v_bills_after - v_bills_before) <> 0 THEN
    RAISE EXCEPTION 'KASUS 2 GAGAL: Tagihan tenant A bertambah duplikat! (sebelum: %, sesudah: %)', v_bills_before, v_bills_after;
  END IF;

  -- Riwayat billing_auto_runs Tenant A terbaru mencatat created_count = 0, skipped_count = 2
  SELECT * INTO v_run_rec
  FROM public.billing_auto_runs
  WHERE tenant_id = v_tenant_id AND period = '2026-11'
  ORDER BY run_at DESC
  LIMIT 1;

  IF v_run_rec.created_count <> 0 OR v_run_rec.skipped_count <> 2 THEN
    RAISE EXCEPTION 'KASUS 2 GAGAL: Idempotensi tidak tercatat benar (created=%, skipped=%)',
      v_run_rec.created_count, v_run_rec.skipped_count;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 2 (Idempotensi berhasil, 0 duplikat, 2 skipped) Berhasil!';

  -- ==============================================================================
  -- 5. KASUS 3: Tanggal Bukan Hari Terbit (2026-11-02)
  -- ==============================================================================
  RAISE NOTICE '[KASUS 3] Menguji eksekusi pada tanggal bukan hari terbit ("2026-11-02")...';

  SELECT COUNT(*) INTO v_runs_before FROM public.billing_auto_runs WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_bills_before FROM public.billing_items WHERE tenant_id = v_tenant_id;

  v_processed := public.run_auto_billing('2026-11-02');

  SELECT COUNT(*) INTO v_runs_after FROM public.billing_auto_runs WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_bills_after FROM public.billing_items WHERE tenant_id = v_tenant_id;

  -- Riwayat dan tagihan Tenant A tidak boleh bertambah pada tanggal 2
  IF v_runs_after <> v_runs_before THEN
    RAISE EXCEPTION 'KASUS 3 GAGAL: Tenant A seharusnya dilewati pada tanggal 2 (runs sebelum: %, sesudah: %)', v_runs_before, v_runs_after;
  END IF;

  IF v_bills_after <> v_bills_before THEN
    RAISE EXCEPTION 'KASUS 3 GAGAL: Tidak boleh ada tagihan baru dibuat pada tanggal bukan hari terbit (bills sebelum: %, sesudah: %)', v_bills_before, v_bills_after;
  END IF;

  RAISE NOTICE '>> PASSED: Kasus 3 (Tanggal bukan hari terbit dilewati) Berhasil!';

  -- ==============================================================================
  -- 6. KASUS 4: Tenant Berstatus Subscription 'read_only' Tidak Diproses
  -- ==============================================================================
  RAISE NOTICE '[KASUS 4] Menguji tenant read_only...';

  UPDATE public.tenant_subscriptions
  SET status = 'read_only'
  WHERE tenant_id = v_tenant_id;

  SELECT COUNT(*) INTO v_runs_before FROM public.billing_auto_runs WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_bills_before FROM public.billing_items WHERE tenant_id = v_tenant_id AND period = '2026-12';

  v_processed := public.run_auto_billing('2026-12-01');

  SELECT COUNT(*) INTO v_runs_after FROM public.billing_auto_runs WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_bills_after FROM public.billing_items WHERE tenant_id = v_tenant_id AND period = '2026-12';

  IF v_runs_after <> v_runs_before THEN
    RAISE EXCEPTION 'KASUS 4 GAGAL: Tenant read_only tidak boleh dicatat run baru (runs sebelum: %, sesudah: %)', v_runs_before, v_runs_after;
  END IF;

  IF v_bills_after <> v_bills_before OR v_bills_after <> 0 THEN
    RAISE EXCEPTION 'KASUS 4 GAGAL: Tagihan tidak boleh dibuat saat subscription read_only (got %)', v_bills_after;
  END IF;

  -- Kembalikan status subscription ke active
  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_id;

  RAISE NOTICE '>> PASSED: Kasus 4 (Tenant read_only dilewati) Berhasil!';

  -- ==============================================================================
  -- 7. KASUS 5: Tenant dengan auto_billing_enabled = false Tidak Diproses
  -- ==============================================================================
  RAISE NOTICE '[KASUS 5] Menguji tenant dengan auto_billing_enabled = false...';

  UPDATE public.tenants
  SET settings = jsonb_set(settings, '{auto_billing_enabled}', 'false'::jsonb)
  WHERE id = v_tenant_id;

  SELECT COUNT(*) INTO v_runs_before FROM public.billing_auto_runs WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_bills_before FROM public.billing_items WHERE tenant_id = v_tenant_id AND period = '2026-12';

  v_processed := public.run_auto_billing('2026-12-01');

  SELECT COUNT(*) INTO v_runs_after FROM public.billing_auto_runs WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_bills_after FROM public.billing_items WHERE tenant_id = v_tenant_id AND period = '2026-12';

  IF v_runs_after <> v_runs_before THEN
    RAISE EXCEPTION 'KASUS 5 GAGAL: Tenant dengan auto_billing_enabled false tidak boleh dicatat run baru (runs sebelum: %, sesudah: %)', v_runs_before, v_runs_after;
  END IF;

  IF v_bills_after <> v_bills_before OR v_bills_after <> 0 THEN
    RAISE EXCEPTION 'KASUS 5 GAGAL: Tagihan dibuat padahal auto_billing_enabled false (got % bills)', v_bills_after;
  END IF;

  -- Kembalikan setting auto_billing_enabled ke true
  UPDATE public.tenants
  SET settings = jsonb_set(settings, '{auto_billing_enabled}', 'true'::jsonb)
  WHERE id = v_tenant_id;

  RAISE NOTICE '>> PASSED: Kasus 5 (auto_billing_enabled false dilewati) Berhasil!';

  -- ==============================================================================
  -- 8. KASUS 6: Penanganan Error Komponen IPL Belum Diatur
  -- ==============================================================================
  RAISE NOTICE '[KASUS 6] Menguji tenant tanpa komponen IPL terkonfigurasi...';

  UPDATE public.tenants
  SET settings = settings - 'ipl_components'
  WHERE id = v_tenant_id;

  v_res := public.generate_auto_bills_for_tenant(v_tenant_id, '2026-12');

  IF (v_res->>'error') IS DISTINCT FROM 'Komponen IPL belum diatur' THEN
    RAISE EXCEPTION 'KASUS 6 GAGAL: Pesan error salah (got %, expected "Komponen IPL belum diatur")', v_res->>'error';
  END IF;

  IF (v_res->>'created')::int <> 0 THEN
    RAISE EXCEPTION 'KASUS 6 GAGAL: Tagihan tidak boleh dibuat saat komponen IPL belum diatur';
  END IF;

  -- Kembalikan konfigurasi ipl_components
  UPDATE public.tenants
  SET settings = jsonb_set(settings, '{ipl_components}', jsonb_build_array(
    jsonb_build_object('name', 'Keamanan', 'amount', 100000),
    jsonb_build_object('name', 'Kebersihan', 'amount', 50000)
  ))
  WHERE id = v_tenant_id;

  RAISE NOTICE '>> PASSED: Kasus 6 (Error komponen IPL belum diatur tertangani) Berhasil!';

  -- ==============================================================================
  -- 9. KASUS 7: RLS billing_auto_runs
  -- ==============================================================================
  RAISE NOTICE '[KASUS 7] Menguji RLS pada tabel billing_auto_runs...';

  -- 9.1 Owner dapat melihat riwayat billing_auto_runs
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT COUNT(*) INTO v_count
  FROM public.billing_auto_runs
  WHERE tenant_id = v_tenant_id;

  IF v_count < 2 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 7.1 GAGAL: Owner harus dapat melihat riwayat billing_auto_runs (got %)', v_count;
  END IF;

  -- 9.2 Pengguna luar (stranger) tidak dapat melihat riwayat
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger_id::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_stranger_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT COUNT(*) INTO v_count
  FROM public.billing_auto_runs
  WHERE tenant_id = v_tenant_id;

  IF v_count <> 0 THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 7.2 GAGAL: Stranger tidak boleh melihat riwayat tenant lain (got %)', v_count;
  END IF;

  -- 9.3 Authenticated user TIDAK boleh INSERT manual ke billing_auto_runs
  v_caught := false;
  BEGIN
    INSERT INTO public.billing_auto_runs (tenant_id, period, created_count, skipped_count)
    VALUES (v_tenant_id, '2026-12', 1, 0);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 7.3 GAGAL: Authenticated user seharusnya dilarang INSERT ke billing_auto_runs';
  END IF;

  -- Kembalikan role ke postgres
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 7 (RLS billing_auto_runs) Berhasil!';

  -- ==============================================================================
  -- 10. KASUS 8: Runtime Rejection (SQLSTATE 42501) untuk anon & authenticated
  -- ==============================================================================
  RAISE NOTICE '[KASUS 8] Menguji runtime privilege rejection untuk role authenticated & anon...';

  -- 10.1 Authenticated memanggil run_auto_billing
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_warga_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_caught := false;
  BEGIN
    PERFORM public.run_auto_billing('2026-11-01');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_caught := true;
    ELSE
      EXECUTE 'SET LOCAL ROLE postgres';
      RAISE EXCEPTION 'KASUS 8.1 GAGAL: SQLSTATE bukan 42501 (got %)', v_sqlstate;
    END IF;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 8.1 GAGAL: run_auto_billing tidak menolak pemanggilan authenticated';
  END IF;

  -- 10.2 Authenticated memanggil generate_auto_bills_for_tenant
  v_caught := false;
  BEGIN
    PERFORM public.generate_auto_bills_for_tenant(v_tenant_id, '2026-11');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_caught := true;
    ELSE
      EXECUTE 'SET LOCAL ROLE postgres';
      RAISE EXCEPTION 'KASUS 8.2 GAGAL: SQLSTATE bukan 42501 (got %)', v_sqlstate;
    END IF;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 8.2 GAGAL: generate_auto_bills_for_tenant tidak menolak pemanggilan authenticated';
  END IF;

  -- 10.3 Anon memanggil run_auto_billing
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';

  v_caught := false;
  BEGIN
    PERFORM public.run_auto_billing('2026-11-01');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_caught := true;
    ELSE
      EXECUTE 'SET LOCAL ROLE postgres';
      RAISE EXCEPTION 'KASUS 8.3 GAGAL: SQLSTATE bukan 42501 (got %)', v_sqlstate;
    END IF;
  END;

  IF NOT v_caught THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    RAISE EXCEPTION 'KASUS 8.3 GAGAL: run_auto_billing tidak menolak pemanggilan anon';
  END IF;

  -- Kembalikan role ke postgres
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '>> PASSED: Kasus 8 (Runtime rejection 42501) Berhasil!';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA TEST AUTO BILLING MATRIX (BILL-AUTO-1.1) LULUS!';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
