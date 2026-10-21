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
});
