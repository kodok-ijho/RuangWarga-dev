// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TenantDashboard from './TenantDashboard';
import TenantDashboardPlaceholder from './TenantDashboardPlaceholder';

afterEach(cleanup);

vi.mock('../../components/TrialCountdownBanner', () => ({
  default: () => <div data-testid="trial-countdown-banner">Trial Banner</div>,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'admin@example.com' },
    profile: { full_name: 'Admin Test' },
  }),
}));

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => ({
    activeTenant: { id: 't-test-1', name: 'Kompleks RT 01', type: 'rt_rw', settings: { onboarding_completed: true } },
    activeTenantId: 't-test-1',
    switchTenant: vi.fn(),
    subscriptionStatus: 'trial',
    userRole: 'admin',
    isTenantAdmin: true,
    isOwner: true,
    activeRoleName: 'Ketua RT',
    hasPermission: () => true,
  }),
}));

vi.mock('../../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => ({
    icon: '🏘️',
    name: 'RT / RW',
    unitLabel: 'Rumah',
    memberLabel: 'Warga',
    billingLabel: 'IPL',
    paymentActionLabel: 'Bayar IPL',
  }),
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({
    isReadOnly: false,
    subscriptionStatus: 'trial',
  }),
}));

vi.mock('../../services/tenantOperationalService', () => ({
  fetchTenantDashboardData: vi.fn().mockResolvedValue({
    summary: { totalResidents: 10, totalUnits: 10 },
  }),
  fetchTenantInviteCode: vi.fn().mockResolvedValue('INVITE123'),
  getCachedTenantInviteCode: vi.fn().mockReturnValue('INVITE123'),
}));

vi.mock('../../components/dashboard/CitizenDashboard', () => ({
  CitizenDashboard: () => <div data-testid="citizen-dashboard">CitizenDashboard</div>,
}));

vi.mock('../../components/dashboard/StaffDashboard', () => ({
  StaffDashboard: () => <div data-testid="staff-dashboard">StaffDashboard</div>,
}));

vi.mock('../../components/dashboard/DashboardSkeleton', () => ({
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton">DashboardSkeleton</div>,
}));

describe('UI-1F: Trial Countdown Banner Single Placement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TenantDashboard tidak merender TrialCountdownBanner (dihandle oleh TenantShell)', async () => {
    render(
      <MemoryRouter initialEntries={['/t/t-test-1']}>
        <TenantDashboard />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('trial-countdown-banner')).toBeNull();
  });

  it('TenantDashboardPlaceholder tidak merender TrialCountdownBanner (dihandle oleh TenantShell)', () => {
    render(
      <MemoryRouter initialEntries={['/t/t-test-1']}>
        <TenantDashboardPlaceholder />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('trial-countdown-banner')).toBeNull();
  });
});
