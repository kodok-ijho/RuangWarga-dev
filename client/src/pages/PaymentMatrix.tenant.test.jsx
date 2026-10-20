// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PaymentMatrix, { buildStaffCashPaymentArgs, buildDetailActionArgs } from './PaymentMatrix';
import * as apiClient from '../services/apiClient';

// Polyfill ResizeObserver untuk jsdom
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserver;
  global.ResizeObserver = ResizeObserver;
}

// Mock apiClient agar portalApiPost melempar error jika terpanggil
vi.mock('../services/apiClient', () => ({
  portalApiPost: vi.fn(() => {
    throw new Error('portalApiPost dipanggil padahal dalam mode tenant!');
  }),
}));

vi.mock('../services/dataService', async () => {
  const actual = await vi.importActual('../services/dataService');
  return {
    ...actual,
    fetchBillMatrix: vi.fn(() => Promise.resolve(sampleMatrixRows)),
    fetchPayments: vi.fn(() => Promise.resolve([])),
  };
});

const mockTenantState = {
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

const mockTenantAccessState = {
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

const mockAuth = {
  user: { id: 'u-bendahara', email: 'bendahara@example.com' },
  profile: { id: 'u-bendahara', full_name: 'Bendahara Pak RT' },
  isAuthenticated: true,
  role: 'bendahara',
  isReadOnly: false,
  session: { access_token: 'fake-token' },
};

let currentTenantAccess = { ...mockTenantAccessState };
let currentAuth = { ...mockAuth };

const mockTenantTemplate = {
  name: 'Kompleks RT/RW',
  unitLabel: 'Rumah',
  billLabel: 'IPL',
  memberLabel: 'Warga',
  occupiedUnitLabel: 'Dihuni',
  emptyUnitLabel: 'Kosong',
  icon: '🏡',
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

const mockTour = {
  triggerTour: vi.fn(),
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => currentAuth,
}));

vi.mock('../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../hooks/useTenantAccess', () => ({
  useTenantAccess: () => currentTenantAccess,
}));

vi.mock('../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => mockTenantTemplate,
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../context/TourContext', () => ({
  useTour: () => mockTour,
}));

const sampleMatrixRows = [
  {
    unit: {
      id: 'unit-1',
      label: 'Rumah A/01',
      block: 'A',
      unit_number: '01',
      is_occupied: true,
      occupancy_status: 'owner_occupied',
      occupant_phone: '081234567890',
    },
    resident: {
      id: 'res-1',
      full_name: 'Budi Santoso',
      phone: '081234567890',
    },
    residents: [{ id: 'res-1', full_name: 'Budi Santoso', phone: '081234567890' }],
    cells: [
      {
        period: '2026-10',
        status: 'unpaid',
        bill: {
          id: 'bill-unpaid-1',
          period: '2026-10',
          status: 'unpaid',
          amount: 150000,
          late_fee: 0,
          due_date: '2026-10-10',
        },
      },
    ],
  },
  {
    unit: {
      id: 'unit-2',
      label: 'Rumah A/02',
      block: 'A',
      unit_number: '02',
      is_occupied: true,
      occupancy_status: 'owner_occupied',
      occupant_phone: '081298765432',
    },
    resident: {
      id: 'res-2',
      full_name: 'Siti Aminah',
      phone: '081298765432',
    },
    residents: [{ id: 'res-2', full_name: 'Siti Aminah', phone: '081298765432' }],
    cells: [
      {
        period: '2026-10',
        status: 'paid',
        bill: {
          id: 'bill-paid-2',
          period: '2026-10',
          status: 'paid',
          amount: 150000,
          late_fee: 0,
          due_date: '2026-10-10',
        },
      },
    ],
  },
];

vi.mock('../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantBillMatrix: vi.fn(() => Promise.resolve(sampleMatrixRows)),
    fetchTenantMembers: vi.fn(() => Promise.resolve([])),
    getTenantBankAccount: vi.fn(() => ({
      bank_name: 'BCA',
      account_number: '1234567890',
      account_holder: 'Pengurus RT 01',
    })),
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

describe('PaymentMatrix Tenant Mode (RTRW-1.3 / RTRW-1F.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentTenantAccess = { ...mockTenantAccessState };
    currentAuth = { ...mockAuth };
  });

  afterEach(() => {
    cleanup();
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

  it('meneruskan tenantId, memberId, dan verifiedBy ke argumen createCashPayment di mode tenant via buildStaffCashPaymentArgs', () => {
    const bill = {
      id: 'bill-1',
      amount: 150000,
      late_fee: 0,
      member_id: 'mem-1',
    };
    const unit = {
      id: 'unit-101',
      member_id: 'fallback-mem',
      members: [{ id: 'fallback-mem' }],
    };
    const receiptFile = { name: 'receipt.png' };

    // Kasus pembayaran tunggal / tagihan pertama (index 0)
    const argsIndex0 = buildStaffCashPaymentArgs({
      bill,
      unit,
      index: 0,
      customAmounts: { 'bill-1': 150000 },
      receiptFile,
      firstPayment: null,
      note: 'Diterima tunai',
      paidAt: '2026-10-11',
      role: 'bendahara',
      activeTenantId: 'tenant-rtrw-1',
      staffVerifier: 'Bendahara Pak RT',
    });

    expect(argsIndex0).toEqual({
      bill_id: 'bill-1',
      amount: 150000,
      file: receiptFile,
      note: 'Diterima tunai',
      paid_at: '2026-10-11',
      recorderRole: 'bendahara',
      tenantId: 'tenant-rtrw-1',
      memberId: 'mem-1',
      verifiedBy: 'Bendahara Pak RT',
    });
    expect(argsIndex0.tenantId).toBe('tenant-rtrw-1');
    expect(argsIndex0.memberId).toBe('mem-1');
    expect(argsIndex0.verifiedBy).toBe('Bendahara Pak RT');

    // Kasus multi-tagihan (index > 0) dengan fallback memberId dari unit.members
    const billWithoutMember = { id: 'bill-2', amount: 100000, late_fee: 5000 };
    const unitFallback = { id: 'unit-102', members: [{ id: 'mem-from-unit-members' }] };
    const argsIndex1 = buildStaffCashPaymentArgs({
      bill: billWithoutMember,
      unit: unitFallback,
      index: 1,
      customAmounts: {},
      receiptFile,
      firstPayment: { file_url: 'https://example.com/receipt.png' },
      note: 'Diterima tunai',
      paidAt: '2026-10-11',
      role: 'bendahara',
      activeTenantId: 'tenant-rtrw-1',
      staffVerifier: 'Bendahara Pak RT',
    });

    expect(argsIndex1.tenantId).toBe('tenant-rtrw-1');
    expect(argsIndex1.memberId).toBe('mem-from-unit-members');
    expect(argsIndex1.file).toBeNull();
    expect(argsIndex1.note).toBe('Diterima tunai (Lampiran: https://example.com/receipt.png)');
    expect(argsIndex1.amount).toBe(105000);
  });

  it('meneruskan tenantId dan verifiedBy ke argumen approveManualPayment di mode tenant via buildDetailActionArgs', () => {
    const args = buildDetailActionArgs('approve', {
      paymentId: 'p-1',
      activeTenantId: 'tenant-rtrw-1',
      verifier: 'Bendahara Pak RT',
    });

    expect(args).toEqual({
      payment_id: 'p-1',
      tenantId: 'tenant-rtrw-1',
      verifiedBy: 'Bendahara Pak RT',
    });
    expect(args.tenantId).toBe('tenant-rtrw-1');
    expect(args.verifiedBy).toBe('Bendahara Pak RT');

    // Fallback verifier jika kosong
    const fallbackArgs = buildDetailActionArgs('approve', {
      paymentId: 'p-1',
      activeTenantId: 'tenant-rtrw-1',
      verifier: null,
    });
    expect(fallbackArgs.verifiedBy).toBe('staff');
  });

  it('meneruskan tenantId ke argumen rejectManualPayment saat staf menolak atau membatalkan di mode tenant via buildDetailActionArgs', () => {
    // Aksi penolakan bukti transfer (reject)
    const rejectArgs = buildDetailActionArgs('reject', {
      paymentId: 'p-1',
      activeTenantId: 'tenant-rtrw-1',
      verifier: 'Bendahara Pak RT',
      reason: 'Bukti transfer tidak valid/blur',
    });

    expect(rejectArgs).toEqual({
      payment_id: 'p-1',
      note: 'Bukti transfer tidak valid/blur',
      tenantId: 'tenant-rtrw-1',
      rejectedBy: 'Bendahara Pak RT',
    });
    expect(rejectArgs.tenantId).toBe('tenant-rtrw-1');

    // Aksi pembatalan transaksi oleh staf (cancel)
    const cancelArgs = buildDetailActionArgs('cancel', {
      paymentId: 'p-1',
      activeTenantId: 'tenant-rtrw-1',
      verifier: 'Bendahara Pak RT',
    });

    expect(cancelArgs).toEqual({
      tenantId: 'tenant-rtrw-1',
      payment_id: 'p-1',
      note: 'Dibatalkan oleh pengurus',
      rejectedBy: 'Bendahara Pak RT',
    });
    expect(cancelArgs.tenantId).toBe('tenant-rtrw-1');
  });

  describe('Fitur Pengingat Tagihan via WhatsApp (NOTIF-1.1)', () => {
    it('link tampil untuk staf dengan izin tagihan pada baris berisi tagihan unpaid dan href berisi wa.me/62', async () => {
      currentAuth = { ...mockAuth, role: 'bendahara' };
      currentTenantAccess = {
        ...mockTenantAccessState,
        isStaff: true,
        canRecordCash: true,
      };

      render(
        <MemoryRouter initialEntries={['/t/tenant-rtrw-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      const link = await screen.findByRole('link', {
        name: /Ingatkan tagihan via WhatsApp untuk Rumah A\/01/i,
      });
      expect(link).toBeDefined();
      expect(link.getAttribute('href')).toContain('wa.me/6281234567890');
      expect(link.textContent).toContain('Ingatkan');
    });

    it('link tidak tampil untuk warga biasa', async () => {
      const { fetchTenantMembers } = await import('../services/tenantOperationalService');
      fetchTenantMembers.mockResolvedValueOnce([
        { id: 'mem-warga', user_id: 'u-warga', email: 'warga@example.com', unit_id: 'unit-1' },
      ]);

      currentAuth = {
        ...mockAuth,
        role: 'warga',
        user: { id: 'u-warga', email: 'warga@example.com' },
        profile: { id: 'u-warga', full_name: 'Warga Biasa', email: 'warga@example.com' },
      };
      currentTenantAccess = {
        ...mockTenantAccessState,
        isStaff: false,
        canWrite: false,
        canVerifyPayments: false,
        canRecordCash: false,
        canRecordTransfer: false,
        canGenerateBilling: false,
      };

      render(
        <MemoryRouter initialEntries={['/t/tenant-rtrw-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      await screen.findByText('Rumah A/01');
      expect(screen.queryByRole('link', { name: /Ingatkan tagihan via WhatsApp/i })).toBeNull();
      expect(screen.queryByText('Ingatkan')).toBeNull();
    });

    it('link tidak tampil bila baris tidak punya tagihan unpaid', async () => {
      currentAuth = { ...mockAuth, role: 'bendahara' };
      currentTenantAccess = {
        ...mockTenantAccessState,
        isStaff: true,
        canRecordCash: true,
      };

      render(
        <MemoryRouter initialEntries={['/t/tenant-rtrw-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      // Baris 1 (Rumah A/01) punya unpaid -> tampil
      const link1 = await screen.findByRole('link', {
        name: /Ingatkan tagihan via WhatsApp untuk Rumah A\/01/i,
      });
      expect(link1).toBeDefined();

      // Baris 2 (Rumah A/02) berstatus paid -> tidak tampil
      expect(
        screen.queryByRole('link', {
          name: /Ingatkan tagihan via WhatsApp untuk Rumah A\/02/i,
        })
      ).toBeNull();
    });
  });
});
