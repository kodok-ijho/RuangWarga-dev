import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import TenantShell from './TenantShell';

let mockTenantState = {
  activeTenant: null,
  activeTenantId: 'tenant-test-1',
  userTenants: [],
  switchTenant: vi.fn(),
  subscriptionStatus: 'active',
  isPlatformAdmin: false,
  isOwner: true,
  userRole: 'admin',
  hasPermission: () => true,
};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'user@example.com' },
    profile: { id: 'u1', full_name: 'Budi Test' },
    isAuthenticated: true,
    role: 'admin',
    signOut: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => ({
    name: 'Kompleks RT/RW',
    unitLabel: 'Rumah',
    billLabel: 'IPL',
    memberLabel: 'Warga',
    icon: '🏡',
  }),
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({
    isReadOnly: false,
    subscriptionStatus: 'active',
  }),
}));

vi.mock('../TenantSwitcher', () => ({
  default: () => <div data-testid="tenant-switcher">TenantSwitcher</div>,
}));

vi.mock('../TrialCountdownBanner', () => ({
  default: () => null,
}));

describe('TenantShell Logo & Identity (BRAND-1F.1)', () => {
  beforeEach(() => {
    mockTenantState = {
      activeTenant: {
        id: 't-pv-1',
        name: 'Palm Village RT 05',
        type: 'rt_rw',
        settings: {},
      },
      activeTenantId: 't-pv-1',
      userTenants: [],
      switchTenant: vi.fn(),
      subscriptionStatus: 'active',
      isPlatformAdmin: false,
      isOwner: true,
      userRole: 'admin',
      hasPermission: () => true,
    };
  });

  it('menampilkan elemen img logo tenant jika settings.logo_url aman (/tenants/...)', () => {
    mockTenantState.activeTenant.settings = {
      logo_url: '/tenants/palm-village/logo.png',
    };

    const html = renderToString(
      <MemoryRouter initialEntries={['/t/t-pv-1/dashboard']}>
        <TenantShell />
      </MemoryRouter>
    );

    expect(html).toContain('src="/tenants/palm-village/logo.png"');
    expect(html).toContain('alt="Palm Village RT 05"');
    expect(html).not.toContain('🏡');
  });

  it('menolak URI javascript: dan menampilkan fallback emoji template', () => {
    mockTenantState.activeTenant.settings = {
      logo_url: 'javascript:alert(1)',
    };

    const html = renderToString(
      <MemoryRouter initialEntries={['/t/t-pv-1/dashboard']}>
        <TenantShell />
      </MemoryRouter>
    );

    expect(html).not.toContain('javascript:alert(1)');
    expect(html).toContain('🏡');
  });

  it('menolak URL HTTP tidak aman dan menampilkan fallback emoji template', () => {
    mockTenantState.activeTenant.settings = {
      logo_url: 'http://evil.test/x.png',
    };

    const html = renderToString(
      <MemoryRouter initialEntries={['/t/t-pv-1/dashboard']}>
        <TenantShell />
      </MemoryRouter>
    );

    expect(html).not.toContain('http://evil.test/x.png');
    expect(html).toContain('🏡');
  });
});
