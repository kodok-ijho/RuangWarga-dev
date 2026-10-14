// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TenantMemberApproval from './TenantMemberApproval';
import * as tenantOperationalService from '../../services/tenantOperationalService';

afterEach(cleanup);

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

let mockTenantState = {};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

describe('TenantMemberApproval (GATE-1F)', () => {
  const mockPendingMember = {
    id: 'member-1',
    full_name: 'Budi Santoso',
    occupancy_status: 'owner_occupied',
    unit_id: 1,
    tenant_units: { label: 'Blok A/1' },
    tenant_roles: { name: 'Warga' },
    phone: '08123456789',
    created_at: '2026-01-01T10:00:00.000Z',
  };

  const mockUnits = [
    { id: 1, label: 'Blok A/1' },
    { id: 2, label: 'Blok A/2' },
  ];

  const mockRoles = [
    { id: 'role-1', name: 'Warga', is_base_role: true, is_owner_role: false },
    { id: 'role-2', name: 'Pengurus', is_base_role: false, is_owner_role: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockTenantState = {
      activeTenant: { id: 'tenant-123', name: 'Kompleks RT 01' },
      activeTenantId: 'tenant-123',
      subscriptionStatus: 'trial',
      isOwner: true,
      isTenantAdmin: true,
      userRole: 'admin',
      switchTenant: vi.fn(),
      hasPermission: vi.fn(() => true),
    };

    vi.spyOn(tenantOperationalService, 'fetchPendingTenantMembers').mockImplementation(() =>
      Promise.resolve([mockPendingMember])
    );
    vi.spyOn(tenantOperationalService, 'fetchTenantUnits').mockImplementation(() =>
      Promise.resolve(mockUnits)
    );
    vi.spyOn(tenantOperationalService, 'fetchTenantRoles').mockImplementation(() =>
      Promise.resolve(mockRoles)
    );
    vi.spyOn(tenantOperationalService, 'approveTenantMember').mockImplementation(() =>
      Promise.resolve({ success: true })
    );
    vi.spyOn(tenantOperationalService, 'rejectTenantMember').mockImplementation(() =>
      Promise.resolve({ success: true })
    );
  });

  const renderComponent = (tenantId = 'tenant-123') => {
    return render(
      <MemoryRouter initialEntries={[`/t/${tenantId}/approval`]}>
        <Routes>
          <Route path="/t/:tenantId/approval" element={<TenantMemberApproval />} />
          <Route path="/t/:tenantId/dashboard" element={<div>Dashboard Mock</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('a. klik "Setujui" → modal konfirmasi persetujuan tampil (tanpa error)', async () => {
    renderComponent();

    const memberName = await screen.findByText('Budi Santoso');
    expect(memberName).toBeTruthy();

    const approveBtn = screen.getByRole('button', { name: /setujui/i });
    fireEvent.click(approveBtn);

    const modalTitle = await screen.findByText('Konfirmasi Persetujuan Warga');
    expect(modalTitle).toBeTruthy();
    expect(screen.getByText(/Tetapkan nomor rumah dan peran untuk/i)).toBeTruthy();
  });

  it('b. konfirmasi di modal → approveTenantMember dipanggil dengan id anggota', async () => {
    renderComponent();

    const memberName = await screen.findByText('Budi Santoso');
    expect(memberName).toBeTruthy();

    const approveBtn = screen.getByRole('button', { name: /setujui/i });
    fireEvent.click(approveBtn);

    const modalTitle = await screen.findByText('Konfirmasi Persetujuan Warga');
    expect(modalTitle).toBeTruthy();

    const confirmBtn = screen.getByRole('button', { name: /setujui sekarang/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(tenantOperationalService.approveTenantMember).toHaveBeenCalledWith(
        'member-1',
        expect.any(Object)
      );
    });
  });

  it('c. klik "Tolak" (window.confirm di-mock true) → rejectTenantMember dipanggil', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderComponent();

    const memberName = await screen.findByText('Budi Santoso');
    expect(memberName).toBeTruthy();

    const rejectBtn = screen.getByRole('button', { name: /tolak/i });
    fireEvent.click(rejectBtn);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(tenantOperationalService.rejectTenantMember).toHaveBeenCalledWith('member-1');
    });
  });

  it('d. dengan subscriptionStatus "read_only" → approveTenantMember/rejectTenantMember tidak dipanggil', async () => {
    mockTenantState.subscriptionStatus = 'read_only';
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderComponent();

    const memberName = await screen.findByText('Budi Santoso');
    expect(memberName).toBeTruthy();

    const approveBtn = screen.getByRole('button', { name: /setujui/i });
    fireEvent.click(approveBtn);

    expect(screen.queryByText('Konfirmasi Persetujuan Warga')).toBeNull();
    expect(tenantOperationalService.approveTenantMember).not.toHaveBeenCalled();

    const rejectBtn = screen.getByRole('button', { name: /tolak/i });
    fireEvent.click(rejectBtn);

    expect(tenantOperationalService.rejectTenantMember).not.toHaveBeenCalled();
  });
});
