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

describe('ARISAN-1.3: ArisanRounds — Modal Rincian Iuran & Pengingat WA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantOperationalService.fetchArisanRounds.mockResolvedValue(mockRounds);
    tenantOperationalService.fetchArisanParticipants.mockResolvedValue(mockParticipants);
    tenantOperationalService.fetchArisanRoundBills.mockResolvedValue(mockRoundBills);
  });

  afterEach(() => {
    cleanup();
  });

  it('menampilkan status tiga peserta (Lunas, Menunggu verifikasi, Belum bayar) dan ringkasan', async () => {
    render(h(MemoryRouter, null, h(ArisanRounds)));

    // Tunggu putaran termuat
    await screen.findByText('Putaran 1 - Oktober 2026');

    // Buka modal Rincian Iuran
    const iuranBtn = screen.getByRole('button', { name: /Iuran Peserta/i });
    fireEvent.click(iuranBtn);

    // Verifikasi modal terbuka
    await screen.findByText('Rincian Iuran — Putaran 1 - Oktober 2026');

    // 1. Verifikasi Ringkasan Setoran
    expect(screen.getByText('Ringkasan Setoran')).toBeTruthy();
    expect(screen.getByText(/1 Lunas/i)).toBeTruthy();
    expect(screen.getByText(/1 Menunggu verifikasi/i)).toBeTruthy();
    expect(screen.getByText(/1 Belum bayar/i)).toBeTruthy();
    expect(screen.getAllByText(/Rp\s*250\.000/i).length).toBeGreaterThanOrEqual(1); // Total Terkumpul (1 x 250k)

    // Keterangan aturan kocokan
    expect(
      screen.getAllByText('Peserta yang belum lunas tidak ikut kocok putaran ini.').length
    ).toBeGreaterThanOrEqual(1);

    // 2. Verifikasi status 3 peserta
    expect(screen.getByText('Ibu Ratna')).toBeTruthy();
    expect(screen.getByText('Lunas')).toBeTruthy();

    expect(screen.getByText('Ibu Dewi')).toBeTruthy();
    expect(screen.getByText('Menunggu verifikasi')).toBeTruthy();
    expect(screen.getByText('Verifikasi')).toBeTruthy(); // link ke /payment-verification

    expect(screen.getByText('Pak Doni')).toBeTruthy();
    expect(screen.getByText('Belum bayar')).toBeTruthy();
  });

  it('menampilkan tombol "Ingatkan via WA" HANYA untuk peserta yang belum bayar', async () => {
    render(h(MemoryRouter, null, h(ArisanRounds)));

    await screen.findByText('Putaran 1 - Oktober 2026');
    const iuranBtn = screen.getByRole('button', { name: /Iuran Peserta/i });
    fireEvent.click(iuranBtn);

    await screen.findByText('Rincian Iuran — Putaran 1 - Oktober 2026');

    // Tombol WA harus ada tepat 1 (hanya untuk Pak Doni yang belum bayar)
    const waLinks = screen.getAllByRole('link', { name: /Ingatkan via WA/i });
    expect(waLinks).toHaveLength(1);

    const waHref = waLinks[0].getAttribute('href');
    expect(waHref).toContain('wa.me/62833333333');
    expect(waHref).toContain(encodeURIComponent('Pengingat setoran arisan'));
  });

  it('tombol "Salin pengingat semua yang belum bayar" menyalin teks daftar yang belum lunas ke clipboard', async () => {
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
    expect(copyBtn).toBeTruthy();

    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedText = writeTextMock.mock.calls[0][0];
    expect(copiedText).toContain('Pengingat Setoran Arisan');
    expect(copiedText).toContain('Pak Doni');
    expect(copiedText).toMatch(/Rp\s*250\.000/);
    expect(copiedText).toContain('Peserta yang belum lunas tidak ikut kocok putaran ini.');
    expect(mockToast.success).toHaveBeenCalledWith(
      'Daftar pengingat berhasil disalin ke clipboard.'
    );
  });
});
