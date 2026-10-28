// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyTenants from './MyTenants';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useTenant', () => ({
  useTenant: vi.fn(),
}));

import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';

describe('MyTenants Component — KOS-1.4b Join Requests Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('menampilkan kartu permohonan bergabung dan menyesuaikan empty state saat joinRequests ada', () => {
    useAuth.mockReturnValue({
      user: { id: 'u-1', email: 'calon@example.com' },
      profile: { id: 'u-1', full_name: 'Calon Penghuni' },
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
      loading: false,
    });

    render(
      <MemoryRouter>
        <MyTenants />
      </MemoryRouter>
    );

    // Kartu permohonan tampil
    expect(screen.getByText('Permohonan Bergabung')).toBeTruthy();
    expect(screen.getByText('Kos Melati Harmoni')).toBeTruthy();
    expect(screen.getByText('Kamar 101')).toBeTruthy();
    expect(screen.getByText('Menunggu persetujuan pengelola')).toBeTruthy();

    // Empty state disesuaikan
    expect(screen.getByText('Pendaftaran Anda sedang diperiksa')).toBeTruthy();
    expect(screen.queryByText('Buat Komunitas Pertama (Trial Gratis)')).toBeNull();
    expect(
      screen.getByText('Ingin mengelola komunitas sendiri? Daftarkan tenant')
    ).toBeTruthy();
  });

  it('KOS-5F.2: menampilkan kartu notifikasi push pemilik jika pengguna adalah owner tenant kos', () => {
    useAuth.mockReturnValue({
      user: { id: 'u-1', email: 'owner@example.com' },
      profile: { id: 'u-1', full_name: 'Pemilik Kos' },
    });

    useTenant.mockReturnValue({
      userTenants: [
        {
          id: 't-kos-1',
          name: 'Kos Dahlia',
          type: 'kos',
          is_owner: true,
          owner_id: 'u-1',
          permissions: [],
        },
      ],
      joinRequests: [],
      activeTenantId: 't-kos-1',
      switchTenant: vi.fn(),
      loading: false,
    });

    render(
      <MemoryRouter>
        <MyTenants />
      </MemoryRouter>
    );

    expect(screen.getByTestId('push-notification-card')).toBeTruthy();
    expect(screen.getByText('Notifikasi di perangkat ini')).toBeTruthy();
    expect(
      screen.getByText(/Notifikasi pemilik: ringkasan pengingat sewa setiap pagi/i)
    ).toBeTruthy();
  });

  it('KOS-5F.2: menampilkan kartu notifikasi push jika staf kos memiliki salah satu izin penagihan/verifikasi', () => {
    useAuth.mockReturnValue({
      user: { id: 'u-2', email: 'staff@example.com' },
      profile: { id: 'u-2', full_name: 'Staf Kos' },
    });

    useTenant.mockReturnValue({
      userTenants: [
        {
          id: 't-kos-2',
          name: 'Kos Bunga Melati',
          type: 'kos',
          is_owner: false,
          owner_id: 'u-99',
          permissions: ['generate_billing'],
        },
      ],
      joinRequests: [],
      activeTenantId: 't-kos-2',
      switchTenant: vi.fn(),
      loading: false,
    });

    render(
      <MemoryRouter>
        <MyTenants />
      </MemoryRouter>
    );

    expect(screen.getByTestId('push-notification-card')).toBeTruthy();
  });

  it('KOS-5F.2: TIDAK menampilkan kartu notifikasi push untuk penyewa biasa kos (tanpa izin penagihan)', () => {
    useAuth.mockReturnValue({
      user: { id: 'u-3', email: 'penyewa@example.com' },
      profile: { id: 'u-3', full_name: 'Penyewa Biasa' },
    });

    useTenant.mockReturnValue({
      userTenants: [
        {
          id: 't-kos-3',
          name: 'Kos Harmoni',
          type: 'kos',
          is_owner: false,
          owner_id: 'u-99',
          permissions: [],
        },
      ],
      joinRequests: [],
      activeTenantId: 't-kos-3',
      switchTenant: vi.fn(),
      loading: false,
    });

    render(
      <MemoryRouter>
        <MyTenants />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('push-notification-card')).toBeNull();
  });

  it('KOS-5F.2: TIDAK menampilkan kartu notifikasi push bila hanya memiliki tenant non-kos atau daftar tenant kosong', () => {
    useAuth.mockReturnValue({
      user: { id: 'u-4', email: 'rtrw@example.com' },
      profile: { id: 'u-4', full_name: 'Ketua RT' },
    });

    useTenant.mockReturnValue({
      userTenants: [
        {
          id: 't-rtrw-1',
          name: 'RT 05 RW 02',
          type: 'rt_rw',
          is_owner: true,
          owner_id: 'u-4',
          permissions: ['generate_billing'],
        },
      ],
      joinRequests: [],
      activeTenantId: 't-rtrw-1',
      switchTenant: vi.fn(),
      loading: false,
    });

    const { rerender } = render(
      <MemoryRouter>
        <MyTenants />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('push-notification-card')).toBeNull();

    // Tenant kosong juga tidak menampilkan kartu push
    useTenant.mockReturnValue({
      userTenants: [],
      joinRequests: [],
      activeTenantId: null,
      switchTenant: vi.fn(),
      loading: false,
    });

    rerender(
      <MemoryRouter>
        <MyTenants />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('push-notification-card')).toBeNull();
  });
});
