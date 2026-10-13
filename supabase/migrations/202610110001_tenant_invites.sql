-- Migration: Pindahkan invite_code ke Tabel Privat tenant_invites
-- Task: SEC-3.1 (Ref: docs/handoff/SEC-3.md, PAY-2-review.md F12)

BEGIN;

-- ==============================================================================
-- 1. TABEL tenant_invites & INDEX UNIQUE CASE-INSENSITIVE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_invites (
  tenant_id   UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_invites_code_upper
  ON public.tenant_invites (upper(code));

-- ==============================================================================
-- 2. ROW LEVEL SECURITY (RLS)
-- Hanya platform admin, tenant owner, atau yang memiliki permission manage_members
-- Tidak ada akses untuk anon atau anggota biasa.
-- ==============================================================================

ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_invites' AND policyname = 'tenant_invites_select'
  ) THEN
    CREATE POLICY "tenant_invites_select" ON public.tenant_invites
      FOR SELECT USING (
        public.is_platform_admin()
        OR public.is_tenant_owner(tenant_id)
        OR public.has_permission(tenant_id, 'manage_members')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_invites' AND policyname = 'tenant_invites_insert'
  ) THEN
    CREATE POLICY "tenant_invites_insert" ON public.tenant_invites
      FOR INSERT WITH CHECK (
        public.is_platform_admin()
        OR public.is_tenant_owner(tenant_id)
        OR public.has_permission(tenant_id, 'manage_members')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_invites' AND policyname = 'tenant_invites_update'
  ) THEN
    CREATE POLICY "tenant_invites_update" ON public.tenant_invites
      FOR UPDATE USING (
        public.is_platform_admin()
        OR public.is_tenant_owner(tenant_id)
        OR public.has_permission(tenant_id, 'manage_members')
      ) WITH CHECK (
        public.is_platform_admin()
        OR public.is_tenant_owner(tenant_id)
        OR public.has_permission(tenant_id, 'manage_members')
      );
  END IF;
END $$;

-- ==============================================================================
-- 3. BACKFILL DATA EXISTING
-- Pindahkan data invite_code dari settings tenants ke tenant_invites
-- ==============================================================================

INSERT INTO public.tenant_invites (tenant_id, code, created_at, updated_at)
SELECT id, settings->>'invite_code', now(), now()
FROM public.tenants
WHERE coalesce(settings->>'invite_code', '') <> ''
ON CONFLICT (tenant_id) DO UPDATE
  SET code = EXCLUDED.code,
      updated_at = now();

-- ==============================================================================
-- 4. HAPUS KUNCI invite_code DARI settings DI TABEL tenants
-- ==============================================================================

UPDATE public.tenants
SET settings = settings - 'invite_code'
WHERE settings ? 'invite_code';

-- ==============================================================================
-- 5. JARING PENGAMAN: TRIGGER PADA TABEL tenants
-- Mencegah penulisan invite_code kembali ke kolom JSONB settings
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_tenant_invite_code_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.settings ? 'invite_code' THEN
    IF coalesce(NEW.settings->>'invite_code', '') <> '' THEN
      INSERT INTO public.tenant_invites (tenant_id, code, updated_at)
      VALUES (NEW.id, NEW.settings->>'invite_code', now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET code = EXCLUDED.code,
            updated_at = now();
    END IF;
    NEW.settings := NEW.settings - 'invite_code';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_tenant_invite_code_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.settings ? 'invite_code' THEN
    IF coalesce(NEW.settings->>'invite_code', '') <> '' THEN
      INSERT INTO public.tenant_invites (tenant_id, code, updated_at)
      VALUES (NEW.id, NEW.settings->>'invite_code', now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET code = EXCLUDED.code,
            updated_at = now();
    END IF;
    UPDATE public.tenants
    SET settings = settings - 'invite_code'
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_tenant_invite_code_before_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_tenant_invite_code_after_insert() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_sync_tenant_invite_code_before_update
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_invite_code_before_update();

CREATE OR REPLACE TRIGGER trg_sync_tenant_invite_code_after_insert
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_invite_code_after_insert();

-- ==============================================================================
-- 6. PERBARUI RPC PUBLIK: get_invite_details(p_code TEXT)
-- Mencari kode undangan di tabel privat tenant_invites
-- Format kembalian sama persis untuk menjaga kompatibilitas alur pendaftaran
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_invite_details(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_units JSONB;
BEGIN
  -- Cari tenant berdasarkan tabel privat tenant_invites
  SELECT t.id, t.name, t.type, t.address, t.contact_phone
  INTO v_tenant
  FROM public.tenant_invites ti
  JOIN public.tenants t ON t.id = ti.tenant_id
  WHERE upper(ti.code) = upper(trim(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'message', 'Kode undangan tidak valid atau tidak ditemukan.');
  END IF;

  -- Ambil daftar unit aktif milik tenant
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'label', label,
      'status', status
    ) ORDER BY id ASC
  )
  INTO v_units
  FROM public.tenant_units
  WHERE tenant_id = v_tenant.id;

  RETURN jsonb_build_object(
    'found', true,
    'tenant_id', v_tenant.id,
    'tenant_name', v_tenant.name,
    'tenant_type', v_tenant.type,
    'address', v_tenant.address,
    'contact_phone', v_tenant.contact_phone,
    'units', coalesce(v_units, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_details(TEXT) TO anon, authenticated;

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- DROP TRIGGER IF EXISTS trg_sync_tenant_invite_code_before_update ON public.tenants;
-- DROP TRIGGER IF EXISTS trg_sync_tenant_invite_code_after_insert ON public.tenants;
-- DROP FUNCTION IF EXISTS public.sync_tenant_invite_code_before_update();
-- DROP FUNCTION IF EXISTS public.sync_tenant_invite_code_after_insert();
-- DROP TABLE IF EXISTS public.tenant_invites;
