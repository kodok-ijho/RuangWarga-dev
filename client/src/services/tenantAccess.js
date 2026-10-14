/**
 * Logika Murni Perhitungan Akses Tenant (RTRW-1.1)
 *
 * Pemetaan Izin RBAC v2:
 * - isMember: user berada di dalam tenant aktif dan berstatus anggota/pemilik/platform admin
 * - isStaff: pemilik, platform admin, atau memiliki salah satu izin operasional/staf
 * - canWrite: subscriptionStatus bukan 'read_only'
 * - canVerifyPayments: manage_billing_cash ATAU manage_billing_transfer
 * - canRecordCash: manage_billing_cash
 * - canRecordTransfer: manage_billing_transfer
 * - canGenerateBilling: generate_billing
 * - canManageExpenses: manage_expenses
 * - canViewReports: view_reports ATAU manage_expenses
 * - canManageMembers: manage_members
 */

export const STAFF_PERMISSIONS = [
  'manage_billing_cash',
  'manage_billing_transfer',
  'generate_billing',
  'manage_expenses',
  'manage_members',
  'view_reports',
  'manage_settings',
  'manage_tenant_users',
];

/**
 * Menghitung hak akses pengguna di workspace tenant aktif.
 *
 * @param {object} params
 * @param {boolean} [params.isOwner=false]
 * @param {boolean} [params.isPlatformAdmin=false]
 * @param {string[]} [params.permissions=[]]
 * @param {string} [params.subscriptionStatus='active']
 * @param {boolean} [params.hasActiveTenant=false]
 * @param {boolean} [params.isMember=true]
 * @returns {object} Hak akses tenant
 */
export function computeTenantAccess({
  isOwner = false,
  isPlatformAdmin = false,
  permissions = [],
  subscriptionStatus = 'active',
  hasActiveTenant = false,
  isMember = true,
} = {}) {
  // Jika tidak ada tenant aktif, tolak seluruh akses workspace
  if (!hasActiveTenant) {
    return {
      isMember: false,
      isStaff: false,
      canWrite: false,
      canVerifyPayments: false,
      canRecordCash: false,
      canRecordTransfer: false,
      canGenerateBilling: false,
      canManageExpenses: false,
      canViewReports: false,
      canManageMembers: false,
    };
  }

  const effectiveIsMember = Boolean(isMember || isOwner || isPlatformAdmin);
  const isPrivileged = Boolean(isOwner || isPlatformAdmin);
  const perms = Array.isArray(permissions) ? permissions : [];

  const hasPerm = (key) => isPrivileged || perms.includes(key);

  const isStaff = isPrivileged || STAFF_PERMISSIONS.some((p) => perms.includes(p));
  const canWrite = subscriptionStatus !== 'read_only';

  return {
    isMember: effectiveIsMember,
    isStaff,
    canWrite,
    canVerifyPayments: hasPerm('manage_billing_cash') || hasPerm('manage_billing_transfer'),
    canRecordCash: hasPerm('manage_billing_cash'),
    canRecordTransfer: hasPerm('manage_billing_transfer'),
    canGenerateBilling: hasPerm('generate_billing'),
    canManageExpenses: hasPerm('manage_expenses'),
    canViewReports: hasPerm('view_reports') || hasPerm('manage_expenses'),
    canManageMembers: hasPerm('manage_members'),
  };
}

/**
 * Memeriksa apakah pengguna berstatus anggota biasa di seluruh tenant-nya
 * (bukan owner, tidak punya izin staf di tenant manapun, dan bukan platform admin).
 *
 * @param {object} [params]
 * @param {Array} [params.userTenants=[]]
 * @param {boolean} [params.isPlatformAdmin=false]
 * @returns {boolean}
 */
export function isRegularMemberOnly({ userTenants = [], isPlatformAdmin = false } = {}) {
  if (isPlatformAdmin) return false;
  if (!Array.isArray(userTenants) || userTenants.length === 0) return false;

  return userTenants.every((t) => {
    if (!t || t.is_owner) return false;
    const perms = Array.isArray(t.permissions) ? t.permissions : [];
    return !perms.some((p) => STAFF_PERMISSIONS.includes(p));
  });
}

/**
 * Menentukan id tenant untuk pengalihan otomatis saat user login.
 * Mengembalikan tenantId hanya bila user adalah anggota biasa pada tepat 1 tenant.
 *
 * @param {object} [params]
 * @param {Array} [params.userTenants=[]]
 * @param {boolean} [params.isPlatformAdmin=false]
 * @returns {string|null}
 */
export function getAutoRedirectTenantId({ userTenants = [], isPlatformAdmin = false } = {}) {
  if (isRegularMemberOnly({ userTenants, isPlatformAdmin }) && userTenants.length === 1) {
    return userTenants[0]?.id || null;
  }
  return null;
}

