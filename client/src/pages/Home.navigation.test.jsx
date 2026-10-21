// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

describe('NAV-1.1: Home Navigation & Auto-Redirect', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderHomeWithRoutes = () => {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/t/:tenantId/dashboard" element={<div>DASHBOARD TENANT</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('a. anggota biasa 1 tenant → tampil DASHBOARD TENANT dan flag sessionStorage terset', () => {
    useAuth.mockReturnValue({
      user: { id: 'u1', email: 'warga@example.com' },
      profile: { id: 'u1', full_name: 'Warga Biasa' },
      isAuthenticated: true,
      signOut: vi.fn(),
      isSuperAdmin: false,
    });

    useTenant.mockReturnValue({
      userTenants: [
        {
          id: 'tenant-warga-1',
          name: 'Kompleks RT 01',
          type: 'rt_rw',
          is_owner: false,
          role_name: 'Warga',
          permissions: [],
          subscription: { status: 'active' },
        },
      ],
      activeTenantId: 'tenant-warga-1',
      switchTenant: vi.fn(),
      isPlatformAdmin: false,
      loading: false,
      refreshTenant: vi.fn(),
    });

    renderHomeWithRoutes();

    expect(screen.getByText('DASHBOARD TENANT')).toBeTruthy();
    expect(sessionStorage.getItem('rw_auto_tenant_redirect_done')).toBe('1');
  });

  it('b. flag sudah ada → TIDAK redirect, halaman daftar tampil, tombol besar "Daftarkan Tenant Baru" tidak ada, tautan "Buka layanan sendiri" ada', () => {
    sessionStorage.setItem('rw_auto_tenant_redirect_done', '1');

    useAuth.mockReturnValue({
      user: { id: 'u1', email: 'warga@example.com' },
      profile: { id: 'u1', full_name: 'Warga Biasa' },
      isAuthenticated: true,
      signOut: vi.fn(),
      isSuperAdmin: false,
    });

    useTenant.mockReturnValue({
      userTenants: [
        {
          id: 'tenant-warga-1',
          name: 'Kompleks RT 01',
          type: 'rt_rw',
          is_owner: false,
          role_name: 'Warga',
          permissions: [],
          subscription: { status: 'active' },
        },
      ],
      activeTenantId: 'tenant-warga-1',
      switchTenant: vi.fn(),
      isPlatformAdmin: false,
      loading: false,
      refreshTenant: vi.fn(),
    });

    renderHomeWithRoutes();

    expect(screen.queryByText('DASHBOARD TENANT')).toBeNull();
    expect(screen.getByText('Layanan & Tenant Anda')).toBeTruthy();
    expect(screen.getByText('Kompleks RT 01')).toBeTruthy();
    expect(screen.queryByText('Daftarkan Tenant Baru')).toBeNull();
    expect(
      screen.getByText(/Punya kos, arisan, atau kepanitiaan sendiri\? Buka layanan sendiri/i)
    ).toBeTruthy();
  });

  it('c. owner 1 tenant → tidak redirect, tombol "Daftarkan Tenant Baru" ada', () => {
    useAuth.mockReturnValue({
      user: { id: 'u2', email: 'owner@example.com' },
      profile: { id: 'u2', full_name: 'Owner RT' },
      isAuthenticated: true,
      signOut: vi.fn(),
      isSuperAdmin: false,
    });

    useTenant.mockReturnValue({
      userTenants: [
        {
          id: 'tenant-owner-1',
          name: 'Kompleks RT 01',
          type: 'rt_rw',
          is_owner: true,
          role_name: 'Ketua RT',
          permissions: ['manage_settings'],
          subscription: { status: 'active' },
        },
      ],
      activeTenantId: 'tenant-owner-1',
      switchTenant: vi.fn(),
      isPlatformAdmin: false,
      loading: false,
      refreshTenant: vi.fn(),
    });

    renderHomeWithRoutes();

    expect(screen.queryByText('DASHBOARD TENANT')).toBeNull();
    expect(screen.getByText('Layanan & Tenant Anda')).toBeTruthy();
    expect(screen.getByText('Daftarkan Tenant Baru')).toBeTruthy();
    expect(
      screen.queryByText(/Punya kos, arisan, atau kepanitiaan sendiri\? Buka layanan sendiri/i)
    ).toBeNull();
    expect(sessionStorage.getItem('rw_auto_tenant_redirect_done')).toBeNull();
  });

  it('d. anggota 2 tenant → tidak redirect', () => {
    useAuth.mockReturnValue({
      user: { id: 'u1', email: 'warga@example.com' },
      profile: { id: 'u1', full_name: 'Warga Multi' },
      isAuthenticated: true,
      signOut: vi.fn(),
      isSuperAdmin: false,
    });

    useTenant.mockReturnValue({
      userTenants: [
        {
          id: 'tenant-warga-1',
          name: 'Kompleks RT 01',
          type: 'rt_rw',
          is_owner: false,
          role_name: 'Warga',
          permissions: [],
          subscription: { status: 'active' },
        },
        {
          id: 'tenant-kos-2',
          name: 'Kos Barokah',
          type: 'kos',
          is_owner: false,
          role_name: 'Penghuni',
          permissions: [],
          subscription: { status: 'active' },
        },
      ],
      activeTenantId: 'tenant-warga-1',
      switchTenant: vi.fn(),
      isPlatformAdmin: false,
      loading: false,
      refreshTenant: vi.fn(),
    });

    renderHomeWithRoutes();

    expect(screen.queryByText('DASHBOARD TENANT')).toBeNull();
    expect(screen.getByText('Layanan & Tenant Anda')).toBeTruthy();
    expect(screen.getByText('Kompleks RT 01')).toBeTruthy();
    expect(screen.getByText('Kos Barokah')).toBeTruthy();
    expect(sessionStorage.getItem('rw_auto_tenant_redirect_done')).toBeNull();
  });

  it('e. bila sessionStorage melempar error → tetap redirect satu kali tanpa crash', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: Access is denied for this document');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: Access is denied for this document');
    });

    useAuth.mockReturnValue({
      user: { id: 'u1', email: 'warga@example.com' },
      profile: { id: 'u1', full_name: 'Warga Biasa' },
      isAuthenticated: true,
      signOut: vi.fn(),
      isSuperAdmin: false,
    });

    useTenant.mockReturnValue({
      userTenants: [
        {
          id: 'tenant-warga-1',
          name: 'Kompleks RT 01',
          type: 'rt_rw',
          is_owner: false,
          role_name: 'Warga',
          permissions: [],
          subscription: { status: 'active' },
        },
      ],
      activeTenantId: 'tenant-warga-1',
      switchTenant: vi.fn(),
      isPlatformAdmin: false,
      loading: false,
      refreshTenant: vi.fn(),
    });

    renderHomeWithRoutes();

    expect(screen.getByText('DASHBOARD TENANT')).toBeTruthy();
  });

  it('f. KOS-1.4b: user tanpa tenant tapi memiliki joinRequests pending → tampil kartu permohonan, teks menunggu, dan tidak tampil tombol utama Daftarkan Tenant Pertama', () => {
    useAuth.mockReturnValue({
      user: { id: 'u3', email: 'calon@example.com' },
      profile: { id: 'u3', full_name: 'Calon Penghuni' },
      isAuthenticated: true,
      signOut: vi.fn(),
      isSuperAdmin: false,
    });

    useTenant.mockReturnValue({
      userTenants: [],
      joinRequests: [
        {
          member_id: 'req-1',
          tenant_id: 't-kos-1',
          tenant_name: 'Kos Melati Harmoni',
          tenant_type: 'kos',
          unit_label: '101',
          status: 'pending',
          requested_at: '2026-10-21T08:00:00Z',
        },
      ],
      activeTenantId: null,
      switchTenant: vi.fn(),
      isPlatformAdmin: false,
      loading: false,
      refreshTenant: vi.fn(),
    });

    renderHomeWithRoutes();

    // Pastikan tidak redirect
    expect(screen.queryByText('DASHBOARD TENANT')).toBeNull();

    // Kartu permohonan bergabung tampil
    expect(screen.getByText('Permohonan Bergabung')).toBeTruthy();
    expect(screen.getByText('Kos Melati Harmoni')).toBeTruthy();
    expect(screen.getByText('Kamar 101')).toBeTruthy();
    expect(screen.getByText('Menunggu persetujuan pengelola')).toBeTruthy();

    // Empty state berubah sesuai KOS-1.4b
    expect(screen.getByText('Pendaftaran Anda sedang diperiksa')).toBeTruthy();
    expect(screen.queryByText(/Daftarkan Tenant Pertama \(Trial Gratis\)/i)).toBeNull();
    expect(
      screen.getByText('Ingin mengelola komunitas sendiri? Daftarkan tenant')
    ).toBeTruthy();
  });
});
