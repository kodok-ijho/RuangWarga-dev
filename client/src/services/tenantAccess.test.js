import { describe, it, expect } from 'vitest';
import {
  computeTenantAccess,
  STAFF_PERMISSIONS,
  isRegularMemberOnly,
  getAutoRedirectTenantId,
} from './tenantAccess';

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
      canManageSettings: false,
      canManageAnnouncements: false,
      canManagePrograms: false,
      canManageBudget: false,
      canRecordIncome: false,
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
    expect(access.canManageAnnouncements).toBe(true);
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
    expect(access.canManageAnnouncements).toBe(true);
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
    expect(access.canManageAnnouncements).toBe(false);
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

  describe('canManageAnnouncements flag (RTRW-3.1)', () => {
    it('memberikan canManageAnnouncements: true untuk pemegang izin manage_announcements', () => {
      const access = computeTenantAccess({
        hasActiveTenant: true,
        isOwner: false,
        isPlatformAdmin: false,
        permissions: ['manage_announcements'],
      });
      expect(access.canManageAnnouncements).toBe(true);
    });

    it('memberikan canManageAnnouncements: true untuk pemegang izin manage_settings', () => {
      const access = computeTenantAccess({
        hasActiveTenant: true,
        isOwner: false,
        isPlatformAdmin: false,
        permissions: ['manage_settings'],
      });
      expect(access.canManageAnnouncements).toBe(true);
    });

    it('memberikan canManageAnnouncements: false bila user hanya memiliki izin lain', () => {
      const access = computeTenantAccess({
        hasActiveTenant: true,
        isOwner: false,
        isPlatformAdmin: false,
        permissions: ['manage_billing_cash', 'view_reports'],
      });
      expect(access.canManageAnnouncements).toBe(false);
    });

    it('memberikan canManageAnnouncements: false bila permissions kosong dan bukan owner/admin', () => {
      const access = computeTenantAccess({
        hasActiveTenant: true,
        isOwner: false,
        isPlatformAdmin: false,
        permissions: [],
      });
      expect(access.canManageAnnouncements).toBe(false);
    });
  });
});

describe('NAV-1.1: isRegularMemberOnly & getAutoRedirectTenantId', () => {
  it('1 tenant anggota → isRegularMemberOnly true, getAutoRedirectTenantId mengembalikan id tenant', () => {
    const userTenants = [
      { id: 'tenant-warga-1', is_owner: false, role_name: 'Warga', permissions: [] },
    ];
    expect(isRegularMemberOnly({ userTenants, isPlatformAdmin: false })).toBe(true);
    expect(getAutoRedirectTenantId({ userTenants, isPlatformAdmin: false })).toBe('tenant-warga-1');
  });

  it('1 tenant owner → isRegularMemberOnly false, getAutoRedirectTenantId mengembalikan null', () => {
    const userTenants = [
      { id: 'tenant-owner-1', is_owner: true, role_name: 'Ketua RT', permissions: STAFF_PERMISSIONS },
    ];
    expect(isRegularMemberOnly({ userTenants, isPlatformAdmin: false })).toBe(false);
    expect(getAutoRedirectTenantId({ userTenants, isPlatformAdmin: false })).toBe(null);
  });

  it('anggota dengan permission staf (mis. manage_billing_cash) → isRegularMemberOnly false, getAutoRedirectTenantId null', () => {
    const userTenants = [
      {
        id: 'tenant-bendahara-1',
        is_owner: false,
        role_name: 'Bendahara',
        permissions: ['manage_billing_cash'],
      },
    ];
    expect(isRegularMemberOnly({ userTenants, isPlatformAdmin: false })).toBe(false);
    expect(getAutoRedirectTenantId({ userTenants, isPlatformAdmin: false })).toBe(null);
  });

  it('2 tenant anggota → isRegularMemberOnly true, getAutoRedirectTenantId null (karena > 1 tenant)', () => {
    const userTenants = [
      { id: 'tenant-warga-1', is_owner: false, role_name: 'Warga', permissions: [] },
      { id: 'tenant-arisan-2', is_owner: false, role_name: 'Peserta', permissions: [] },
    ];
    expect(isRegularMemberOnly({ userTenants, isPlatformAdmin: false })).toBe(true);
    expect(getAutoRedirectTenantId({ userTenants, isPlatformAdmin: false })).toBe(null);
  });

  it('platform admin → isRegularMemberOnly false, getAutoRedirectTenantId null', () => {
    const userTenants = [
      { id: 'tenant-warga-1', is_owner: false, role_name: 'Warga', permissions: [] },
    ];
    expect(isRegularMemberOnly({ userTenants, isPlatformAdmin: true })).toBe(false);
    expect(getAutoRedirectTenantId({ userTenants, isPlatformAdmin: true })).toBe(null);
  });

  it('userTenants kosong → isRegularMemberOnly false, getAutoRedirectTenantId null', () => {
    expect(isRegularMemberOnly({ userTenants: [], isPlatformAdmin: false })).toBe(false);
    expect(getAutoRedirectTenantId({ userTenants: [], isPlatformAdmin: false })).toBe(null);
    expect(isRegularMemberOnly()).toBe(false);
    expect(getAutoRedirectTenantId()).toBe(null);
  });

  describe('PANITIA-1.4: Izin Acara, Anggaran, dan Pemasukan', () => {
    it('Owner memiliki canManagePrograms, canManageBudget, dan canRecordIncome bernilai true', () => {
      const access = computeTenantAccess({
        hasActiveTenant: true,
        isOwner: true,
      });
      expect(access.canManagePrograms).toBe(true);
      expect(access.canManageBudget).toBe(true);
      expect(access.canRecordIncome).toBe(true);
    });

    it('Platform Admin memiliki canManagePrograms, canManageBudget, dan canRecordIncome bernilai true', () => {
      const access = computeTenantAccess({
        hasActiveTenant: true,
        isPlatformAdmin: true,
      });
      expect(access.canManagePrograms).toBe(true);
      expect(access.canManageBudget).toBe(true);
      expect(access.canRecordIncome).toBe(true);
    });

    it('Anggota biasa tanpa izin memiliki seluruh flag bernilai false', () => {
      const access = computeTenantAccess({
        hasActiveTenant: true,
        isOwner: false,
        permissions: [],
      });
      expect(access.canManagePrograms).toBe(false);
      expect(access.canManageBudget).toBe(false);
      expect(access.canRecordIncome).toBe(false);
    });

    it('Pemegang izin manage_programs memiliki canManagePrograms dan canManageBudget true, canRecordIncome false', () => {
      const access = computeTenantAccess({
        hasActiveTenant: true,
        permissions: ['manage_programs'],
      });
      expect(access.canManagePrograms).toBe(true);
      expect(access.canManageBudget).toBe(true);
      expect(access.canRecordIncome).toBe(false);
    });

    it('Pemegang izin manage_settings memiliki canManagePrograms dan canManageBudget true', () => {
      const access = computeTenantAccess({
        hasActiveTenant: true,
        permissions: ['manage_settings'],
      });
      expect(access.canManagePrograms).toBe(true);
      expect(access.canManageBudget).toBe(true);
    });

    it('Pemegang izin manage_expenses memiliki canManageBudget dan canRecordIncome true, canManagePrograms false', () => {
      const access = computeTenantAccess({
        hasActiveTenant: true,
        permissions: ['manage_expenses'],
      });
      expect(access.canManagePrograms).toBe(false);
      expect(access.canManageBudget).toBe(true);
      expect(access.canRecordIncome).toBe(true);
    });

    it('Pemegang izin manage_billing_cash memiliki canRecordIncome true, canManagePrograms dan canManageBudget false', () => {
      const access = computeTenantAccess({
        hasActiveTenant: true,
        permissions: ['manage_billing_cash'],
      });
      expect(access.canManagePrograms).toBe(false);
      expect(access.canManageBudget).toBe(false);
      expect(access.canRecordIncome).toBe(true);
    });
  });
});
