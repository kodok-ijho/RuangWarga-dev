// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ManageRoles from './ManageRoles';
import * as tenantOperationalService from '../../services/tenantOperationalService';

let mockTenant = {
  id: 'tenant-rtrw-1',
  name: 'Kompleks RT 01',
  type: 'rt_rw',
  is_owner: true,
};

let mockSubscriptionGate = {
  isReadOnly: false,
  guardAction: (fn) => fn(),
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => ({
    activeTenant: mockTenant,
    isPlatformAdmin: false,
    hasPermission: () => true,
  }),
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => mockSubscriptionGate,
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantRoles: vi.fn().mockResolvedValue([
      { id: 'role-1', name: 'Admin', is_owner_role: true, permissions: [] },
    ]),
    createTenantRole: vi.fn(),
    updateTenantRole: vi.fn(),
    deleteTenantRole: vi.fn(),
    applyRoleTemplate: vi.fn().mockResolvedValue({
      created: ['Ketua RT/RW', 'Sekretaris'],
      skipped: ['Bendahara'],
    }),
  };
});

function renderManageRoles(tenantId = 'tenant-rtrw-1') {
  return render(
    <MemoryRouter initialEntries={[`/t/${tenantId}/roles`]}>
      <Routes>
        <Route path="/t/:tenantId/roles" element={<ManageRoles />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ManageRoles (RTRW-2.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenant = {
      id: 'tenant-rtrw-1',
      name: 'Kompleks RT 01',
      type: 'rt_rw',
      is_owner: true,
    };
    mockSubscriptionGate = {
      isReadOnly: false,
      guardAction: (fn) => fn(),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('tombol template tampil untuk tenant rt_rw dan memanggil applyRoleTemplate', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);

    renderManageRoles();

    // Pastikan tombol Gunakan Template Jabatan RT/RW tampil
    const templateBtn = await screen.findByRole('button', {
      name: /Gunakan Template Jabatan RT\/RW/i,
    });
    expect(templateBtn).toBeTruthy();

    // Klik tombol
    fireEvent.click(templateBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect(tenantOperationalService.applyRoleTemplate).toHaveBeenCalledWith('tenant-rtrw-1', 'rt_rw');

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringMatching(/2 jabatan ditambahkan, 1 sudah ada/i)
      );
      // fetchTenantRoles dipanggil saat loadRoles awal dan setelah applyRoleTemplate
      expect(tenantOperationalService.fetchTenantRoles).toHaveBeenCalledTimes(2);
    });
  });

  it('tombol template tidak tampil untuk tipe tenant selain rt_rw (misal kos/arisan)', async () => {
    mockTenant = {
      id: 'tenant-kos-1',
      name: 'Kos Melati',
      type: 'kos',
      is_owner: true,
    };

    renderManageRoles('tenant-kos-1');

    await screen.findByText(/Kelola Role & Hak Akses/i);

    // Tombol tidak boleh ada
    const templateBtn = screen.queryByRole('button', {
      name: /Gunakan Template Jabatan RT\/RW/i,
    });
    expect(templateBtn).toBeNull();
  });
});
