// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PanitiaDashboard } from './PanitiaDashboard';
import * as tenantOperationalService from '../../services/tenantOperationalService';

let mockTenantAccess = {
  canManagePrograms: true,
  canRecordIncome: true,
  canManageExpenses: true,
};

let mockSubscriptionGate = {
  canTransact: true,
  isReadOnly: false,
};

vi.mock('../../hooks/useTenantAccess', () => ({
  useTenantAccess: () => mockTenantAccess,
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => mockSubscriptionGate,
}));

vi.mock('../../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../../services/tenantOperationalService');
  return {
    ...actual,
    fetchPrograms: vi.fn(),
    fetchBudgetItems: vi.fn(),
    fetchProgramTransactions: vi.fn(),
  };
});

describe('PANITIA-1.8: PanitiaDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantAccess = {
      canManagePrograms: true,
      canRecordIncome: true,
      canManageExpenses: true,
    };
    mockSubscriptionGate = {
      canTransact: true,
      isReadOnly: false,
    };
    tenantOperationalService.fetchBudgetItems.mockResolvedValue([]);
    tenantOperationalService.fetchProgramTransactions.mockResolvedValue({ incomes: [], expenses: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders active programs list with financial progress when programs exist', async () => {
    tenantOperationalService.fetchPrograms.mockResolvedValue([
      {
        id: 'p-1',
        name: 'Pentas Seni 2026',
        status: 'running',
        starts_on: '2026-11-20',
        ends_on: '2026-11-21',
      },
    ]);

    render(
      <MemoryRouter>
        <PanitiaDashboard
          tenantId="t-panitia-1"
          activeTenant={{ id: 't-panitia-1', name: 'OSIS SMA 1', type: 'panitia' }}
          template={{ features: { hasPrograms: true } }}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText('Pentas Seni 2026')).toBeTruthy();
    expect(screen.getByText('Pengeluaran:')).toBeTruthy();
    expect(screen.getByText('Semua Acara')).toBeTruthy();
  });

  it('renders "Buat Acara Pertama" empty state for managers when no programs exist', async () => {
    tenantOperationalService.fetchPrograms.mockResolvedValue([]);
    mockTenantAccess.canManagePrograms = true;

    render(
      <MemoryRouter>
        <PanitiaDashboard
          tenantId="t-panitia-1"
          activeTenant={{ id: 't-panitia-1', name: 'OSIS SMA 1', type: 'panitia' }}
          template={{ features: { hasPrograms: true } }}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText('Buat Acara Pertama')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Buat Acara Baru/i })).toBeTruthy();
  });

  it('renders "Belum ada acara" empty state for regular members when no programs exist', async () => {
    tenantOperationalService.fetchPrograms.mockResolvedValue([]);
    mockTenantAccess.canManagePrograms = false;

    render(
      <MemoryRouter>
        <PanitiaDashboard
          tenantId="t-panitia-1"
          activeTenant={{ id: 't-panitia-1', name: 'OSIS SMA 1', type: 'panitia' }}
          template={{ features: { hasPrograms: true } }}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText('Belum ada acara')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Buat Acara Baru/i })).toBeNull();
  });
});
