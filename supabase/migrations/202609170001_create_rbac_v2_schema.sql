-- Migration: Create RBAC v2 Schema (permissions, tenant_roles, tenant_role_permissions)
-- Task: T12.2
-- Date: 2026-09-17
-- Ref: requirement.md §3.2, FR-34, FR-36, FR-37; specification.md §2.1.1, §6.1

BEGIN;

-- ============================================================
-- 1. TABEL PERMISSIONS (Kamus permission generik tetap tingkat platform)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.permissions (
  key           TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT
);

-- Seed 10 permission keys resmi (Spec §2.1.1, Req §3.2.4)
INSERT INTO public.permissions (key, label, description) VALUES
  ('manage_billing_cash',     'Catat Pembayaran Tunai',      'Mencatat pembayaran tunai langsung'),
  ('manage_billing_transfer', 'Catat & Verifikasi Transfer', 'Mencatat & memverifikasi bukti transfer'),
  ('generate_billing',        'Terbitkan Tagihan',           'Generate tagihan berkala (IPL/sewa/kontribusi/iuran)'),
  ('manage_members',          'Kelola Anggota',              'CRUD anggota, approve/reject pendaftaran, impor CSV'),
  ('manage_settings',         'Kelola Pengaturan',           'Edit konfigurasi tenant'),
  ('manage_expenses',         'Kelola Pengeluaran',          'CRUD pengeluaran'),
  ('view_reports',            'Lihat Laporan',               'Akses laporan keuangan (read-only)'),
  ('run_special_action',      'Jalankan Aksi Khusus',        'Kocok arisan, checkout kos, mulai siklus baru'),
  ('post_listing',            'Pasang Iklan',                'Posting listing publik'),
  ('manage_tenant_users',     'Kelola User & Audit',         'CRUD akun/akses user tenant, ubah role, lihat audit log')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description;

-- ============================================================
-- 2. TABEL TENANT_ROLES (Role kustom per tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  is_owner_role   BOOLEAN NOT NULL DEFAULT false,
  is_base_role    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_roles_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_roles_tenant_id ON public.tenant_roles(tenant_id);

-- ============================================================
-- 3. TABEL TENANT_ROLE_PERMISSIONS (Relasi many-to-many role-permission)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_role_permissions (
  tenant_role_id  UUID NOT NULL REFERENCES public.tenant_roles(id) ON DELETE CASCADE,
  permission_key  TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (tenant_role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_trp_permission_key ON public.tenant_role_permissions(permission_key);

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_role_permissions ENABLE ROW LEVEL SECURITY;

-- 4.1 RLS permissions:
-- Siapapun dapat membaca kamus permission
DROP POLICY IF EXISTS "permissions_select_all" ON public.permissions;
CREATE POLICY "permissions_select_all" ON public.permissions
  FOR SELECT USING (true);

-- Hanya platform admin yang dapat memodifikasi kamus permission
DROP POLICY IF EXISTS "permissions_modify_platform_admin" ON public.permissions;
CREATE POLICY "permissions_modify_platform_admin" ON public.permissions
  FOR ALL USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- 4.2 RLS tenant_roles:
-- SELECT: platform admin, anggota tenant aktif, atau owner tenant
DROP POLICY IF EXISTS "tenant_roles_select" ON public.tenant_roles;
CREATE POLICY "tenant_roles_select" ON public.tenant_roles
  FOR SELECT USING (
    public.is_platform_admin()
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  );

-- INSERT: platform admin atau tenant admin (akan diperluas has_permission di T12.7)
DROP POLICY IF EXISTS "tenant_roles_insert" ON public.tenant_roles;
CREATE POLICY "tenant_roles_insert" ON public.tenant_roles
  FOR INSERT WITH CHECK (
    public.is_platform_admin()
    OR public.is_tenant_admin(tenant_id)
  );

-- UPDATE: platform admin atau tenant admin
DROP POLICY IF EXISTS "tenant_roles_update" ON public.tenant_roles;
CREATE POLICY "tenant_roles_update" ON public.tenant_roles
  FOR UPDATE USING (
    public.is_platform_admin()
    OR public.is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    public.is_platform_admin()
    OR public.is_tenant_admin(tenant_id)
  );

-- DELETE: role bawaan (is_owner_role / is_base_role) TIDAK BOLEH dihapus siapapun (Req FR-37)
DROP POLICY IF EXISTS "tenant_roles_delete" ON public.tenant_roles;
CREATE POLICY "tenant_roles_delete" ON public.tenant_roles
  FOR DELETE USING (
    NOT (is_owner_role OR is_base_role)
    AND (
      public.is_platform_admin()
      OR public.is_tenant_admin(tenant_id)
    )
  );

-- 4.3 RLS tenant_role_permissions:
-- SELECT: bisa dibaca jika user punya akses baca ke tenant_role terkait
DROP POLICY IF EXISTS "tenant_role_permissions_select" ON public.tenant_role_permissions;
CREATE POLICY "tenant_role_permissions_select" ON public.tenant_role_permissions
  FOR SELECT USING (
    public.is_platform_admin()
    OR tenant_role_id IN (
      SELECT id FROM public.tenant_roles
      WHERE tenant_id IN (SELECT public.current_tenant_ids())
         OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
    )
  );

-- INSERT/UPDATE/DELETE: hak kelola mengikuti hak admin pada tenant terkait
DROP POLICY IF EXISTS "tenant_role_permissions_modify" ON public.tenant_role_permissions;
CREATE POLICY "tenant_role_permissions_modify" ON public.tenant_role_permissions
  FOR ALL USING (
    public.is_platform_admin()
    OR tenant_role_id IN (
      SELECT id FROM public.tenant_roles
      WHERE public.is_tenant_admin(tenant_id)
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR tenant_role_id IN (
      SELECT id FROM public.tenant_roles
      WHERE public.is_tenant_admin(tenant_id)
    )
  );

COMMIT;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.tenant_role_permissions CASCADE;
-- DROP TABLE IF EXISTS public.tenant_roles CASCADE;
-- DROP TABLE IF EXISTS public.permissions CASCADE;
