-- Migration: Proteksi Role Bawaan dan Izinnya di Level Database
-- Task: SEC-4.1 (Ref: docs/handoff/SEC-4.md, DEBT-1-review.md N3)
-- Date: 2026-10-12
--
-- 1. Mengubah policy tenant_roles_insert dan tenant_roles_update agar melarang pembuatan
--    atau pengubahan role dengan is_owner_role = true atau is_base_role = true oleh non-platform-admin.
-- 2. Membatasi hak UPDATE tabel tenant_roles ke kolom (name) saja untuk authenticated.
-- 3. Mengubah policy tenant_role_permissions_modify agar baris izin untuk role bawaan
--    (is_owner_role = true atau is_base_role = true) tidak dapat dimodifikasi oleh non-platform-admin.
-- Catatan: Menggunakan ALTER POLICY (bukan menghapus policy) agar kompatibel dengan konektor Claude.

BEGIN;

-- ==============================================================================
-- 1. PROTEKSI tenant_roles_insert
-- ==============================================================================

ALTER POLICY "tenant_roles_insert" ON public.tenant_roles
  WITH CHECK (
    public.is_platform_admin()
    OR (
      NOT is_owner_role
      AND NOT is_base_role
      AND (
        public.is_tenant_owner(tenant_id)
        OR public.has_permission(tenant_id, 'manage_tenant_users')
      )
    )
  );

-- ==============================================================================
-- 2. PROTEKSI tenant_roles_update
-- ==============================================================================

ALTER POLICY "tenant_roles_update" ON public.tenant_roles
  USING (
    public.is_platform_admin()
    OR (
      NOT is_owner_role
      AND NOT is_base_role
      AND (
        public.is_tenant_owner(tenant_id)
        OR public.has_permission(tenant_id, 'manage_tenant_users')
      )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      NOT is_owner_role
      AND NOT is_base_role
      AND (
        public.is_tenant_owner(tenant_id)
        OR public.has_permission(tenant_id, 'manage_tenant_users')
      )
    )
  );

-- ==============================================================================
-- 3. BATASI HAK UPDATE PADA KOLOM (name) SAJA
-- ==============================================================================

REVOKE UPDATE ON public.tenant_roles FROM anon, authenticated;
GRANT UPDATE (name) ON public.tenant_roles TO authenticated;

-- ==============================================================================
-- 4. PROTEKSI tenant_role_permissions_modify
-- ==============================================================================

ALTER POLICY "tenant_role_permissions_modify" ON public.tenant_role_permissions
  USING (
    public.is_platform_admin()
    OR tenant_role_id IN (
      SELECT tr.id FROM public.tenant_roles tr
      WHERE NOT tr.is_owner_role
        AND NOT tr.is_base_role
        AND (
          public.is_tenant_owner(tr.tenant_id)
          OR public.has_permission(tr.tenant_id, 'manage_tenant_users')
        )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR tenant_role_id IN (
      SELECT tr.id FROM public.tenant_roles tr
      WHERE NOT tr.is_owner_role
        AND NOT tr.is_base_role
        AND (
          public.is_tenant_owner(tr.tenant_id)
          OR public.has_permission(tr.tenant_id, 'manage_tenant_users')
        )
    )
  );

COMMIT;

-- ==============================================================================
-- ROLLBACK:
-- ==============================================================================
-- ALTER POLICY "tenant_roles_insert" ON public.tenant_roles
--   WITH CHECK (
--     public.is_platform_admin()
--     OR public.is_tenant_owner(tenant_id)
--     OR public.has_permission(tenant_id, 'manage_tenant_users'::text)
--   );
--
-- ALTER POLICY "tenant_roles_update" ON public.tenant_roles
--   USING (
--     public.is_platform_admin()
--     OR public.is_tenant_owner(tenant_id)
--     OR public.has_permission(tenant_id, 'manage_tenant_users'::text)
--   )
--   WITH CHECK (
--     public.is_platform_admin()
--     OR public.is_tenant_owner(tenant_id)
--     OR public.has_permission(tenant_id, 'manage_tenant_users'::text)
--   );
--
-- GRANT UPDATE ON public.tenant_roles TO authenticated;
--
-- ALTER POLICY "tenant_role_permissions_modify" ON public.tenant_role_permissions
--   USING (
--     public.is_platform_admin()
--     OR tenant_role_id IN (
--       SELECT tr.id FROM public.tenant_roles tr
--       WHERE public.is_tenant_owner(tr.tenant_id)
--          OR public.has_permission(tr.tenant_id, 'manage_tenant_users'::text)
--     )
--   )
--   WITH CHECK (
--     public.is_platform_admin()
--     OR tenant_role_id IN (
--       SELECT tr.id FROM public.tenant_roles tr
--       WHERE public.is_tenant_owner(tr.tenant_id)
--          OR public.has_permission(tr.tenant_id, 'manage_tenant_users'::text)
--     )
--   );
