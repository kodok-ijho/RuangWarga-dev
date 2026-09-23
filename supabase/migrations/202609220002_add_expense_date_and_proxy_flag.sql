-- Migration: Add expense_date and is_date_proxy to expenses table
-- Sub-Gate: 8.1-B3 (Historical Expense Date Migration)
-- Date: 2026-09-22
-- Target: RuangWarga-dev (Multi-Tenant SaaS)

BEGIN;

-- ============================================================
-- 1. HELPER FUNCTION: Calendar Date Validation
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_valid_calendar_date(p_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_text IS NULL OR p_text !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' THEN
    RETURN false;
  END IF;
  PERFORM p_text::date;
  RETURN true;
EXCEPTION WHEN datetime_field_overflow THEN
  RETURN false;
WHEN others THEN
  RETURN false;
END;
$$;

-- ============================================================
-- 2. ADD COLUMNS (NULLABLE INITIAL STAGE)
-- ============================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS expense_date DATE,
  ADD COLUMN IF NOT EXISTS is_date_proxy BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 3. BACKFILL FROM VERIFIED DATE METADATA
-- ============================================================

-- Backfill from metadata->>'date' if valid calendar date (VERIFIED_DATE)
UPDATE public.expenses
SET expense_date = (metadata->>'date')::date,
    is_date_proxy = false
WHERE expense_date IS NULL
  AND public.is_valid_calendar_date(metadata->>'date');

-- Backfill from created_at as PROXY_DATE only if metadata date is missing
UPDATE public.expenses
SET expense_date = (created_at AT TIME ZONE 'UTC')::date,
    is_date_proxy = true
WHERE expense_date IS NULL;

-- ============================================================
-- 4. VALIDATE ZERO NULLS & SET NOT NULL
-- ============================================================

DO $$
DECLARE
  v_null_count integer;
  v_invalid_amount_count integer;
  v_null_tenant_count integer;
BEGIN
  SELECT count(*) INTO v_null_count
  FROM public.expenses
  WHERE expense_date IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Sub-Gate 8.1-B3 ABORTED: Found % expenses with NULL expense_date', v_null_count;
  END IF;

  SELECT count(*) INTO v_invalid_amount_count
  FROM public.expenses
  WHERE amount < 0;

  IF v_invalid_amount_count > 0 THEN
    RAISE EXCEPTION 'Sub-Gate 8.1-B3 ABORTED: Found % expenses with negative amount', v_invalid_amount_count;
  END IF;

  SELECT count(*) INTO v_null_tenant_count
  FROM public.expenses
  WHERE tenant_id IS NULL;

  IF v_null_tenant_count > 0 THEN
    RAISE EXCEPTION 'Sub-Gate 8.1-B3 ABORTED: Found % expenses with NULL tenant_id', v_null_tenant_count;
  END IF;
END $$;

ALTER TABLE public.expenses
  ALTER COLUMN expense_date SET NOT NULL;

-- ============================================================
-- 5. CREATE COMPOSITE INDEX FOR REPORTING
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date
  ON public.expenses(tenant_id, expense_date);

COMMIT;

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_expenses_tenant_date;
-- ALTER TABLE public.expenses DROP COLUMN IF EXISTS is_date_proxy;
-- ALTER TABLE public.expenses DROP COLUMN IF EXISTS expense_date;
-- DROP FUNCTION IF EXISTS public.is_valid_calendar_date(text);
