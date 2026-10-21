// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ChoosePlan from './ChoosePlan';

let mockActiveTenant = {
  id: 't-panitia-1',
  name: 'Panitia Wisuda 2026',
  type: 'panitia',
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => ({
    activeTenant: mockActiveTenant,
    activeTenantId: mockActiveTenant.id,
    userTenants: [mockActiveTenant],
    isDemo: false,
  }),
}));

vi.mock('../../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => ({
    name: mockActiveTenant.type === 'panitia' ? 'Kepanitiaan & Acara' : 'Kompleks RT/RW',
    unitLabel: mockActiveTenant.type === 'panitia' ? 'Acara' : 'Rumah',
  }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

describe('PANITIA-1F.1: ChoosePlan Page for Panitia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('bila tenant panitia, hanya menampilkan pemberitahuan dan tombol nonaktif tanpa kalkulator atau harga RT/RW', () => {
    mockActiveTenant = {
      id: 't-panitia-1',
      name: 'Panitia Wisuda 2026',
      type: 'panitia',
    };

    render(
      <MemoryRouter initialEntries={['/account/choose-plan']}>
        <Routes>
          <Route path="/account/choose-plan" element={<ChoosePlan />} />
        </Routes>
      </MemoryRouter>
    );

    // Kartu pemberitahuan tampil
    expect(
      screen.getByText('Harga paket Kepanitiaan (per acara aktif) segera tersedia')
    ).toBeTruthy();

    // Tombol nonaktif Paket Segera Tersedia tampil
    const disabledBtn = screen.getByRole('button', { name: /Paket Segera Tersedia/i });
    expect(disabledBtn).toBeTruthy();
    expect(disabledBtn.disabled).toBe(true);

    // Kalkulator tidak tampil
    expect(screen.queryByText(/Masukkan Perkiraan Jumlah/i)).toBeNull();

    // Angka harga (Rp ...) tidak tampil sama sekali di halaman
    expect(screen.queryByText(/Rp\s/i)).toBeNull();
    expect(screen.queryByText(/Lanjut ke Pembayaran QRIS/i)).toBeNull();
  });

  it('bila tenant RT/RW, tetap menampilkan kalkulator estimasi kebutuhan dan harga', () => {
    mockActiveTenant = {
      id: 't-rtrw-1',
      name: 'Palm Village RT 05',
      type: 'rt_rw',
    };

    render(
      <MemoryRouter initialEntries={['/account/choose-plan']}>
        <Routes>
          <Route path="/account/choose-plan" element={<ChoosePlan />} />
        </Routes>
      </MemoryRouter>
    );

    // Kalkulator tampil
    expect(screen.getByText(/Masukkan Perkiraan Jumlah/i)).toBeTruthy();

    // Tombol lanjut ke pembayaran tampil
    expect(screen.getByRole('button', { name: /Lanjut ke Pembayaran QRIS/i })).toBeTruthy();
  });
});
