// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ArisanRounds from './ArisanRounds';
import * as tenantOperationalService from '../../services/tenantOperationalService';

const h = React.createElement;

const mockTenant = {
  id: 'tenant-arisan-1',
  name: 'Arisan Dahlia Indah',
  type: 'arisan',
  settings: {
    contribution_amount: 250000,
    slot_count: 5,
    bank_account: {
      bank_name: 'BCA',
      account_number: '1234567890',
      account_holder: 'Bendahara Arisan Dahlia',
    },
  },
};

const mockRounds = [
  {
    id: 'round-1',
    tenant_id: 'tenant-arisan-1',
    round_number: 1,
    period: 'Putaran 1 - Oktober 2026',
    status: 'collecting',
    total_pool_amount: 750000,
    winner_member_id: null,
    drawn_at: null,
    created_at: '2026-10-01T00:00:00Z',
  },
];

const mockParticipants = [
  { id: 'part-1', member_id: 'mem-1', has_won: false },
  { id: 'part-2', member_id: 'mem-2', has_won: false },
  { id: 'part-3', member_id: 'mem-3', has_won: false },
  { id: 'part-4', member_id: 'mem-4', has_won: false },
  { id: 'part-5', member_id: 'mem-5', has_won: false },
];

const mockRoundBills = [
  {
    id: 'bill-1',
    tenant_id: 'tenant-arisan-1',
    member_id: 'mem-1',
    amount: 250000,
    status: 'paid',
    due_date: '2026-10-15',
    member: { id: 'mem-1', full_name: 'Ibu Ratna', phone: '0811111111' },
    tenant_members: { id: 'mem-1', full_name: 'Ibu Ratna', phone: '0811111111' },
    tenant_units: { id: 1, label: 'Slot-1' },
    latestPayment: { id: 'pay-1', status: 'approved' },
  },
  {
    id: 'bill-2',
    tenant_id: 'tenant-arisan-1',
    member_id: 'mem-2',
    amount: 250000,
    status: 'pending_verification',
    due_date: '2026-10-15',
    member: { id: 'mem-2', full_name: 'Ibu Dewi', phone: '0822222222' },
    tenant_members: { id: 'mem-2', full_name: 'Ibu Dewi', phone: '0822222222' },
    tenant_units: { id: 2, label: 'Slot-2' },
    latestPayment: { id: 'pay-2', status: 'pending' },
  },
  {
    id: 'bill-3',
    tenant_id: 'tenant-arisan-1',
    member_id: 'mem-3',
    amount: 250000,
    status: 'unpaid',
    due_date: '2026-10-15',
    member: { id: 'mem-3', full_name: 'Pak Doni', phone: '0833333333' },
    tenant_members: { id: 'mem-3', full_name: 'Pak Doni', phone: '0833333333' },
    tenant_units: { id: 3, label: 'Slot-3' },
    latestPayment: null,
  },
  {
    id: 'bill-4',
    tenant_id: 'tenant-arisan-1',
    member_id: 'mem-4',
    amount: 250000,
    status: 'unpaid',
    due_date: '2026-10-15',
    member: { id: 'mem-4', full_name: 'Pak Eko', phone: null },
    tenant_members: { id: 'mem-4', full_name: 'Pak Eko', phone: null },
    tenant_units: { id: 4, label: 'Slot-4' },
    latestPayment: null,
  },
  {
    id: 'bill-5',
    tenant_id: 'tenant-arisan-1',
    member_id: 'mem-5',
    amount: 250000,
    status: 'cancelled',
    due_date: '2026-10-15',
    member: { id: 'mem-5', full_name: 'Pak Batal', phone: '0855555555' },
    tenant_members: { id: 'mem-5', full_name: 'Pak Batal', phone: '0855555555' },
    tenant_units: { id: 5, label: 'Slot-5' },
    latestPayment: null,
  },
];

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => ({
    activeTenant: mockTenant,
    activeTenantId: mockTenant.id,
    hasPermission: (perm) => [
      'run_special_action',
      'generate_billing',
      'manage_billing_cash',
      'manage_billing_transfer',
    ].includes(perm),
  }),
}));

vi.mock('../../hooks/useTenantAccess', () => ({
  useTenantAccess: () => ({
    canVerifyPayments: true,
    canRecordCash: true,
    canRecordTransfer: true,
    canGenerateBilling: true,
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
    fetchArisanRounds: vi.fn(),
    fetchArisanParticipants: vi.fn(),
    fetchArisanRoundBills: vi.fn(),
    payArisanBillManual: vi.fn(),
    generateArisanRoundBills: vi.fn(),
  };
});

describe('ARISAN-1.3 & PANITIA-ARISAN-1F F.2: ArisanRounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantOperationalService.fetchArisanRounds.mockResolvedValue(mockRounds);
    tenantOperationalService.fetchArisanParticipants.mockResolvedValue(mockParticipants);
    tenantOperationalService.fetchArisanRoundBills.mockResolvedValue(mockRoundBills);
  });

  afterEach(() => {
    cleanup();
  });

  it('menampilkan status peserta (Lunas, Menunggu verifikasi, Belum bayar, Dibatalkan) dan ringkasan; cancelled tidak dihitung belum bayar', async () => {
    render(h(MemoryRouter, null, h(ArisanRounds)));

    await screen.findByText('Putaran 1 - Oktober 2026');

    // Buka modal Rincian Iuran
    const iuranBtn = screen.getByRole('button', { name: /Iuran Peserta/i });
    fireEvent.click(iuranBtn);

    await screen.findByText('Rincian Iuran — Putaran 1 - Oktober 2026');

    // Ringkasan Setoran: 1 Lunas, 1 Menunggu verifikasi, 2 Belum bayar (cancelled tidak dihitung sebagai belum bayar)
    expect(screen.getByText('Ringkasan Setoran')).toBeTruthy();
    expect(screen.getByText(/1 Lunas/i)).toBeTruthy();
    expect(screen.getByText(/1 Menunggu verifikasi/i)).toBeTruthy();
    expect(screen.getByText(/2 Belum bayar/i)).toBeTruthy();

    // Verifikasi peserta
    expect(screen.getByText('Ibu Ratna')).toBeTruthy();
    expect(screen.getByText('Lunas')).toBeTruthy();

    expect(screen.getByText('Ibu Dewi')).toBeTruthy();
    expect(screen.getByText('Menunggu verifikasi')).toBeTruthy();
    expect(screen.getByText('Verifikasi')).toBeTruthy();

    expect(screen.getByText('Pak Doni')).toBeTruthy();
    expect(screen.getByText('Pak Eko')).toBeTruthy();
    expect(screen.getAllByText('Belum bayar').length).toBe(2);

    // Tagihan cancelled diberi badge "Dibatalkan" tanpa aksi
    expect(screen.getByText('Pak Batal')).toBeTruthy();
    expect(screen.getByText('Dibatalkan')).toBeTruthy();
  });

  it('menampilkan tombol "Ingatkan via WA" hanya bila peserta belum bayar DAN nomor HP ada', async () => {
    render(h(MemoryRouter, null, h(ArisanRounds)));

    await screen.findByText('Putaran 1 - Oktober 2026');
    const iuranBtn = screen.getByRole('button', { name: /Iuran Peserta/i });
    fireEvent.click(iuranBtn);

    await screen.findByText('Rincian Iuran — Putaran 1 - Oktober 2026');

    // Pak Doni punya phone -> ada tombol WA
    // Pak Eko phone null -> TIDAK ada tombol WA
    // Ibu Ratna lunas, Ibu Dewi pending, Pak Batal cancelled -> TIDAK ada tombol WA
    // Jadi hanya ada tepat 1 tombol "Ingatkan via WA"
    const waLinks = screen.getAllByRole('link', { name: /Ingatkan via WA/i });
    expect(waLinks).toHaveLength(1);

    const waHref = waLinks[0].getAttribute('href');
    expect(waHref).toContain('wa.me/62833333333');
    expect(waHref).toContain(encodeURIComponent('Pengingat setoran arisan'));
  });

  it('tombol "Salin pengingat semua" menyalin teks daftar yang belum lunas ke clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(h(MemoryRouter, null, h(ArisanRounds)));

    await screen.findByText('Putaran 1 - Oktober 2026');
    const iuranBtn = screen.getByRole('button', { name: /Iuran Peserta/i });
    fireEvent.click(iuranBtn);

    await screen.findByText('Rincian Iuran — Putaran 1 - Oktober 2026');

    const copyBtn = screen.getByRole('button', {
      name: /Salin pengingat semua yang belum bayar/i,
    });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedText = writeTextMock.mock.calls[0][0];
    expect(copiedText).toContain('Pengingat Setoran Arisan');
    expect(copiedText).toContain('Pak Doni');
    expect(copiedText).toContain('Pak Eko');
    expect(copiedText).not.toContain('Pak Batal'); // cancelled tidak masuk
    await vi.waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(
        'Daftar pengingat berhasil disalin ke clipboard.'
      );
    });
  });

  it('clipboard menolak saat salin pengingat -> tampil toast error gagal', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Akses clipboard ditolak'));
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(h(MemoryRouter, null, h(ArisanRounds)));

    await screen.findByText('Putaran 1 - Oktober 2026');
    const iuranBtn = screen.getByRole('button', { name: /Iuran Peserta/i });
    fireEvent.click(iuranBtn);

    await screen.findByText('Rincian Iuran — Putaran 1 - Oktober 2026');

    const copyBtn = screen.getByRole('button', {
      name: /Salin pengingat semua yang belum bayar/i,
    });
    fireEvent.click(copyBtn);

    // Tunggu pemanggilan promise rejected
    await vi.waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Akses clipboard ditolak');
    });
  });
});
