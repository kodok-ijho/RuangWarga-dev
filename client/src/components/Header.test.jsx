import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header';

let mockTenantState = {
  isPlatformAdmin: false,
  activeTenant: null,
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    profile: { id: 'u1', full_name: 'Budi Test' },
    role: 'admin',
    isReadOnly: false,
    signOut: vi.fn(),
    updateProfile: vi.fn(),
    session: { access_token: 'dummy-token' },
  }),
  IS_DEMO_MODE: false,
}));

vi.mock('../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => ({
    communityLabel: 'Perumahan',
    memberLabel: 'Warga',
    unitLabel: 'Rumah',
    billLabel: 'IPL',
    icon: '🏡',
  }),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../context/TourContext', () => ({
  useTour: () => ({
    startTour: vi.fn(),
  }),
}));

vi.mock('./TenantSwitcher', () => ({
  default: () => <div data-testid="tenant-switcher">TenantSwitcher</div>,
}));

vi.mock('../services/dataService', () => ({
  fetchDashboardData: vi.fn().mockResolvedValue({}),
  fetchMyEventAccess: vi.fn().mockResolvedValue({}),
}));

describe('Header Brand Identity', () => {
  beforeEach(() => {
    mockTenantState = {
      isPlatformAdmin: false,
      activeTenant: null,
    };
  });

  it('di luar tenant → menampilkan BrandLogo penuh (simbol + wordmark RuangWarga)', () => {
    mockTenantState.activeTenant = null;

    const html = renderToString(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(html).toContain('src="/brand/rw-mark.svg"');
    expect(html).toContain('Ruang');
    expect(html).toContain('Warga');
    expect(html).not.toContain('object-cover ring-2 ring-forest-800/10');
  });

  it('di tenant dengan logo_url → menampilkan logo tenant dan nama tenant', () => {
    mockTenantState.activeTenant = {
      id: 'tenant-pv-1',
      name: 'Palm Village RT 05',
      type: 'rt_rw',
      settings: {
        logo_url: '/tenants/palm-village/logo.png',
      },
    };

    const html = renderToString(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(html).toContain('src="/tenants/palm-village/logo.png"');
    expect(html).toContain('Palm Village RT 05');
  });

  it('di tenant tanpa logo_url → menampilkan BrandLogo mark saja dan nama tenant', () => {
    mockTenantState.activeTenant = {
      id: 'tenant-rw-2',
      name: 'RT 01 Sukamaju',
      type: 'rt_rw',
      settings: {},
    };

    const html = renderToString(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(html).toContain('src="/brand/rw-mark.svg"');
    expect(html).toContain('RT 01 Sukamaju');
    // Wordmark Ruang + Warga pada logo brand harus tidak ada karena showWordmark={false}
    expect(html).not.toContain('text-forest-800">Ruang');
  });

  it('di tenant dengan logo_url tidak aman → jatuh ke BrandLogo mark saja dan nama tenant', () => {
    mockTenantState.activeTenant = {
      id: 'tenant-rw-3',
      name: 'Kompleks Asri',
      type: 'rt_rw',
      settings: {
        logo_url: 'javascript:alert(1)',
      },
    };

    const html = renderToString(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(html).not.toContain('javascript:alert(1)');
    expect(html).toContain('src="/brand/rw-mark.svg"');
    expect(html).toContain('Kompleks Asri');
  });
});
