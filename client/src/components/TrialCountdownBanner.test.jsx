// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrialCountdownBanner from './TrialCountdownBanner';

vi.mock('../hooks/useTenant', () => ({
  useTenant: vi.fn(),
}));

import { useTenant } from '../hooks/useTenant';

describe('TrialCountdownBanner Component (KOS-1F.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('trial + admin → banner countdown tampil dengan tombol pilih paket', () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    useTenant.mockReturnValue({
      activeTenant: {
        id: 't-kos-1',
        name: 'Kos Melati Harmoni',
        subscription: {
          status: 'trial',
          trial_ends_at: futureDate,
        },
      },
      activeTenantId: 't-kos-1',
      userTenants: [],
      isTenantAdmin: true,
    });

    render(
      <MemoryRouter>
        <TrialCountdownBanner />
      </MemoryRouter>
    );

    expect(screen.getByText('Masa percobaan gratis Anda sedang berjalan')).toBeTruthy();
    expect(screen.getByText('Pilih Paket Sekarang')).toBeTruthy();
  });

  it('trial + non-admin → kosong (return null)', () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    useTenant.mockReturnValue({
      activeTenant: {
        id: 't-kos-1',
        name: 'Kos Melati Harmoni',
        subscription: {
          status: 'trial',
          trial_ends_at: futureDate,
        },
      },
      activeTenantId: 't-kos-1',
      userTenants: [],
      isTenantAdmin: false,
    });

    const { container } = render(
      <MemoryRouter>
        <TrialCountdownBanner />
      </MemoryRouter>
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('Masa percobaan gratis Anda sedang berjalan')).toBeNull();
  });

  it('read_only + non-admin → tampil dengan teks anggota tanpa tombol', () => {
    useTenant.mockReturnValue({
      activeTenant: {
        id: 't-kos-1',
        name: 'Kos Melati Harmoni',
        subscription: {
          status: 'read_only',
        },
      },
      activeTenantId: 't-kos-1',
      userTenants: [],
      isTenantAdmin: false,
    });

    render(
      <MemoryRouter>
        <TrialCountdownBanner />
      </MemoryRouter>
    );

    expect(
      screen.getByText(
        'Layanan sedang dalam mode baca-saja. Pembayaran baru untuk sementara belum bisa dicatat. Hubungi pengelola.'
      )
    ).toBeTruthy();
    expect(screen.queryByText('Aktifkan Langganan Sekarang')).toBeNull();
  });

  it('HARGA.4: TrialCountdownBanner tidak dirender untuk panitia dengan trial_ends_at lampau', () => {
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    useTenant.mockReturnValue({
      activeTenant: {
        id: 't-panitia-1',
        name: 'Panitia Dies Natalis 2026',
        type: 'panitia',
        subscription: {
          status: 'trial',
          trial_ends_at: pastDate,
        },
      },
      activeTenantId: 't-panitia-1',
      userTenants: [],
      isTenantAdmin: true,
    });

    const { container } = render(
      <MemoryRouter>
        <TrialCountdownBanner />
      </MemoryRouter>
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/Mode Read-Only/i)).toBeNull();
    expect(screen.queryByText(/Masa Percobaan Berakhir/i)).toBeNull();
  });

  it('HARGA.4: RT/RW tetap seperti sebelumnya (tampil read-only jika trial lampau)', () => {
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    useTenant.mockReturnValue({
      activeTenant: {
        id: 't-rtrw-1',
        name: 'Palm Village RT 05',
        type: 'rt_rw',
        subscription: {
          status: 'read_only',
          trial_ends_at: pastDate,
        },
      },
      activeTenantId: 't-rtrw-1',
      userTenants: [],
      isTenantAdmin: true,
    });

    render(
      <MemoryRouter>
        <TrialCountdownBanner />
      </MemoryRouter>
    );

    expect(screen.getByText(/Mode Read-Only/i)).toBeTruthy();
    expect(screen.getByText(/Aktifkan Langganan Sekarang/i)).toBeTruthy();
  });
});
