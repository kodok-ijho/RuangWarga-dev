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
});
