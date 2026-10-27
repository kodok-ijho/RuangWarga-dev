-- Migration: Penagihan Kos, Denda Keterlambatan, Antrean Pengingat, dan Laporan Tunggakan
-- Task: KOS-5.1 (Ref: docs/handoff/KOS-5.md)
-- Date: 2026-10-27

BEGIN;

-- ==============================================================================
-- 1. FUNCTION public.validate_late_fee_rule & ALTER TABLE public.kos_contracts
-- Menambahkan kolom late_fee_rule pada kos_contracts dan fungsi validasinya
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.validate_late_fee_rule(p_rule JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_type TEXT;
  v_grace_days INT;
  v_amount NUMERIC;
  v_max NUMERIC;
  v_percent NUMERIC;
BEGIN
  IF p_rule IS NULL OR jsonb_typeof(p_rule) <> 'object' THEN
    RETURN FALSE;
  END IF;

  v_type := p_rule->>'type';
  IF v_type IS NULL OR v_type NOT IN ('none', 'once', 'daily', 'percent') THEN
    RETURN FALSE;
  END IF;

  IF p_rule ? 'grace_days' AND (p_rule->>'grace_days') IS NOT NULL AND jsonb_typeof(p_rule->'grace_days') <> 'null' THEN
    IF NOT ((p_rule->>'grace_days') ~ '^[0-9]+$') THEN
      RETURN FALSE;
    END IF;
    v_grace_days := (p_rule->>'grace_days')::INT;
    IF v_grace_days < 0 OR v_grace_days > 7 THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF v_type = 'none' THEN
    RETURN TRUE;
  ELSIF v_type = 'once' THEN
    IF (p_rule->>'amount') IS NULL OR NOT ((p_rule->>'amount') ~ '^[0-9]+(\.[0-9]+)?$') THEN
      RETURN FALSE;
    END IF;
    v_amount := (p_rule->>'amount')::NUMERIC;
    RETURN (v_amount > 0);
  ELSIF v_type = 'daily' THEN
    IF (p_rule->>'amount') IS NULL OR NOT ((p_rule->>'amount') ~ '^[0-9]+(\.[0-9]+)?$') THEN
      RETURN FALSE;
    END IF;
    v_amount := (p_rule->>'amount')::NUMERIC;
    IF v_amount <= 0 THEN
      RETURN FALSE;
    END IF;

    IF (p_rule->>'max') IS NULL OR NOT ((p_rule->>'max') ~ '^[0-9]+(\.[0-9]+)?$') THEN
      RETURN FALSE;
    END IF;
    v_max := (p_rule->>'max')::NUMERIC;
    RETURN (v_max > 0);
  ELSIF v_type = 'percent' THEN
    IF (p_rule->>'percent') IS NULL OR NOT ((p_rule->>'percent') ~ '^[0-9]+(\.[0-9]+)?$') THEN
      RETURN FALSE;
    END IF;
    v_percent := (p_rule->>'percent')::NUMERIC;
    RETURN (v_percent > 0 AND v_percent <= 100);
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_late_fee_rule(JSONB) TO authenticated, service_role;

ALTER TABLE public.kos_contracts
  ADD COLUMN IF NOT EXISTS late_fee_rule JSONB NOT NULL DEFAULT '{"type":"none"}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_kos_contracts_late_fee_rule'
  ) THEN
    ALTER TABLE public.kos_contracts
      ADD CONSTRAINT ck_kos_contracts_late_fee_rule
      CHECK (public.validate_late_fee_rule(late_fee_rule));
  END IF;
END $$;


-- ==============================================================================
-- 2. FUNCTION public.create_kos_contract (VERSI 12 ARGUMEN DENGAN ATURAN DENDA)
-- ==============================================================================
-- Drop versi 11 argumen sebelumnya dari 202610260002_kos_contract_fees.sql
DROP FUNCTION IF EXISTS public.create_kos_contract(UUID, BIGINT, UUID, TEXT, NUMERIC, DATE, INT, INT, TEXT, TEXT, JSONB);

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
  p_additional_fees JSONB DEFAULT '[]'::jsonb,
  p_late_fee_rule   JSONB DEFAULT NULL
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
  v_fee JSONB;
  v_fee_name TEXT;
  v_fee_amount NUMERIC;
  v_total_additional_fees NUMERIC := 0;
  v_normalized_fees JSONB := '[]'::jsonb;
  v_line_items JSONB := '[]'::jsonb;
  v_fee_line_items JSONB := '[]'::jsonb;
  v_sum_prorated_fees NUMERIC := 0;
  v_prorated_fee NUMERIC;
  v_rent_line_amount NUMERIC;
  v_late_fee_rule JSONB;
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
  FOR v_fee IN SELECT value FROM jsonb_array_elements(p_additional_fees) LOOP
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

  -- 2b. Validasi & Penentuan Aturan Denda Keterlambatan (KOS-5.1)
  IF p_late_fee_rule IS NOT NULL THEN
    IF NOT public.validate_late_fee_rule(p_late_fee_rule) THEN
      RAISE EXCEPTION 'Aturan denda keterlambatan tidak valid';
    END IF;
    v_late_fee_rule := p_late_fee_rule;
  ELSE
    IF (v_tenant.settings ? 'late_fee_rule')
       AND public.validate_late_fee_rule(v_tenant.settings->'late_fee_rule') THEN
      v_late_fee_rule := v_tenant.settings->'late_fee_rule';
    ELSE
      v_late_fee_rule := '{"type":"none"}'::jsonb;
    END IF;
  END IF;

  -- Normalisasi grace_days default 0 jika belum diset
  IF (v_late_fee_rule->>'grace_days') IS NULL THEN
    v_late_fee_rule := v_late_fee_rule || '{"grace_days": 0}'::jsonb;
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
      v_end_date := (date_trunc('month', p_start_date)::date + ((p_months + 1) || ' month')::interval - interval '1 day')::date;
    ELSE
      v_end_date := (p_start_date + (p_months || ' month')::interval - interval '1 day')::date;
    END IF;
  ELSE
    v_end_date := NULL;
  END IF;

  -- 6. Insert Kontrak Master
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
    additional_fees,
    late_fee_rule
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
    v_normalized_fees,
    v_late_fee_rule
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
    v_service_end := (date_trunc('month', p_start_date)::date + interval '1 month' - interval '1 day')::date;
    IF v_end_date IS NOT NULL AND v_service_end > v_end_date THEN
      v_service_end := v_end_date;
    END IF;

    v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', p_start_date)::date + interval '1 month' - interval '1 day'))::INT;
    v_prorata_days := (v_service_end - v_service_start + 1);

    v_bill_amount := floor(((p_rent_price + v_total_additional_fees) * v_prorata_days::numeric / v_days_in_month::numeric) / 1000.0) * 1000;

    v_sum_prorated_fees := 0;
    v_fee_line_items := '[]'::jsonb;
    FOR v_fee IN SELECT value FROM jsonb_array_elements(v_normalized_fees) LOOP
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

    FOR v_fee IN SELECT value FROM jsonb_array_elements(v_normalized_fees) LOOP
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
    'additional_fees', v_normalized_fees,
    'late_fee_rule', v_late_fee_rule
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_kos_contract(UUID, BIGINT, UUID, TEXT, NUMERIC, DATE, INT, INT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_kos_contract(UUID, BIGINT, UUID, TEXT, NUMERIC, DATE, INT, INT, TEXT, TEXT, JSONB, JSONB) TO authenticated, service_role;


-- ==============================================================================
-- 3. TABEL public.rent_reminders
-- Menyimpan antrean pengingat tagihan sewa kos (tahap h-3, h0, h+3, h+7)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.rent_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bill_id       UUID NOT NULL REFERENCES public.billing_items(id) ON DELETE CASCADE,
  member_id     UUID REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  stage         TEXT NOT NULL CHECK (stage IN ('h-3', 'h0', 'h+3', 'h+7')),
  remind_date   DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped')),
  sent_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at       TIMESTAMPTZ,
  push_sent_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_rent_reminders_bill_stage UNIQUE (bill_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_rent_reminders_tenant_id ON public.rent_reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_reminders_remind_date ON public.rent_reminders(remind_date);
CREATE INDEX IF NOT EXISTS idx_rent_reminders_status ON public.rent_reminders(status);
CREATE INDEX IF NOT EXISTS idx_rent_reminders_bill_id ON public.rent_reminders(bill_id);

ALTER TABLE public.rent_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rent_reminders_select" ON public.rent_reminders;
CREATE POLICY "rent_reminders_select" ON public.rent_reminders
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR public.has_permission(tenant_id, 'generate_billing')
    OR (
      member_id IS NOT NULL AND member_id IN (
        SELECT id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  );

REVOKE ALL ON public.rent_reminders FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.rent_reminders FROM authenticated;
GRANT SELECT ON public.rent_reminders TO authenticated;
GRANT ALL ON public.rent_reminders TO service_role;


-- ==============================================================================
-- 4. FUNCTION public.run_kos_collections
-- Menghitung denda keterlambatan dan membuat antrean pengingat tagihan
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.run_kos_collections(
  p_today DATE DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := COALESCE(p_today, (now() AT TIME ZONE 'Asia/Jakarta')::date);
  v_bill RECORD;
  v_rule JSONB;
  v_rule_type TEXT;
  v_rule_grace_days INT;
  v_calc_late_fee NUMERIC;
  v_days_late INT;
  v_daily_amount NUMERIC;
  v_max_amount NUMERIC;
  v_percent NUMERIC;
  v_rent_base NUMERIC;
  v_fees_updated INT := 0;
  v_reminders_created INT := 0;
BEGIN
  -- (a) Hitung late_fee untuk billing_items kontrak status 'unpaid'
  FOR v_bill IN
    SELECT
      b.id AS bill_id,
      b.tenant_id,
      b.contract_id,
      b.amount,
      b.late_fee,
      b.due_date,
      b.metadata,
      c.late_fee_rule
    FROM public.billing_items b
    JOIN public.tenants t ON t.id = b.tenant_id
    JOIN public.kos_contracts c ON c.id = b.contract_id
    WHERE b.contract_id IS NOT NULL
      AND b.status = 'unpaid'
      AND t.type = 'kos'
      AND public.tenant_subscription_status(b.tenant_id) IN ('trial'::public.subscription_status, 'active'::public.subscription_status)
      AND COALESCE(b.metadata->>'late_fee_waived', 'false') <> 'true'
  LOOP
    v_rule := COALESCE(v_bill.late_fee_rule, '{"type":"none"}'::jsonb);
    v_rule_type := COALESCE(v_rule->>'type', 'none');
    v_rule_grace_days := COALESCE(
      CASE WHEN (v_rule->>'grace_days') ~ '^[0-9]+$' THEN (v_rule->>'grace_days')::INT END,
      0
    );

    -- Denda hanya dihitung jika sudah lewat due_date + grace_days
    IF v_today > (v_bill.due_date + v_rule_grace_days) THEN
      IF v_rule_type = 'once' THEN
        v_calc_late_fee := COALESCE((v_rule->>'amount')::NUMERIC, 0);
      ELSIF v_rule_type = 'daily' THEN
        v_days_late := (v_today - (v_bill.due_date + v_rule_grace_days));
        v_daily_amount := COALESCE((v_rule->>'amount')::NUMERIC, 0);
        v_max_amount := COALESCE((v_rule->>'max')::NUMERIC, 0);
        v_calc_late_fee := LEAST(v_daily_amount * v_days_late, v_max_amount);
      ELSIF v_rule_type = 'percent' THEN
        v_percent := COALESCE((v_rule->>'percent')::NUMERIC, 0);
        v_rent_base := NULL;
        IF v_bill.metadata ? 'line_items' AND jsonb_typeof(v_bill.metadata->'line_items') = 'array' THEN
          SELECT (elem->>'amount')::NUMERIC INTO v_rent_base
          FROM jsonb_array_elements(v_bill.metadata->'line_items') AS elem
          WHERE elem->>'name' = 'Sewa'
          LIMIT 1;
        END IF;
        IF v_rent_base IS NULL THEN
          v_rent_base := v_bill.amount;
        END IF;
        v_calc_late_fee := floor(v_rent_base * (v_percent / 100.0));
      ELSE
        v_calc_late_fee := 0;
      END IF;
    ELSE
      v_calc_late_fee := 0;
    END IF;

    -- Update hanya bila nilai denda berbeda (idempoten)
    IF v_calc_late_fee IS DISTINCT FROM v_bill.late_fee THEN
      UPDATE public.billing_items
      SET late_fee = v_calc_late_fee,
          updated_at = now()
      WHERE id = v_bill.bill_id;

      v_fees_updated := v_fees_updated + 1;
    END IF;
  END LOOP;

  -- (b) Buat rent_reminders untuk tagihan unpaid pada tanggal pengingat
  WITH inserted AS (
    INSERT INTO public.rent_reminders (
      tenant_id,
      bill_id,
      member_id,
      stage,
      remind_date,
      status
    )
    SELECT
      b.tenant_id,
      b.id AS bill_id,
      COALESCE(b.member_id, c.member_id) AS member_id,
      s.stage,
      v_today AS remind_date,
      'pending' AS status
    FROM public.billing_items b
    JOIN public.kos_contracts c ON c.id = b.contract_id
    JOIN public.tenants t ON t.id = b.tenant_id
    CROSS JOIN (VALUES
      ('h-3', -3),
      ('h0',   0),
      ('h+3',  3),
      ('h+7',  7)
    ) AS s(stage, offset_days)
    WHERE b.contract_id IS NOT NULL
      AND b.status = 'unpaid'
      AND t.type = 'kos'
      AND public.tenant_subscription_status(b.tenant_id) IN ('trial'::public.subscription_status, 'active'::public.subscription_status)
      AND (b.due_date + s.offset_days) = v_today
    ON CONFLICT (bill_id, stage) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_reminders_created FROM inserted;

  RETURN jsonb_build_object(
    'success', true,
    'fees_updated', v_fees_updated,
    'reminders_created', v_reminders_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_kos_collections(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_kos_collections(DATE) TO service_role;


-- ==============================================================================
-- 5. FUNCTION public.run_auto_billing (DIPERBARUI DENGAN PANGGILAN RUN_KOS_COLLECTIONS)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.run_auto_billing(
  p_today DATE DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_date DATE;
  v_period TEXT;
  v_tenant RECORD;
  v_result JSONB;
  v_created INT;
  v_skipped INT;
  v_error TEXT;
  v_processed_count INT := 0;
BEGIN
  v_target_date := COALESCE(p_today, (now() AT TIME ZONE 'Asia/Jakarta')::date);
  v_period := to_char(v_target_date, 'YYYY-MM');

  -- 1. Blok RT/RW & Vertikal Berbasis billing_issue_day (IPL)
  FOR v_tenant IN
    SELECT t.id
    FROM public.tenants t
    WHERE t.type <> 'kos'
      AND (t.settings->>'auto_billing_enabled') = 'true'
      AND CASE WHEN (t.settings->>'billing_issue_day') ~ '^[0-9]{1,2}$' THEN (t.settings->>'billing_issue_day')::INT END = EXTRACT(DAY FROM v_target_date)::INT
      AND public.tenant_subscription_status(t.id) IN ('trial'::public.subscription_status, 'active'::public.subscription_status)
    ORDER BY t.created_at ASC
  LOOP
    BEGIN
      v_result := public.generate_auto_bills_for_tenant(v_tenant.id, v_period);
      v_created := COALESCE((v_result->>'created')::INT, 0);
      v_skipped := COALESCE((v_result->>'skipped')::INT, 0);
      v_error := v_result->>'error';
    EXCEPTION WHEN OTHERS THEN
      v_created := 0;
      v_skipped := 0;
      v_error := SQLERRM;
    END;

    INSERT INTO public.billing_auto_runs (
      tenant_id,
      period,
      run_at,
      created_count,
      skipped_count,
      error
    ) VALUES (
      v_tenant.id,
      v_period,
      clock_timestamp(),
      v_created,
      v_skipped,
      v_error
    );

    v_processed_count := v_processed_count + 1;
  END LOOP;

  -- 2. Blok Kos Harian (Setiap Hari untuk Seluruh Tenant Kos Aktif)
  FOR v_tenant IN
    SELECT t.id
    FROM public.tenants t
    WHERE t.type = 'kos'
      AND public.tenant_subscription_status(t.id) IN ('trial'::public.subscription_status, 'active'::public.subscription_status)
    ORDER BY t.created_at ASC
  LOOP
    BEGIN
      v_result := public.generate_kos_contract_bills(v_target_date, v_tenant.id);
      v_created := COALESCE((v_result->>'generated_count')::INT, 0);
      v_skipped := COALESCE((v_result->>'skipped_count')::INT, 0);
      v_error := NULL;
    EXCEPTION WHEN OTHERS THEN
      v_created := 0;
      v_skipped := 0;
      v_error := SQLERRM;
    END;

    IF v_created > 0 OR v_error IS NOT NULL THEN
      INSERT INTO public.billing_auto_runs (
        tenant_id,
        period,
        run_at,
        created_count,
        skipped_count,
        error
      ) VALUES (
        v_tenant.id,
        v_period,
        clock_timestamp(),
        v_created,
        v_skipped,
        v_error
      );
    END IF;

    v_processed_count := v_processed_count + 1;
  END LOOP;

  -- 3. Blok Kos Collections (Denda Keterlambatan & Antrean Pengingat KOS-5.1)
  BEGIN
    PERFORM public.run_kos_collections(v_target_date);
  EXCEPTION WHEN OTHERS THEN
    -- Kegagalan denda/pengingat tidak menggagalkan penagihan otomatis
    RAISE WARNING 'Gagal menjalankan run_kos_collections: %', SQLERRM;
  END;

  RETURN v_processed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.run_auto_billing(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_auto_billing(DATE) TO service_role;


-- ==============================================================================
-- 6. RPC waive_late_fee, mark_rent_reminder, get_kos_arrears
-- ==============================================================================

-- 6a. waive_late_fee
CREATE OR REPLACE FUNCTION public.waive_late_fee(
  p_bill_id UUID,
  p_reason  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bill RECORD;
BEGIN
  -- 1. Validasi alasan
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Alasan penghapusan denda wajib diisi';
  END IF;

  -- 2. Cari tagihan
  SELECT id, tenant_id, contract_id, status, late_fee, metadata
  INTO v_bill
  FROM public.billing_items
  WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan';
  END IF;

  -- 3. Otorisasi (SEC-1.1): Harus service_role, platform admin, owner, atau generate_billing
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR public.is_tenant_owner(v_bill.tenant_id)
    OR public.has_permission(v_bill.tenant_id, 'generate_billing')
  ) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  -- 4. Update tagihan: set late_fee 0 dan metadata
  UPDATE public.billing_items
  SET late_fee = 0,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'late_fee_waived', true,
        'waived_by', auth.uid(),
        'waived_at', now(),
        'waive_reason', btrim(p_reason)
      ),
      updated_at = now()
  WHERE id = p_bill_id;

  RETURN jsonb_build_object(
    'success', true,
    'bill_id', p_bill_id,
    'late_fee', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.waive_late_fee(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.waive_late_fee(UUID, TEXT) TO authenticated, service_role;


-- 6b. mark_rent_reminder
CREATE OR REPLACE FUNCTION public.mark_rent_reminder(
  p_reminder_id UUID,
  p_status      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reminder RECORD;
BEGIN
  -- 1. Validasi status
  IF p_status IS NULL OR p_status NOT IN ('sent', 'skipped') THEN
    RAISE EXCEPTION 'Status pengingat tidak valid: % (harus sent atau skipped)', COALESCE(p_status, 'NULL');
  END IF;

  -- 2. Cari pengingat
  SELECT id, tenant_id, bill_id, member_id, status
  INTO v_reminder
  FROM public.rent_reminders
  WHERE id = p_reminder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengingat sewa tidak ditemukan';
  END IF;

  -- 3. Otorisasi (SEC-1.1): Harus service_role, platform admin, owner, atau generate_billing
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR public.is_tenant_owner(v_reminder.tenant_id)
    OR public.has_permission(v_reminder.tenant_id, 'generate_billing')
  ) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  -- 4. Update status dan siapa yang mengirim/menandai
  UPDATE public.rent_reminders
  SET status = p_status,
      sent_by = auth.uid(),
      sent_at = now(),
      updated_at = now()
  WHERE id = p_reminder_id;

  RETURN jsonb_build_object(
    'success', true,
    'reminder_id', p_reminder_id,
    'status', p_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_rent_reminder(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_rent_reminder(UUID, TEXT) TO authenticated, service_role;


-- 6c. get_kos_arrears
CREATE OR REPLACE FUNCTION public.get_kos_arrears(
  p_tenant_id UUID
)
RETURNS TABLE (
  member_id       UUID,
  nama            TEXT,
  unit            TEXT,
  total_due       NUMERIC,
  bills_count     INT,
  bill_count      INT,
  oldest_due_date DATE,
  days_late       INT,
  bucket          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
  -- 1. Otorisasi (SEC-1.1 & KOS-5)
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR public.is_tenant_owner(p_tenant_id)
    OR public.has_permission(p_tenant_id, 'generate_billing')
  ) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(b.member_id, c.member_id) AS member_id,
    COALESCE(m.full_name, c.tenant_name, b.metadata->>'member_name', 'Penyewa')::TEXT AS nama,
    u.label::TEXT AS unit,
    SUM(b.amount + COALESCE(b.late_fee, 0))::NUMERIC AS total_due,
    COUNT(b.id)::INT AS bills_count,
    COUNT(b.id)::INT AS bill_count,
    MIN(b.due_date) AS oldest_due_date,
    (v_today - MIN(b.due_date))::INT AS days_late,
    CASE
      WHEN (v_today - MIN(b.due_date)) <= 7 THEN '0-7'
      WHEN (v_today - MIN(b.due_date)) <= 30 THEN '8-30'
      ELSE '>30'
    END::TEXT AS bucket
  FROM public.billing_items b
  JOIN public.kos_contracts c ON c.id = b.contract_id
  JOIN public.tenant_units u ON u.id = b.unit_id
  LEFT JOIN public.tenant_members m ON m.id = COALESCE(b.member_id, c.member_id)
  WHERE b.tenant_id = p_tenant_id
    AND b.contract_id IS NOT NULL
    AND b.status = 'unpaid'
    AND b.due_date < v_today
  GROUP BY
    COALESCE(b.member_id, c.member_id),
    COALESCE(m.full_name, c.tenant_name, b.metadata->>'member_name', 'Penyewa'),
    u.label
  ORDER BY days_late DESC, total_due DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_kos_arrears(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kos_arrears(UUID) TO authenticated, service_role;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP FUNCTION IF EXISTS public.get_kos_arrears(UUID);
-- DROP FUNCTION IF EXISTS public.mark_rent_reminder(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.waive_late_fee(UUID, TEXT);
-- DROP TABLE IF EXISTS public.rent_reminders CASCADE;
-- DROP FUNCTION IF EXISTS public.run_kos_collections(DATE);
-- ALTER TABLE public.kos_contracts DROP CONSTRAINT IF EXISTS ck_kos_contracts_late_fee_rule;
-- ALTER TABLE public.kos_contracts DROP COLUMN IF EXISTS late_fee_rule;
-- DROP FUNCTION IF EXISTS public.validate_late_fee_rule(JSONB);
