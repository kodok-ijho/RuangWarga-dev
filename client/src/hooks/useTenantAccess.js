import { useMemo } from 'react';
import { useTenant } from './useTenant';
import { computeTenantAccess } from '../services/tenantAccess';

/**
 * Hook kemudahan untuk memeriksa izin tenant RBAC v2 pengguna saat ini.
 *
 * @returns {object} Hak akses tenant dan status loading:
 * {
 *   isMember,
 *   isStaff,
 *   canWrite,
 *   canVerifyPayments,
 *   canRecordCash,
 *   canRecordTransfer,
 *   canGenerateBilling,
 *   canManageExpenses,
 *   canViewReports,
 *   canManageMembers,
 *   loading,
 * }
 */
export function useTenantAccess() {
  const {
    isOwner,
    isPlatformAdmin,
    permissions = [],
    subscriptionStatus = 'active',
    activeTenant,
    activeTenantId,
    loading,
  } = useTenant();

  const access = useMemo(() => {
    const hasActiveTenant = Boolean(activeTenantId && activeTenant);
    const isMember = Boolean(hasActiveTenant && (activeTenant || isOwner || isPlatformAdmin));

    return computeTenantAccess({
      isOwner,
      isPlatformAdmin,
      permissions,
      subscriptionStatus,
      hasActiveTenant,
      isMember,
    });
  }, [isOwner, isPlatformAdmin, permissions, subscriptionStatus, activeTenant, activeTenantId]);

  return {
    ...access,
    loading: Boolean(loading),
  };
}

export default useTenantAccess;
