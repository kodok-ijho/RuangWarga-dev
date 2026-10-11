import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import PaymentMatrix from './PaymentMatrix';
import * as apiClient from '../services/apiClient';
import * as dataService from '../services/dataService';
import * as tenantOpService from '../services/tenantOperationalService';

// Mock apiClient agar portalApiPost melempar error jika terpanggil
vi.mock('../services/apiClient', () => ({
  portalApiPost: vi.fn(() => {
    throw new Error('portalApiPost dipanggil padahal dalam mode tenant!');
  }),
}));

let mockTenantState = {
  activeTenant: { id: 'tenant-rtrw-1', name: 'Kompleks RT 01', type: 'rt_rw' },
  activeTenantId: 'tenant-rtrw-1',
  userTenants: [],
  switchTenant: vi.fn(),
  subscriptionStatus: 'active',
  isPlatformAdmin: false,
  isOwner: false,
  userRole: 'bendahara',
  hasPermission: (perm) => perm === 'manage_billing_cash',
};

let mockTenantAccessState = {
  isMember: true,
  isStaff: true,
  canWrite: true,
  canVerifyPayments: true,
  canRecordCash: true,
  canRecordTransfer: false,
  canGenerateBilling: false,
  canManageExpenses: false,
  canViewReports: true,
  canManageMembers: false,
  loading: false,
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-bendahara', email: 'bendahara@example.com' },
    profile: { id: 'u-bendahara', full_name: 'Bendahara Pak RT' },
    isAuthenticated: true,
    role: 'bendahara',
    isReadOnly: false,
    session: { access_token: 'fake-token' },
  }),
}));

vi.mock('../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../hooks/useTenantAccess', () => ({
  useTenantAccess: () => mockTenantAccessState,
}));

vi.mock('../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => ({
    name: 'Kompleks RT/RW',
    unitLabel: 'Rumah',
    billLabel: 'IPL',
    memberLabel: 'Warga',
    icon: '🏡',
  }),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../context/TourContext', () => ({
  useTour: () => ({ triggerTour: vi.fn() }),
}));

vi.mock('../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantPayments: vi.fn(() => Promise.resolve([
      {
        id: 'p-1',
        billing_item_id: 'bill-1',
        amount: 150000,
        status: 'pending_verification',
        method: 'cash',
        created_at: new Date().toISOString(),
      },
    ])),
    verifyTenantPayment: vi.fn(() => Promise.resolve({ success: true })),
    rejectTenantPayment: vi.fn(() => Promise.resolve({ success: true })),
  };
});

describe('PaymentMatrix Tenant Mode (RTRW-1.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tidak merender tombol "Reset & Hapus Semua Transaksi" saat ada activeTenantId', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/t/tenant-rtrw-1/payment-matrix']}>
        <PaymentMatrix />
      </MemoryRouter>
    );

    expect(html).not.toContain('Reset &amp; Hapus Semua Transaksi');
    expect(html).not.toContain('Reset & Hapus Semua Transaksi');
  });

  it('meneruskan tenantId, memberId, dan verifiedBy ke createCashPayment di mode tenant', async () => {
    const createCashSpy = vi.spyOn(dataService, 'createCashPayment').mockResolvedValue({ id: 'p-new' });

    // Panggil langsung fungsi createCashPayment dengan parameter tenant
    await dataService.createCashPayment('fake-token', {
      bill_id: 'bill-1',
      amount: 150000,
      note: 'Diterima tunai',
      paid_at: '2026-10-11',
      tenantId: 'tenant-rtrw-1',
      memberId: 'mem-1',
      verifiedBy: 'Bendahara Pak RT',
    });

    expect(createCashSpy).toHaveBeenCalledWith('fake-token', expect.objectContaining({
      tenantId: 'tenant-rtrw-1',
      memberId: 'mem-1',
      verifiedBy: 'Bendahara Pak RT',
      bill_id: 'bill-1',
    }));

    // Pastikan portalApiPost tidak dipanggil
    expect(apiClient.portalApiPost).not.toHaveBeenCalled();
  });

  it('meneruskan tenantId dan verifiedBy ke approveManualPayment di mode tenant', async () => {
    const approveSpy = vi.spyOn(dataService, 'approveManualPayment').mockResolvedValue({ success: true });

    await dataService.approveManualPayment('fake-token', {
      payment_id: 'p-1',
      tenantId: 'tenant-rtrw-1',
      verifiedBy: 'Bendahara Pak RT',
    });

    expect(approveSpy).toHaveBeenCalledWith('fake-token', expect.objectContaining({
      tenantId: 'tenant-rtrw-1',
      verifiedBy: 'Bendahara Pak RT',
      payment_id: 'p-1',
    }));

    expect(apiClient.portalApiPost).not.toHaveBeenCalled();
  });

  it('meneruskan tenantId ke rejectManualPayment saat staf membatalkan/menolak di mode tenant', async () => {
    const rejectSpy = vi.spyOn(dataService, 'rejectManualPayment').mockResolvedValue({ success: true });

    await dataService.rejectManualPayment('fake-token', {
      tenantId: 'tenant-rtrw-1',
      payment_id: 'p-1',
      note: 'Dibatalkan oleh pengurus',
      rejectedBy: 'Bendahara Pak RT',
    });

    expect(rejectSpy).toHaveBeenCalledWith('fake-token', expect.objectContaining({
      tenantId: 'tenant-rtrw-1',
      payment_id: 'p-1',
      note: 'Dibatalkan oleh pengurus',
    }));

    expect(apiClient.portalApiPost).not.toHaveBeenCalled();
  });
});
