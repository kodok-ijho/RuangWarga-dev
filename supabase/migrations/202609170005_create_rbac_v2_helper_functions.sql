-- Migration: Helper Functions for RBAC v2 (has_permission, is_tenant_owner, alias is_tenant_admin)
-- Task: T12.6
-- Date: 2026-09-17
-- Ref: requirement.md §3.2, FR-32, FR-39, FR-40; specification.md §2.1.4

BEGIN;

-- 1. is_tenant_owner(p_tenant_id uuid)
-- Mengecek apakah user saat ini adalah pemilik (owner) tenant tertentu
CREATE OR REPLACE FUNCTION public.is_tenant_owner(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id AND owner_id = auth.uid()
  );
$$;

-- 2. has_permission(p_tenant_id uuid, p_permission_key text)
-- Mengecek apakah user aktif memiliki permission tertentu di tenant tertentu
-- lewat tenant_role_id yang ditugaskan padanya (atau jika user adalah owner tenant / platform admin)
CREATE OR REPLACE FUNCTION public.has_permission(p_tenant_id UUID, p_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Platform admin dan Tenant owner memiliki containment penuh atas seluruh permission (Req §3.2.2)
  SELECT public.is_platform_admin()
  OR public.is_tenant_owner(p_tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.tenant_role_permissions trp ON trp.tenant_role_id = tm.tenant_role_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'approved'
      AND trp.permission_key = p_permission_key
  );
$$;

-- 3. is_tenant_admin(t_id uuid) - Alias kompatibilitas mundur selama masa transisi
-- Memanggil is_tenant_owner dan has_permission secara internal
CREATE OR REPLACE FUNCTION public.is_tenant_admin(t_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
  OR public.is_tenant_owner(t_id)
  OR public.has_permission(t_id, 'manage_settings')
  OR EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = t_id AND user_id = auth.uid() AND role = 'admin' AND status = 'approved'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_tenant_owner(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(UUID) TO authenticated, anon, service_role;

COMMIT;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.has_permission(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.is_tenant_owner(UUID);
