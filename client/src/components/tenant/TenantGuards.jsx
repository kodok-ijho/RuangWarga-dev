import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTenant } from '../../hooks/useTenant';
import { useTenantAccess } from '../../hooks/useTenantAccess';

export const PageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
  </div>
);

/**
 * TenantAccessGuard — memastikan user memiliki hak akses tertentu di workspace tenant (RTRW-1.1).
 * require: nama properti dari useTenantAccess (mis. 'canVerifyPayments', 'isMember', 'canViewReports').
 *
 * RTRW-1F.3 (T3): Bila tenantId di URL ada dan activeTenantId !== tenantId,
 * tunggu hingga TenantShell menyelesaikan sinkronisasi switchTenant(tenantId)
 * dengan menampilkan PageLoader sebelum menilai izin apa pun.
 */
export function TenantAccessGuard({ require: requiredAccess, children }) {
  const { tenantId } = useParams();
  const { activeTenantId } = useTenant();
  const access = useTenantAccess();

  if (tenantId && activeTenantId !== tenantId) {
    return <PageLoader />;
  }

  if (access.loading) {
    return <PageLoader />;
  }

  const isAllowed = Boolean(access[requiredAccess]);
  if (!isAllowed) {
    const targetTenantId = tenantId || activeTenantId || '';
    const fallbackPath = targetTenantId ? `/t/${targetTenantId}/dashboard` : '/';
    return <Navigate to={fallbackPath} replace />;
  }

  return children;
}

/**
 * TenantPermissionGuard — memastikan user memiliki permission tertentu atau merupakan Owner / Platform Admin.
 *
 * RTRW-1F.3 (T3): Bila tenantId di URL ada dan activeTenantId !== tenantId,
 * tunggu hingga TenantShell menyelesaikan sinkronisasi switchTenant(tenantId)
 * dengan menampilkan PageLoader sebelum menilai izin apa pun.
 */
export function TenantPermissionGuard({ permission, children }) {
  const { tenantId } = useParams();
  const { isOwner, isPlatformAdmin, hasPermission, loading, activeTenantId } = useTenant();

  if (tenantId && activeTenantId !== tenantId) {
    return <PageLoader />;
  }

  if (loading) {
    return <PageLoader />;
  }

  const allowed = isPlatformAdmin || isOwner || (hasPermission && hasPermission(permission));
  if (!allowed) {
    const targetTenantId = tenantId || activeTenantId || '';
    const fallbackPath = targetTenantId ? `/t/${targetTenantId}/dashboard` : '/';
    return <Navigate to={fallbackPath} replace />;
  }

  return children;
}
