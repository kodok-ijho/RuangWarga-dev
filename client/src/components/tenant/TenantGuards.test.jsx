// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TenantAccessGuard, TenantPermissionGuard } from './TenantGuards';

let mockTenantState = {};
let mockTenantAccessState = {};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../../hooks/useTenantAccess', () => ({
  useTenantAccess: () => mockTenantAccessState,
}));

afterEach(cleanup);

describe('TenantAccessGuard (RTRW-1F.3 / T3)', () => {
  beforeEach(() => {
    mockTenantState = {};
    mockTenantAccessState = {};
  });

  const renderAccessRoute = (initialEntries = ['/t/B/verify']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/t/:tenantId/verify"
            element={
              <TenantAccessGuard require="canVerifyPayments">
                <div>KONTEN VERIFIKASI</div>
              </TenantAccessGuard>
            }
          />
          <Route path="/t/:tenantId/dashboard" element={<div>DASHBOARD TENANT</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('a. URL /t/B/verify, activeTenantId "A", akses (milik A) canVerifyPayments FALSE -> loader tampil, TIDAK redirect, konten tidak tampil', () => {
    mockTenantState = { activeTenantId: 'A', loading: false };
    mockTenantAccessState = { loading: false, canVerifyPayments: false };

    const { container } = renderAccessRoute();

    // Spinner tampil karena activeTenantId !== tenantId di URL
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    // Tidak redirect ke dashboard tenant
    expect(screen.queryByText('DASHBOARD TENANT')).toBeNull();
    // Konten verifikasi tidak tampil
    expect(screen.queryByText('KONTEN VERIFIKASI')).toBeNull();
  });

  it('b. URL /t/B/verify, activeTenantId "A", akses canVerifyPayments TRUE -> loader, konten TIDAK tampil', () => {
    mockTenantState = { activeTenantId: 'A', loading: false };
    mockTenantAccessState = { loading: false, canVerifyPayments: true };

    const { container } = renderAccessRoute();

    // Loader tampil menunggu sinkronisasi tenant
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    // Konten TIDAK tampil meski akses tenant A adalah TRUE
    expect(screen.queryByText('KONTEN VERIFIKASI')).toBeNull();
    expect(screen.queryByText('DASHBOARD TENANT')).toBeNull();
  });

  it('c. setelah activeTenantId = "B" (rerender dengan state baru) dan akses B canVerifyPayments TRUE -> "KONTEN VERIFIKASI" tampil', () => {
    mockTenantState = { activeTenantId: 'A', loading: false };
    mockTenantAccessState = { loading: false, canVerifyPayments: true };

    const { container, rerender } = render(
      <MemoryRouter initialEntries={['/t/B/verify']}>
        <Routes>
          <Route
            path="/t/:tenantId/verify"
            element={
              <TenantAccessGuard require="canVerifyPayments">
                <div>KONTEN VERIFIKASI</div>
              </TenantAccessGuard>
            }
          />
          <Route path="/t/:tenantId/dashboard" element={<div>DASHBOARD TENANT</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Mula-mula loader tampil
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByText('KONTEN VERIFIKASI')).toBeNull();

    // Simulasi switch tenant selesai ke 'B' dan izin B aktif
    mockTenantState = { activeTenantId: 'B', loading: false };
    mockTenantAccessState = { loading: false, canVerifyPayments: true };

    rerender(
      <MemoryRouter initialEntries={['/t/B/verify']}>
        <Routes>
          <Route
            path="/t/:tenantId/verify"
            element={
              <TenantAccessGuard require="canVerifyPayments">
                <div>KONTEN VERIFIKASI</div>
              </TenantAccessGuard>
            }
          />
          <Route path="/t/:tenantId/dashboard" element={<div>DASHBOARD TENANT</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Loader hilang, konten verifikasi tampil
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(screen.getByText('KONTEN VERIFIKASI')).toBeTruthy();
    expect(screen.queryByText('DASHBOARD TENANT')).toBeNull();
  });

  it('d. activeTenantId = "B", akses B canVerifyPayments FALSE -> redirect: "DASHBOARD TENANT" tampil', () => {
    mockTenantState = { activeTenantId: 'B', loading: false };
    mockTenantAccessState = { loading: false, canVerifyPayments: false };

    const { container } = renderAccessRoute();

    // Loader tidak ada
    expect(container.querySelector('.animate-spin')).toBeNull();
    // Konten verifikasi tidak tampil
    expect(screen.queryByText('KONTEN VERIFIKASI')).toBeNull();
    // Redirect ke dashboard tenant
    expect(screen.getByText('DASHBOARD TENANT')).toBeTruthy();
  });

  it('menampilkan loader saat access.loading masih true meskipun activeTenantId cocok', () => {
    mockTenantState = { activeTenantId: 'B', loading: false };
    mockTenantAccessState = { loading: true, canVerifyPayments: true };

    const { container } = renderAccessRoute();

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByText('KONTEN VERIFIKASI')).toBeNull();
    expect(screen.queryByText('DASHBOARD TENANT')).toBeNull();
  });
});

describe('TenantPermissionGuard (RTRW-1F.3 / T3)', () => {
  beforeEach(() => {
    mockTenantState = {};
    mockTenantAccessState = {};
  });

  const renderPermissionRoute = (initialEntries = ['/t/B/roles']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/t/:tenantId/roles"
            element={
              <TenantPermissionGuard permission="manage_members">
                <div>KONTEN ROLES</div>
              </TenantPermissionGuard>
            }
          />
          <Route path="/t/:tenantId/dashboard" element={<div>DASHBOARD TENANT</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('a. URL /t/B/roles, activeTenantId "A", izin (milik A) FALSE -> loader tampil, TIDAK redirect, konten tidak tampil', () => {
    mockTenantState = {
      activeTenantId: 'A',
      loading: false,
      isOwner: false,
      isPlatformAdmin: false,
      hasPermission: () => false,
    };

    const { container } = renderPermissionRoute();

    // Loader tampil menunggu sinkronisasi tenant
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    // Tidak redirect
    expect(screen.queryByText('DASHBOARD TENANT')).toBeNull();
    // Konten roles tidak tampil
    expect(screen.queryByText('KONTEN ROLES')).toBeNull();
  });

  it('b. URL /t/B/roles, activeTenantId "A", izin (milik A) TRUE -> loader tampil, konten TIDAK tampil', () => {
    mockTenantState = {
      activeTenantId: 'A',
      loading: false,
      isOwner: true,
      isPlatformAdmin: false,
      hasPermission: () => true,
    };

    const { container } = renderPermissionRoute();

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByText('KONTEN ROLES')).toBeNull();
    expect(screen.queryByText('DASHBOARD TENANT')).toBeNull();
  });

  it('c. setelah activeTenantId = "B" (rerender dengan state baru) dan izin B TRUE -> "KONTEN ROLES" tampil', () => {
    mockTenantState = {
      activeTenantId: 'A',
      loading: false,
      isOwner: false,
      isPlatformAdmin: false,
      hasPermission: () => false,
    };

    const { container, rerender } = render(
      <MemoryRouter initialEntries={['/t/B/roles']}>
        <Routes>
          <Route
            path="/t/:tenantId/roles"
            element={
              <TenantPermissionGuard permission="manage_members">
                <div>KONTEN ROLES</div>
              </TenantPermissionGuard>
            }
          />
          <Route path="/t/:tenantId/dashboard" element={<div>DASHBOARD TENANT</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByText('KONTEN ROLES')).toBeNull();

    // Simulasi switch tenant selesai ke 'B' dan user memiliki permission
    mockTenantState = {
      activeTenantId: 'B',
      loading: false,
      isOwner: false,
      isPlatformAdmin: false,
      hasPermission: (perm) => perm === 'manage_members',
    };

    rerender(
      <MemoryRouter initialEntries={['/t/B/roles']}>
        <Routes>
          <Route
            path="/t/:tenantId/roles"
            element={
              <TenantPermissionGuard permission="manage_members">
                <div>KONTEN ROLES</div>
              </TenantPermissionGuard>
            }
          />
          <Route path="/t/:tenantId/dashboard" element={<div>DASHBOARD TENANT</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(screen.getByText('KONTEN ROLES')).toBeTruthy();
    expect(screen.queryByText('DASHBOARD TENANT')).toBeNull();
  });

  it('d. activeTenantId = "B", izin B FALSE -> redirect: "DASHBOARD TENANT" tampil', () => {
    mockTenantState = {
      activeTenantId: 'B',
      loading: false,
      isOwner: false,
      isPlatformAdmin: false,
      hasPermission: () => false,
    };

    const { container } = renderPermissionRoute();

    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText('KONTEN ROLES')).toBeNull();
    expect(screen.getByText('DASHBOARD TENANT')).toBeTruthy();
  });

  it('mengizinkan akses bila user adalah isOwner di tenant B', () => {
    mockTenantState = {
      activeTenantId: 'B',
      loading: false,
      isOwner: true,
      isPlatformAdmin: false,
      hasPermission: () => false,
    };

    const { container } = renderPermissionRoute();

    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(screen.getByText('KONTEN ROLES')).toBeTruthy();
  });

  it('mengizinkan akses bila user adalah isPlatformAdmin', () => {
    mockTenantState = {
      activeTenantId: 'B',
      loading: false,
      isOwner: false,
      isPlatformAdmin: true,
      hasPermission: () => false,
    };

    const { container } = renderPermissionRoute();

    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(screen.getByText('KONTEN ROLES')).toBeTruthy();
  });

  it('menampilkan loader saat tenant loading masih true meskipun activeTenantId cocok', () => {
    mockTenantState = {
      activeTenantId: 'B',
      loading: true,
      isOwner: true,
      isPlatformAdmin: false,
      hasPermission: () => true,
    };

    const { container } = renderPermissionRoute();

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByText('KONTEN ROLES')).toBeNull();
  });
});
