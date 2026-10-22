// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SubscriptionStatus from './SubscriptionStatus';
import * as tenantOperationalService from '../../services/tenantOperationalService';

let mockTenant = {
  id: 't-panitia-sub',
  name: 'Panitia Wisuda 2026',
  type: 'panitia',
  subscription: {
    status: 'trial',
    trial_ends_at: '2026-12-31T23:59:59Z',
  },
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => ({
    activeTenant: mockTenant,
    activeTenantId: mockTenant.id,
    userTenants: [mockTenant],
    isDemo: false,
    isTenantAdmin: true,
  }),
}));

vi.mock('../../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => ({
    name: 'Kepanitiaan & Acara',
    unitLabel: 'Acara',
  }),
}));

vi.mock('../../services/supabaseClient', () => {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'sub-panitia-1',
        status: 'trial',
        trial_ends_at: '2026-12-31T23:59:59Z',
        tenant_subscription_blocks: [],
      },
      error: null,
    }),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: 'sub-panitia-1',
        status: 'trial',
        trial_ends_at: '2026-12-31T23:59:59Z',
        tenant_subscription_blocks: [],
      },
      error: null,
    }),
  };
  return {
    supabase: {
      from: vi.fn().mockReturnValue(mockQuery),
    },
  };
});

vi.mock('../../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../../services/tenantOperationalService');
  return {
    ...actual,
    fetchPrograms: vi.fn(),
  };
});

describe('PANITIA-1.8: SubscriptionStatus for Panitia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('HARGA.4: displays "Organisasi aktif (tanpa batas waktu)" and list of programs with access badges', async () => {
    // Programs with access status
    tenantOperationalService.fetchPrograms.mockResolvedValue([
      { id: 'p1', name: 'Acara 1', status: 'planning', is_free_trial: true, access_until: '2099-01-01T00:00:00Z' },
      { id: 'p2', name: 'Acara 2', status: 'running', is_free_trial: false, access_until: null },
      { id: 'p3', name: 'Acara 3', status: 'completed', is_free_trial: false, access_until: '2020-01-01T00:00:00Z' },
    ]);

    render(
      <MemoryRouter initialEntries={['/account/subscription?tenantId=t-panitia-sub']}>
        <Routes>
          <Route path="/account/subscription" element={<SubscriptionStatus />} />
        </Routes>
      </MemoryRouter>
    );

    // Expect kartu status langganan menampilkan "Organisasi aktif (tanpa batas waktu)"
    expect(await screen.findByText('Organisasi aktif (tanpa batas waktu)')).toBeTruthy();

    // Expect daftar acara dengan badge masa aktif (menggantikan hitungan "acara aktif")
    expect(screen.getByText('Daftar Acara & Masa Aktif')).toBeTruthy();
    expect(screen.getByText('Acara 1')).toBeTruthy();
    expect(screen.getByText('Acara 2')).toBeTruthy();
    expect(screen.getByText('Acara 3')).toBeTruthy();
    expect(screen.getByText('Belum aktif')).toBeTruthy(); // untuk Acara 2
    expect(screen.queryByText(/2 acara aktif/i)).toBeNull();
  });

  it('HARGA.4: displays empty text when programs fetch fails or is empty', async () => {
    tenantOperationalService.fetchPrograms.mockRejectedValue(new Error('Database error'));

    render(
      <MemoryRouter initialEntries={['/account/subscription?tenantId=t-panitia-sub']}>
        <Routes>
          <Route path="/account/subscription" element={<SubscriptionStatus />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Belum ada acara yang dibuat.')).toBeTruthy();
  });
});
