-- Migration: Penjaga Kolom Kritis dan Pengaturan Tenant
-- Task: SEC-5.2 (Ref: docs/handoff/SEC-5.md, AUDIT-RTRW.md S4)
-- Date: 2026-10-13
--
-- 1. Trigger trg_guard_tenant_columns pada tabel tenants.
-- 2. Melarang modifikasi id, owner_id, type, dan created_at oleh pemanggil non-privileged.
-- 3. Mengamankan kunci legacy_qris_enabled agar tidak dapat dimanipulasi dari client.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_tenant_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Bypass untuk service_role, migrasi, dan platform admin
  IF public.is_billing_privileged() THEN
    RETURN NEW;
  END IF;

  -- 1. Operasi INSERT
  IF TG_OP = 'INSERT' THEN
    NEW.settings := coalesce(NEW.settings, '{}'::jsonb) - 'legacy_qris_enabled';
    RETURN NEW;
  END IF;

  -- 2. Operasi UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Lindungi kolom identitas dan kepemilikan tenant
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Kolom ini hanya dapat diubah oleh Platform Owner.' USING ERRCODE = '42501';
    END IF;

    -- Pertahankan status kunci legacy_qris_enabled dari nilai lama
    IF OLD.settings ? 'legacy_qris_enabled' THEN
      NEW.settings := coalesce(NEW.settings, '{}'::jsonb) || jsonb_build_object('legacy_qris_enabled', OLD.settings->'legacy_qris_enabled');
    ELSE
      NEW.settings := coalesce(NEW.settings, '{}'::jsonb) - 'legacy_qris_enabled';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_tenant_columns() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_guard_tenant_columns
  BEFORE INSERT OR UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_tenant_columns();

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- ALTER TABLE public.tenants DISABLE TRIGGER trg_guard_tenant_columns;
