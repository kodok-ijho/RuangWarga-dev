/**
 * rbacTestHelpers.js — Helper Functions untuk Pengujian & Evaluasi RBAC v2
 *
 * Menerapkan model containment wewenang RBAC v2:
 * - 10 Platform Permissions resmi
 * - Penentuan wewenang efektif (Owner & Super Admin = superset 10 permission)
 * - Validasi pembuatan/penghapusan role
 * - Pengecekan izin aksi spesifik (has_permission equivalent)
 *
 * Ref: requirement.md §3.2 (FR-31 s/d FR-40), specification.md §2.1
 */

export const ALL_PLATFORM_PERMISSIONS = [
  'manage_billing_cash',
  'manage_billing_transfer',
  'generate_billing',
  'manage_members',
  'manage_settings',
  'manage_expenses',
  'view_reports',
  'run_special_action',
  'post_listing',
  'manage_tenant_users',
];

/**
 * Memeriksa apakah permission key ada dalam daftar permission
 */
export function hasTenantPermission(permissions = [], key) {
  if (!Array.isArray(permissions)) return false;
  return permissions.includes(key);
}

/**
 * Menghitung daftar permission efektif seorang user di tenant tertentu
 * Model containment:
 * - Owner atau Super Admin otomatis memiliki SEMUA 10 permission
 * - Staff/Pengelola memiliki permission sesuai penugasan role kustom
 */
export function calculateEffectivePermissions({ isOwner = false, isPlatformAdmin = false, rolePermissions = [] } = {}) {
  if (isOwner || isPlatformAdmin) {
    return [...ALL_PLATFORM_PERMISSIONS];
  }
  return Array.isArray(rolePermissions) ? [...rolePermissions] : [];
}

/**
 * Memeriksa apakah user berhak mengelola (create/update/delete) custom roles di tenant
 * Aturan (FR-34, FR-36):
 * - Super Admin: Ya
 * - Owner/Admin tenant: Ya
 * - Pengelola: Hanya jika memiliki permission 'manage_tenant_users'
 */
export function canManageRoles({ isOwner = false, isPlatformAdmin = false, memberRole = null } = {}) {
  if (isPlatformAdmin || isOwner) return true;
  if (!memberRole) return false;
  const perms = memberRole.permissions || [];
  return perms.includes('manage_tenant_users');
}

/**
 * Memeriksa apakah user berhak mengubah subscription/billing platform untuk tenant (FR-35)
 * Eksklusif: Hanya Admin/Owner tenant atau Super Admin
 */
export function canModifySubscription({ isOwner = false, isPlatformAdmin = false } = {}) {
  return Boolean(isOwner || isPlatformAdmin);
}

/**
 * Memvalidasi apakah sebuah role dapat dihapus (FR-37)
 * Role bawaan (Admin & Warga/Anggota) TIDAK DAPAT dihapus oleh siapapun
 */
export function validateRoleDeletion(role) {
  if (!role) {
    return { canDelete: false, reason: 'Role tidak ditemukan' };
  }
  if (role.is_owner_role || role.is_base_role) {
    return { canDelete: false, reason: 'Role bawaan ("Admin" dan "Warga/Anggota") tidak dapat dihapus.' };
  }
  return { canDelete: true, reason: null };
}

/**
 * Evaluasi akses menyeluruh untuk sebuah aksi operasional
 */
export function evaluateRbacAccess({
  userId,
  tenantId,
  isOwner = false,
  isPlatformAdmin = false,
  memberRole = null,
  requestedAction,
} = {}) {
  const effectivePermissions = calculateEffectivePermissions({
    isOwner,
    isPlatformAdmin,
    rolePermissions: memberRole?.permissions || [],
  });

  const allowed = isPlatformAdmin || isOwner || effectivePermissions.includes(requestedAction);

  return {
    userId,
    tenantId,
    isOwner,
    isPlatformAdmin,
    allowed,
    effectivePermissions,
  };
}
