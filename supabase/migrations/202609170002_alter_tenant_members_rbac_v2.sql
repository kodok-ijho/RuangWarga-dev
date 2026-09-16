-- Migration: Alter tenant_members for RBAC v2 (Add tenant_role_id and is_owner)
-- Task: T12.3
-- Date: 2026-09-17
-- Ref: requirement.md §3.2, FR-32, FR-33, FR-38; specification.md §2.1.2

BEGIN;

-- Tambah kolom tenant_role_id (FK ke tenant_roles)
ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS tenant_role_id UUID REFERENCES public.tenant_roles(id) ON DELETE SET NULL;

-- Tambah penanda kepemilikan is_owner (true HANYA untuk Admin asli / pemilik tenant)
ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

-- Index untuk performa lookup role anggota
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_role_id
  ON public.tenant_members(tenant_role_id);

CREATE INDEX IF NOT EXISTS idx_tenant_members_is_owner
  ON public.tenant_members(is_owner);

-- CATATAN: Kolom 'role' sengaja DIPERTAHANKAN pada tahap ini untuk menjamin
-- kompatibilitas mundur dan ketersediaan jalur rollback selama migrasi berlangsung.
-- Kolom 'role' baru akan di-drop pada Task T12.11 setelah seluruh RLS dan UI siap.

COMMIT;

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_tenant_members_is_owner;
-- DROP INDEX IF EXISTS public.idx_tenant_members_tenant_role_id;
-- ALTER TABLE public.tenant_members DROP COLUMN IF EXISTS is_owner;
-- ALTER TABLE public.tenant_members DROP COLUMN IF EXISTS tenant_role_id;
