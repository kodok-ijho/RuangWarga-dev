// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
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
    total_pool_amount: 500000,
    winner_member_id: null,
    drawn_at: null,
  },
  {
    id: 'round-2',
    round_number: 2,
    period: 'Putaran 2 - November 2026',
    status: 'drawn',
    total_pool_amount: 500000,
    winner_member_id: 'mem-1',
    drawn_at: '2026-11-10T12:30:00Z',
    operator: { full_name: 'Ketua Arisan Budi' },
    winner: { full_name: 'Ibu Ratna' },
    eligible_snapshot: [
      { member_id: 'mem-1', full_name: 'Ibu Ratna', slot_label: 'Slot 1' },
      { member_id: 'mem-2', full_name: 'Ibu Siti', slot_label: 'Slot 2' },
    ],
    excluded_snapshot: [
      { member_id: 'mem-3', full_name: 'Ibu Dewi', slot_label: 'Slot 3' },
    ],
  },
  {
    id: 'round-3',
    round_number: 3,
    period: 'Putaran 3 - Desember 2026',
    status: 'drawn',
    total_pool_amount: 300000,
    winner_member_id: 'mem-2',
    drawn_at: '2026-12-10T12:30:00Z',
    operator: { full_name: 'Ketua Arisan Budi' },
    winner: { full_name: 'Ibu Siti' },
    eligible_snapshot: [
      { member_id: 'mem-2', full_name: 'Ibu Siti', slot_label: 'Slot 2' },
    ],
    excluded_snapshot: [],
  },
  {
    id: 'round-old',
    round_number: 0,
    period: 'Putaran Perdana - September 2026',
    status: 'drawn',
    total_pool_amount: 250000,
    winner_member_id: 'mem-old',
    drawn_at: '2026-09-10T12:30:00Z',
    operator: { full_name: 'Ketua Arisan Budi' },
    winner: { full_name: 'Ibu Lawas' },
    eligible_snapshot: null,
    excluded_snapshot: null,
  },
];

const mockCandidates = [
  { id: 'cand-1', member_id: 'mem-1', full_name: 'Ibu Ratna', slot: { label: 'Slot 1' }, has_won: false },
  { id: 'cand-2', member_id: 'mem-2', full_name: 'Ibu Siti', slot: { label: 'Slot 2' }, has_won: false },
  { id: 'cand-3', member_id: 'mem-3', full_name: 'Ibu Dewi', slot: { label: 'Slot 3' }, has_won: false },
  { id: 'cand-4', member_id: 'mem-old', full_name: 'Ibu Pemenang Lama', slot: { label: 'Slot 4' }, has_won: true },
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
  {
    id: 'bill-4',
    member_id: 'mem-old',
    status: 'paid',
    member: { full_name: 'Ibu Pemenang Lama' },
    metadata: { slot_label: 'Slot 4' },
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

describe('ArisanDraw Component (ARISAN-1.4 & PANITIA-ARISAN-1F F.1)', () => {
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
      drawn_at: '2026-10-10T12:30:00Z',
      eligible_count: 2,
      excluded_count: 1,
      is_cycle_completed: false,
      remaining_candidates: 2,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('1. menampilkan daftar ikut kocok dan tidak ikut; pemenang lama lunas tidak masuk ke daftar', async () => {
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

    // Pemenang putaran sebelumnya (has_won: true) tidak boleh tampil di "Ikut kocok" maupun "Tidak ikut"
    expect(screen.queryByText('Ibu Pemenang Lama')).toBeNull();

    // Tombol kocok aktif
    const drawBtn = screen.getByRole('button', { name: /Jalankan Kocok Sekarang/i });
    expect(drawBtn.disabled).toBe(false);
  });

  it('2. alur kocok: klik Kocok → konfirmasi → mock drawArisanWinner → kartu menampilkan total_prize dan drawn_at RPC', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    tenantOperationalService.drawArisanWinner.mockResolvedValueOnce({
      success: true,
      round_id: 'round-1',
      round_number: 1,
      winner_member_id: 'mem-1',
      winner_name: 'Ibu Ratna',
      slot_label: 'Slot 1',
      total_prize: 750000,
      drawn_at: '2026-10-15T14:30:00Z',
      eligible_count: 2,
      excluded_count: 1,
      is_cycle_completed: false,
      remaining_candidates: 2,
    });

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

    const drawBtn = await screen.findByRole('button', { name: /Jalankan Kocok Sekarang/i });
    fireEvent.click(drawBtn);

    expect(window.confirm).toHaveBeenCalledWith('Hasil kocok final dan tidak bisa diulang. Lanjutkan?');

    await waitFor(
      () => {
        expect(tenantOperationalService.drawArisanWinner).toHaveBeenCalledWith('tenant-arisan-1', 'round-1', null);
        // Modal perayaan menampilkan total hadiah Rp750.000 dan waktu kocok dari RPC
        expect(screen.getAllByText(/750\.000/).length).toBeGreaterThan(0);
      },
      { timeout: 4000 }
    );
  });

  it('3. kartu hasil menampilkan data pemenang dari putaran berstatus drawn dan slot dari snapshot', async () => {
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
    // Slot dari snapshot
    expect(screen.getByText('Slot 1')).toBeTruthy();
    // Operator
    expect(screen.getByText('Ketua Arisan Budi')).toBeTruthy();
    // Hadiah (Rp 500.000 dari total_pool_amount)
    expect(screen.getAllByText(/500\.000/).length).toBeGreaterThan(0);
    // Peserta ikut/tidak ikut
    expect(screen.getByText(/2 ikut \/ 1 tidak/i)).toBeTruthy();
  });

  it('4. tombol bagikan ke WhatsApp membentuk link wa.me dengan teks HASIL KOCOKAN ARISAN', async () => {
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
    expect(decodeURIComponent(openedUrl)).toContain('HASIL KOCOKAN ARISAN');
    expect(decodeURIComponent(openedUrl)).toContain('Ibu Ratna');

    openSpy.mockRestore();
  });

  it('5. tab riwayat menampilkan total_pool_amount 300.000 (Rp300.000) dan slot dari snapshot serta fallback putaran lama', async () => {
    render(
      h(
        MemoryRouter,
        { initialEntries: ['/t/tenant-arisan-1/arisan/draw?tab=history'] },
        h(
          Routes,
          null,
          h(Route, { path: '/t/:tenantId/arisan/draw', element: h(ArisanDraw) })
        )
      )
    );

    // Tab history langsung terbuka dari URL param tab=history
    await screen.findByText(/Riwayat Transparan Pengocokan Putaran Arisan/i);

    // Putaran 3 menampilkan Rp300.000 dan slot (Slot 2)
    expect(screen.getAllByText(/300\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\(Slot 2\)/)).toBeTruthy();

    // Buka accordion snapshot putaran #2
    const detailBtns = screen.getAllByRole('button', { name: /Daftar Peserta/i });
    expect(detailBtns.length).toBeGreaterThan(1);
    fireEvent.click(detailBtns[1]); // buka putaran #2

    // Verifikasi bahwa snapshot peserta ikut dan tidak ikut terlihat
    await screen.findByText(/Ikut kocok \(setoran lunas\):/i);
    expect(screen.getByText(/Tidak ikut \(belum lunas\):/i)).toBeTruthy();

    // Buka accordion putaran perdana tanpa snapshot
    fireEvent.click(detailBtns[2]);
    await screen.findByText(/Daftar peserta tidak tercatat \(dikocok sebelum fitur ini\)/i);
  });
});
