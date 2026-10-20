-- Migration: Acara Multi-Tenant: Tabel & RLS
-- Task: RTRW-3.2a (Ref: docs/handoff/RTRW-3.md § RTRW-3.2)
-- Date: 2026-10-20
--
-- Fitur:
-- 1. Membuat tabel public.tenant_events untuk agenda kegiatan/acara per tenant.
-- 2. Index (tenant_id, starts_at) untuk memudahkan pemilahan feed acara mendatang dan selesai.
-- 3. Trigger sentuhan updated_at memakai public.touch_updated_at().
-- 4. RLS policies persis mengikuti pola tenant_announcements:
--    - SELECT: platform admin, anggota tenant approved (current_tenant_ids), atau tenant owner.
--    - INSERT/UPDATE/DELETE: can_manage_announcements(tenant_id) dan subscription bukan read_only.
-- 5. Hak akses: REVOKE ALL dari anon, GRANT SELECT, INSERT, UPDATE, DELETE ke authenticated dan service_role.

BEGIN;

-- ==============================================================================
-- 1. TABEL public.tenant_events
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.tenant_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 150),
  description   TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
  location      TEXT NULL CHECK (location IS NULL OR char_length(location) <= 200),
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NULL,
  image_path    TEXT NULL CHECK (image_path IS NULL OR public.is_valid_announcement_image_path(image_path)),
  created_by    UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tenant_events_ends_at CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

-- Index agenda/kegiatan tenant berdasarkan waktu mulai
CREATE INDEX IF NOT EXISTS idx_tenant_events_tenant_starts_at
  ON public.tenant_events (tenant_id, starts_at);

-- Trigger sentuhan updated_at
DROP TRIGGER IF EXISTS trg_tenant_events_updated ON public.tenant_events;
CREATE TRIGGER trg_tenant_events_updated
  BEFORE UPDATE ON public.tenant_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ==============================================================================
-- 2. RLS & PRIVILEGES
-- ==============================================================================
ALTER TABLE public.tenant_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_events TO authenticated, service_role;

DROP POLICY IF EXISTS "tenant_events_select" ON public.tenant_events;
CREATE POLICY "tenant_events_select" ON public.tenant_events
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR public.is_tenant_owner(tenant_id)
  );

DROP POLICY IF EXISTS "tenant_events_insert" ON public.tenant_events;
CREATE POLICY "tenant_events_insert" ON public.tenant_events
  FOR INSERT
  WITH CHECK (
    public.can_manage_announcements(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

DROP POLICY IF EXISTS "tenant_events_update" ON public.tenant_events;
CREATE POLICY "tenant_events_update" ON public.tenant_events
  FOR UPDATE
  USING (
    public.can_manage_announcements(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  )
  WITH CHECK (
    public.can_manage_announcements(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

DROP POLICY IF EXISTS "tenant_events_delete" ON public.tenant_events;
CREATE POLICY "tenant_events_delete" ON public.tenant_events
  FOR DELETE
  USING (
    public.can_manage_announcements(tenant_id)
    AND public.tenant_subscription_status(tenant_id) <> 'read_only'::public.subscription_status
  );

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP TABLE IF EXISTS public.tenant_events CASCADE;
