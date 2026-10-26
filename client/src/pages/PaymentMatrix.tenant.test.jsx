// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

const mockTenantTemplate = {
  name: 'Kompleks RT/RW',
  unitLabel: 'Rumah',
  billLabel: 'IPL',
  memberLabel: 'Warga',
  occupiedUnitLabel: 'Dihuni',
  emptyUnitLabel: 'Kosong',
  icon: '🏡',
};

let currentTenantAccess = { ...mockTenantAccessState };
let currentAuth = { ...mockAuth };
let currentTenantState = { ...mockTenantState };
let currentTenantTemplate = { ...mockTenantTemplate };

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
  useTenant: () => currentTenantState,
}));

vi.mock('../hooks/useTenantAccess', () => ({
  useTenantAccess: () => currentTenantAccess,
}));

vi.mock('../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => currentTenantTemplate,
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

vi.mock('../services/publicListingService', () => ({
  fetchTenantListings: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantBillMatrix: vi.fn(() => Promise.resolve(sampleMatrixRows)),
    fetchTenantMembers: vi.fn(() => Promise.resolve([])),
    fetchKosContracts: vi.fn(() => Promise.resolve([])),
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
    currentTenantState = { ...mockTenantState };
    currentTenantTemplate = { ...mockTenantTemplate };
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

  describe('KOS-2.5: Integrasi Kontrak dan Tawaran Iklan di Matriks Kos', () => {
    const kosMatrixRows = [
      {
        unit: {
          id: 101,
          label: 'Kamar 101',
          status: 'occupied',
        },
        resident: null,
        residents: [],
        cells: [
          {
            period: '2026-10',
            status: 'unpaid',
            bill: {
              id: 'bill-dhani-1',
              period: '2026-10',
              status: 'unpaid',
              amount: 1500000,
              service_start: '2026-10-19',
              service_end: '2026-11-18',
              due_date: '2026-10-29',
            },
          },
        ],
      },
      {
        unit: {
          id: 102,
          label: 'Kamar 102',
          status: 'vacant',
        },
        resident: null,
        residents: [],
        cells: [
          {
            period: '2026-10',
            status: 'none',
            bill: null,
          },
        ],
      },
      {
        unit: {
          id: 103,
          label: 'Kamar 103',
          status: 'vacant',
          metadata: {
            previous_tenant_member_id: 'mem-alumni-3',
          },
        },
        resident: null,
        residents: [],
        cells: [
          {
            period: '2026-10',
            status: 'none',
            bill: null,
          },
        ],
      },
    ];

    const kosContracts = [
      {
        id: 'c-101',
        unit_id: 101,
        status: 'active',
        tenant_name: 'Dhani Mahasiswa',
        rent_price: 1500000,
        start_date: '2026-10-19',
        end_date: null, // Bulanan
      },
      {
        id: 'c-103',
        unit_id: 103,
        status: 'ended', // Sudah checkout
        tenant_name: 'Alumni Kos',
        rent_price: 1500000,
        start_date: '2026-01-01',
        end_date: '2026-06-30',
      },
    ];

    const kosListings = [
      {
        id: 'lst-102',
        unit_id: 102,
        status: 'active',
        title: 'Kamar 102 Nyaman AC',
      },
    ];

    beforeEach(async () => {
      currentTenantState = {
        activeTenant: { id: 'tenant-kos-1', name: 'Kos Harmoni', type: 'kos' },
        activeTenantId: 'tenant-kos-1',
        userTenants: [],
        switchTenant: vi.fn(),
        subscriptionStatus: 'active',
        isPlatformAdmin: false,
        isOwner: true,
        userRole: 'admin',
        hasPermission: () => true,
      };

      currentTenantTemplate = {
        name: 'Kos-kosan',
        unitLabel: 'Kamar',
        billLabel: 'Sewa',
        memberLabel: 'Penyewa',
        occupiedUnitLabel: 'Terisi',
        emptyUnitLabel: 'Kosong',
        icon: '🛏️',
      };

      currentTenantAccess = {
        ...mockTenantAccessState,
        isStaff: true,
        canWrite: true,
        canGenerateBilling: true,
      };

      const dataService = await import('../services/dataService');
      dataService.fetchBillMatrix.mockResolvedValue(kosMatrixRows);

      const opService = await import('../services/tenantOperationalService');
      opService.fetchKosContracts.mockResolvedValue(kosContracts);

      const listService = await import('../services/publicListingService');
      listService.fetchTenantListings.mockResolvedValue(kosListings);
    });

    it('kamar dengan kontrak aktif: nama penyewa dari kontrak, badge Bulanan, tooltip memuat masa sewa & jatuh tempo', async () => {
      render(
        <MemoryRouter initialEntries={['/t/tenant-kos-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      // Kamar 101 harus menampilkan nama penyewa dari kontrak
      expect(await screen.findByText('Kamar 101')).toBeTruthy();
      expect(await screen.findByText('Dhani Mahasiswa')).toBeTruthy();
      expect(await screen.findByText('Bulanan')).toBeTruthy();

      // Tooltip sel tagihan memuat masa sewa dan jatuh tempo
      const cellElement = screen.getByTitle(/Masa Sewa: 19 Okt 2026 – 18 Nov 2026/i);
      expect(cellElement).toBeTruthy();
      expect(cellElement.getAttribute('title')).toContain('Jatuh Tempo: 29 Okt 2026');
    });

    it('KOS-3.2: kamar dengan kontrak prorata menampilkan badge Prorata di samping badge Bulanan', async () => {
      const opService = await import('../services/tenantOperationalService');
      opService.fetchKosContracts.mockResolvedValueOnce([
        {
          id: 'c-101-prorata',
          unit_id: 101,
          status: 'active',
          tenant_name: 'Dhani Mahasiswa',
          rent_price: 1500000,
          start_date: '2026-10-19',
          end_date: null,
          billing_cycle: 'month_start_prorata',
        },
      ]);

      render(
        <MemoryRouter initialEntries={['/t/tenant-kos-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      expect(await screen.findByText('Kamar 101')).toBeTruthy();
      expect(await screen.findByText('Bulanan')).toBeTruthy();
      expect(await screen.findByText('Prorata')).toBeTruthy();
    });

    it('kamar kosong dengan iklan aktif: tampil Kamar Kosong, Buat Kontrak, dan badge Diiklankan', async () => {
      render(
        <MemoryRouter initialEntries={['/t/tenant-kos-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      expect(await screen.findByText('Kamar 102')).toBeTruthy();
      // Ada label Kamar Kosong
      const emptyBadge = await screen.findAllByText('Kamar Kosong');
      expect(emptyBadge.length).toBeGreaterThanOrEqual(1);

      // Ada badge Diiklankan untuk Kamar 102
      expect(await screen.findByRole('button', { name: /Diiklankan/i })).toBeTruthy();
      // Ada tombol Buat Kontrak
      const contractBtns = await screen.findAllByRole('button', { name: /Buat Kontrak/i });
      expect(contractBtns.length).toBeGreaterThanOrEqual(1);
    });

    it('kamar dengan kontrak berakhir (ended) dan tanpa iklan: tampil Kamar Kosong, Buat Kontrak, dan tombol Iklankan', async () => {
      render(
        <MemoryRouter initialEntries={['/t/tenant-kos-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      expect(await screen.findByText('Kamar 103')).toBeTruthy();
      // Tombol Iklankan muncul untuk Kamar 103 (bukan Diiklankan)
      expect(await screen.findByRole('button', { name: /^Iklankan$/i })).toBeTruthy();
    });

    it('KOS-2F.3 (K5): fetch kontrak kosong ([]) tetap menampilkan kamar occupied sebagai Terisi (bukan Kamar Kosong)', async () => {
      const opService = await import('../services/tenantOperationalService');
      opService.fetchKosContracts.mockResolvedValue([]);

      render(
        <MemoryRouter initialEntries={['/t/tenant-kos-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      // Kamar 101 berstatus occupied di unit: harus ada badge Terisi, bukan Kamar Kosong
      expect(await screen.findByText('Kamar 101')).toBeTruthy();
      const terisiBadges = await screen.findAllByText('Terisi');
      expect(terisiBadges.length).toBeGreaterThanOrEqual(1);

      // Kamar 102 tetap Kamar Kosong karena status unit vacant
      expect(await screen.findByText('Kamar 102')).toBeTruthy();
      const emptyBadges = await screen.findAllByText('Kamar Kosong');
      expect(emptyBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('RBAC-UI-1: Gate izin tombol kontrak, tagihan, iklan, dan checkout di matriks kos', () => {
    const kosMatrixRows = [
      {
        unit: { id: 101, label: 'Kamar 101', status: 'occupied' },
        resident: null,
        residents: [],
        cells: [{ period: '2026-10', status: 'unpaid', bill: { id: 'b-101', period: '2026-10', status: 'unpaid', amount: 1500000 } }],
      },
      {
        unit: { id: 102, label: 'Kamar 102', status: 'vacant' },
        resident: null,
        residents: [],
        cells: [{ period: '2026-10', status: 'none', bill: null }],
      },
    ];

    beforeEach(async () => {
      const dataService = await import('../services/dataService');
      dataService.fetchBillMatrix.mockResolvedValue(kosMatrixRows);

      const opService = await import('../services/tenantOperationalService');
      opService.fetchKosContracts.mockResolvedValue([]);
      opService.fetchTenantMembers.mockResolvedValue([
        { id: 'mem-101', user_id: 'u-warga', email: 'warga@example.com', unit_id: 101 },
      ]);

      const listService = await import('../services/publicListingService');
      listService.fetchTenantListings.mockResolvedValue([]);

      currentTenantTemplate = {
        name: 'Kos-kosan',
        unitLabel: 'Kamar',
        billLabel: 'Sewa',
        memberLabel: 'Penyewa',
        occupiedUnitLabel: 'Terisi',
        emptyUnitLabel: 'Kosong',
        icon: '🛏️',
      };
    });

    it('anggota biasa tanpa izin: tidak ada tombol Kontrak & Tagihan Kamar, Auto-Generate / Auto-Tagih Sewa, Buat Kontrak, Iklankan, dan Checkout', async () => {
      currentAuth = {
        ...mockAuth,
        role: 'warga',
        user: { id: 'u-warga', email: 'warga@example.com' },
        profile: { id: 'u-warga', full_name: 'Penyewa Biasa', email: 'warga@example.com', unit_id: 101 },
      };

      currentTenantState = {
        activeTenant: { id: 'tenant-kos-1', name: 'Kos Harmoni', type: 'kos' },
        activeTenantId: 'tenant-kos-1',
        userTenants: [],
        switchTenant: vi.fn(),
        subscriptionStatus: 'active',
        isPlatformAdmin: false,
        isOwner: false,
        userRole: 'anggota',
        hasPermission: () => false,
      };

      currentTenantAccess = {
        ...mockTenantAccessState,
        isMember: true,
        isStaff: false,
        canWrite: true, // subscriptionStatus 'active'
        canGenerateBilling: false,
        canManageMembers: false,
        canVerifyPayments: false,
        canRecordCash: false,
        canRecordTransfer: false,
      };

      render(
        <MemoryRouter initialEntries={['/t/tenant-kos-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      // Verifikasi di header toolbar
      expect(screen.queryByText(/Kontrak & Tagihan Kamar/i)).toBeNull();
      expect(screen.queryByText(/Auto-Tagih Sewa/i)).toBeNull();
      expect(screen.queryByText(/Auto-Generate/i)).toBeNull();
      expect(screen.queryByText(/Checkout Kamar/i)).toBeNull();

      // Beralih ke tab matriks transparansi
      const matrixTab = await screen.findByRole('button', { name: /Matriks Transparansi/i });
      fireEvent.click(matrixTab);

      // Warga hanya melihat unit miliknya sendiri (Kamar 101)
      expect(await screen.findByText('Kamar 101')).toBeTruthy();
      expect(screen.queryByText(/Buat Kontrak/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /^Iklankan$/i })).toBeNull();
    });

    it('staf tanpa izin billing/listing/members: melihat kamar kosong tetapi tidak ada tombol Buat Kontrak, Iklankan, tagihan, dan checkout', async () => {
      currentAuth = {
        ...mockAuth,
        role: 'pengurus',
        user: { id: 'u-pengawas', email: 'pengawas@example.com' },
        profile: { id: 'u-pengawas', full_name: 'Pengawas Kos', email: 'pengawas@example.com' },
      };

      currentTenantState = {
        activeTenant: { id: 'tenant-kos-1', name: 'Kos Harmoni', type: 'kos' },
        activeTenantId: 'tenant-kos-1',
        userTenants: [],
        switchTenant: vi.fn(),
        subscriptionStatus: 'active',
        isPlatformAdmin: false,
        isOwner: false,
        userRole: 'pengurus',
        hasPermission: (p) => p === 'view_reports',
      };

      currentTenantAccess = {
        ...mockTenantAccessState,
        isMember: true,
        isStaff: true,
        canWrite: true,
        canGenerateBilling: false,
        canManageMembers: false,
        canVerifyPayments: false,
        canRecordCash: false,
        canRecordTransfer: false,
        canViewReports: true,
      };

      render(
        <MemoryRouter initialEntries={['/t/tenant-kos-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      // Header toolbar
      expect(screen.queryByText(/Kontrak & Tagihan Kamar/i)).toBeNull();
      expect(screen.queryByText(/Auto-Tagih Sewa/i)).toBeNull();
      expect(screen.queryByText(/Checkout Kamar/i)).toBeNull();

      // Staf melihat kamar kosong (Kamar 102)
      expect(await screen.findByText('Kamar 102')).toBeTruthy();
      // Tombol Buat Kontrak & Iklankan di kamar kosong TIDAK ADA
      expect(screen.queryByText(/Buat Kontrak/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /^Iklankan$/i })).toBeNull();
    });

    it('owner kos: tombol Kontrak & Tagihan Kamar, Auto-Tagih Sewa, Buat Kontrak, Iklankan, dan Checkout Kamar tampil', async () => {
      currentAuth = { ...mockAuth, role: 'admin' };
      currentTenantState = {
        activeTenant: { id: 'tenant-kos-1', name: 'Kos Harmoni', type: 'kos', is_owner: true },
        activeTenantId: 'tenant-kos-1',
        userTenants: [],
        switchTenant: vi.fn(),
        subscriptionStatus: 'active',
        isPlatformAdmin: false,
        isOwner: true,
        userRole: 'admin',
        hasPermission: () => true,
      };

      currentTenantAccess = {
        ...mockTenantAccessState,
        isMember: true,
        isStaff: true,
        canWrite: true,
        canGenerateBilling: true,
        canManageMembers: true,
      };

      render(
        <MemoryRouter initialEntries={['/t/tenant-kos-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      expect(await screen.findByText(/Kontrak & Tagihan Kamar/i)).toBeTruthy();
      expect(screen.getByText(/Auto-Tagih Sewa/i)).toBeTruthy();
      expect(screen.getByText(/Checkout Kamar/i)).toBeTruthy();
      expect((await screen.findAllByText(/Buat Kontrak/i)).length).toBeGreaterThanOrEqual(1);
      expect(await screen.findByRole('button', { name: /^Iklankan$/i })).toBeTruthy();
    });

    it('anggota dengan generate_billing saja: tombol kontrak dan tagihan ada, checkout dan iklankan tidak ada', async () => {
      currentAuth = { ...mockAuth, role: 'pengurus' };
      currentTenantState = {
        activeTenant: { id: 'tenant-kos-1', name: 'Kos Harmoni', type: 'kos', permissions: ['generate_billing'] },
        activeTenantId: 'tenant-kos-1',
        userTenants: [],
        switchTenant: vi.fn(),
        subscriptionStatus: 'active',
        isPlatformAdmin: false,
        isOwner: false,
        userRole: 'pengurus',
        hasPermission: (p) => p === 'generate_billing',
      };

      currentTenantAccess = {
        ...mockTenantAccessState,
        isMember: true,
        isStaff: true,
        canWrite: true,
        canGenerateBilling: true,
        canManageMembers: false,
      };

      render(
        <MemoryRouter initialEntries={['/t/tenant-kos-1/payment-matrix']}>
          <PaymentMatrix />
        </MemoryRouter>
      );

      // Tombol tagihan & kontrak ada
      expect(await screen.findByText(/Kontrak & Tagihan Kamar/i)).toBeTruthy();
      expect(screen.getByText(/Auto-Tagih Sewa/i)).toBeTruthy();
      expect((await screen.findAllByText(/Buat Kontrak/i)).length).toBeGreaterThanOrEqual(1);

      // Checkout kamar dan iklankan TIDAK ada
      expect(screen.queryByText(/Checkout Kamar/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /^Iklankan$/i })).toBeNull();
    });
  });
});
