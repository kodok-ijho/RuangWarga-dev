import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AccountLayout from './AccountLayout';
import TenantShell from '../tenant/TenantShell';
import LegacyBottomNav from '../LegacyBottomNav';

// Mock useAuth
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'user@example.com' },
    profile: { id: 'u1', full_name: 'Budi Test' },
    isAuthenticated: true,
    role: 'admin',
    signOut: vi.fn(),
  }),
}));

// Mock useTenant
vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => ({
    activeTenant: {
      id: 't-kos-1',
      name: 'Kos Melati Indah',
      type: 'kos',
      primary_color: '#0f172a',
      accent_color: '#2563eb',
    },
    activeTenantId: 't-kos-1',
    userTenants: [
      { id: 't-kos-1', name: 'Kos Melati Indah', type: 'kos' },
      { id: 't-rt-2', name: 'RT 04 Sejahtera', type: 'rt_rw' },
    ],
    switchTenant: vi.fn(),
    subscriptionStatus: 'trial',
    isPlatformAdmin: false,
    isOwner: true,
    userRole: 'admin',
    hasPermission: () => true,
  }),
}));

// Mock useTenantTemplate
vi.mock('../../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => ({
    name: 'Kos-kosan / Kontrakan',
    unitLabel: 'Kamar',
    billLabel: 'Sewa',
    memberLabel: 'Penyewa',
    icon: '🏢',
  }),
}));

// Mock useSubscriptionGate
vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({
    isReadOnly: false,
    subscriptionStatus: 'trial',
  }),
}));

describe('Phase 3 — Account Layer (Tenant-Neutral SaaS)', () => {
  it('renders AccountLayout with global RuangWarga identity and no Palm Village branding', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/account']}>
        <AccountLayout />
      </MemoryRouter>
    );

    // Global brand
    expect(html).toContain('RuangWarga');
    expect(html).toContain('Platform Akun');

    // Neutral navigation concepts
    expect(html).toContain('Komunitas Saya');
    expect(html).toContain('Langganan &amp; Billing');
    expect(html).toContain('Tambah Komunitas');

    // Neutrality checks: Must NOT contain Palm Village or forest/gold hardcoding
    expect(html).not.toContain('Palm Village');
    expect(html).not.toContain('IPL');
    expect(html).not.toContain('bg-forest-800');
    expect(html).not.toContain('text-gold-400');
  });
});

describe('Phase 4 — Tenant Workspace Shell (Contextual & Responsive)', () => {
  it('renders TenantShell with active tenant context and contextual navigation', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/t/t-kos-1/dashboard']}>
        <TenantShell />
      </MemoryRouter>
    );

    // Active tenant identity
    expect(html).toContain('Kos Melati Indah');
    expect(html).toContain('🏢');

    // Contextual navigation adapting to tenant type (kos: Sewa, Penyewa)
    expect(html).toContain('Sewa');
    expect(html).toContain('Penyewa');

    // Mobile nav destination count limit (<= 4 destinations)
    expect(html).toContain('aria-label="Navigasi Komunitas Ponsel"');
    expect(html).toContain('Beranda');
    expect(html).toContain('Menu');

    // Scoped CSS variable
    expect(html).toContain('--tenant-primary');
    expect(html).toContain('--tenant-accent');
  });
});

describe('Phase 4.6 — Navigation Safeguards (No Duplicate Navbars)', () => {
  it('ensures LegacyBottomNav returns empty (null) on tenant workspace routes', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/t/t-kos-1/dashboard']}>
        <LegacyBottomNav />
      </MemoryRouter>
    );
    expect(html).toBe('');
  });

  it('ensures LegacyBottomNav returns empty (null) on account, platform, listing, and onboarding routes', () => {
    const paths = ['/account', '/platform', '/listing', '/onboarding'];
    for (const path of paths) {
      const html = renderToString(
        <MemoryRouter initialEntries={[path]}>
          <LegacyBottomNav />
        </MemoryRouter>
      );
      expect(html).toBe('');
    }
  });
});
