-- Test Suite: Kos Contracts Schema & Synchronization Matrix (Task KOS-2.1 & KOS-2F.2)
-- Date: 2026-10-24
-- Ref: docs/handoff/KOS-2.md § KOS-2.1 & docs/handoff/KOS-2F.md § 2F.2
--
-- File ini memvalidasi aturan integritas kontrak kos dan status kamar:
-- 1. Kontrak aktif -> kamar otomatis occupied dengan metadata tenant_member_id dan contract_*
-- 2. Dua kontrak aktif di kamar yang sama ditolak (unique constraint unit_id where active)
-- 3. Penyewa yang sama memiliki 2 kontrak aktif di tenant yang sama ditolak (unique constraint member_id where active)
-- 4. Kontrak aktif diakhiri (status = 'ended') -> kamar otomatis kembali vacant
-- 5. Update manual kamar kos ke 'occupied' tanpa kontrak aktif ditolak oleh guard trigger
-- 6. Approval anggota kos tidak mengubah status kamar (tetap vacant)
-- 7. Kontrak aktif di kamar 'inactive' ditolak
-- 8. Validasi assert backfill: tidak ada kamar kos occupied tanpa kontrak aktif
-- 9. INSERT kamar kos langsung berstatus 'occupied' ditolak oleh guard trigger (K6)
-- 10. Skenario INDI KOS: tagihan lama tertaut ke kontrak backfill dan tidak terbit tagihan ganda (K3)
-- 11. Tagihan lama cancelled atau non-sewa tidak ikut ditautkan oleh backfill (K3)

BEGIN;

DO $$
DECLARE
  v_owner_kos       UUID := gen_random_uuid();
  v_user_1          UUID := gen_random_uuid();
  v_user_2          UUID := gen_random_uuid();
  v_tenant_kos      UUID;
  v_role_kos_id     UUID;
  v_member_1_id     UUID;
  v_member_2_id     UUID;
  v_room_1_id       BIGINT;
  v_room_2_id       BIGINT;
  v_room_inactive_id BIGINT;
  v_contract_1_id   UUID;
  v_contract_2_id   UUID;
  v_unit_status     TEXT;
  v_unit_metadata   JSONB;
  v_err_caught      BOOLEAN;
  v_orphaned_rooms  INT;

  -- Variabel untuk UJI 9, 10, 11 (KOS-2F.2)
  v_today_wib           DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_first_last_month    DATE;
  v_last_month_period   TEXT;
  v_user_indi           UUID := gen_random_uuid();
  v_member_indi_id      UUID;
  v_room_indi_id        BIGINT;
  v_bill_indi_id        UUID;
  v_linked_contract_id  UUID;
  v_linked_service_start DATE;
  v_linked_service_end  DATE;
  v_bills_in_period     INT;
  v_gen_res             JSONB;
  v_room_filter_id      BIGINT;
  v_contract_filter_id  UUID;
  v_bill_cancelled_id   UUID;
  v_bill_deposit_id     UUID;
  v_bill_electric_id    UUID;
BEGIN
  v_first_last_month := (date_trunc('month', v_today_wib) - interval '1 month')::date;
  v_last_month_period := to_char(v_first_last_month, 'YYYY-MM');

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI TEST SUITE: KOS CONTRACTS & ROOM STATUS (KOS-2.1 & 2F.2)';
  RAISE NOTICE '============================================================';

  -- ----------------------------------------------------------------------------
  -- SETUP FIXTURES
  -- ----------------------------------------------------------------------------
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_owner_kos, 'ownerkos_k2@test.invalid', 'authenticated', 'authenticated'),
    (v_user_1,    'user1_k2@test.invalid',    'authenticated', 'authenticated'),
    (v_user_2,    'user2_k2@test.invalid',    'authenticated', 'authenticated');

  INSERT INTO public.tenants (name, type, owner_id, settings)
  VALUES ('Kos Melati Harmoni Test', 'kos', v_owner_kos, '{"default_rent_price": 1500000, "rent_grace_days": 10}'::jsonb)
  RETURNING id INTO v_tenant_kos;

  SELECT id INTO v_role_kos_id FROM public.tenant_roles WHERE tenant_id = v_tenant_kos AND is_base_role = true LIMIT 1;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES
    (v_tenant_kos, 'Kamar 01', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_1_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES
    (v_tenant_kos, 'Kamar 02', 'vacant', '{}'::jsonb) RETURNING id INTO v_room_2_id;

  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES
    (v_tenant_kos, 'Kamar Gudang', 'inactive', '{}'::jsonb) RETURNING id INTO v_room_inactive_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_1, 'Dhani Mahasiswa', 'approved', false, v_room_1_id, v_role_kos_id)
  RETURNING id INTO v_member_1_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES
    (v_tenant_kos, v_user_2, 'Budi Pekerja', 'approved', false, v_room_2_id, v_role_kos_id)
  RETURNING id INTO v_member_2_id;

  -- ----------------------------------------------------------------------------
  -- UJI 1: Kontrak aktif -> kamar otomatis occupied & metadata tersinkron
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 1] Menambahkan kontrak aktif baru...';
  INSERT INTO public.kos_contracts (
    tenant_id, unit_id, member_id, tenant_name, rent_price, start_date, grace_days, status
  ) VALUES (
    v_tenant_kos, v_room_1_id, v_member_1_id, 'Dhani Mahasiswa', 1500000, '2026-10-19', 10, 'active'
  ) RETURNING id INTO v_contract_1_id;

  SELECT status, metadata INTO v_unit_status, v_unit_metadata
  FROM public.tenant_units WHERE id = v_room_1_id;

  IF v_unit_status <> 'occupied' THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: status kamar seharusnya occupied, aktual: %', v_unit_status;
  END IF;
  IF (v_unit_metadata->>'tenant_member_id')::uuid <> v_member_1_id THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: tenant_member_id tidak sesuai di metadata kamar';
  END IF;
  IF (v_unit_metadata->>'contract_id')::uuid <> v_contract_1_id THEN
    RAISE EXCEPTION 'Uji 1 GAGAL: contract_id tidak tersimpan di metadata kamar';
  END IF;
  RAISE NOTICE '-> OK: Kamar otomatis occupied dan metadata tersinkron.';

  -- ----------------------------------------------------------------------------
  -- UJI 2: Dua kontrak aktif di kamar yang sama harus ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 2] Mencoba membuat kontrak aktif kedua di Kamar 01...';
  v_err_caught := false;
  BEGIN
    INSERT INTO public.kos_contracts (
      tenant_id, unit_id, member_id, tenant_name, rent_price, start_date, grace_days, status
    ) VALUES (
      v_tenant_kos, v_room_1_id, v_member_2_id, 'Budi Pekerja', 1500000, '2026-10-20', 10, 'active'
    );
  EXCEPTION WHEN unique_violation THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 2 GAGAL: Kamar yang sama diizinkan memiliki dua kontrak aktif!';
  END IF;
  RAISE NOTICE '-> OK: Dua kontrak aktif di kamar yang sama ditolak (unique constraint).';

  -- ----------------------------------------------------------------------------
  -- UJI 3: Penyewa yang sama di dua kamar ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 3] Mencoba membuat kontrak aktif kedua untuk Dhani di Kamar 02...';
  v_err_caught := false;
  BEGIN
    INSERT INTO public.kos_contracts (
      tenant_id, unit_id, member_id, tenant_name, rent_price, start_date, grace_days, status
    ) VALUES (
      v_tenant_kos, v_room_2_id, v_member_1_id, 'Dhani Mahasiswa', 1500000, '2026-10-20', 10, 'active'
    );
  EXCEPTION WHEN unique_violation THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 3 GAGAL: Penyewa yang sama diizinkan memiliki dua kontrak aktif!';
  END IF;
  RAISE NOTICE '-> OK: Penyewa di dua kamar aktif ditolak.';

  -- ----------------------------------------------------------------------------
  -- UJI 4: Kontrak aktif diakhiri (ended) -> kamar otomatis vacant
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 4] Mengakhiri kontrak Dhani...';
  UPDATE public.kos_contracts
  SET status = 'ended', ended_at = now(), end_reason = 'checkout'
  WHERE id = v_contract_1_id;

  SELECT status, metadata INTO v_unit_status, v_unit_metadata
  FROM public.tenant_units WHERE id = v_room_1_id;

  IF v_unit_status <> 'vacant' THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: status kamar seharusnya vacant setelah kontrak berakhir, aktual: %', v_unit_status;
  END IF;
  IF v_unit_metadata ? 'tenant_member_id' THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: metadata tenant_member_id harus dibersihkan setelah kontrak berakhir';
  END IF;
  IF (v_unit_metadata->>'previous_tenant_member_id')::uuid <> v_member_1_id THEN
    RAISE EXCEPTION 'Uji 4 GAGAL: previous_tenant_member_id tidak dicatat';
  END IF;
  RAISE NOTICE '-> OK: Kamar otomatis vacant dan riwayat penyewa sebelumnya tercatat.';

  -- ----------------------------------------------------------------------------
  -- UJI 5: Update manual kamar ke occupied tanpa kontrak aktif ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 5] Mencoba mengupdate kamar langsung ke occupied dari browser...';
  v_err_caught := false;
  BEGIN
    UPDATE public.tenant_units
    SET status = 'occupied'
    WHERE id = v_room_2_id;
  EXCEPTION WHEN raise_exception THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 5 GAGAL: Kamar diizinkan diubah ke occupied tanpa kontrak aktif!';
  END IF;
  RAISE NOTICE '-> OK: Update manual kamar ke occupied ditolak oleh guard trigger.';

  -- ----------------------------------------------------------------------------
  -- UJI 6: Approval anggota tidak mengubah status kamar (tetap vacant)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 6] Menguji approval anggota baru di Kamar 02...';
  -- Buat member baru berstatus pending
  INSERT INTO auth.users (id, email, aud, role)
  VALUES ('00000000-0000-4000-8000-0000000000c6', 'calon_k2@test.invalid', 'authenticated', 'authenticated');
  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, '00000000-0000-4000-8000-0000000000c6', 'Calon Penghuni Baru', 'pending', false, v_room_2_id, v_role_kos_id);

  -- Setujui anggota
  UPDATE public.tenant_members
  SET status = 'approved'
  WHERE tenant_id = v_tenant_kos AND full_name = 'Calon Penghuni Baru';

  SELECT status INTO v_unit_status
  FROM public.tenant_units WHERE id = v_room_2_id;

  IF v_unit_status <> 'vacant' THEN
    RAISE EXCEPTION 'Uji 6 GAGAL: Approval anggota tidak boleh mengubah status kamar, aktual: %', v_unit_status;
  END IF;
  RAISE NOTICE '-> OK: Approval anggota tidak mengubah kamar menjadi occupied.';

  -- ----------------------------------------------------------------------------
  -- UJI 7: Kontrak aktif di kamar inactive ditolak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 7] Mencoba membuat kontrak pada kamar inactive...';
  v_err_caught := false;
  BEGIN
    INSERT INTO public.kos_contracts (
      tenant_id, unit_id, member_id, tenant_name, rent_price, start_date, grace_days, status
    ) VALUES (
      v_tenant_kos, v_room_inactive_id, v_member_2_id, 'Budi Pekerja', 1500000, '2026-10-20', 10, 'active'
    );
  EXCEPTION WHEN raise_exception THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 7 GAGAL: Pembuatan kontrak di kamar inactive diizinkan!';
  END IF;
  RAISE NOTICE '-> OK: Kontrak di kamar inactive ditolak.';

  -- ----------------------------------------------------------------------------
  -- UJI 8: Assert backfill integritas (tidak ada kamar kos occupied tanpa kontrak)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 8] Memeriksa assert integritas: kamar kos occupied tanpa kontrak aktif...';
  SELECT count(*) INTO v_orphaned_rooms
  FROM public.tenant_units u
  JOIN public.tenants t ON t.id = u.tenant_id
  WHERE t.type = 'kos' AND u.status = 'occupied'
    AND NOT EXISTS (
      SELECT 1 FROM public.kos_contracts c
      WHERE c.unit_id = u.id AND c.status = 'active'
    );

  IF v_orphaned_rooms > 0 THEN
    RAISE EXCEPTION 'Uji 8 GAGAL: Ditemukan % kamar kos occupied tanpa kontrak aktif!', v_orphaned_rooms;
  END IF;
  RAISE NOTICE '-> OK: Seluruh kamar occupied memiliki kontrak aktif.';

  -- ----------------------------------------------------------------------------
  -- UJI 9: INSERT kamar kos langsung berstatus occupied ditolak (KOS-2F.2 / K6)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 9] Mencoba INSERT kamar kos langsung berstatus occupied tanpa kontrak...';
  v_err_caught := false;
  BEGIN
    INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
    VALUES (v_tenant_kos, 'Kamar Ilegal', 'occupied', '{}'::jsonb);
  EXCEPTION WHEN raise_exception THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Uji 9 GAGAL: INSERT kamar kos berstatus occupied tanpa kontrak aktif diizinkan!';
  END IF;
  RAISE NOTICE '-> OK: INSERT kamar kos langsung berstatus occupied ditolak oleh guard trigger.';

  -- ----------------------------------------------------------------------------
  -- UJI 10: Skenario INDI KOS - Backfill 7.1 + 7.1b menautkan tagihan lama & idempoten (KOS-2F.2 / K3)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 10] Menguji skenario INDI KOS: tagihan lama tertaut ke kontrak backfill...';

  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_user_indi, 'user_indi@test.invalid', 'authenticated', 'authenticated');

  -- Kamar INDI 01 (diset occupied dengan flag sync aktif, meniru data pra-migrasi KOS-2)
  PERFORM set_config('ruangwarga.kos_contract_sync', 'on', true);
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (
    v_tenant_kos,
    'Kamar INDI 01',
    'occupied',
    jsonb_build_object(
      'contract_start', v_first_last_month::text,
      'rent_price', 1600000,
      'tenant_name', 'Indi Warga'
    )
  ) RETURNING id INTO v_room_indi_id;
  PERFORM set_config('ruangwarga.kos_contract_sync', 'off', true);

  INSERT INTO public.tenant_members (tenant_id, user_id, full_name, status, is_owner, unit_id, tenant_role_id)
  VALUES (v_tenant_kos, v_user_indi, 'Indi Warga', 'approved', false, v_room_indi_id, v_role_kos_id)
  RETURNING id INTO v_member_indi_id;

  -- Update metadata unit dengan tenant_member_id
  PERFORM set_config('ruangwarga.kos_contract_sync', 'on', true);
  UPDATE public.tenant_units
  SET metadata = metadata || jsonb_build_object('tenant_member_id', v_member_indi_id)
  WHERE id = v_room_indi_id;
  PERFORM set_config('ruangwarga.kos_contract_sync', 'off', true);

  -- Tagihan lama model lama (pending_verification, tanpa contract_id)
  INSERT INTO public.billing_items (
    tenant_id,
    unit_id,
    member_id,
    period,
    amount,
    due_date,
    status,
    contract_id,
    metadata
  ) VALUES (
    v_tenant_kos,
    v_room_indi_id,
    v_member_indi_id,
    v_last_month_period,
    1600000,
    v_first_last_month + 10,
    'pending_verification',
    NULL,
    '{"bill_type": "rent"}'::jsonb
  ) RETURNING id INTO v_bill_indi_id;

  -- Jalankan ulang logika backfill 7.1 + 7.1b untuk data uji
  PERFORM set_config('ruangwarga.kos_contract_sync', 'on', true);

  -- 7.1 Kamar occupied DENGAN contract_start -> Buat kontrak active
  INSERT INTO public.kos_contracts (
    tenant_id,
    unit_id,
    member_id,
    tenant_name,
    rent_price,
    start_date,
    end_date,
    grace_days,
    status,
    notes,
    created_at,
    updated_at
  )
  SELECT
    u.tenant_id,
    u.id AS unit_id,
    CASE 
      WHEN (u.metadata->>'tenant_member_id') ~ '^[0-9a-fA-F-]{36}$'
        AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.id = (u.metadata->>'tenant_member_id')::uuid AND m.tenant_id = u.tenant_id)
      THEN (u.metadata->>'tenant_member_id')::uuid
      ELSE NULL
    END AS member_id,
    COALESCE(
      (SELECT full_name FROM public.tenant_members m WHERE m.id = (u.metadata->>'tenant_member_id')::uuid),
      u.metadata->>'tenant_name',
      'Penyewa Kamar ' || u.label
    ) AS tenant_name,
    COALESCE(
      CASE WHEN (u.metadata->>'rent_price') ~ '^[0-9]+(\.[0-9]+)?$' THEN (u.metadata->>'rent_price')::numeric END,
      CASE WHEN (t.settings->>'default_rent_price') ~ '^[0-9]+(\.[0-9]+)?$' THEN (t.settings->>'default_rent_price')::numeric END,
      0
    ) AS rent_price,
    (u.metadata->>'contract_start')::date AS start_date,
    CASE
      WHEN (u.metadata->>'contract_end') IS NOT NULL AND (u.metadata->>'contract_end') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN (u.metadata->>'contract_end')::date
      ELSE NULL
    END AS end_date,
    COALESCE(
      CASE WHEN (t.settings->>'rent_grace_days') ~ '^[0-9]+$' THEN (t.settings->>'rent_grace_days')::int END,
      10
    ) AS grace_days,
    'active',
    'Backfill dari metadata unit KOS-2.1',
    now(),
    now()
  FROM public.tenant_units u
  JOIN public.tenants t ON t.id = u.tenant_id
  WHERE t.type = 'kos'
    AND u.status = 'occupied'
    AND u.metadata->>'contract_start' IS NOT NULL
    AND (u.metadata->>'contract_start') ~ '^\d{4}-\d{2}-\d{2}$'
    AND NOT EXISTS (
      SELECT 1 FROM public.kos_contracts c WHERE c.unit_id = u.id AND c.status = 'active'
    );

  -- 7.1b Tautkan tagihan model lama ke kontrak hasil backfill
  WITH contract_periods AS (
    SELECT
      c.id AS contract_id,
      c.unit_id,
      (c.start_date + (s.n * interval '1 month'))::date AS service_start,
      CASE
        WHEN c.end_date IS NOT NULL AND (c.start_date + ((s.n + 1) * interval '1 month') - interval '1 day')::date > c.end_date
        THEN c.end_date
        ELSE (c.start_date + ((s.n + 1) * interval '1 month') - interval '1 day')::date
      END AS service_end,
      to_char((c.start_date + (s.n * interval '1 month'))::date, 'YYYY-MM') AS period
    FROM public.kos_contracts c
    CROSS JOIN LATERAL generate_series(
      0,
      GREATEST(
        0,
        (EXTRACT(YEAR FROM age((now() AT TIME ZONE 'Asia/Jakarta')::date, c.start_date)) * 12
         + EXTRACT(MONTH FROM age((now() AT TIME ZONE 'Asia/Jakarta')::date, c.start_date)) + 2)::int
      )
    ) AS s(n)
    WHERE c.notes = 'Backfill dari metadata unit KOS-2.1'
      AND (c.start_date + (s.n * interval '1 month'))::date <= (now() AT TIME ZONE 'Asia/Jakarta')::date
      AND (c.end_date IS NULL OR (c.start_date + (s.n * interval '1 month'))::date <= c.end_date)
  ),
  matched_bills AS (
    SELECT DISTINCT ON (cp.contract_id, cp.service_start)
      b.id AS bill_id,
      cp.contract_id,
      cp.service_start,
      cp.service_end
    FROM contract_periods cp
    JOIN public.billing_items b ON b.unit_id = cp.unit_id
      AND b.contract_id IS NULL
      AND b.status <> 'cancelled'
      AND (b.metadata->>'bill_type' IS NULL OR b.metadata->>'bill_type' = 'rent')
      AND (b.metadata->>'billing_type' IS NULL OR b.metadata->>'billing_type' = 'rent')
      AND b.period = cp.period
    ORDER BY cp.contract_id, cp.service_start, b.created_at ASC, b.id ASC
  )
  UPDATE public.billing_items b
  SET contract_id = mb.contract_id,
      service_start = mb.service_start,
      service_end = mb.service_end,
      updated_at = now()
  FROM matched_bills mb
  WHERE b.id = mb.bill_id;

  PERFORM set_config('ruangwarga.kos_contract_sync', 'off', true);

  -- Verifikasi tagihan lama Kamar INDI 01 tertaut ke contract_id hasil backfill
  SELECT contract_id, service_start, service_end
  INTO v_linked_contract_id, v_linked_service_start, v_linked_service_end
  FROM public.billing_items WHERE id = v_bill_indi_id;

  IF v_linked_contract_id IS NULL THEN
    RAISE EXCEPTION 'Uji 10 GAGAL: Tagihan lama Kamar INDI 01 tidak tertaut ke contract_id!';
  END IF;
  IF v_linked_service_start <> v_first_last_month THEN
    RAISE EXCEPTION 'Uji 10 GAGAL: service_start tagihan lama tidak sesuai (aktual: %, ekspektasi: %)', v_linked_service_start, v_first_last_month;
  END IF;
  IF v_linked_service_end IS NULL THEN
    RAISE EXCEPTION 'Uji 10 GAGAL: service_end tagihan lama masih NULL!';
  END IF;

  -- Jalankan fungsi penerbitan tagihan internal (sebagai service_role / superuser)
  SELECT public.generate_kos_contract_bills(v_today_wib, v_tenant_kos) INTO v_gen_res;

  -- Verifikasi tidak ada tagihan ganda untuk periode bulan lalu
  SELECT count(*) INTO v_bills_in_period
  FROM public.billing_items
  WHERE unit_id = v_room_indi_id AND period = v_last_month_period AND status <> 'cancelled';

  IF v_bills_in_period <> 1 THEN
    RAISE EXCEPTION 'Uji 10 GAGAL: Terbit tagihan ganda! Jumlah tagihan periode % untuk Kamar INDI 01: % (ekspektasi: 1)', v_last_month_period, v_bills_in_period;
  END IF;
  RAISE NOTICE '-> OK: Tagihan lama INDI KOS tertaut ke kontrak dan generate_kos_contract_bills tidak membuat tagihan ganda.';

  -- ----------------------------------------------------------------------------
  -- UJI 11: Tagihan lama cancelled atau non-sewa tidak ikut ditautkan (KOS-2F.2 / K3)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE '[UJI 11] Menguji tagihan lama cancelled atau non-sewa tidak ikut ditautkan...';

  PERFORM set_config('ruangwarga.kos_contract_sync', 'on', true);
  INSERT INTO public.tenant_units (tenant_id, label, status, metadata)
  VALUES (
    v_tenant_kos,
    'Kamar Filter 01',
    'occupied',
    jsonb_build_object(
      'contract_start', v_first_last_month::text,
      'rent_price', 1200000,
      'tenant_name', 'Penyewa Filter'
    )
  ) RETURNING id INTO v_room_filter_id;
  PERFORM set_config('ruangwarga.kos_contract_sync', 'off', true);

  -- 1. Tagihan sewa berstatus cancelled
  INSERT INTO public.billing_items (
    tenant_id, unit_id, period, amount, due_date, status, contract_id, metadata
  ) VALUES (
    v_tenant_kos, v_room_filter_id, v_last_month_period, 1200000, v_first_last_month + 10,
    'cancelled', NULL, '{"bill_type": "rent"}'::jsonb
  ) RETURNING id INTO v_bill_cancelled_id;

  -- 2. Tagihan deposit (non-sewa via bill_type)
  INSERT INTO public.billing_items (
    tenant_id, unit_id, period, amount, due_date, status, contract_id, metadata
  ) VALUES (
    v_tenant_kos, v_room_filter_id, v_last_month_period, 500000, v_first_last_month + 10,
    'unpaid', NULL, '{"bill_type": "deposit"}'::jsonb
  ) RETURNING id INTO v_bill_deposit_id;

  -- 3. Tagihan listrik (non-sewa via billing_type)
  INSERT INTO public.billing_items (
    tenant_id, unit_id, period, amount, due_date, status, contract_id, metadata
  ) VALUES (
    v_tenant_kos, v_room_filter_id, v_last_month_period, 150000, v_first_last_month + 10,
    'unpaid', NULL, '{"billing_type": "electric"}'::jsonb
  ) RETURNING id INTO v_bill_electric_id;

  -- Jalankan ulang logika backfill 7.1 + 7.1b
  PERFORM set_config('ruangwarga.kos_contract_sync', 'on', true);

  INSERT INTO public.kos_contracts (
    tenant_id,
    unit_id,
    member_id,
    tenant_name,
    rent_price,
    start_date,
    end_date,
    grace_days,
    status,
    notes,
    created_at,
    updated_at
  )
  SELECT
    u.tenant_id,
    u.id AS unit_id,
    NULL AS member_id,
    COALESCE(u.metadata->>'tenant_name', 'Penyewa Kamar ' || u.label) AS tenant_name,
    COALESCE(
      CASE WHEN (u.metadata->>'rent_price') ~ '^[0-9]+(\.[0-9]+)?$' THEN (u.metadata->>'rent_price')::numeric END,
      0
    ) AS rent_price,
    (u.metadata->>'contract_start')::date AS start_date,
    NULL AS end_date,
    10 AS grace_days,
    'active',
    'Backfill dari metadata unit KOS-2.1',
    now(),
    now()
  FROM public.tenant_units u
  JOIN public.tenants t ON t.id = u.tenant_id
  WHERE u.id = v_room_filter_id
    AND NOT EXISTS (
      SELECT 1 FROM public.kos_contracts c WHERE c.unit_id = u.id AND c.status = 'active'
    );

  WITH contract_periods AS (
    SELECT
      c.id AS contract_id,
      c.unit_id,
      (c.start_date + (s.n * interval '1 month'))::date AS service_start,
      CASE
        WHEN c.end_date IS NOT NULL AND (c.start_date + ((s.n + 1) * interval '1 month') - interval '1 day')::date > c.end_date
        THEN c.end_date
        ELSE (c.start_date + ((s.n + 1) * interval '1 month') - interval '1 day')::date
      END AS service_end,
      to_char((c.start_date + (s.n * interval '1 month'))::date, 'YYYY-MM') AS period
    FROM public.kos_contracts c
    CROSS JOIN LATERAL generate_series(
      0,
      GREATEST(
        0,
        (EXTRACT(YEAR FROM age((now() AT TIME ZONE 'Asia/Jakarta')::date, c.start_date)) * 12
         + EXTRACT(MONTH FROM age((now() AT TIME ZONE 'Asia/Jakarta')::date, c.start_date)) + 2)::int
      )
    ) AS s(n)
    WHERE c.notes = 'Backfill dari metadata unit KOS-2.1'
      AND (c.start_date + (s.n * interval '1 month'))::date <= (now() AT TIME ZONE 'Asia/Jakarta')::date
      AND (c.end_date IS NULL OR (c.start_date + (s.n * interval '1 month'))::date <= c.end_date)
  ),
  matched_bills AS (
    SELECT DISTINCT ON (cp.contract_id, cp.service_start)
      b.id AS bill_id,
      cp.contract_id,
      cp.service_start,
      cp.service_end
    FROM contract_periods cp
    JOIN public.billing_items b ON b.unit_id = cp.unit_id
      AND b.contract_id IS NULL
      AND b.status <> 'cancelled'
      AND (b.metadata->>'bill_type' IS NULL OR b.metadata->>'bill_type' = 'rent')
      AND (b.metadata->>'billing_type' IS NULL OR b.metadata->>'billing_type' = 'rent')
      AND b.period = cp.period
    ORDER BY cp.contract_id, cp.service_start, b.created_at ASC, b.id ASC
  )
  UPDATE public.billing_items b
  SET contract_id = mb.contract_id,
      service_start = mb.service_start,
      service_end = mb.service_end,
      updated_at = now()
  FROM matched_bills mb
  WHERE b.id = mb.bill_id;

  PERFORM set_config('ruangwarga.kos_contract_sync', 'off', true);

  -- Pastikan kontrak aktif untuk Kamar Filter 01 telah dibuat
  SELECT id INTO v_contract_filter_id
  FROM public.kos_contracts
  WHERE unit_id = v_room_filter_id AND status = 'active';

  IF v_contract_filter_id IS NULL THEN
    RAISE EXCEPTION 'Uji 11 GAGAL: Kontrak hasil backfill untuk Kamar Filter 01 tidak terbentuk!';
  END IF;

  -- Verifikasi tidak ada tagihan cancelled atau non-sewa yang tertaut
  IF EXISTS (
    SELECT 1 FROM public.billing_items
    WHERE id IN (v_bill_cancelled_id, v_bill_deposit_id, v_bill_electric_id)
      AND contract_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Uji 11 GAGAL: Tagihan cancelled atau non-sewa ikut tertaut ke contract_id!';
  END IF;
  RAISE NOTICE '-> OK: Tagihan cancelled dan non-sewa tidak ikut ditautkan ke kontrak.';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SELURUH UJI KOS-2.1 & KOS-2F.2 BERHASIL (100%% LULUS)';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
