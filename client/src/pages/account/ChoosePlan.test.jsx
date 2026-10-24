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

  it('HARGA.4: ChoosePlan panitia menampilkan "Rp25.000" dan "gratis 1 bulan" tanpa kalkulator', () => {
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

    // Menampilkan model penetapan harga Rp25.000 dan gratis 1 bulan
    expect(screen.getAllByText(/Rp\s*25\.000/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/gratis 1 bulan/i).length).toBeGreaterThan(0);

    // Kalkulator blok tidak tampil
    expect(screen.queryByText(/Masukkan Perkiraan Jumlah/i)).toBeNull();
    expect(screen.queryByText(/Rekomendasi Terbaik/i)).toBeNull();

    // Tombol navigasi ke daftar acara tampil
    expect(screen.getByRole('button', { name: /Buka Daftar Acara/i })).toBeTruthy();
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
