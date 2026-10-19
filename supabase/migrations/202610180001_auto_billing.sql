-- Migration: Auto Billing Automation for Multi-Tenant SaaS
-- Task: BILL-AUTO-1.1 (Ref: docs/handoff/BILL-AUTO-1.md)
-- Date: 2026-10-18
--
-- Fitur:
-- 1. Mengaktifkan ekstensi pg_cron.
-- 2. Membuat tabel public.billing_auto_runs untuk audit trail penerbitan otomatis + RLS.
-- 3. Membuat fungsi public.generate_auto_bills_for_tenant(uuid, text) SECURITY DEFINER.
-- 4. Membuat fungsi public.run_auto_billing(date) SECURITY DEFINER.
-- 5. Revoke eksekusi fungsi dari PUBLIC, anon, authenticated; Grant ke service_role.
-- 6. Menjadwalkan cron job harian pada 17:05 UTC (00:05 WIB) secara idempoten.

BEGIN;

-- ==============================================================================
-- 1. EXTENSION pg_cron
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ==============================================================================
-- 2. TABEL public.billing_auto_runs (Riwayat Penerbitan Tagihan Otomatis)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.billing_auto_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period        TEXT NOT NULL,
  run_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_billing_auto_runs_tenant_id ON public.billing_auto_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_auto_runs_period ON public.billing_auto_runs(period);
CREATE INDEX IF NOT EXISTS idx_billing_auto_runs_run_at ON public.billing_auto_runs(run_at DESC);

-- RLS: Pengurus tenant atau platform admin dapat membaca riwayat
ALTER TABLE public.billing_auto_runs ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.billing_auto_runs FROM anon, authenticated;

DROP POLICY IF EXISTS "billing_auto_runs_select" ON public.billing_auto_runs;
CREATE POLICY "billing_auto_runs_select" ON public.billing_auto_runs
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR public.is_tenant_owner(tenant_id)
    OR public.has_permission(tenant_id, 'generate_billing')
    OR public.has_permission(tenant_id, 'manage_settings')
  );

-- Catatan: Hak INSERT/UPDATE/DELETE dicabut dari anon dan authenticated;
-- hanya fungsi SECURITY DEFINER atau service_role yang dapat menulis riwayat.

-- ==============================================================================
-- 3. FUNCTION public.generate_auto_bills_for_tenant(p_tenant_id, p_period)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.generate_auto_bills_for_tenant(
  p_tenant_id UUID,
  p_period TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant RECORD;
  v_unit RECORD;
  v_member_id UUID;
  v_member_name TEXT;
  v_total_amount NUMERIC(12,2) := 0;
  v_due_date DATE;
  v_due_day INT;
  v_year INT;
  v_month INT;
  v_days_in_month INT;
  v_clamped_due_day INT;
  v_created_count INT := 0;
  v_skipped_count INT := 0;
  v_bill_id UUID;
  v_kos_res JSONB;
  v_error TEXT := NULL;
BEGIN
  -- Validasi parameter
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id tidak boleh null';
  END IF;

  IF p_period IS NULL OR p_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Format periode tidak valid. Gunakan format YYYY-MM';
  END IF;

  SELECT t.id, t.type, t.settings
  INTO v_tenant
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'created', 0,
      'skipped', 0,
      'error', 'Tenant tidak ditemukan'
    );
  END IF;

  -- 3.1 Cabang tipe rt_rw: Terbitkan tagihan IPL untuk seluruh unit aktif
  IF v_tenant.type = 'rt_rw' THEN
    -- Hitung total amount dari settings->'ipl_components'
    IF v_tenant.settings IS NOT NULL
       AND (v_tenant.settings ? 'ipl_components')
       AND jsonb_typeof(v_tenant.settings->'ipl_components') = 'array'
       AND jsonb_array_length(v_tenant.settings->'ipl_components') > 0 THEN
      SELECT COALESCE(SUM(
        CASE
          WHEN (elem->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (elem->>'amount')::NUMERIC(12,2)
          ELSE 0
        END
      ), 0)
      INTO v_total_amount
      FROM jsonb_array_elements(v_tenant.settings->'ipl_components') AS elem;
    ELSE
      v_total_amount := 0;
    END IF;

    -- Bila amount 0 / tidak ada komponen -> JANGAN buat tagihan, catat error
    IF v_total_amount <= 0 THEN
      RETURN jsonb_build_object(
        'created', 0,
        'skipped', 0,
        'error', 'Komponen IPL belum diatur'
      );
    END IF;

    -- Hitung due_date: settings->>'due_day' (default 10), clamp ke hari terakhir bulan berjalan
    v_year := split_part(p_period, '-', 1)::INT;
    v_month := split_part(p_period, '-', 2)::INT;
    IF v_month < 1 OR v_month > 12 THEN
      RETURN jsonb_build_object(
        'created', 0,
        'skipped', 0,
        'error', 'Bulan periode tidak valid'
      );
    END IF;

    v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', make_date(v_year, v_month, 1)) + interval '1 month' - interval '1 day'))::INT;

    IF v_tenant.settings IS NOT NULL AND (v_tenant.settings->>'due_day') ~ '^[0-9]{1,2}$' THEN
      v_due_day := (v_tenant.settings->>'due_day')::INT;
    ELSE
      v_due_day := 10;
    END IF;

    v_clamped_due_day := LEAST(GREATEST(v_due_day, 1), v_days_in_month);
    v_due_date := make_date(v_year, v_month, v_clamped_due_day);

    -- Loop setiap unit aktif yang dimiliki tenant
    FOR v_unit IN
      SELECT u.id, u.label
      FROM public.tenant_units u
      WHERE u.tenant_id = p_tenant_id
        AND u.status = 'active'
      ORDER BY u.id ASC
    LOOP
      -- Cek apakah unit sudah memiliki tagihan IPL pada periode ini (status <> 'cancelled')
      IF EXISTS (
        SELECT 1
        FROM public.billing_items b
        WHERE b.tenant_id = p_tenant_id
          AND b.unit_id = v_unit.id
          AND b.period = p_period
          AND (b.metadata->>'bill_type') = 'ipl'
          AND b.status <> 'cancelled'
      ) THEN
        v_skipped_count := v_skipped_count + 1;
      ELSE
        -- Ambil member approved yang tertaut ke unit bila ada (ambil yang pertama)
        v_member_id := NULL;
        v_member_name := NULL;

        SELECT tm.id, tm.full_name
        INTO v_member_id, v_member_name
        FROM public.tenant_members tm
        WHERE tm.tenant_id = p_tenant_id
          AND tm.unit_id = v_unit.id
          AND tm.status = 'approved'
        ORDER BY tm.created_at ASC
        LIMIT 1;

        -- Insert tagihan IPL baru secara idempoten
        INSERT INTO public.billing_items (
          tenant_id,
          unit_id,
          member_id,
          period,
          amount,
          late_fee,
          due_date,
          status,
          metadata
        ) VALUES (
          p_tenant_id,
          v_unit.id,
          v_member_id,
          p_period,
          v_total_amount,
          0,
          v_due_date,
          'unpaid',
          jsonb_build_object(
            'bill_type', 'ipl',
            'auto_generated', true,
            'components', COALESCE(v_tenant.settings->'ipl_components', '[]'::jsonb),
            'unit_label', v_unit.label,
            'member_name', COALESCE(v_member_name, 'Belum Terdaftar / Kosong')
          )
        )
        ON CONFLICT (tenant_id, unit_id, period)
        WHERE ((metadata->>'bill_type') = 'ipl' AND status <> 'cancelled')
        DO NOTHING
        RETURNING id INTO v_bill_id;

        IF v_bill_id IS NOT NULL THEN
          v_created_count := v_created_count + 1;
        ELSE
          v_skipped_count := v_skipped_count + 1;
        END IF;
      END IF;
    END LOOP;

    RETURN jsonb_build_object(
      'created', v_created_count,
      'skipped', v_skipped_count,
      'error', NULL
    );

  -- 3.2 Cabang tipe kos: Memakai ulang RPC auto_generate_kos_billing
  ELSIF v_tenant.type = 'kos' THEN
    BEGIN
      v_kos_res := public.auto_generate_kos_billing(p_period, p_tenant_id);
      v_created_count := COALESCE((v_kos_res->>'generated_count')::INT, 0);
      v_skipped_count := COALESCE((v_kos_res->>'skipped_count')::INT, 0);
    EXCEPTION WHEN OTHERS THEN
      v_created_count := 0;
      v_skipped_count := 0;
      v_error := SQLERRM;
    END;

    RETURN jsonb_build_object(
      'created', v_created_count,
      'skipped', v_skipped_count,
      'error', v_error
    );

  -- 3.3 Cabang tipe lain (arisan, kelas): belum diotomasi, lewati tanpa error
  ELSE
    RETURN jsonb_build_object(
      'created', 0,
      'skipped', 0,
      'error', NULL
    );
  END IF;
END;
$$;

-- ==============================================================================
-- 4. FUNCTION public.run_auto_billing(p_today date default ...)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.run_auto_billing(
  p_today DATE DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date
)
RETURNS INTEGER
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

  -- Loop setiap tenant yang mengaktifkan auto-billing, tanggal terbit sesuai hari ini,
  -- dan berstatus langganan trial atau active (bukan read_only / suspended).
  FOR v_tenant IN
    SELECT t.id
    FROM public.tenants t
    WHERE (t.settings->>'auto_billing_enabled') = 'true'
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

  RETURN v_processed_count;
END;
$$;

-- ==============================================================================
-- 5. GRANTS & SECURITY DEFINER PRIVILEGES
-- Cabut akses eksekusi dari PUBLIC, anon, dan authenticated; hanya service_role
-- ==============================================================================
REVOKE ALL ON FUNCTION public.generate_auto_bills_for_tenant(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_auto_bills_for_tenant(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.run_auto_billing(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_auto_billing(DATE) TO service_role;

-- ==============================================================================
-- 6. JADWAL PG_CRON (Idempoten: Unschedule jika sudah ada, jadwalkan 17:05 UTC)
-- 17:05 UTC = 00:05 WIB
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'cron' AND table_name = 'job'
  ) THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ruangwarga-auto-billing') THEN
      PERFORM cron.unschedule('ruangwarga-auto-billing');
    END IF;
  END IF;
END $$;

SELECT cron.schedule('ruangwarga-auto-billing', '5 17 * * *', $$SELECT public.run_auto_billing();$$);

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DO $$
-- BEGIN
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables 
--     WHERE table_schema = 'cron' AND table_name = 'job'
--   ) THEN
--     IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ruangwarga-auto-billing') THEN
--       PERFORM cron.unschedule('ruangwarga-auto-billing');
--     END IF;
--   END IF;
-- END $$;
-- DROP FUNCTION IF EXISTS public.run_auto_billing(DATE);
-- DROP FUNCTION IF EXISTS public.generate_auto_bills_for_tenant(UUID, TEXT);
-- DROP TABLE IF EXISTS public.billing_auto_runs; -- mencakup drop policy RLS dan revoke hak akses
