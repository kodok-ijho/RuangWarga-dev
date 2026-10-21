/**
 * arisanAccess.js
 * Helper penentu hak akses fitur arisan berdasarkan izin tenant RBAC v2.
 */

/**
 * Menghitung hak akses fitur arisan dari fungsi hasPermission milik tenant
 * @param {Function} hasPermission - (key: string) => boolean
 * @returns {{ canManageRounds: boolean, canGenerateBills: boolean, canRecordPayment: boolean }}
 */
export function getArisanAccess(hasPermission) {
  if (typeof hasPermission !== 'function') {
    return {
      canManageRounds: false,
      canGenerateBills: false,
      canRecordPayment: false,
    };
  }

  return {
    canManageRounds: Boolean(hasPermission('run_special_action')), // buat putaran, kocok, mulai siklus baru
    canGenerateBills: Boolean(hasPermission('generate_billing')),   // terbitkan iuran
    canRecordPayment: Boolean(hasPermission('manage_billing_cash')), // tandai lunas (tunai)
  };
}
