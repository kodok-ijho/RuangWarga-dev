-- Migration: Penambahan biaya tambahan per kontrak kos dan pencatatan line_items tagihan
-- Task: KOS-4.1 (Ref: docs/handoff/KOS-4.md)
-- Date: 2026-10-26

BEGIN;

-- ==============================================================================
-- 1. ALTER TABLE public.kos_contracts
-- Menambahkan kolom additional_fees JSONB dengan default '[]'::jsonb
-- ==============================================================================
ALTER TABLE public.kos_contracts
  ADD COLUMN IF NOT EXISTS additional_fees JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_kos_contracts_additional_fees_array'
  ) THEN
    ALTER TABLE public.kos_contracts
      ADD CONSTRAINT ck_kos_contracts_additional_fees_array
      CHECK (jsonb_typeof(additional_fees) = 'array');
  END IF;
END $$;


-- ==============================================================================
-- 2. FUNCTION public.create_kos_contract (VERSI 11 ARGUMEN DENGAN BIAYA TAMBAHAN)
-- ==============================================================================
-- Drop versi 10 argumen sebelumnya dari 202610250001_kos_contract_prorata.sql
DROP FUNCTION IF EXISTS public.create_kos_contract(UUID, BIGINT, UUID, TEXT, NUMERIC, DATE, INT, INT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_kos_contract(
  p_tenant_id       UUID,
  p_unit_id         BIGINT,
  p_member_id       UUID DEFAULT NULL,
  p_tenant_name     TEXT DEFAULT NULL,
  p_rent_price      NUMERIC DEFAULT 0,
  p_start_date      DATE DEFAULT CURRENT_DATE,
  p_months          INT DEFAULT NULL,
  p_grace_days      INT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL,
  p_billing_cycle   TEXT DEFAULT 'start_date',
  p_additional_fees JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant RECORD;
  v_unit RECORD;
  v_member RECORD;
  v_contract_id UUID;
  v_bill_id UUID;
  v_grace_days INT;
  v_end_date DATE;
  v_service_start DATE;
  v_service_end DATE;
  v_period TEXT;
  v_due_date DATE;
  v_tenant_display_name TEXT;
  v_today DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_billing_cycle TEXT;
  v_bill_amount NUMERIC;
  v_bill_metadata JSONB;
  v_days_in_month INT;
  v_prorata_days INT;
  v_fee RECORD;
  v_fee_name TEXT;
  v_fee_amount NUMERIC;
  v_total_additional_fees NUMERIC := 0;
  v_normalized_fees JSONB := '[]'::jsonb;
  v_line_items JSONB := '[]'::jsonb;
  v_fee_line_items JSONB := '[]'::jsonb;
  v_sum_prorated_fees NUMERIC := 0;
  v_prorated_fee NUMERIC;
  v_rent_line_amount NUMERIC;
BEGIN
  -- 1. Otorisasi (SEC-1.1): Harus service_role, platform admin, owner, atau punya izin generate_billing
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR public.is_tenant_owner(p_tenant_id)
    OR public.has_permission(p_tenant_id, 'generate_billing')
  ) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  -- 1b. Validasi Rentang Tanggal Mulai (K9): Mencegah salah ketik tahun
  IF p_start_date IS NULL
     OR p_start_date < (v_today - interval '12 month')::date
     OR p_start_date > (v_today + interval '3 month')::date THEN
    RAISE EXCEPTION 'Tanggal mulai sewa tidak valid: tidak boleh lebih dari 12 bulan ke belakang atau 3 bulan ke depan';
  END IF;

  -- 1c. Validasi & Normalisasi Siklus Tagihan (KOS-3.1)
  IF p_billing_cycle IS NULL OR p_billing_cycle NOT IN ('start_date', 'month_start_prorata') THEN
    RAISE EXCEPTION 'Siklus tagihan tidak valid: % (harus start_date atau month_start_prorata)', COALESCE(p_billing_cycle, 'NULL');
  END IF;

  v_billing_cycle := p_billing_cycle;
  -- Masuk tanggal 1 dinormalkan menjadi 'start_date' (tanpa prorata)
  IF v_billing_cycle = 'month_start_prorata' AND EXTRACT(DAY FROM p_start_date)::INT = 1 THEN
    v_billing_cycle := 'start_date';
  END IF;

  -- 1d. Validasi Biaya Tambahan (KOS-4.1)
  IF p_additional_fees IS NULL OR jsonb_typeof(p_additional_fees) <> 'array' THEN
    RAISE EXCEPTION 'Biaya tambahan harus berupa array JSON';
  END IF;

  IF jsonb_array_length(p_additional_fees) > 10 THEN
    RAISE EXCEPTION 'Jumlah biaya tambahan maksimal 10 item';
  END IF;

  v_total_additional_fees := 0;
  v_normalized_fees := '[]'::jsonb;
  FOR v_fee IN SELECT * FROM jsonb_array_elements(p_additional_fees) LOOP
    IF jsonb_typeof(v_fee) <> 'object' THEN
      RAISE EXCEPTION 'Item biaya tambahan harus berupa objek';
    END IF;

    v_fee_name := btrim(COALESCE(v_fee->>'name', ''));
    IF v_fee_name = '' THEN
      RAISE EXCEPTION 'Nama biaya tambahan tidak boleh kosong';
    END IF;

    IF char_length(v_fee_name) > 60 THEN
      RAISE EXCEPTION 'Nama biaya tambahan maksimal 60 karakter';
    END IF;

    IF (v_fee->>'amount') IS NULL OR NOT (btrim(v_fee->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$') THEN
      RAISE EXCEPTION 'Nominal biaya tambahan % tidak valid', v_fee_name;
    END IF;

    v_fee_amount := (v_fee->>'amount')::numeric;
    IF v_fee_amount < 0 THEN
      RAISE EXCEPTION 'Nominal biaya tambahan % tidak boleh negatif', v_fee_name;
    END IF;

    v_total_additional_fees := v_total_additional_fees + v_fee_amount;
    v_normalized_fees := v_normalized_fees || jsonb_build_array(jsonb_build_object(
      'name', v_fee_name,
      'amount', v_fee_amount
    ));
  END LOOP;

  -- 2. Validasi Tenant & Status Langganan
  SELECT id, type, settings INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant tidak ditemukan';
  END IF;

  IF v_tenant.type <> 'kos' THEN
    RAISE EXCEPTION 'Fungsi pembuatan kontrak hanya berlaku untuk tenant kos';
  END IF;

  IF public.tenant_subscription_status(p_tenant_id) NOT IN ('trial'::public.subscription_status, 'active'::public.subscription_status) THEN
    RAISE EXCEPTION 'Langganan tenant sedang tidak aktif atau read-only';
  END IF;

  -- 3. Validasi Kamar (Unit)
  SELECT id, tenant_id, label, status, metadata INTO v_unit
  FROM public.tenant_units
  WHERE id = p_unit_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kamar tidak ditemukan pada kos ini';
  END IF;

  IF v_unit.status = 'inactive' THEN
    RAISE EXCEPTION 'Kamar tidak aktif tidak dapat memiliki kontrak aktif';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.kos_contracts
    WHERE unit_id = p_unit_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Kamar % sudah memiliki kontrak sewa aktif', v_unit.label;
  END IF;

  -- 4. Validasi Identitas Penyewa
  IF p_member_id IS NOT NULL THEN
    SELECT id, tenant_id, full_name, status INTO v_member
    FROM public.tenant_members
    WHERE id = p_member_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Data anggota penyewa tidak ditemukan';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.kos_contracts
      WHERE tenant_id = p_tenant_id AND member_id = p_member_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Penyewa % sudah memiliki kontrak sewa aktif di kamar lain', v_member.full_name;
    END IF;

    v_tenant_display_name := v_member.full_name;
  ELSE
    IF p_tenant_name IS NULL OR btrim(p_tenant_name) = '' THEN
      RAISE EXCEPTION 'Nama penyewa wajib diisi jika belum terdaftar sebagai anggota';
    END IF;
    v_tenant_display_name := btrim(p_tenant_name);
  END IF;

  -- 5. Hitung Tenggat Bayar (grace_days) & Tanggal Selesai (end_date)
  v_grace_days := COALESCE(
    p_grace_days,
    CASE WHEN (v_tenant.settings->>'rent_grace_days') ~ '^[0-9]+$' THEN (v_tenant.settings->>'rent_grace_days')::INT END,
    10
  );
  IF v_grace_days < 0 OR v_grace_days > 28 THEN
    v_grace_days := 10;
  END IF;

  IF p_months IS NOT NULL AND p_months > 0 THEN
    IF v_billing_cycle = 'month_start_prorata' THEN
      -- Durasi tetap p_months = N: bulan pertama prorata + N bulan kalender penuh;
      -- end_date = hari terakhir bulan ke-N setelah bulan masuk
      v_end_date := (date_trunc('month', p_start_date)::date + ((p_months + 1) || ' month')::interval - interval '1 day')::date;
    ELSE
      v_end_date := (p_start_date + (p_months || ' month')::interval - interval '1 day')::date;
    END IF;
  ELSE
    v_end_date := NULL;
  END IF;

  -- 6. Insert Kontrak Master (Trigger sync_kos_room_on_contract_change akan otomatis set kamar occupied)
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
    created_by,
    billing_cycle,
    additional_fees
  ) VALUES (
    p_tenant_id,
    p_unit_id,
    p_member_id,
    v_tenant_display_name,
    p_rent_price,
    p_start_date,
    v_end_date,
    v_grace_days,
    'active',
    p_notes,
    auth.uid(),
    v_billing_cycle,
    v_normalized_fees
  ) RETURNING id INTO v_contract_id;

  -- Update relasi unit pada tenant_members bila ada
  IF p_member_id IS NOT NULL THEN
    UPDATE public.tenant_members
    SET unit_id = p_unit_id,
        occupancy_status = 'active',
        updated_at = now()
    WHERE id = p_member_id;
  END IF;

  -- 7. Terbitkan Tagihan Periode Pertama (Periode 0)
  v_service_start := p_start_date;
  v_period := to_char(v_service_start, 'YYYY-MM');
  v_due_date := v_service_start + v_grace_days;

  IF v_billing_cycle = 'month_start_prorata' THEN
    -- Masa sewa start_date s.d. akhir bulan masuk
    v_service_end := (date_trunc('month', p_start_date)::date + interval '1 month' - interval '1 day')::date;
    IF v_end_date IS NOT NULL AND v_service_end > v_end_date THEN
      v_service_end := v_end_date;
    END IF;

    -- Jumlah hari dalam bulan masuk
    v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', p_start_date)::date + interval '1 month' - interval '1 day'))::INT;
    -- Jumlah hari terpakai (inklusif: start_date s.d. service_end)
    v_prorata_days := (v_service_end - v_service_start + 1);

    -- nominal total prorata = floor((rent + total_fees) * hari_terpakai / hari_dalam_bulan / 1000) * 1000
    v_bill_amount := floor(((p_rent_price + v_total_additional_fees) * v_prorata_days::numeric / v_days_in_month::numeric) / 1000.0) * 1000;

    -- line_items prorata: per fee floor ke rupiah, baris Sewa = total prorata - jumlah biaya prorata
    v_sum_prorated_fees := 0;
    v_fee_line_items := '[]'::jsonb;
    FOR v_fee IN SELECT * FROM jsonb_array_elements(v_normalized_fees) LOOP
      v_prorated_fee := floor((v_fee->>'amount')::numeric * v_prorata_days::numeric / v_days_in_month::numeric);
      v_sum_prorated_fees := v_sum_prorated_fees + v_prorated_fee;
      v_fee_line_items := v_fee_line_items || jsonb_build_array(jsonb_build_object(
        'name', v_fee->>'name',
        'amount', v_prorated_fee
      ));
    END LOOP;

    v_rent_line_amount := v_bill_amount - v_sum_prorated_fees;
    v_line_items := jsonb_build_array(jsonb_build_object(
      'name', 'Sewa',
      'amount', v_rent_line_amount
    )) || v_fee_line_items;

    v_bill_metadata := jsonb_build_object(
      'bill_type', 'rent',
      'auto_generated', false,
      'unit_label', v_unit.label,
      'member_name', v_tenant_display_name,
      'contract_period_index', 0,
      'prorata', true,
      'prorata_days', v_prorata_days,
      'days_in_month', v_days_in_month,
      'line_items', v_line_items,
      'notes', 'Tagihan sewa periode pertama (kontrak baru prorata)'
    );
  ELSE
    v_service_end := (p_start_date + interval '1 month' - interval '1 day')::date;
    IF v_end_date IS NOT NULL AND v_service_end > v_end_date THEN
      v_service_end := v_end_date;
    END IF;

    v_bill_amount := p_rent_price + v_total_additional_fees;

    v_line_items := jsonb_build_array(jsonb_build_object(
      'name', 'Sewa',
      'amount', p_rent_price
    ));

    FOR v_fee IN SELECT * FROM jsonb_array_elements(v_normalized_fees) LOOP
      v_line_items := v_line_items || jsonb_build_array(jsonb_build_object(
        'name', v_fee->>'name',
        'amount', (v_fee->>'amount')::numeric
      ));
    END LOOP;

    v_bill_metadata := jsonb_build_object(
      'bill_type', 'rent',
      'auto_generated', false,
      'unit_label', v_unit.label,
      'member_name', v_tenant_display_name,
      'contract_period_index', 0,
      'line_items', v_line_items,
      'notes', 'Tagihan sewa periode pertama (kontrak baru)'
    );
  END IF;

  INSERT INTO public.billing_items (
    tenant_id,
    unit_id,
    member_id,
    period,
    amount,
    late_fee,
    due_date,
    status,
    contract_id,
    service_start,
    service_end,
    metadata
  ) VALUES (
    p_tenant_id,
    p_unit_id,
    p_member_id,
    v_period,
    v_bill_amount,
    0,
    v_due_date,
    'unpaid',
    v_contract_id,
    v_service_start,
    v_service_end,
    v_bill_metadata
  ) RETURNING id INTO v_bill_id;

  RETURN jsonb_build_object(
    'success', true,
    'contract_id', v_contract_id,
    'bill_id', v_bill_id,
    'unit_id', p_unit_id,
    'member_id', p_member_id,
    'tenant_name', v_tenant_display_name,
    'rent_price', p_rent_price,
    'start_date', p_start_date,
    'end_date', v_end_date,
    'grace_days', v_grace_days,
    'billing_cycle', v_billing_cycle,
    'additional_fees', v_normalized_fees
  );
END;
$$;


-- ==============================================================================
-- 3. FUNCTION public.generate_kos_contract_bills (DUKUNGAN BIAYA TAMBAHAN & LINE_ITEMS)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.generate_kos_contract_bills(
  p_today     DATE DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := COALESCE(p_today, (now() AT TIME ZONE 'Asia/Jakarta')::date);
  v_contract RECORD;
  v_n INT;
  v_service_start DATE;
  v_service_end DATE;
  v_period TEXT;
  v_due_date DATE;
  v_generated_count INT := 0;
  v_skipped_count INT := 0;
  v_new_bill_id UUID;
  v_bill_amount NUMERIC;
  v_line_items JSONB;
  v_fee RECORD;
  v_fee_amount NUMERIC;
BEGIN
  FOR v_contract IN
    SELECT
      c.id AS contract_id,
      c.tenant_id,
      c.unit_id,
      c.member_id,
      c.tenant_name,
      c.rent_price,
      c.start_date,
      c.end_date,
      c.grace_days,
      COALESCE(c.billing_cycle, 'start_date') AS billing_cycle,
      COALESCE(c.additional_fees, '[]'::jsonb) AS additional_fees,
      u.label AS unit_label,
      COALESCE(m.full_name, c.tenant_name) AS member_name
    FROM public.kos_contracts c
    JOIN public.tenants t ON t.id = c.tenant_id
    JOIN public.tenant_units u ON u.id = c.unit_id
    LEFT JOIN public.tenant_members m ON m.id = c.member_id
    WHERE c.status = 'active'
      AND t.type = 'kos'
      AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
      AND public.tenant_subscription_status(c.tenant_id) IN ('trial'::public.subscription_status, 'active'::public.subscription_status)
    ORDER BY c.start_date ASC
  LOOP
    -- Hitung nominal dan line_items periode reguler untuk kontrak ini
    v_bill_amount := v_contract.rent_price;
    v_line_items := jsonb_build_array(jsonb_build_object(
      'name', 'Sewa',
      'amount', v_contract.rent_price
    ));

    IF v_contract.additional_fees IS NOT NULL AND jsonb_typeof(v_contract.additional_fees) = 'array' THEN
      FOR v_fee IN SELECT * FROM jsonb_array_elements(v_contract.additional_fees) LOOP
        v_fee_amount := COALESCE((v_fee->>'amount')::numeric, 0);
        v_bill_amount := v_bill_amount + v_fee_amount;
        v_line_items := v_line_items || jsonb_build_array(jsonb_build_object(
          'name', COALESCE(v_fee->>'name', 'Biaya'),
          'amount', v_fee_amount
        ));
      END LOOP;
    END IF;

    -- Kontrak month_start_prorata telah memiliki tagihan periode 0 (prorata saat dibuat);
    -- penagihan berkala berikutnya mulai dari periode n = 1 (tanggal 1 bulan berikutnya).
    -- Kontrak start_date tetap mulai dari periode n = 0 (idempoten melewati periode 0 yang sudah terbit).
    IF v_contract.billing_cycle = 'month_start_prorata' THEN
      v_n := 1;
    ELSE
      v_n := 0;
    END IF;

    LOOP
      IF v_contract.billing_cycle = 'month_start_prorata' THEN
        v_service_start := (date_trunc('month', v_contract.start_date)::date + (v_n || ' month')::interval)::date;
      ELSE
        -- Periode ke-n dihitung dari start_date (PostgreSQL clamp otomatis tanggal akhir bulan)
        v_service_start := (v_contract.start_date + (v_n || ' month')::interval)::date;
      END IF;

      -- Berhenti jika service_start belum tiba (belum tanggalnya)
      IF v_service_start > v_today THEN
        EXIT;
      END IF;

      -- Berhenti jika kontrak memiliki end_date dan masa sewa telah melampaui end_date
      IF v_contract.end_date IS NOT NULL AND v_service_start > v_contract.end_date THEN
        EXIT;
      END IF;

      IF v_contract.billing_cycle = 'month_start_prorata' THEN
        v_service_end := (date_trunc('month', v_contract.start_date)::date + ((v_n + 1) || ' month')::interval - interval '1 day')::date;
      ELSE
        v_service_end := (v_contract.start_date + ((v_n + 1) || ' month')::interval - interval '1 day')::date;
      END IF;

      IF v_contract.end_date IS NOT NULL AND v_service_end > v_contract.end_date THEN
        v_service_end := v_contract.end_date;
      END IF;

      v_period := to_char(v_service_start, 'YYYY-MM');
      v_due_date := v_service_start + v_contract.grace_days;

      -- Idempoten: Cek apakah sudah ada tagihan aktif untuk periode kontrak ini
      IF NOT EXISTS (
        SELECT 1 FROM public.billing_items b
        WHERE b.contract_id = v_contract.contract_id
          AND b.service_start = v_service_start
          AND b.status <> 'cancelled'
      ) THEN
        INSERT INTO public.billing_items (
          tenant_id,
          unit_id,
          member_id,
          period,
          amount,
          late_fee,
          due_date,
          status,
          contract_id,
          service_start,
          service_end,
          metadata
        ) VALUES (
          v_contract.tenant_id,
          v_contract.unit_id,
          v_contract.member_id,
          v_period,
          v_bill_amount,
          0,
          v_due_date,
          'unpaid',
          v_contract.contract_id,
          v_service_start,
          v_service_end,
          jsonb_build_object(
            'bill_type', 'rent',
            'auto_generated', true,
            'unit_label', v_contract.unit_label,
            'member_name', v_contract.member_name,
            'contract_period_index', v_n,
            'line_items', v_line_items
          )
        )
        ON CONFLICT (contract_id, service_start) WHERE (contract_id IS NOT NULL AND status <> 'cancelled')
        DO NOTHING
        RETURNING id INTO v_new_bill_id;

        IF v_new_bill_id IS NOT NULL THEN
          v_generated_count := v_generated_count + 1;
        ELSE
          v_skipped_count := v_skipped_count + 1;
        END IF;
      ELSE
        v_skipped_count := v_skipped_count + 1;
      END IF;

      v_n := v_n + 1;
      -- Safety guard
      IF v_n > 1200 THEN
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'generated_count', v_generated_count,
    'skipped_count', v_skipped_count
  );
END;
$$;


-- ==============================================================================
-- 4. GRANTS & REVOKES
-- ==============================================================================
REVOKE ALL ON FUNCTION public.create_kos_contract(UUID, BIGINT, UUID, TEXT, NUMERIC, DATE, INT, INT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_kos_contract(UUID, BIGINT, UUID, TEXT, NUMERIC, DATE, INT, INT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.generate_kos_contract_bills(DATE, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_kos_contract_bills(DATE, UUID) TO service_role;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- ALTER TABLE public.kos_contracts DROP COLUMN IF EXISTS additional_fees;
-- DROP FUNCTION IF EXISTS public.create_kos_contract(UUID, BIGINT, UUID, TEXT, NUMERIC, DATE, INT, INT, TEXT, TEXT, JSONB);
-- (Kembalikan create_kos_contract 10 argumen dan generate_kos_contract_bills dari 202610250001_kos_contract_prorata.sql)
