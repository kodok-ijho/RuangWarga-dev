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
  {
    id: 'cand-1',
    member_id: 'mem-1',
    full_name: 'Ibu Ratna',
    member: { id: 'mem-1', full_name: 'Ibu Ratna', status: 'approved' },
    slot: { label: 'Slot 1' },
    has_won: false,
  },
  {
    id: 'cand-2',
    member_id: 'mem-2',
    full_name: 'Ibu Siti',
    member: { id: 'mem-2', full_name: 'Ibu Siti', status: 'approved' },
    slot: { label: 'Slot 2' },
    has_won: false,
  },
  {
    id: 'cand-3',
    member_id: 'mem-3',
    full_name: 'Ibu Dewi',
    member: { id: 'mem-3', full_name: 'Ibu Dewi', status: 'approved' },
    slot: { label: 'Slot 3' },
    has_won: false,
  },
  {
    id: 'cand-4',
    member_id: 'mem-old',
    full_name: 'Ibu Pemenang Lama',
    member: { id: 'mem-old', full_name: 'Ibu Pemenang Lama', status: 'approved' },
    slot: { label: 'Slot 4' },
    has_won: true,
  },
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
    expect(screen.getAllByText('Slot 1').length).toBeGreaterThan(0);
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

  describe('2F.2: Filter Kandidat dan Resolusi Status Tagihan Per Anggota', () => {
    it('kandidat berstatus left / pending tidak tampil di kedua daftar dan tidak dihitung statistik', async () => {
      const candidatesWithInactive = [
        ...mockCandidates,
        {
          id: 'cand-left',
          member_id: 'mem-left',
          full_name: 'Bpk Keluar',
          member: { id: 'mem-left', full_name: 'Bpk Keluar', status: 'left' },
          slot: { label: 'Slot 5' },
          has_won: false,
        },
        {
          id: 'cand-pending',
          member_id: 'mem-pending',
          full_name: 'Sdr Menunggu',
          member: { id: 'mem-pending', full_name: 'Sdr Menunggu', status: 'pending' },
          slot: { label: 'Slot 6' },
          has_won: false,
        },
      ];
      tenantOperationalService.fetchArisanCandidates.mockResolvedValueOnce(candidatesWithInactive);

      // Beri tagihan paid untuk Bpk Keluar dan unpaid untuk Sdr Menunggu
      tenantOperationalService.fetchArisanRoundBills.mockResolvedValueOnce([
        ...mockRoundBills,
        {
          id: 'bill-left',
          member_id: 'mem-left',
          status: 'paid',
          member: { full_name: 'Bpk Keluar' },
        },
        {
          id: 'bill-pending',
          member_id: 'mem-pending',
          status: 'unpaid',
          member: { full_name: 'Sdr Menunggu' },
        },
      ]);

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

      await screen.findByText(/Ikut kocok \(setoran lunas\)/i);

      // Bpk Keluar (left) dan Sdr Menunggu (pending) tidak boleh tampil di mana pun
      expect(screen.queryByText('Bpk Keluar')).toBeNull();
      expect(screen.queryByText('Sdr Menunggu')).toBeNull();

      // Statistik hanya menghitung kandidat approved: 2 lunas (Ratna, Siti) + 1 belum lunas (Dewi) = 3 total (67%)
      expect(screen.getByText(/2 dari 3 Peserta Lunas/i)).toBeTruthy();
      expect(screen.getByText('67%')).toBeTruthy();
    });

    it('anggota dengan tagihan cancelled + paid (urutan apa pun) tampil di Ikut kocok', async () => {
      // Ratna: [cancelled, paid]
      // Siti: [paid, cancelled]
      const billsCancelledPaid = [
        {
          id: 'bill-ratna-cancelled',
          member_id: 'mem-1',
          status: 'cancelled',
          member: { full_name: 'Ibu Ratna' },
        },
        {
          id: 'bill-ratna-paid',
          member_id: 'mem-1',
          status: 'paid',
          member: { full_name: 'Ibu Ratna' },
        },
        {
          id: 'bill-siti-paid',
          member_id: 'mem-2',
          status: 'paid',
          member: { full_name: 'Ibu Siti' },
        },
        {
          id: 'bill-siti-cancelled',
          member_id: 'mem-2',
          status: 'cancelled',
          member: { full_name: 'Ibu Siti' },
        },
        {
          id: 'bill-dewi-only-cancelled',
          member_id: 'mem-3',
          status: 'cancelled',
          member: { full_name: 'Ibu Dewi' },
        },
      ];
      tenantOperationalService.fetchArisanRoundBills.mockResolvedValueOnce(billsCancelledPaid);

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

      await screen.findByText(/Ikut kocok \(setoran lunas\)/i);

      // Ibu Ratna (cancelled + paid) dan Ibu Siti (paid + cancelled) harus berada di Ikut kocok
      expect(screen.getAllByText('Ibu Ratna').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ibu Siti').length).toBeGreaterThan(0);

      // Ibu Dewi (hanya cancelled) berada di Tidak ikut (belum lunas)
      expect(screen.getAllByText('Ibu Dewi').length).toBeGreaterThan(0);

      // Statistik: 2 lunas, 1 belum lunas
      expect(screen.getByText(/2 dari 3 Peserta Lunas/i)).toBeTruthy();
      expect(screen.getByText('67%')).toBeTruthy();
    });
  });
});
