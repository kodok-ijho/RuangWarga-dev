// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ArisanDraw from './ArisanDraw';
import * as tenantOperationalService from '../../services/tenantOperationalService';

const h = React.createElement;

const mockTenant = {
  id: 'tenant-arisan-1',
  name: 'Arisan Dahlia Indah',
  type: 'arisan',
};

const mockRounds = [
  {
    id: 'round-1',
    round_number: 1,
    period: 'Putaran 1 - Oktober 2026',
    status: 'collecting',
    pool_amount: 500000,
    winner_member_id: null,
    drawn_at: null,
  },
  {
    id: 'round-2',
    round_number: 2,
    period: 'Putaran 2 - November 2026',
    status: 'drawn',
    pool_amount: 500000,
    drawn_at: '2026-11-10T12:30:00Z',
    operator: { full_name: 'Ketua Arisan Budi' },
    winner: { full_name: 'Ibu Ratna', unit: { name: 'Slot 1' } },
    slot_label: 'Slot 1',
    eligible_snapshot: ['Ibu Ratna', 'Ibu Siti'],
    excluded_snapshot: ['Ibu Dewi'],
  },
  {
    id: 'round-3',
    round_number: 3,
    period: 'Putaran 3 - Desember 2026',
    status: 'drawn',
    pool_amount: 250000,
    drawn_at: '2026-12-10T12:30:00Z',
    operator: { full_name: 'Ketua Arisan Budi' },
    winner: { full_name: 'Ibu Siti' },
    eligible_snapshot: null,
    excluded_snapshot: null,
  },
];

const mockCandidates = [
  { id: 'mem-1', full_name: 'Ibu Ratna', unit: { name: 'Slot 1' } },
  { id: 'mem-2', full_name: 'Ibu Siti', unit: { name: 'Slot 2' } },
  { id: 'mem-3', full_name: 'Ibu Dewi', unit: { name: 'Slot 3' } },
];

const mockRoundBills = [
  {
    id: 'bill-1',
    member_id: 'mem-1',
    status: 'paid',
    member: { full_name: 'Ibu Ratna' },
    metadata: { slot_label: 'Slot 1' },
  },
  {
    id: 'bill-2',
    member_id: 'mem-2',
    status: 'paid',
    member: { full_name: 'Ibu Siti' },
    metadata: { slot_label: 'Slot 2' },
  },
  {
    id: 'bill-3',
    member_id: 'mem-3',
    status: 'unpaid',
    member: { full_name: 'Ibu Dewi' },
    metadata: { slot_label: 'Slot 3' },
  },
];

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => ({
    activeTenant: mockTenant,
    activeTenantId: mockTenant.id,
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
    fetchArisanRounds: vi.fn(),
    fetchArisanParticipants: vi.fn(),
    fetchArisanCandidates: vi.fn(),
    fetchArisanRoundBills: vi.fn(),
    drawArisanWinner: vi.fn(),
    startNewArisanCycle: vi.fn(),
  };
});

describe('ArisanDraw Component (ARISAN-1.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantOperationalService.fetchArisanRounds.mockResolvedValue(mockRounds);
    tenantOperationalService.fetchArisanParticipants.mockResolvedValue(mockCandidates);
    tenantOperationalService.fetchArisanCandidates.mockResolvedValue(mockCandidates);
    tenantOperationalService.fetchArisanRoundBills.mockResolvedValue(mockRoundBills);
    tenantOperationalService.drawArisanWinner.mockResolvedValue({
      success: true,
      round_id: 'round-1',
      round_number: 1,
      winner_member_id: 'mem-1',
      winner_name: 'Ibu Ratna',
      slot_label: 'Slot 1',
      total_prize: 500000,
      eligible_count: 2,
      excluded_count: 1,
      is_cycle_completed: false,
      remaining_candidates: 2,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('1. menampilkan daftar ikut kocok (setoran lunas) dan tidak ikut (belum lunas) sebelum kocok', async () => {
    render(
      h(
        MemoryRouter,
        { initialEntries: ['/t/tenant-arisan-1/arisan/draw?roundId=round-1'] },
        h(
          Routes,
          null,
          h(Route, { path: '/t/:tenantId/arisan/draw', element: h(ArisanDraw) })
        )
      )
    );

    // Tunggu komponen memuat data dan arena tampil
    await screen.findByText(/Ikut kocok \(setoran lunas\)/i);
    expect(screen.getByText(/Tidak ikut \(belum lunas\)/i)).toBeTruthy();

    // Periksa bahwa peserta yang lunas tampil di daftar ikut
    expect(screen.getAllByText('Ibu Ratna').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ibu Siti').length).toBeGreaterThan(0);

    // Periksa bahwa peserta belum lunas tampil di daftar tidak ikut
    expect(screen.getAllByText('Ibu Dewi').length).toBeGreaterThan(0);

    // Tombol kocok aktif
    const drawBtn = screen.getByRole('button', { name: /Jalankan Kocok Sekarang/i });
    expect(drawBtn.disabled).toBe(false);
  });

  it('2. kartu hasil menampilkan data pemenang dari putaran berstatus drawn / RPC tiruan', async () => {
    render(
      h(
        MemoryRouter,
        { initialEntries: ['/t/tenant-arisan-1/arisan/draw?roundId=round-2'] },
        h(
          Routes,
          null,
          h(Route, { path: '/t/:tenantId/arisan/draw', element: h(ArisanDraw) })
        )
      )
    );

    await screen.findByText(/Pemenang Terpilih/i);

    // Pemenang Ibu Ratna
    expect(screen.getAllByText('Ibu Ratna').length).toBeGreaterThan(0);
    // Operator
    expect(screen.getByText('Ketua Arisan Budi')).toBeTruthy();
    // Hadiah (Rp 500.000)
    expect(screen.getAllByText(/500\.000/).length).toBeGreaterThan(0);
    // Peserta ikut/tidak ikut
    expect(screen.getByText(/2 ikut \/ 1 tidak/i)).toBeTruthy();
  });

  it('3. tombol bagikan ke WhatsApp membentuk link wa.me dengan teks hasil kocok', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});

    render(
      h(
        MemoryRouter,
        { initialEntries: ['/t/tenant-arisan-1/arisan/draw?roundId=round-2'] },
        h(
          Routes,
          null,
          h(Route, { path: '/t/:tenantId/arisan/draw', element: h(ArisanDraw) })
        )
      )
    );

    const shareBtn = await screen.findByRole('button', { name: /Bagikan ke WhatsApp/i });
    fireEvent.click(shareBtn);

    expect(openSpy).toHaveBeenCalled();
    const openedUrl = openSpy.mock.calls[0][0];
    expect(openedUrl.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(openedUrl)).toContain('HASIL PENGUKURAN & KOCOKAN ARISAN');
    expect(decodeURIComponent(openedUrl)).toContain('Ibu Ratna');

    openSpy.mockRestore();
  });

  it('4. tab riwayat transparan menampilkan snapshot peserta dan fallback putaran lama', async () => {
    render(
      h(
        MemoryRouter,
        { initialEntries: ['/t/tenant-arisan-1/arisan/draw'] },
        h(
          Routes,
          null,
          h(Route, { path: '/t/:tenantId/arisan/draw', element: h(ArisanDraw) })
        )
      )
    );

    // Tunggu tab Riwayat Transparan muncul
    const historyTabBtn = await screen.findByRole('button', { name: /Riwayat Transparan/i });
    fireEvent.click(historyTabBtn);

    // Periksa daftar putaran riwayat (round-2 dan round-3)
    const round2Elements = await screen.findAllByText(/Putaran #2/i);
    expect(round2Elements.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Putaran #3/i).length).toBeGreaterThan(0);

    // Buka accordion snapshot putaran #2 (index 1 karena round-3 round_number lebih besar)
    const detailBtns = screen.getAllByRole('button', { name: /Daftar Peserta/i });
    expect(detailBtns.length).toBeGreaterThan(1);
    fireEvent.click(detailBtns[1]); // buka putaran #2

    // Verifikasi bahwa snapshot peserta ikut dan tidak ikut terlihat
    await screen.findByText(/Ikut kocok \(setoran lunas\):/i);
    expect(screen.getByText(/Tidak ikut \(belum lunas\):/i)).toBeTruthy();

    // Buka accordion snapshot putaran #3 (putaran lama tanpa snapshot, index 0)
    fireEvent.click(detailBtns[0]); // buka putaran #3
    await screen.findByText(/Daftar peserta tidak tercatat \(dikocok sebelum fitur ini\)/i);
  });
});
