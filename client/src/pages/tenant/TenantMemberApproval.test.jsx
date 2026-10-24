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
      activeTenant: { id: 'tenant-123', name: 'Kompleks RT 01', type: 'rt_rw' },
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

  it('a. klik "Setujui" pada RT/RW → modal konfirmasi persetujuan tampil (tanpa error)', async () => {
    renderComponent();

    const memberName = await screen.findByText('Budi Santoso');
    expect(memberName).toBeTruthy();

    const approveBtn = screen.getByRole('button', { name: /^setujui$/i });
    fireEvent.click(approveBtn);

    const modalTitle = await screen.findByText('Konfirmasi Persetujuan Warga');
    expect(modalTitle).toBeTruthy();
    expect(screen.getByText(/Tetapkan nomor rumah dan peran untuk/i)).toBeTruthy();
  });

  it('b. konfirmasi di modal RT/RW → approveTenantMember dipanggil dengan id anggota', async () => {
    renderComponent();

    const memberName = await screen.findByText('Budi Santoso');
    expect(memberName).toBeTruthy();

    const approveBtn = screen.getByRole('button', { name: /^setujui$/i });
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

    const approveBtn = screen.getByRole('button', { name: /^setujui$/i });
    fireEvent.click(approveBtn);

    expect(screen.queryByText('Konfirmasi Persetujuan Warga')).toBeNull();
    expect(tenantOperationalService.approveTenantMember).not.toHaveBeenCalled();

    const rejectBtn = screen.getByRole('button', { name: /tolak/i });
    fireEvent.click(rejectBtn);

    expect(tenantOperationalService.rejectTenantMember).not.toHaveBeenCalled();
  });
});

describe('TenantMemberApproval Khusus Kos (KOS-2.7)', () => {
  const kosTenantId = 'tenant-kos-1';
  const mockPendingKosApplicant = {
    id: 'applicant-1',
    full_name: 'Dhani Mahasiswa',
    occupancy_status: 'tenant',
    unit_id: 101,
    tenant_units: { id: 101, label: 'Kamar 101' },
    phone: '081234567890',
    created_at: '2026-10-24T00:00:00.000Z',
  };

  const mockKosUnits = [
    {
      id: 101,
      label: 'Kamar 101',
      status: 'vacant',
      metadata: { rent_price: 1500000 },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockTenantState = {
      activeTenant: { id: kosTenantId, name: 'Kos Melati Harmoni', type: 'kos' },
      activeTenantId: kosTenantId,
      subscriptionStatus: 'active',
      isOwner: true,
      isTenantAdmin: true,
      userRole: 'admin',
      switchTenant: vi.fn(),
      hasPermission: vi.fn(() => true),
    };

    vi.spyOn(tenantOperationalService, 'fetchPendingTenantMembers').mockResolvedValue([
      mockPendingKosApplicant,
    ]);
    vi.spyOn(tenantOperationalService, 'fetchTenantUnits').mockResolvedValue(mockKosUnits);
    vi.spyOn(tenantOperationalService, 'fetchTenantMembers').mockResolvedValue([]);
    vi.spyOn(tenantOperationalService, 'fetchTenantDetails').mockResolvedValue({
      id: kosTenantId,
      settings: { rent_grace_days: 10, default_rent_price: 1500000 },
    });
    vi.spyOn(tenantOperationalService, 'fetchActiveContractByUnit').mockResolvedValue(null);
    vi.spyOn(tenantOperationalService, 'createKosContract').mockResolvedValue({
      id: 'contract-new-1',
      unit_id: 101,
      rent_price: 1500000,
    });
    vi.spyOn(tenantOperationalService, 'approveTenantMember').mockResolvedValue({
      success: true,
    });
  });

  const renderKosComponent = () => {
    return render(
      <MemoryRouter initialEntries={[`/t/${kosTenantId}/approval`]}>
        <Routes>
          <Route path="/t/:tenantId/approval" element={<TenantMemberApproval />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('alur 1: pendaftar memilih kamar menampilkan "Setujui & Buat Kontrak" dan "Setujui tanpa kamar"', async () => {
    renderKosComponent();

    expect(await screen.findByText('Dhani Mahasiswa')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Setujui & Buat Kontrak/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Setujui tanpa kamar/i })).toBeTruthy();
  });

  it('alur 2: klik "Setujui & Buat Kontrak" membuka form kontrak terkunci dan menyetujui berurutan saat disimpan', async () => {
    renderKosComponent();

    const btnWithContract = await screen.findByRole('button', { name: /Setujui & Buat Kontrak/i });
    fireEvent.click(btnWithContract);

    // Form modal kontrak sewa terbuka
    expect(await screen.findByText('Buat Kontrak Sewa')).toBeTruthy();
    expect(screen.getByText(/Kamar Pendaftar \(Terkunci\)/i)).toBeTruthy();
    expect(screen.getAllByText(/Pendaftar \(Terkunci\)/i).length).toBeGreaterThan(0);

    // Simpan kontrak
    const submitBtn = screen.getByRole('button', { name: /Simpan Kontrak/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // Pastikan createKosContract dipanggil dengan data pendaftar & kamar
      expect(tenantOperationalService.createKosContract).toHaveBeenCalledWith(
        kosTenantId,
        expect.objectContaining({
          unitId: 101,
          memberId: 'applicant-1',
        })
      );
      // Pastikan approveTenantMember dipanggil setelah kontrak sukses
      expect(tenantOperationalService.approveTenantMember).toHaveBeenCalledWith(
        'applicant-1',
        expect.objectContaining({
          unitId: 101,
          role: 'anggota',
        })
      );
    });
  });

  it('alur 3: bila pembuatan kontrak gagal, jangan approve anggota', async () => {
    tenantOperationalService.createKosContract.mockRejectedValueOnce(
      new Error('Kamar sudah memiliki kontrak sewa aktif')
    );

    renderKosComponent();

    const btnWithContract = await screen.findByRole('button', { name: /Setujui & Buat Kontrak/i });
    fireEvent.click(btnWithContract);

    expect(await screen.findByText('Buat Kontrak Sewa')).toBeTruthy();

    const submitBtn = screen.getByRole('button', { name: /Simpan Kontrak/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.createKosContract).toHaveBeenCalled();
      // approveTenantMember TIDAK boleh dipanggil karena kontrak gagal
      expect(tenantOperationalService.approveTenantMember).not.toHaveBeenCalled();
    });
  });

  it('alur 4: klik "Setujui tanpa kamar" langsung menyetujui tanpa mengaitkan ke kamar', async () => {
    renderKosComponent();

    const btnWithoutRoom = await screen.findByRole('button', { name: /Setujui tanpa kamar/i });
    fireEvent.click(btnWithoutRoom);

    await waitFor(() => {
      expect(tenantOperationalService.approveTenantMember).toHaveBeenCalledWith(
        'applicant-1',
        expect.objectContaining({
          unitId: null,
          role: 'anggota',
        })
      );
      expect(tenantOperationalService.createKosContract).not.toHaveBeenCalled();
    });
  });
});
