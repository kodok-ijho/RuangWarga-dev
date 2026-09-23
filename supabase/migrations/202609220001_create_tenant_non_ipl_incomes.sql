-- Migration: Create tenant_non_ipl_incomes table with multi-tenant RLS
-- Sub-Gate: 8.1-B2 (Legacy Tenant Mapping / Finance Schema Preparation)
-- Date: 2026-09-22
-- Target: RuangWarga-dev (Multi-Tenant SaaS)

BEGIN;

-- ============================================================
-- 1. TABLE DEFINITION
-- ============================================================

CREATE TABLE IF NOT EXISTS public.non_ipl_incomes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  income_date       DATE NOT NULL,
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category          TEXT NOT NULL CHECK (length(btrim(category)) > 0),
  source_name       TEXT NOT NULL CHECK (length(btrim(source_name)) > 0),
  description       TEXT,
  payment_method    TEXT NOT NULL DEFAULT 'other',
  reference_number  TEXT,
  receipt_url       TEXT,
  recorded_by       UUID REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  deleted_by        UUID REFERENCES public.tenant_members(id) ON DELETE SET NULL
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_non_ipl_incomes_tenant_date
  ON public.non_ipl_incomes(tenant_id, income_date);

CREATE INDEX IF NOT EXISTS idx_non_ipl_incomes_category
  ON public.non_ipl_incomes(category);

CREATE INDEX IF NOT EXISTS idx_non_ipl_incomes_deleted_at
  ON public.non_ipl_incomes(deleted_at);

-- ============================================================
-- 3. TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_non_ipl_incomes_updated ON public.non_ipl_incomes;
CREATE TRIGGER trg_non_ipl_incomes_updated
  BEFORE UPDATE ON public.non_ipl_incomes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.non_ipl_incomes ENABLE ROW LEVEL SECURITY;

-- SELECT: Platform admin, tenant owner, or active members of the tenant
DROP POLICY IF EXISTS "non_ipl_incomes_select" ON public.non_ipl_incomes;
CREATE POLICY "non_ipl_incomes_select" ON public.non_ipl_incomes
  FOR SELECT USING (
    is_platform_admin()
    OR is_tenant_owner(tenant_id)
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

-- INSERT: Authorized staff when subscription is active/trial
DROP POLICY IF EXISTS "non_ipl_incomes_insert" ON public.non_ipl_incomes;
CREATE POLICY "non_ipl_incomes_insert" ON public.non_ipl_incomes
  FOR INSERT WITH CHECK (
    (tenant_subscription_status(tenant_id) = ANY (ARRAY['trial'::subscription_status, 'active'::subscription_status]))
    AND (
      is_platform_admin()
      OR is_tenant_owner(tenant_id)
      OR has_permission(tenant_id, 'manage_billing_cash'::text)
      OR has_permission(tenant_id, 'manage_expenses'::text)
    )
  );

-- UPDATE: Authorized staff when subscription is active/trial
DROP POLICY IF EXISTS "non_ipl_incomes_update" ON public.non_ipl_incomes;
CREATE POLICY "non_ipl_incomes_update" ON public.non_ipl_incomes
  FOR UPDATE USING (
    (tenant_subscription_status(tenant_id) = ANY (ARRAY['trial'::subscription_status, 'active'::subscription_status]))
    AND (
      is_platform_admin()
      OR is_tenant_owner(tenant_id)
      OR has_permission(tenant_id, 'manage_billing_cash'::text)
      OR has_permission(tenant_id, 'manage_expenses'::text)
    )
  ) WITH CHECK (
    (tenant_subscription_status(tenant_id) = ANY (ARRAY['trial'::subscription_status, 'active'::subscription_status]))
    AND (
      is_platform_admin()
      OR is_tenant_owner(tenant_id)
      OR has_permission(tenant_id, 'manage_billing_cash'::text)
      OR has_permission(tenant_id, 'manage_expenses'::text)
    )
  );

-- DELETE: Authorized staff when subscription is active/trial
DROP POLICY IF EXISTS "non_ipl_incomes_delete" ON public.non_ipl_incomes;
CREATE POLICY "non_ipl_incomes_delete" ON public.non_ipl_incomes
  FOR DELETE USING (
    (tenant_subscription_status(tenant_id) = ANY (ARRAY['trial'::subscription_status, 'active'::subscription_status]))
    AND (
      is_platform_admin()
      OR is_tenant_owner(tenant_id)
      OR has_permission(tenant_id, 'manage_billing_cash'::text)
      OR has_permission(tenant_id, 'manage_expenses'::text)
    )
  );

COMMIT;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.non_ipl_incomes CASCADE;
