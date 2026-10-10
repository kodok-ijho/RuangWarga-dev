-- Migration: Catat Riwayat Perubahan Rekening Tenant (tenant_settings_audit)
-- Task: SEC-3.3 (Ref: docs/handoff/SEC-3.md, PAY-2-review.md F12)

BEGIN;

-- ==============================================================================
-- 1. TABEL tenant_settings_audit
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_settings_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  changed_by  UUID,
  field       TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  changed_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_audit_tenant_field_changed
  ON public.tenant_settings_audit (tenant_id, field, changed_at DESC);

-- ==============================================================================
-- 2. ROW LEVEL SECURITY (RLS)
-- Hanya platform admin atau tenant owner yang dapat melihat riwayat audit.
-- Tidak ada policy INSERT/UPDATE/DELETE untuk klien (audit murni dibuat oleh trigger).
-- ==============================================================================

ALTER TABLE public.tenant_settings_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_settings_audit' AND policyname = 'tenant_settings_audit_select'
  ) THEN
    CREATE POLICY "tenant_settings_audit_select" ON public.tenant_settings_audit
      FOR SELECT USING (
        public.is_platform_admin() OR public.is_tenant_owner(tenant_id)
      );
  END IF;
END $$;

-- ==============================================================================
-- 3. TRIGGER AUDIT PADA TABEL tenants (AFTER UPDATE)
-- Mencatat perubahan rekening bank ke tenant_settings_audit
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.log_tenant_settings_bank_account_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.settings->'bank_account') IS DISTINCT FROM (NEW.settings->'bank_account') THEN
    INSERT INTO public.tenant_settings_audit (
      tenant_id,
      changed_by,
      field,
      old_value,
      new_value,
      changed_at
    ) VALUES (
      NEW.id,
      auth.uid(),
      'bank_account',
      OLD.settings->'bank_account',
      NEW.settings->'bank_account',
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_tenant_settings_bank_account_audit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_tenant_settings_bank_account_audit
  AFTER UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.log_tenant_settings_bank_account_audit();

COMMIT;

-- ROLLBACK (manual via psql / superuser bila diperlukan):
-- ALTER TABLE public.tenants DISABLE TRIGGER trg_tenant_settings_bank_account_audit;
