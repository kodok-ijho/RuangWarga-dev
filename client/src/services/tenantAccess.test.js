import { describe, it, expect } from 'vitest';
import { computeTenantAccess, STAFF_PERMISSIONS } from './tenantAccess';

describe('RTRW-1.1: computeTenantAccess (Pure RBAC v2 Engine)', () => {
  it('menolak seluruh akses bila tidak ada tenant aktif (hasActiveTenant = false)', () => {
    const access = computeTenantAccess({
      hasActiveTenant: false,
      isOwner: true,
      permissions: STAFF_PERMISSIONS,
    });

    expect(access).toEqual({
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
    });
  });

  it('memberikan akses penuh untuk Owner pada tenant aktif', () => {
    const access = computeTenantAccess({
      hasActiveTenant: true,
      isOwner: true,
      isPlatformAdmin: false,
      permissions: [],
      subscriptionStatus: 'active',
    });

    expect(access.isMember).toBe(true);
    expect(access.isStaff).toBe(true);
    expect(access.canWrite).toBe(true);
    expect(access.canVerifyPayments).toBe(true);
    expect(access.canRecordCash).toBe(true);
    expect(access.canRecordTransfer).toBe(true);
    expect(access.canGenerateBilling).toBe(true);
    expect(access.canManageExpenses).toBe(true);
    expect(access.canViewReports).toBe(true);
    expect(access.canManageMembers).toBe(true);
  });

  it('memberikan akses penuh untuk Platform Admin pada tenant aktif', () => {
    const access = computeTenantAccess({
      hasActiveTenant: true,
      isOwner: false,
      isPlatformAdmin: true,
      permissions: [],
      subscriptionStatus: 'active',
    });

    expect(access.isMember).toBe(true);
    expect(access.isStaff).toBe(true);
    expect(access.canWrite).toBe(true);
    expect(access.canVerifyPayments).toBe(true);
    expect(access.canRecordCash).toBe(true);
    expect(access.canRecordTransfer).toBe(true);
    expect(access.canGenerateBilling).toBe(true);
    expect(access.canManageExpenses).toBe(true);
    expect(access.canViewReports).toBe(true);
    expect(access.canManageMembers).toBe(true);
  });

  it('membatasi hak akses untuk Warga Biasa (role dasar tanpa izin staf)', () => {
    const access = computeTenantAccess({
      hasActiveTenant: true,
      isOwner: false,
      isPlatformAdmin: false,
      permissions: [],
      subscriptionStatus: 'active',
      isMember: true,
    });

    expect(access.isMember).toBe(true);
    expect(access.isStaff).toBe(false);
    expect(access.canWrite).toBe(true);
    expect(access.canVerifyPayments).toBe(false);
    expect(access.canRecordCash).toBe(false);
    expect(access.canRecordTransfer).toBe(false);
    expect(access.canGenerateBilling).toBe(false);
    expect(access.canManageExpenses).toBe(false);
    expect(access.canViewReports).toBe(false);
    expect(access.canManageMembers).toBe(false);
  });

  it('memberikan izin verifikasi dan pencatatan kas/transfer untuk Bendahara', () => {
    const access = computeTenantAccess({
      hasActiveTenant: true,
      isOwner: false,
      isPlatformAdmin: false,
      permissions: ['manage_billing_cash', 'manage_billing_transfer'],
      subscriptionStatus: 'active',
    });

    expect(access.isMember).toBe(true);
    expect(access.isStaff).toBe(true);
    expect(access.canWrite).toBe(true);
    expect(access.canVerifyPayments).toBe(true);
    expect(access.canRecordCash).toBe(true);
    expect(access.canRecordTransfer).toBe(true);
    expect(access.canGenerateBilling).toBe(false);
    expect(access.canManageExpenses).toBe(false);
    expect(access.canViewReports).toBe(false);
    expect(access.canManageMembers).toBe(false);
  });

  it('memberikan izin laporan untuk Pembaca Laporan (view_reports)', () => {
    const access = computeTenantAccess({
      hasActiveTenant: true,
      isOwner: false,
      isPlatformAdmin: false,
      permissions: ['view_reports'],
      subscriptionStatus: 'active',
    });

    expect(access.isMember).toBe(true);
    expect(access.isStaff).toBe(true);
    expect(access.canWrite).toBe(true);
    expect(access.canVerifyPayments).toBe(false);
    expect(access.canRecordCash).toBe(false);
    expect(access.canRecordTransfer).toBe(false);
    expect(access.canGenerateBilling).toBe(false);
    expect(access.canManageExpenses).toBe(false);
    expect(access.canViewReports).toBe(true);
    expect(access.canManageMembers).toBe(false);
  });

  it('mengizinkan view_reports bila user memiliki manage_expenses', () => {
    const access = computeTenantAccess({
      hasActiveTenant: true,
      isOwner: false,
      isPlatformAdmin: false,
      permissions: ['manage_expenses'],
      subscriptionStatus: 'active',
    });

    expect(access.canManageExpenses).toBe(true);
    expect(access.canViewReports).toBe(true);
  });

  it('menonaktifkan canWrite ketika status langganan tenant read_only', () => {
    const access = computeTenantAccess({
      hasActiveTenant: true,
      isOwner: true,
      subscriptionStatus: 'read_only',
    });

    expect(access.isMember).toBe(true);
    expect(access.isStaff).toBe(true);
    expect(access.canWrite).toBe(false); // Blokir mutasi tulis
    expect(access.canViewReports).toBe(true);
    expect(access.canVerifyPayments).toBe(true);
  });
});
