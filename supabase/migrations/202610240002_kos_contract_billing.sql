-- Migration: Fungsi pembuatan kontrak kos, penagihan berkala per tanggal masuk, checkout, dan auto billing
-- Task: KOS-2.2 (Ref: docs/handoff/KOS-2.md)
-- Date: 2026-10-24

BEGIN;

-- ==============================================================================
-- 1. FUNCTION public.create_kos_contract
-- Membuat kontrak sewa baru, menyinkronkan kamar, dan menerbitkan tagihan pertama
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_kos_contract(
  p_tenant_id   UUID,
  p_unit_id     BIGINT,
  p_member_id   UUID DEFAULT NULL,
  p_tenant_name TEXT DEFAULT NULL,
  p_rent_price  NUMERIC DEFAULT 0,
  p_start_date  DATE DEFAULT CURRENT_DATE,
  p_months      INT DEFAULT NULL,
  p_grace_days  INT DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL
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
    v_end_date := (p_start_date + (p_months || ' month')::interval - interval '1 day')::date;
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
    created_by
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
    auth.uid()
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
  v_service_end := (p_start_date + interval '1 month' - interval '1 day')::date;
  IF v_end_date IS NOT NULL AND v_service_end > v_end_date THEN
    v_service_end := v_end_date;
  END IF;

  v_period := to_char(v_service_start, 'YYYY-MM');
  v_due_date := v_service_start + v_grace_days;

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
    p_rent_price,
    0,
    v_due_date,
    'unpaid',
    v_contract_id,
    v_service_start,
    v_service_end,
    jsonb_build_object(
      'bill_type', 'rent',
      'auto_generated', false,
      'unit_label', v_unit.label,
      'member_name', v_tenant_display_name,
      'contract_period_index', 0,
      'notes', 'Tagihan sewa periode pertama (kontrak baru)'
    )
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
    'grace_days', v_grace_days
  );
END;
$$;


-- ==============================================================================
-- 2. FUNCTION public.generate_kos_contract_bills
-- Menerbitkan tagihan periode jatuh tempo untuk semua kontrak aktif (idempoten & catch-up)
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
    v_n := 0;
    LOOP
      -- Periode ke-n dihitung dari start_date (PostgreSQL clamp otomatis tanggal akhir bulan)
      v_service_start := (v_contract.start_date + (v_n || ' month')::interval)::date;

      -- Berhenti jika service_start belum tiba (belum tanggalnya)
      IF v_service_start > v_today THEN
        EXIT;
      END IF;

      -- Berhenti jika kontrak memiliki end_date dan masa sewa telah melampaui end_date
      IF v_contract.end_date IS NOT NULL AND v_service_start > v_contract.end_date THEN
        EXIT;
      END IF;

      v_service_end := (v_contract.start_date + ((v_n + 1) || ' month')::interval - interval '1 day')::date;
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
          v_contract.rent_price,
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
            'contract_period_index', v_n
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
-- 3. FUNCTION public.auto_generate_kos_billing (WRAPPER KOMPATIBILITAS)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.auto_generate_kos_billing(
  p_period    TEXT,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res JSONB;
BEGIN
  -- Mendelegasikan ke generate_kos_contract_bills per aturan KOS-2
  v_res := public.generate_kos_contract_bills(
    (now() AT TIME ZONE 'Asia/Jakarta')::date,
    p_tenant_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'period', p_period,
    'generated_count', COALESCE((v_res->>'generated_count')::INT, 0),
    'skipped_count', COALESCE((v_res->>'skipped_count')::INT, 0)
  );
END;
$$;


-- ==============================================================================
-- 4. FUNCTION public.checkout_kos_room (DIPERBARUI DENGAN PENGAKHIRAN KONTRAK)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.checkout_kos_room(
  p_tenant_id           UUID,
  p_unit_id             BIGINT,
  p_checkout_date       DATE DEFAULT CURRENT_DATE,
  p_reason              TEXT DEFAULT NULL,
  p_cancel_future_bills BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unit RECORD;
  v_member_id UUID;
  v_cancelled_bills_count INT := 0;
  v_checkout_period TEXT;
  v_updated_metadata JSONB;
  v_checkout_dt DATE := COALESCE(p_checkout_date, (now() AT TIME ZONE 'Asia/Jakarta')::date);
BEGIN
  -- Guard otorisasi (SEC-1.1)
  IF NOT (auth.role() = 'service_role' OR public.has_permission(p_tenant_id, 'manage_members')) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  SELECT u.id, u.tenant_id, u.label, u.status, u.metadata
  INTO v_unit
  FROM public.tenant_units u
  WHERE u.id = p_unit_id AND u.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kamar/unit tidak ditemukan pada tenant ini';
  END IF;

  -- 1. Akhiri Kontrak Sewa Aktif di Kamar Ini
  UPDATE public.kos_contracts
  SET status = 'ended',
      end_date = LEAST(COALESCE(end_date, v_checkout_dt), v_checkout_dt),
      ended_at = now(),
      end_reason = COALESCE(p_reason, 'checkout')
  WHERE unit_id = p_unit_id AND status = 'active';

  -- 2. Dapatkan Member ID penyewa
  IF (v_unit.metadata ? 'tenant_member_id') AND (v_unit.metadata->>'tenant_member_id') IS NOT NULL AND (v_unit.metadata->>'tenant_member_id') != '' THEN
    BEGIN
      v_member_id := (v_unit.metadata->>'tenant_member_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_member_id := NULL;
    END IF;
  END IF;

  IF v_member_id IS NULL THEN
    SELECT tm.id INTO v_member_id
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.unit_id = p_unit_id
      AND tm.status = 'approved'
    LIMIT 1;
  END IF;

  v_checkout_period := to_char(v_checkout_dt, 'YYYY-MM');

  -- 3. Set Kamar menjadi Vacant dengan metadata checkout
  -- Aktifkan flag session agar guard trigger mengizinkan
  PERFORM set_config('ruangwarga.kos_contract_sync', 'on', true);

  v_updated_metadata := v_unit.metadata || jsonb_build_object(
    'last_checkout', jsonb_build_object(
      'checkout_date', v_checkout_dt,
      'reason', COALESCE(p_reason, 'Checkout penyewa'),
      'checked_out_at', now(),
      'previous_member_id', v_member_id,
      'previous_contract_start', v_unit.metadata->>'contract_start',
      'previous_contract_end', v_unit.metadata->>'contract_end'
    ),
    'previous_tenant_member_id', COALESCE(v_member_id::text, v_unit.metadata->>'tenant_member_id')
  );

  v_updated_metadata := v_updated_metadata - 'contract_start' - 'contract_end' - 'tenant_member_id' - 'contract_id' - 'notes';

  UPDATE public.tenant_units
  SET status = 'vacant',
      metadata = v_updated_metadata,
      updated_at = now()
  WHERE id = p_unit_id;

  PERFORM set_config('ruangwarga.kos_contract_sync', 'off', true);

  -- 4. Lepaskan unit dari anggota penyewa
  IF v_member_id IS NOT NULL THEN
    UPDATE public.tenant_members
    SET unit_id = NULL,
        occupancy_status = 'checkout',
        updated_at = now()
    WHERE id = v_member_id;
  ELSE
    UPDATE public.tenant_members
    SET unit_id = NULL,
        occupancy_status = 'checkout',
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND unit_id = p_unit_id;
  END IF;

  -- 5. Batalkan tagihan masa depan jika diminta
  IF p_cancel_future_bills THEN
    WITH cancelled AS (
      UPDATE public.billing_items
      SET status = 'cancelled',
          metadata = metadata || jsonb_build_object(
            'cancelled_reason', 'Checkout kamar lebih awal',
            'cancelled_at', now()
          ),
          updated_at = now()
      WHERE tenant_id = p_tenant_id
        AND unit_id = p_unit_id
        AND status = 'unpaid'
        AND (service_start > v_checkout_dt OR (service_start IS NULL AND period > v_checkout_period))
      RETURNING id
    )
    SELECT count(*) INTO v_cancelled_bills_count FROM cancelled;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'unit_id', p_unit_id,
    'unit_label', v_unit.label,
    'status', 'vacant',
    'checkout_date', v_checkout_dt,
    'cancelled_future_bills', v_cancelled_bills_count
  );
END;
$$;


-- ==============================================================================
-- 5. FUNCTION public.run_auto_billing (DIPERBARUI DENGAN BLOK KOS HARIAN)
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

  RETURN v_processed_count;
END;
$$;


-- ==============================================================================
-- 6. GRANTS & REVOKES
-- ==============================================================================
REVOKE ALL ON FUNCTION public.create_kos_contract(UUID, BIGINT, UUID, TEXT, NUMERIC, DATE, INT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_kos_contract(UUID, BIGINT, UUID, TEXT, NUMERIC, DATE, INT, INT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.generate_kos_contract_bills(DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_kos_contract_bills(DATE, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.auto_generate_kos_billing(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_generate_kos_billing(TEXT, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.checkout_kos_room(UUID, BIGINT, DATE, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_kos_room(UUID, BIGINT, DATE, TEXT, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.run_auto_billing(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_auto_billing(DATE) TO service_role;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP FUNCTION IF EXISTS public.create_kos_contract(UUID, BIGINT, UUID, TEXT, NUMERIC, DATE, INT, INT, TEXT);
-- DROP FUNCTION IF EXISTS public.generate_kos_contract_bills(DATE, UUID);
