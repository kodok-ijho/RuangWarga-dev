-- Test Suite: Kos Collections, Late Fee, Reminders & Arrears (Task KOS-5.1)
-- Date: 2026-10-27
-- Ref: docs/handoff/KOS-5.md § 5.1
--
-- File ini memvalidasi aturan penagihan kos, denda keterlambatan, pengingat, dan tunggakan:
-- 1. validate_late_fee_rule: aturan valid diterima, aturan tidak valid ditolak
-- 2. create_kos_contract: integrasi late_fee_rule (warisan settings vs kustom, grace_days 0-7)
-- 3. run_kos_collections: pengujian tiap model denda (none, once, daily dengan max & grace_days, percent)
-- 4. run_kos_collections: eksekusi 2x idempoten (fees_updated 0 pada pemanggilan kedua)
-- 5. run_kos_collections: denda berhenti bertambah saat status tagihan pending_verification
-- 6. waive_late_fee: penghapusan denda, pencatatan metadata, dan pencegahan kalkulasi ulang
-- 7. rent_reminders: antrean pengingat 4 tahap (h-3, h0, h+3, h+7) dan mark_rent_reminder (sent/skipped)
-- 8. get_kos_arrears: agregasi per penyewa dan pengelompokan umur tunggakan (0-7, 8-30, >30 hari)
-- 9. Otorisasi & RLS: penolakan akses warga (42501) dan proteksi tabel rent_reminders
-- 10. run_auto_billing: pemanggilan aman run_kos_collections di akhir proses

BEGIN;

DO $$
DECLARE
  v_owner_kos          UUID := gen_random_uuid();
  v_warga_kos          UUID := gen_random_uuid();
  v_penyewa_none       UUID := gen_random_uuid();
  v_penyewa_once       UUID := gen_random_uuid();
  v_penyewa_daily      UUID := gen_random_uuid();
  v_penyewa_percent    UUID := gen_random_uuid();
  v_penyewa_pending    UUID := gen_random_uuid();
  v_penyewa_waive      UUID := gen_random_uuid();
  v_penyewa_arr_0_7    UUID := gen_random_uuid();
  v_penyewa_arr_8_30   UUID := gen_random_uuid();
  v_penyewa_arr_30plus UUID := gen_random_uuid();
  v_penyewa_rem_h3     UUID := gen_random_uuid();
  v_penyewa_rem_h0     UUID := gen_random_uuid();
  v_penyewa_rem_hp3    UUID := gen_random_uuid();
  v_penyewa_rem_hp7    UUID := gen_random_uuid();

  v_tenant_kos         UUID;
  v_role_kos_id        UUID;

  v_room_none_id       BIGINT;
  v_room_once_id       BIGINT;
  v_room_daily_id      BIGINT;
  v_room_percent_id    BIGINT;
  v_room_pending_id    BIGINT;
  v_room_waive_id      BIGINT;
  v_room_arr_0_7_id    BIGINT;
  v_room_arr_8_30_id   BIGINT;
  v_room_arr_30plus_id BIGINT;
  v_room_rem_h3_id     BIGINT;
  v_room_rem_h0_id     BIGINT;
  v_room_rem_hp3_id    BIGINT;
  v_room_rem_hp7_id    BIGINT;

  v_member_none_id       UUID;
  v_member_once_id       UUID;
  v_member_daily_id      UUID;
  v_member_percent_id    UUID;
  v_member_pending_id    UUID;
  v_member_waive_id      UUID;
  v_member_arr_0_7_id    UUID;
  v_member_arr_8_30_id   UUID;
  v_member_arr_30plus_id UUID;
  v_member_rem_h3_id     UUID;
  v_member_rem_h0_id     UUID;
  v_member_rem_hp3_id    UUID;
  v_member_rem_hp7_id    UUID;

  v_today              DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_res                JSONB;
  v_contract_id        UUID;
  v_bill_id            UUID;
  v_bill_rec           RECORD;
  v_reminder_rec       RECORD;
  v_arrear_rec         RECORD;
  v_reminder_id        UUID;
  v_err_caught         BOOLEAN;
  v_sqlstate           TEXT;
  v_errmsg             TEXT;
  v_arrears_count      INT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: KOS COLLECTIONS & LATE FEES (KOS-5.1)';
  RAISE NOTICE '============================================================';

  -- ----------------------------------------------------------------------------
  -- SETUP FIXTURES
  -- ----------------------------------------------------------------------------
  -- 1. auth.users wajib ada sebelum relasi tenant_members (FK)
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_kos,          'owner_coll@test.invalid',      'authenticated', 'authenticated'),
    (v_warga_kos,          'warga_coll@test.invalid',      'authenticated', 'authenticated'),
    (v_penyewa_none,       'penyewa_none@test.invalid',    'authenticated', 'authenticated'),
    (v_penyewa_once,       'penyewa_once@test.invalid',    'authenticated', 'authenticated'),
    (v_penyewa_daily,      'penyewa_daily@test.invalid',   'authenticated', 'authenticated'),
    (v_penyewa_percent,    'penyewa_percent@test.invalid', 'authenticated', 'authenticated'),
    (v_penyewa_pending,    'penyewa_pending@test.invalid', 'authenticated', 'authenticated'),
    (v_penyewa_waive,      'penyewa_waive@test.invalid',   'authenticated', 'authenticated'),
    (v_penyewa_arr_0_7,    'penyewa_arr1@test.invalid',    'authenticated', 'authenticated'),
    (v_penyewa_arr_8_30,   'penyewa_arr2@test.invalid',    'authenticated', 'authenticated'),
    (v_penyewa_arr_30plus, 'penyewa_arr3@test.invalid',    'authenticated', 'authenticated'),
    (v_penyewa_rem_h3,     'penyewa_rem1@test.invalid',    'authenticated', 'authenticated'),
    (v_penyewa_rem_h0,     'penyewa_rem2@test.invalid',    'authenticated', 'authenticated'),
    (v_penyewa_rem_hp3,    'penyewa_rem3@test.invalid',    'authenticated', 'authenticated'),
    (v_penyewa_rem_hp7,    'penyewa_rem4@test.invalid',    'authenticated', 'authenticated');

  -- 2. Buat Tenant Kos dengan aturan denda default di settings
  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES (
    'Kos Collections Test Suite',
    'kos',
    v_owner_kos,
    jsonb_build_object(
      'rent_grace_days', 10,
      'default_rent_price', 1500000,
      'late_fee_rule', jsonb_build_object('type', 'once', 'amount', 25000, 'grace_days', 1)
    )
  )
  RETURNING id INTO v_tenant_kos;

  -- Pastikan status langganan adalah trial / active
  UPDATE public.tenant_subscriptions
  SET status = 'active'::public.subscription_status
  WHERE tenant_id = v_tenant_kos;

  SELECT id INTO v_role_kos_id
  FROM public.tenant_roles
  WHERE tenant_id = v_tenant_kos AND is_base_role = true
  LIMIT 1;

  -- Warga biasa (non-owner, tanpa hak generate_billing)
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, tenant_role_id)
  VALUES (v_tenant_kos, v_warga_kos, 'Warga Biasa Tanpa Izin', 'approved', false, v_role_kos_id);

  -- Kamar & Anggota untuk pengujian tiap fitur
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar None', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_none_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_none, 'Penyewa None', 'approved', false, v_room_none_id, v_role_kos_id) RETURNING id INTO v_member_none_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Once', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_once_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_once, 'Penyewa Once', 'approved', false, v_room_once_id, v_role_kos_id) RETURNING id INTO v_member_once_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Daily', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_daily_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_daily, 'Penyewa Daily', 'approved', false, v_room_daily_id, v_role_kos_id) RETURNING id INTO v_member_daily_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Percent', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_percent_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_percent, 'Penyewa Percent', 'approved', false, v_room_percent_id, v_role_kos_id) RETURNING id INTO v_member_percent_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Pending', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_pending_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_pending, 'Penyewa Pending', 'approved', false, v_room_pending_id, v_role_kos_id) RETURNING id INTO v_member_pending_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Waive', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_waive_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_waive, 'Penyewa Waive', 'approved', false, v_room_waive_id, v_role_kos_id) RETURNING id INTO v_member_waive_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Arr 0-7', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_arr_0_7_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_arr_0_7, 'Penyewa Arr 0-7', 'approved', false, v_room_arr_0_7_id, v_role_kos_id) RETURNING id INTO v_member_arr_0_7_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Arr 8-30', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_arr_8_30_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_arr_8_30, 'Penyewa Arr 8-30', 'approved', false, v_room_arr_8_30_id, v_role_kos_id) RETURNING id INTO v_member_arr_8_30_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Arr >30', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_arr_30plus_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_arr_30plus, 'Penyewa Arr >30', 'approved', false, v_room_arr_30plus_id, v_role_kos_id) RETURNING id INTO v_member_arr_30plus_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Rem H-3', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_rem_h3_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_rem_h3, 'Penyewa Rem H-3', 'approved', false, v_room_rem_h3_id, v_role_kos_id) RETURNING id INTO v_member_rem_h3_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Rem H0', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_rem_h0_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_rem_h0, 'Penyewa Rem H0', 'approved', false, v_room_rem_h0_id, v_role_kos_id) RETURNING id INTO v_member_rem_h0_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Rem H+3', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_rem_hp3_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_rem_hp3, 'Penyewa Rem H+3', 'approved', false, v_room_rem_hp3_id, v_role_kos_id) RETURNING id INTO v_member_rem_hp3_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (v_tenant_kos, 'Kamar Rem H+7', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_rem_hp7_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_penyewa_rem_hp7, 'Penyewa Rem H+7', 'approved', false, v_room_rem_hp7_id, v_role_kos_id) RETURNING id INTO v_member_rem_hp7_id;


  -- ----------------------------------------------------------------------------
  -- UJI 1: Validasi Aturan Denda (public.validate_late_fee_rule)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 1] Menguji fungsi validate_late_fee_rule...';

  -- 1a. Aturan valid
  IF NOT public.validate_late_fee_rule('{"type":"none"}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1a GAGAL: type none seharusnya valid';
  END IF;

  IF NOT public.validate_late_fee_rule('{"type":"none", "grace_days": 3}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1a GAGAL: type none dengan grace_days seharusnya valid';
  END IF;

  IF NOT public.validate_late_fee_rule('{"type":"once", "amount": 50000, "grace_days": 0}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1a GAGAL: type once seharusnya valid';
  END IF;

  IF NOT public.validate_late_fee_rule('{"type":"daily", "amount": 10000, "max": 100000, "grace_days": 5}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1a GAGAL: type daily seharusnya valid';
  END IF;

  IF NOT public.validate_late_fee_rule('{"type":"percent", "percent": 5, "grace_days": 2}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1a GAGAL: type percent seharusnya valid';
  END IF;

  -- 1b. Aturan tidak valid
  IF public.validate_late_fee_rule('{"type":"invalid_type"}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1b GAGAL: type invalid_type seharusnya ditolak';
  END IF;

  IF public.validate_late_fee_rule('{"type":"once", "amount": 0}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1b GAGAL: once dengan amount 0 seharusnya ditolak';
  END IF;

  IF public.validate_late_fee_rule('{"type":"once", "amount": -1000}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1b GAGAL: once dengan amount negatif seharusnya ditolak';
  END IF;

  IF public.validate_late_fee_rule('{"type":"daily", "amount": 10000, "max": 0}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1b GAGAL: daily dengan max 0 seharusnya ditolak';
  END IF;

  IF public.validate_late_fee_rule('{"type":"percent", "percent": 0}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1b GAGAL: percent 0 seharusnya ditolak';
  END IF;

  IF public.validate_late_fee_rule('{"type":"percent", "percent": 101}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1b GAGAL: percent > 100 seharusnya ditolak';
  END IF;

  IF public.validate_late_fee_rule('{"type":"once", "amount": 50000, "grace_days": 8}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1b GAGAL: grace_days > 7 seharusnya ditolak';
  END IF;

  IF public.validate_late_fee_rule('{"type":"once", "amount": 50000, "grace_days": -1}'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1b GAGAL: grace_days negatif seharusnya ditolak';
  END IF;

  IF public.validate_late_fee_rule(NULL) THEN
    RAISE EXCEPTION 'Uji 1b GAGAL: NULL seharusnya ditolak';
  END IF;

  IF public.validate_late_fee_rule('[]'::jsonb) THEN
    RAISE EXCEPTION 'Uji 1b GAGAL: array seharusnya ditolak';
  END IF;

  RAISE NOTICE '-> OK: Fungsi validate_late_fee_rule memvalidasi struktur aturan denda dengan benar.';


  -- ----------------------------------------------------------------------------
  -- UJI 2: create_kos_contract dengan late_fee_rule (KOS-5.1)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 2] Menguji create_kos_contract dengan late_fee_rule...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  -- 2a. Aturan tidak valid ditolak
  v_err_caught := false;
  BEGIN
    PERFORM public.create_kos_contract(
      v_tenant_kos, v_room_none_id, v_member_none_id, 'None', 1500000, v_today, NULL, 10, NULL, 'start_date', '[]'::jsonb,
      '{"type": "daily", "amount": 10000, "max": 0}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg LIKE '%Aturan denda keterlambatan tidak valid%' THEN
      v_err_caught := true;
    END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 2a GAGAL: Aturan denda tidak valid diizinkan saat membuat kontrak!';
  END IF;
  RAISE NOTICE '-> OK: Input aturan denda tidak valid ditolak.';

  -- 2b. Warisan dari settings bila p_late_fee_rule NULL
  -- settings.late_fee_rule = {"type":"once","amount":25000,"grace_days":1}
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_once_id, v_member_once_id, 'Penyewa Once Settings', 1500000,
    (v_today - interval '20 days')::date, NULL, 5, 'Kontrak warisan settings', 'start_date', '[]'::jsonb, NULL
  );

  SELECT * INTO v_bill_rec FROM public.kos_contracts WHERE id = (v_res->>'contract_id')::uuid;
  IF (v_bill_rec.late_fee_rule->>'type') <> 'once'
     OR (v_bill_rec.late_fee_rule->>'amount')::numeric <> 25000
     OR (v_bill_rec.late_fee_rule->>'grace_days')::int <> 1 THEN
    RAISE EXCEPTION 'Uji 2b GAGAL: late_fee_rule tidak mewarisi settings kos, aktual: %', v_bill_rec.late_fee_rule;
  END IF;
  RAISE NOTICE '-> OK: Kontrak baru berhasil mewarisi aturan denda dari pengaturan kos saat parameter NULL.';

  -- Ubah aturan kontrak Once menjadi eksplisit 50.000, grace_days 0 untuk pengujian berikutnya
  UPDATE public.kos_contracts
  SET late_fee_rule = '{"type":"once", "amount": 50000, "grace_days": 0}'::jsonb
  WHERE id = (v_res->>'contract_id')::uuid;


  -- ----------------------------------------------------------------------------
  -- UJI 3: Pengujian Model Denda di run_kos_collections
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 3] Menguji perhitungan denda tiap model di run_kos_collections...';

  -- Buat kontrak model None
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_none_id, v_member_none_id, 'Penyewa None', 1500000,
    (v_today - interval '20 days')::date, NULL, 5, 'Kontrak None', 'start_date', '[]'::jsonb,
    '{"type":"none"}'::jsonb
  );

  -- Buat kontrak model Daily: amount 10000, max 50000, grace_days 2
  -- Tanggal mulai v_today - 10 hari, grace_days tagihan 5 -> due_date = v_today - 5 hari
  -- Toleransi denda 2 hari -> batas toleransi denda = due_date + 2 = v_today - 3 hari
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_daily_id, v_member_daily_id, 'Penyewa Daily', 1500000,
    (v_today - interval '10 days')::date, NULL, 5, 'Kontrak Daily', 'start_date', '[]'::jsonb,
    '{"type":"daily", "amount": 10000, "max": 50000, "grace_days": 2}'::jsonb
  );

  -- Buat kontrak model Percent: Sewa 1.000.000 + Parkir 200.000 (total tagihan 1.200.000), percent 5%
  -- Tanggal mulai v_today - 20 hari, grace_days tagihan 5 -> due_date = v_today - 15 hari
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_percent_id, v_member_percent_id, 'Penyewa Percent', 1000000,
    (v_today - interval '20 days')::date, NULL, 5, 'Kontrak Percent', 'start_date',
    '[{"name": "Parkir", "amount": 200000}]'::jsonb,
    '{"type":"percent", "percent": 5, "grace_days": 0}'::jsonb
  );

  -- Jalankan run_kos_collections sebagai service_role / postgres
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  -- 3a. Model None: denda harus tetap 0
  PERFORM public.run_kos_collections(v_today);

  SELECT * INTO v_bill_rec
  FROM public.billing_items b
  JOIN public.kos_contracts c ON c.id = b.contract_id
  WHERE c.unit_id = v_room_none_id;

  IF v_bill_rec.late_fee <> 0 THEN
    RAISE EXCEPTION 'Uji 3a GAGAL: Model none menghasilkan denda %, seharusnya 0', v_bill_rec.late_fee;
  END IF;
  RAISE NOTICE '-> OK: Model none menghasilkan denda 0.';

  -- 3b. Model Once: denda 50.000 (sekali)
  SELECT * INTO v_bill_rec
  FROM public.billing_items b
  JOIN public.kos_contracts c ON c.id = b.contract_id
  WHERE c.unit_id = v_room_once_id;

  IF v_bill_rec.late_fee <> 50000 THEN
    RAISE EXCEPTION 'Uji 3b GAGAL: Model once menghasilkan denda %, seharusnya 50000', v_bill_rec.late_fee;
  END IF;
  RAISE NOTICE '-> OK: Model once menghasilkan denda 50.000.';

  -- 3c. Model Daily dengan grace_days & capping max:
  -- due_date = v_today - 5; grace_days denda = 2 -> batas toleransi = v_today - 3.
  -- Jalankan simulasi di tanggal batas toleransi (v_today - 3): belum lewat -> denda 0
  PERFORM public.run_kos_collections((v_today - interval '3 days')::date);
  SELECT late_fee INTO v_bill_rec.late_fee
  FROM public.billing_items b JOIN public.kos_contracts c ON c.id = b.contract_id
  WHERE c.unit_id = v_room_daily_id;
  IF v_bill_rec.late_fee <> 0 THEN
    RAISE EXCEPTION 'Uji 3c-1 GAGAL: Pada masa toleransi denda seharusnya 0, aktual: %', v_bill_rec.late_fee;
  END IF;

  -- Jalankan simulasi 2 hari setelah toleransi (v_today - 1 hari): terlambat 2 hari -> 10000 * 2 = 20000
  PERFORM public.run_kos_collections((v_today - interval '1 day')::date);
  SELECT late_fee INTO v_bill_rec.late_fee
  FROM public.billing_items b JOIN public.kos_contracts c ON c.id = b.contract_id
  WHERE c.unit_id = v_room_daily_id;
  IF v_bill_rec.late_fee <> 20000 THEN
    RAISE EXCEPTION 'Uji 3c-2 GAGAL: Terlambat 2 hari denda seharusnya 20000, aktual: %', v_bill_rec.late_fee;
  END IF;

  -- Jalankan simulasi 10 hari kemudian (v_today + 10): 13 hari terlambat -> 130.000 > max (50.000) -> cap 50.000
  PERFORM public.run_kos_collections((v_today + interval '10 days')::date);
  SELECT late_fee INTO v_bill_rec.late_fee
  FROM public.billing_items b JOIN public.kos_contracts c ON c.id = b.contract_id
  WHERE c.unit_id = v_room_daily_id;
  IF v_bill_rec.late_fee <> 50000 THEN
    RAISE EXCEPTION 'Uji 3c-3 GAGAL: Denda daily tidak di-cap pada batas max 50000, aktual: %', v_bill_rec.late_fee;
  END IF;
  RAISE NOTICE '-> OK: Model daily menghormati toleransi denda, pertambahan harian, dan batas max.';

  -- 3d. Model Percent: 5% dari nominal Sewa (1.000.000) = 50.000 (bukan dari total 1.200.000)
  PERFORM public.run_kos_collections(v_today);
  SELECT * INTO v_bill_rec
  FROM public.billing_items b JOIN public.kos_contracts c ON c.id = b.contract_id
  WHERE c.unit_id = v_room_percent_id;

  IF v_bill_rec.late_fee <> 50000 THEN
    RAISE EXCEPTION 'Uji 3d GAGAL: Model percent seharusnya 50000 (5%% dari 1.000.000 sewa), aktual: %', v_bill_rec.late_fee;
  END IF;
  RAISE NOTICE '-> OK: Model percent dihitung dari baris Sewa saja (50.000), mengabaikan biaya tambahan.';


  -- ----------------------------------------------------------------------------
  -- UJI 4: Idempoten 2x run_kos_collections
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 4] Menguji idempoten run_kos_collections...';
  v_res := public.run_kos_collections(v_today);
  IF (v_res->>'fees_updated')::int <> 0 THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: Pemanggilan kedua memperbarui % denda, seharusnya 0', v_res->>'fees_updated';
  END IF;
  RAISE NOTICE '-> OK: Pemanggilan run_kos_collections 2x pada hari yang sama adalah idempoten.';


  -- ----------------------------------------------------------------------------
  -- UJI 5: Denda berhenti saat status pending_verification
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 5] Menguji denda berhenti saat status pending_verification...';
  -- Buat kontrak kamar pending
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_pending_id, v_member_pending_id, 'Penyewa Pending', 1500000,
    (v_today - interval '8 days')::date, NULL, 5, 'Kontrak Pending', 'start_date', '[]'::jsonb,
    '{"type":"daily", "amount": 10000, "max": 100000, "grace_days": 0}'::jsonb
  );

  -- Hitung denda di hari ini (terlambat 3 hari -> 30000)
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  PERFORM public.run_kos_collections(v_today);
  SELECT id, late_fee INTO v_bill_id, v_bill_rec.late_fee
  FROM public.billing_items WHERE contract_id = (v_res->>'contract_id')::uuid;

  IF v_bill_rec.late_fee <> 30000 THEN
    RAISE EXCEPTION 'Uji 5 Setup GAGAL: late_fee awal seharusnya 30000, aktual: %', v_bill_rec.late_fee;
  END IF;

  -- Pengguna upload bukti bayar -> status menjadi pending_verification
  UPDATE public.billing_items SET status = 'pending_verification' WHERE id = v_bill_id;

  -- Jalankan collections di hari esok (+3 hari)
  PERFORM public.run_kos_collections((v_today + interval '3 days')::date);
  SELECT late_fee INTO v_bill_rec.late_fee FROM public.billing_items WHERE id = v_bill_id;

  IF v_bill_rec.late_fee <> 30000 THEN
    RAISE EXCEPTION 'Uji 5 GAGAL: late_fee berubah saat pending_verification, aktual: %', v_bill_rec.late_fee;
  END IF;
  RAISE NOTICE '-> OK: Denda berhenti bertambah saat tagihan berstatus pending_verification.';


  -- ----------------------------------------------------------------------------
  -- UJI 6: Penghapusan Denda (public.waive_late_fee)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 6] Menguji RPC waive_late_fee...';
  -- Buat kontrak kamar waive dan kenakan denda
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_waive_id, v_member_waive_id, 'Penyewa Waive', 1500000,
    (v_today - interval '20 days')::date, NULL, 5, 'Kontrak Waive', 'start_date', '[]'::jsonb,
    '{"type":"once", "amount": 50000, "grace_days": 0}'::jsonb
  );

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  PERFORM public.run_kos_collections(v_today);

  SELECT id, late_fee INTO v_bill_id, v_bill_rec.late_fee
  FROM public.billing_items WHERE contract_id = (v_res->>'contract_id')::uuid;

  IF v_bill_rec.late_fee <> 50000 THEN
    RAISE EXCEPTION 'Uji 6 Setup GAGAL: denda awal belum 50000';
  END IF;

  -- Panggil waive_late_fee sebagai owner
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);
  v_res := public.waive_late_fee(v_bill_id, 'Keringanan khusus mahasiswa semester akhir');

  IF (v_res->>'success')::boolean <> true OR (v_res->>'late_fee')::int <> 0 THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: waive_late_fee tidak mengembalikan success/late_fee 0';
  END IF;

  SELECT * INTO v_bill_rec FROM public.billing_items WHERE id = v_bill_id;
  IF v_bill_rec.late_fee <> 0 THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: late_fee tidak menjadi 0 setelah di-waive';
  END IF;

  IF (v_bill_rec.metadata->>'late_fee_waived')::boolean <> true
     OR (v_bill_rec.metadata->>'waive_reason') <> 'Keringanan khusus mahasiswa semester akhir'
     OR (v_bill_rec.metadata->>'waived_by')::uuid <> v_owner_kos THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: Metadata penghapusan denda tidak tercatat lengkap: %', v_bill_rec.metadata;
  END IF;

  -- Jalankan kembali run_kos_collections: tagihan waived tidak boleh dihitung lagi
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  PERFORM public.run_kos_collections((v_today + interval '5 days')::date);

  SELECT late_fee INTO v_bill_rec.late_fee FROM public.billing_items WHERE id = v_bill_id;
  IF v_bill_rec.late_fee <> 0 THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: Tagihan yang sudah di-waive kembali dikenakan denda, aktual: %', v_bill_rec.late_fee;
  END IF;
  RAISE NOTICE '-> OK: waive_late_fee berhasil menghapus denda, mencatat metadata, dan mencegah rekalkulasi.';


  -- ----------------------------------------------------------------------------
  -- UJI 7: Antrean Pengingat (H-3, H0, H+3, H+7) dan mark_rent_reminder
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 7] Menguji antrean pengingat 4 tahap dan mark_rent_reminder...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  -- Buat 4 kontrak untuk menguji 4 tahap pengingat pada hari v_today
  -- Tahap H-3: due_date = v_today + 3 -> start_date = (v_today + 3) - 5 = v_today - 2 hari
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_rem_h3_id, v_member_rem_h3_id, 'Penyewa H-3', 1500000,
    (v_today - interval '2 days')::date, NULL, 5, 'Kontrak H-3', 'start_date', '[]'::jsonb, '{"type":"none"}'::jsonb
  );

  -- Tahap H0: due_date = v_today -> start_date = v_today - 5 hari
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_rem_h0_id, v_member_rem_h0_id, 'Penyewa H0', 1500000,
    (v_today - interval '5 days')::date, NULL, 5, 'Kontrak H0', 'start_date', '[]'::jsonb, '{"type":"none"}'::jsonb
  );

  -- Tahap H+3: due_date = v_today - 3 -> start_date = (v_today - 3) - 5 = v_today - 8 hari
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_rem_hp3_id, v_member_rem_hp3_id, 'Penyewa H+3', 1500000,
    (v_today - interval '8 days')::date, NULL, 5, 'Kontrak H+3', 'start_date', '[]'::jsonb, '{"type":"none"}'::jsonb
  );

  -- Tahap H+7: due_date = v_today - 7 -> start_date = (v_today - 7) - 5 = v_today - 12 hari
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_rem_hp7_id, v_member_rem_hp7_id, 'Penyewa H+7', 1500000,
    (v_today - interval '12 days')::date, NULL, 5, 'Kontrak H+7', 'start_date', '[]'::jsonb, '{"type":"none"}'::jsonb
  );

  -- Jalankan run_kos_collections untuk v_today
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  v_res := public.run_kos_collections(v_today);

  -- Verifikasi keberadaan baris pada masing-masing tahap
  SELECT r.* INTO v_reminder_rec
  FROM public.rent_reminders r
  JOIN public.billing_items b ON b.id = r.bill_id
  JOIN public.kos_contracts c ON c.id = b.contract_id
  WHERE c.unit_id = v_room_rem_h3_id AND r.stage = 'h-3';
  v_reminder_id := v_reminder_rec.id;

  IF v_reminder_id IS NULL OR v_reminder_rec.status <> 'pending' OR v_reminder_rec.remind_date <> v_today THEN
    RAISE EXCEPTION 'Uji 7 GAGAL: Pengingat tahap h-3 tidak dibuat dengan benar';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rent_reminders r
    JOIN public.billing_items b ON b.id = r.bill_id
    JOIN public.kos_contracts c ON c.id = b.contract_id
    WHERE c.unit_id = v_room_rem_h0_id AND r.stage = 'h0' AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Uji 7 GAGAL: Pengingat tahap h0 tidak dibuat';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rent_reminders r
    JOIN public.billing_items b ON b.id = r.bill_id
    JOIN public.kos_contracts c ON c.id = b.contract_id
    WHERE c.unit_id = v_room_rem_hp3_id AND r.stage = 'h+3' AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Uji 7 GAGAL: Pengingat tahap h+3 tidak dibuat';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rent_reminders r
    JOIN public.billing_items b ON b.id = r.bill_id
    JOIN public.kos_contracts c ON c.id = b.contract_id
    WHERE c.unit_id = v_room_rem_hp7_id AND r.stage = 'h+7' AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Uji 7 GAGAL: Pengingat tahap h+7 tidak dibuat';
  END IF;
  RAISE NOTICE '-> OK: Antrean pengingat berhasil dibuat untuk semua 4 tahap (h-3, h0, h+3, h+7).';

  -- Uji mark_rent_reminder (tandai sent dan skipped)
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  v_res := public.mark_rent_reminder(v_reminder_id, 'sent');
  SELECT * INTO v_reminder_rec
  FROM public.rent_reminders WHERE id = v_reminder_id;

  IF v_reminder_rec.status <> 'sent' OR v_reminder_rec.sent_by <> v_owner_kos OR v_reminder_rec.sent_at IS NULL THEN
    RAISE EXCEPTION 'Uji 7 GAGAL: mark_rent_reminder status sent tidak tercatat dengan benar';
  END IF;

  SELECT r.id INTO v_reminder_id
  FROM public.rent_reminders r
  JOIN public.billing_items b ON b.id = r.bill_id
  JOIN public.kos_contracts c ON c.id = b.contract_id
  WHERE c.unit_id = v_room_rem_h0_id AND r.stage = 'h0';

  v_res := public.mark_rent_reminder(v_reminder_id, 'skipped');
  SELECT * INTO v_reminder_rec FROM public.rent_reminders WHERE id = v_reminder_id;
  IF v_reminder_rec.status <> 'skipped' THEN
    RAISE EXCEPTION 'Uji 7 GAGAL: mark_rent_reminder status skipped gagal';
  END IF;
  RAISE NOTICE '-> OK: mark_rent_reminder berhasil menandai status sent (beserta pengirim & waktu) dan skipped.';


  -- ----------------------------------------------------------------------------
  -- UJI 8: Laporan Tunggakan (get_kos_arrears) dan Pengelompokan Bucket
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 8] Menguji RPC get_kos_arrears dan bucket umur tunggakan...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_kos, 'role', 'authenticated')::text, true);

  -- Buat 3 kontrak dengan due_date lampau untuk memicu 3 bucket:
  -- Bucket '0-7': due_date = v_today - 4 hari (start = v_today - 9)
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_arr_0_7_id, v_member_arr_0_7_id, 'Penyewa Arr 0-7', 1200000,
    (v_today - interval '9 days')::date, NULL, 5, 'Arr 0-7', 'start_date', '[]'::jsonb, '{"type":"none"}'::jsonb
  );

  -- Bucket '8-30': due_date = v_today - 15 hari (start = v_today - 20)
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_arr_8_30_id, v_member_arr_8_30_id, 'Penyewa Arr 8-30', 1300000,
    (v_today - interval '20 days')::date, NULL, 5, 'Arr 8-30', 'start_date', '[]'::jsonb, '{"type":"none"}'::jsonb
  );

  -- Bucket '>30': due_date = v_today - 45 hari (start = v_today - 50)
  v_res := public.create_kos_contract(
    v_tenant_kos, v_room_arr_30plus_id, v_member_arr_30plus_id, 'Penyewa Arr >30', 1400000,
    (v_today - interval '50 days')::date, NULL, 5, 'Arr >30', 'start_date', '[]'::jsonb, '{"type":"none"}'::jsonb
  );

  -- Hitung arrears
  SELECT count(*) INTO v_arrears_count FROM public.get_kos_arrears(v_tenant_kos);
  IF v_arrears_count < 3 THEN
    RAISE EXCEPTION 'Uji 8 GAGAL: get_kos_arrears mengembalikan % baris, minimal 3 baris diharapkan', v_arrears_count;
  END IF;

  -- Periksa data bucket '0-7'
  SELECT * INTO v_arrear_rec
  FROM public.get_kos_arrears(v_tenant_kos)
  WHERE member_id = v_member_arr_0_7_id;

  IF v_arrear_rec.bucket <> '0-7' OR v_arrear_rec.days_late <> 4 OR v_arrear_rec.total_due <> 1200000 THEN
    RAISE EXCEPTION 'Uji 8 GAGAL: Baris bucket 0-7 tidak valid: %', row_to_json(v_arrear_rec);
  END IF;

  -- Periksa data bucket '8-30'
  SELECT * INTO v_arrear_rec
  FROM public.get_kos_arrears(v_tenant_kos)
  WHERE member_id = v_member_arr_8_30_id;

  IF v_arrear_rec.bucket <> '8-30' OR v_arrear_rec.days_late <> 15 OR v_arrear_rec.total_due <> 1300000 THEN
    RAISE EXCEPTION 'Uji 8 GAGAL: Baris bucket 8-30 tidak valid: %', row_to_json(v_arrear_rec);
  END IF;

  -- Periksa data bucket '>30'
  SELECT * INTO v_arrear_rec
  FROM public.get_kos_arrears(v_tenant_kos)
  WHERE member_id = v_member_arr_30plus_id;

  IF v_arrear_rec.bucket <> '>30' OR v_arrear_rec.days_late <> 45 OR v_arrear_rec.total_due <> 1400000 THEN
    RAISE EXCEPTION 'Uji 8 GAGAL: Baris bucket >30 tidak valid: %', row_to_json(v_arrear_rec);
  END IF;
  RAISE NOTICE '-> OK: get_kos_arrears mengelompokkan tunggakan ke dalam bucket 0-7, 8-30, dan >30 secara akurat.';


  -- ----------------------------------------------------------------------------
  -- UJI 9: Otorisasi & RLS (Akses Warga Ditolak 42501)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 9] Menguji pembatasan otorisasi untuk warga (42501)...';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_warga_kos, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 9a. Warga memanggil waive_late_fee -> ditolak 42501
  v_err_caught := false;
  BEGIN
    PERFORM public.waive_late_fee(v_bill_id, 'Coba hapus denda sendiri');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 9a GAGAL: Warga diizinkan memanggil waive_late_fee!';
  END IF;

  -- 9b. Warga memanggil mark_rent_reminder -> ditolak 42501
  v_err_caught := false;
  BEGIN
    PERFORM public.mark_rent_reminder(v_reminder_id, 'sent');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 9b GAGAL: Warga diizinkan memanggil mark_rent_reminder!';
  END IF;

  -- 9c. Warga memanggil get_kos_arrears -> ditolak 42501
  v_err_caught := false;
  BEGIN
    PERFORM * FROM public.get_kos_arrears(v_tenant_kos);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 9c GAGAL: Warga diizinkan memanggil get_kos_arrears!';
  END IF;

  -- 9d. Role authenticated memanggil run_kos_collections -> ditolak 42501
  v_err_caught := false;
  BEGIN
    PERFORM public.run_kos_collections(v_today);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 9d GAGAL: Role authenticated diizinkan memanggil run_kos_collections!';
  END IF;

  -- 9e. Direct INSERT pada rent_reminders oleh authenticated -> ditolak 42501
  v_err_caught := false;
  BEGIN
    INSERT INTO public.rent_reminders (tenant_id, bill_id, member_id, stage, remind_date, status)
    VALUES (v_tenant_kos, v_bill_id, v_member_none_id, 'h0', v_today, 'pending');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN
      v_err_caught := true;
    END IF;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 9e GAGAL: Role authenticated diizinkan INSERT langsung ke rent_reminders!';
  END IF;
  RAISE NOTICE '-> OK: Seluruh operasi modifikasi dan laporan terlindungi dari pemanggil tanpa hak (42501).';


  -- ----------------------------------------------------------------------------
  -- UJI 10: Integrasi run_auto_billing dengan run_kos_collections
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 10] Menguji integrasi run_auto_billing...';
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  -- run_auto_billing harus berhasil memanggil run_kos_collections tanpa galat
  PERFORM public.run_auto_billing(v_today);
  RAISE NOTICE '-> OK: run_auto_billing mengeksekusi blok koleksi kos dengan aman.';

  -- Kembalikan role ke postgres di akhir DO block
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('role', 'postgres', true);

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SELURUH UJI KOS-5.1 BERHASIL (100%% LULUS)';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
