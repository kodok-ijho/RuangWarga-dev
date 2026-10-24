// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ArisanMyContributions from './ArisanMyContributions';
import * as tenantOperationalService from '../../services/tenantOperationalService';

const h = React.createElement;

const { mockTenant, mockMember } = vi.hoisted(() => ({
  mockTenant: {
    id: 'tenant-arisan-1',
    name: 'Arisan Dahlia Indah',
    type: 'arisan',
  },
  mockMember: {
    id: 'mem-1',
    full_name: 'Ibu Ratna',
  },
}));

const mockRounds = [
  {
    id: 'round-1',
    round_number: 1,
    period: 'Oktober 2026',
    status: 'drawn',
    total_pool_amount: 500000,
    drawn_at: '2026-10-15T10:00:00Z',
    winner_member_id: 'mem-siti',
    winner: { full_name: 'Ibu Siti' },
    eligible_snapshot: [
      { member_id: 'mem-siti', full_name: 'Ibu Siti', slot_label: 'Slot 2' },
    ],
    excluded_snapshot: [],
  },
  {
    id: 'round-2',
    round_number: 2,
    period: 'November 2026',
    status: 'collecting',
    total_pool_amount: 500000,
  },
];

const mockBills = [
  {
    id: 'bill-1',
    round_number: 2,
    round_label: 'Putaran #2 - November 2026',
    amount: 250000,
    due_date: '2026-11-10',
    status: 'unpaid',
    period: 'Putaran 2',
  },
  {
    id: 'bill-2',
    round_number: 1,
    round_label: 'Putaran #1 - Oktober 2026',
    amount: 250000,
    due_date: '2026-10-10',
    status: 'paid',
    period: 'Putaran 1',
  },
  {
    id: 'bill-3',
    round_number: 3,
    round_label: 'Putaran #3 - Desember 2026',
    amount: 250000,
    due_date: '2026-12-10',
    status: 'pending_verification',
    period: 'Putaran 3',
  },
];

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => ({
    activeTenant: mockTenant,
    activeTenantId: mockTenant.id,
    activeMember: mockMember,
    hasPermission: () => true,
  }),
}));

vi.mock('../../context/TenantContext', () => ({
  useTenant: () => ({
    activeTenant: mockTenant,
    activeTenantId: mockTenant.id,
    activeMember: mockMember,
    hasPermission: () => true,
  }),
  TenantContext: React.createContext({
    activeTenant: mockTenant,
    activeTenantId: mockTenant.id,
    activeMember: mockMember,
    hasPermission: () => true,
  }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({
    isReadOnly: false,
    bannerText: '',
  }),
}));

vi.mock('../../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../../services/tenantOperationalService');
  return {
    ...actual,
    fetchMyArisanBills: vi.fn(),
    fetchArisanRounds: vi.fn(),
    getTenantBankAccount: vi.fn().mockReturnValue({
      bank_name: 'BCA',
      account_number: '1234567890',
      account_name: 'Bendahara Arisan',
    }),
    submitMemberTransfer: vi.fn().mockResolvedValue({ id: 'pay-1' }),
  };
});

describe('ArisanMyContributions (ARISAN-1.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantOperationalService.fetchMyArisanBills.mockResolvedValue(mockBills);
    tenantOperationalService.fetchArisanRounds.mockResolvedValue(mockRounds);
  });

  afterEach(() => {
    cleanup();
  });

  it('1. menampilkan daftar setoran anggota dengan nominal, status, dan hasil kocok terakhir', async () => {
    render(
      h(
        MemoryRouter,
        { initialEntries: ['/t/tenant-arisan-1/arisan/my'] },
        h(
          Routes,
          null,
          h(Route, { path: '/t/:tenantId/arisan/my', element: h(ArisanMyContributions) })
        )
      )
    );

    // Judul halaman
    await screen.findByRole('heading', { name: /Setoran Saya/i });

    // Hasil kocok terakhir
    expect(screen.getByText(/Hasil Kocok Terakhir/i)).toBeTruthy();
    expect(screen.getAllByText(/Putaran #1/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Ibu Siti')).toBeTruthy();
    expect(screen.getByText(/Riwayat Transparan/i)).toBeTruthy();

    // Tagihan 1: unpaid
    expect(screen.getByText(/Putaran #2 - November 2026/i)).toBeTruthy();
    expect(screen.getByText(/Belum bayar/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bayar/i })).toBeTruthy();

    // Tagihan 2: paid
    expect(screen.getByText(/Putaran #1 - Oktober 2026/i)).toBeTruthy();
    expect(screen.getAllByText(/Lunas/i).length).toBeGreaterThan(0);

    // Tagihan 3: pending_verification
    expect(screen.getByText(/Putaran #3 - Desember 2026/i)).toBeTruthy();
    expect(screen.getAllByText(/Menunggu verifikasi/i).length).toBeGreaterThan(0);
  });

  it('2. tombol bayar membuka modal bayar (MemberBillPayModal)', async () => {
    render(
      h(
        MemoryRouter,
        { initialEntries: ['/t/tenant-arisan-1/arisan/my'] },
        h(
          Routes,
          null,
          h(Route, { path: '/t/:tenantId/arisan/my', element: h(ArisanMyContributions) })
        )
      )
    );

    const payBtn = await screen.findByRole('button', { name: /Bayar/i });
    fireEvent.click(payBtn);

    // Modal terbuka dengan informasi rekening dan form upload bukti
    await screen.findByText(/Rekening Transfer Pengelola/i);
    expect(screen.getByText(/1234567890/)).toBeTruthy();
    expect(screen.getByText(/Unggah Bukti Transfer/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kirim Bukti Pembayaran/i })).toBeTruthy();
  });
});
