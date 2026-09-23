-- Migration: Create opening balance RPC and partial cash index
-- Sub-Gate: 8.1-C3 (Database RPC & Partial Index Migration)
-- Date: 2026-09-22
-- Target: RuangWarga-dev (jqbegedjsylhrqpknwor)

BEGIN;

-- ============================================================
-- 1. COMPOSITE PARTIAL INDEX FOR MONETARY CASH PAYMENTS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_payments_tenant_cash
  ON public.payments(tenant_id, paid_at)
  WHERE status = 'completed' AND amount > 0;

-- ============================================================
-- 2. OPENING BALANCE RPC FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_tenant_opening_balance(
  p_tenant_id uuid,
  p_before_date date
)
RETURNS numeric(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inflow_payments numeric(12,2);
  v_inflow_non_ipl numeric(12,2);
  v_outflow_expenses numeric(12,2);
  v_start_timestamptz timestamptz;
BEGIN
  -- 1. Security Check: Strict internal tenant authorization (SECURITY DEFINER barrier)
  IF NOT (
    public.is_platform_admin()
    OR public.is_tenant_owner(p_tenant_id)
    OR p_tenant_id IN (SELECT public.current_tenant_ids())
  ) THEN
    RAISE EXCEPTION 'Access denied for tenant %', p_tenant_id USING ERRCODE = '42501';
  END IF;

  -- 2. Construct Asia/Jakarta boundary timestamp for timestamptz fields
  -- p_before_date is interpreted as p_before_date 00:00:00+07:00 (WIB)
  v_start_timestamptz := (p_before_date::text || ' 00:00:00+07')::timestamptz;

  -- 3. Inflow: Completed monetary payments strictly before period start (Patch 2: paid_at IS NOT NULL)
  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_inflow_payments
  FROM public.payments
  WHERE tenant_id = p_tenant_id
    AND status = 'completed'
    AND amount > 0
    AND paid_at IS NOT NULL
    AND paid_at < v_start_timestamptz;

  -- 4. Inflow: Verified non-IPL incomes strictly before period start (Patch 3: legacy compatibility)
  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_inflow_non_ipl
  FROM public.non_ipl_incomes
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
    AND amount > 0
    AND COALESCE(metadata->>'status', 'verified') != 'rejected'
    AND income_date < p_before_date;

  -- 5. Outflow: Expenses strictly before period start (Patch 9: verified schema)
  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_outflow_expenses
  FROM public.expenses
  WHERE tenant_id = p_tenant_id
    AND amount > 0
    AND expense_date < p_before_date;

  RETURN (v_inflow_payments + v_inflow_non_ipl - v_outflow_expenses);
END;
$$;

-- ============================================================
-- 3. FUNCTION OWNERSHIP & PRIVILEGE HARDENING
-- ============================================================

ALTER FUNCTION public.get_tenant_opening_balance(uuid, date) OWNER TO postgres;

-- Revoke all execute privileges from PUBLIC and anon
REVOKE ALL ON FUNCTION public.get_tenant_opening_balance(uuid, date) FROM PUBLIC, anon;

-- Grant execute only to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.get_tenant_opening_balance(uuid, date) TO authenticated, service_role;

COMMIT;

-- ============================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.get_tenant_opening_balance(uuid, date);
-- DROP INDEX IF EXISTS public.idx_payments_tenant_cash;
-- ============================================================
