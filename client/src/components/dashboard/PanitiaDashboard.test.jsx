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

let mockActiveTenant = { id: 't-panitia-1', name: 'OSIS SMA 1', type: 'panitia' };
let mockActiveMember = { id: 'm-1', full_name: 'Budi Santoso' };

vi.mock('../../context/TenantContext', () => ({
  useTenant: () => ({
    activeTenant: mockActiveTenant,
    activeMember: mockActiveMember,
  }),
}));

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
    fetchProgramsOverview: vi.fn(),
    fetchBudgetItems: vi.fn(),
    fetchProgramTransactions: vi.fn(),
    fetchMyProgramDues: vi.fn(),
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
    tenantOperationalService.fetchMyProgramDues.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders active programs list with financial progress when programs exist', async () => {
    const mockList = [
      {
        id: 'p-1',
        name: 'Pentas Seni 2026',
        status: 'running',
        starts_on: '2026-11-20',
        ends_on: '2026-11-21',
      },
    ];
    tenantOperationalService.fetchPrograms.mockResolvedValue(mockList);
    tenantOperationalService.fetchProgramsOverview.mockResolvedValue(mockList);

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
    tenantOperationalService.fetchProgramsOverview.mockResolvedValue([]);
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
    tenantOperationalService.fetchProgramsOverview.mockResolvedValue([]);
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

  it('PANITIA-1F.4: displays error state with "Coba lagi" button when fetchPrograms fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    tenantOperationalService.fetchPrograms.mockRejectedValue(new Error('Database timeout'));
    tenantOperationalService.fetchProgramsOverview.mockRejectedValue(new Error('Database timeout'));

    render(
      <MemoryRouter>
        <PanitiaDashboard
          tenantId="t-panitia-1"
          activeTenant={{ id: 't-panitia-1', name: 'OSIS SMA 1', type: 'panitia' }}
          template={{ features: { hasPrograms: true } }}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText('Gagal memuat acara.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Coba lagi/i })).toBeTruthy();
    expect(screen.queryByText(/Buat Acara Pertama/i)).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('PANITIA-2.4: kartu Iuran Saya tampil dengan 1 iuran unpaid', async () => {
    tenantOperationalService.fetchPrograms.mockResolvedValue([]);
    tenantOperationalService.fetchProgramsOverview.mockResolvedValue([]);
    tenantOperationalService.fetchMyProgramDues.mockResolvedValue([
      {
        id: 'due-101',
        program_id: 'p-1',
        program: { id: 'p-1', name: 'Pentas Seni Tahunan 2026' },
        amount: 50000,
        due_date: '2026-11-20',
        status: 'unpaid',
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

    // Kartu Iuran Saya muncul
    expect(await screen.findByTestId('my-dues-card')).toBeTruthy();
    expect(screen.getByText('Iuran Saya')).toBeTruthy();
    expect(screen.getByText('Pentas Seni Tahunan 2026')).toBeTruthy();
    expect(screen.getByText(/50\.000/)).toBeTruthy();
    expect(screen.getByText('Belum bayar')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Bayar$/i })).toBeTruthy();
  });
});
