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

  it('displays "{n} acara aktif" for panitia tenant type', async () => {
    // 2 active programs (planning & running), 1 completed program
    tenantOperationalService.fetchPrograms.mockResolvedValue([
      { id: 'p1', name: 'Acara 1', status: 'planning' },
      { id: 'p2', name: 'Acara 2', status: 'running' },
      { id: 'p3', name: 'Acara 3', status: 'completed' },
    ]);

    render(
      <MemoryRouter initialEntries={['/account/subscription?tenantId=t-panitia-sub']}>
        <Routes>
          <Route path="/account/subscription" element={<SubscriptionStatus />} />
        </Routes>
      </MemoryRouter>
    );

    // Expect 2 active programs to be displayed
    expect(await screen.findByText('2 acara aktif')).toBeTruthy();
    expect(screen.getByText('Pemakaian Acara')).toBeTruthy();
  });
});
