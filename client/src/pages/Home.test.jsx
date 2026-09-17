import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
  IS_DEMO_MODE: false,
}));

vi.mock('../hooks/useTenant', () => ({
  useTenant: vi.fn(),
}));

import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';

describe('Home Page — SumoPod UX Model Test', () => {
  it('renders clean GuestLandingView when user is NOT authenticated', () => {
    useAuth.mockReturnValue({
      user: null,
      profile: null,
      isAuthenticated: false,
      signOut: vi.fn(),
      isSuperAdmin: false,
    });

    useTenant.mockReturnValue({
      userTenants: [],
      activeTenantId: null,
      switchTenant: vi.fn(),
      isPlatformAdmin: false,
      loading: false,
      refreshTenant: vi.fn(),
    });

    const html = renderToString(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    // Guest Landing elements must be present
    expect(html).toContain('Kelola Iuran &amp; Warga');
    expect(html).toContain('Masuk ke Akun');
    expect(html).toContain('Solusi Terpadu Manajemen Komunitas');
    expect(html).toContain('Mulai Coba Gratis 15 Hari');
    expect(html).toContain('Dirancang Khusus Sesuai Karakter Operasional');

    // Authenticated workspace elements must NOT be present
    expect(html).not.toContain('Layanan &amp; Tenant Anda');
    expect(html).not.toContain('Platform Superadmin Access');
  });

  it('renders AuthenticatedWorkspaceHub when user IS authenticated', () => {
    useAuth.mockReturnValue({
      user: { id: 'user-1', email: 'dyudhiantoro@gmail.com' },
      profile: { id: 'user-1', full_name: 'Dwi Yudhiantoro', email: 'dyudhiantoro@gmail.com' },
      isAuthenticated: true,
      signOut: vi.fn(),
      isSuperAdmin: true,
    });

    useTenant.mockReturnValue({
      userTenants: [
        {
          id: 'tenant-123',
          name: 'Palm Village RT 05',
          type: 'rt_rw',
          role: 'admin',
          subscription: { status: 'active' },
        },
      ],
      activeTenantId: 'tenant-123',
      switchTenant: vi.fn(),
      isPlatformAdmin: true,
      loading: false,
      refreshTenant: vi.fn(),
    });

    const html = renderToString(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    // Authenticated Workspace Hub elements must be present
    expect(html).toContain('Workspace Kelola Tenant');
    expect(html).toContain('Platform Superadmin Access');
    expect(html).toContain('dyudhiantoro@gmail.com');
    expect(html).toContain('Layanan &amp; Tenant Anda');
    expect(html).toContain('Palm Village RT 05');
    expect(html).toContain('Daftarkan Tenant Baru');
    expect(html).toContain('Keluar');

    // Guest Landing headline must NOT be present
    expect(html).not.toContain('Kelola Iuran &amp; Warga');
  });
});
