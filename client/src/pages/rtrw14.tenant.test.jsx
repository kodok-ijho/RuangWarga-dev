// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PaymentVerification from './PaymentVerification';
import Reports from './Reports';
import Expenses from './Expenses';
import * as dataService from '../services/dataService';
import * as tenantOpService from '../services/tenantOperationalService';

// Polyfill ResizeObserver for jsdom (needed by recharts / responsive containers)
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserver;
  global.ResizeObserver = ResizeObserver;
}

// Mock dataService functions
vi.mock('../services/dataService', () => ({
  fetchSettings: vi.fn(() => Promise.resolve({ qris_enabled: true })),
  fetchNonIplIncomes: vi.fn(() => Promise.resolve([])),
  fetchEvents: vi.fn(() => Promise.resolve([])),
  fetchMyEventAccess: vi.fn(() => Promise.resolve({ events: [] })),
  fetchPayments: vi.fn(() => Promise.resolve([])),
  fetchMonthlyFinance: vi.fn(() => Promise.resolve({ report: { details: [] }, expenses: [], cashPayments: [], nonIplIncomes: [] })),
  fetchRunningBalance: vi.fn(() => Promise.resolve([])),
  fetchExpenses: vi.fn(() => Promise.resolve([])),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  IS_DEMO: false,
}));

// Mock tenant operational service
vi.mock('../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantUnits: vi.fn(() => Promise.resolve([])),
    fetchTenantMembers: vi.fn(() => Promise.resolve([])),
    fetchTenantPayments: vi.fn(() => Promise.resolve([])),
    fetchTenantExpenses: vi.fn(() => Promise.resolve([])),
  };
});

// Mock state & hooks
const mockTenantAccessState = {
  isMember: true,
  isStaff: true,
  canWrite: true,
  canVerifyPayments: true,
  canRecordCash: true,
  canRecordTransfer: true,
  canGenerateBilling: true,
  canManageExpenses: true,
  canViewReports: true,
  canManageMembers: true,
  loading: false,
};

const mockTenantState = {
  activeTenant: { id: 'tenant-rtrw-1', name: 'Kompleks RT 01', type: 'rt_rw', settings: { qris_enabled: true } },
  activeTenantId: 'tenant-rtrw-1',
  userTenants: [],
  switchTenant: vi.fn(),
  subscriptionStatus: 'active',
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

const mockAuth = {
  user: { id: 'u-1', email: 'test@example.com' },
  profile: { id: 'u-1', full_name: 'Pak RT' },
  isAuthenticated: true,
  role: 'admin',
  isReadOnly: false,
  session: { access_token: 'fake-token' },
};

const mockSubscriptionGate = {
  canWrite: true,
  isReadOnly: false,
  status: 'active',
};

const mockTenantTemplate = {
  name: 'Kompleks RT/RW',
  unitLabel: 'Rumah',
  billLabel: 'IPL',
  memberLabel: 'Warga',
  icon: '🏡',
};

const mockTour = {
  triggerTour: vi.fn(),
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../context/TenantContext', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../hooks/useTenantAccess', () => ({
  useTenantAccess: () => mockTenantAccessState,
}));

vi.mock('../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => mockSubscriptionGate,
}));

vi.mock('../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => mockTenantTemplate,
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../context/TourContext', () => ({
  useTour: () => mockTour,
}));

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'mock-path' }, error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://mock-signed-url' }, error: null }),
      })),
    },
  },
}));

describe('RTRW-1.4 Tenant Isolation Tests for PaymentVerification, Reports, and Expenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('PaymentVerification memanggil fetchPayments dengan tenantId dan tidak memanggil dataService.fetchSettings saat tenant aktif', async () => {
    render(
      <MemoryRouter initialEntries={['/t/tenant-rtrw-1/verify']}>
        <Routes>
          <Route path="/t/:tenantId/verify" element={<PaymentVerification />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(dataService.fetchPayments).toHaveBeenCalledWith(
        'fake-token',
        expect.objectContaining({ tenantId: 'tenant-rtrw-1' })
      );
    });

    expect(dataService.fetchSettings).not.toHaveBeenCalled();
  });

  it('Reports memanggil fetchMonthlyFinance dengan tenantId dan tidak memanggil dataService.fetchNonIplIncomes maupun dataService.fetchEvents saat tenant aktif', async () => {
    render(
      <MemoryRouter initialEntries={['/t/tenant-rtrw-1/reports']}>
        <Routes>
          <Route path="/t/:tenantId/reports" element={<Reports />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(dataService.fetchMonthlyFinance).toHaveBeenCalledWith(
        'fake-token',
        expect.objectContaining({ tenantId: 'tenant-rtrw-1' })
      );
    });

    expect(dataService.fetchNonIplIncomes).not.toHaveBeenCalled();
    expect(dataService.fetchEvents).not.toHaveBeenCalled();
  });

  it('Expenses memanggil fetchExpenses dengan tenantId dan tidak memanggil dataService.fetchEvents maupun dataService.fetchMyEventAccess saat tenant aktif', async () => {
    render(
      <MemoryRouter initialEntries={['/t/tenant-rtrw-1/expenses']}>
        <Routes>
          <Route path="/t/:tenantId/expenses" element={<Expenses />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(dataService.fetchExpenses).toHaveBeenCalledWith(
        'fake-token',
        expect.objectContaining({ tenantId: 'tenant-rtrw-1' })
      );
    });

    expect(dataService.fetchEvents).not.toHaveBeenCalled();
    expect(dataService.fetchMyEventAccess).not.toHaveBeenCalled();
  });
});
