// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Programs from './Programs';
import * as tenantOperationalService from '../../services/tenantOperationalService';

let mockTenant = {
  id: 'tenant-panitia-1',
  name: 'Panitia Dies Natalis 2026',
  type: 'panitia',
};

let mockTenantAccess = {
  canManagePrograms: true,
  canManageBudget: true,
  canRecordIncome: true,
  canManageExpenses: true,
  canViewReports: true,
};

let mockSubscriptionGate = {
  canTransact: true,
  isReadOnly: false,
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../../context/TenantContext', () => ({
  useTenant: () => ({
    activeTenant: mockTenant,
  }),
}));

vi.mock('../../hooks/useTenantAccess', () => ({
  useTenantAccess: () => mockTenantAccess,
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => mockSubscriptionGate,
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../../services/tenantOperationalService');
  return {
    ...actual,
    fetchPrograms: vi.fn(),
    fetchProgramsOverview: vi.fn(),
    createProgram: vi.fn(),
    fetchBudgetItems: vi.fn(),
    fetchProgramTransactions: vi.fn(),
    fetchTenantMembers: vi.fn(),
  };
});

function renderPrograms(initialEntry = '/t/tenant-panitia-1/programs') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/t/:tenantId/programs" element={<Programs />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PANITIA-1.7: Programs Page', () => {
  const mockProgramsList = [
    {
      id: 'prog-1',
      tenant_id: 'tenant-panitia-1',
      name: 'Pentas Seni 2026',
      description: 'Acara musik siswa',
      location: 'Lapangan Basket',
      starts_on: '2026-11-20',
      ends_on: '2026-11-21',
      status: 'running',
      lead_member: { id: 'm-1', name: 'Faiz' },
    },
    {
      id: 'prog-2',
      tenant_id: 'tenant-panitia-1',
      name: 'Lomba Catur Antar Kelas',
      description: 'Turnamen catur',
      location: 'Aula',
      starts_on: '2026-12-01',
      ends_on: '2026-12-02',
      status: 'planning',
      lead_member: { id: 'm-2', name: 'Budi' },
    },
    {
      id: 'prog-3',
      tenant_id: 'tenant-panitia-1',
      name: 'Bazar Buku Murah',
      description: 'Bazar tahun lalu',
      location: 'Kantin',
      starts_on: '2025-05-10',
      ends_on: '2025-05-11',
      status: 'completed',
      lead_member: { id: 'm-3', name: 'Citra' },
    },
    {
      id: 'prog-4',
      tenant_id: 'tenant-panitia-1',
      name: 'Workshop Robotik 2024',
      description: 'Arsip lama',
      location: 'Lab Komputer',
      starts_on: '2024-03-01',
      ends_on: '2024-03-02',
      status: 'archived',
      lead_member: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenant = {
      id: 'tenant-panitia-1',
      name: 'Panitia Dies Natalis 2026',
      type: 'panitia',
    };
    mockTenantAccess = {
      canManagePrograms: true,
      canManageBudget: true,
      canRecordIncome: true,
      canManageExpenses: true,
      canViewReports: true,
    };
    mockSubscriptionGate = {
      canTransact: true,
      isReadOnly: false,
    };

    tenantOperationalService.fetchPrograms.mockResolvedValue(mockProgramsList);
    tenantOperationalService.fetchProgramsOverview.mockResolvedValue(mockProgramsList);
    tenantOperationalService.fetchBudgetItems.mockResolvedValue([]);
    tenantOperationalService.fetchProgramTransactions.mockResolvedValue({ incomes: [], expenses: [] });
    tenantOperationalService.fetchTenantMembers.mockResolvedValue([
      { id: 'm-1', name: 'Faiz', status: 'approved' },
      { id: 'm-2', name: 'Budi', status: 'approved' },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders programs list and switches tabs to filter programs', async () => {
    renderPrograms();

    // Default tab is 'Aktif' -> shows running ('Pentas Seni 2026') & planning ('Lomba Catur Antar Kelas')
    expect(await screen.findByText('Pentas Seni 2026')).toBeTruthy();
    expect(screen.getByText('Lomba Catur Antar Kelas')).toBeTruthy();
    expect(screen.queryByText('Bazar Buku Murah')).toBeNull();
    expect(screen.queryByText('Workshop Robotik 2024')).toBeNull();

    // Switch to 'Selesai' tab
    const completedTab = screen.getByRole('button', { name: /Selesai/i });
    fireEvent.click(completedTab);

    expect(await screen.findByText('Bazar Buku Murah')).toBeTruthy();
    expect(screen.queryByText('Pentas Seni 2026')).toBeNull();

    // Switch to 'Arsip' tab
    const archivedTab = screen.getByRole('button', { name: /Arsip/i });
    fireEvent.click(archivedTab);

    expect(await screen.findByText('Workshop Robotik 2024')).toBeTruthy();
    expect(screen.queryByText('Bazar Buku Murah')).toBeNull();
  }, 15000);

  it('hides "Buat Acara" button for members without canManagePrograms permission', async () => {
    mockTenantAccess = {
      ...mockTenantAccess,
      canManagePrograms: false,
    };

    renderPrograms();

    await screen.findByText('Pentas Seni 2026');
    expect(screen.queryByRole('button', { name: /Buat Acara/i })).toBeNull();
  });

  it('submits new program via createProgram', async () => {
    tenantOperationalService.createProgram.mockResolvedValue({
      id: 'prog-new',
      name: 'Festival Budaya 2026',
      status: 'planning',
    });

    renderPrograms();

    const addBtn = await screen.findByRole('button', { name: /Buat Acara/i });
    fireEvent.click(addBtn);

    const nameInput = screen.getByLabelText(/Nama Acara/i);
    fireEvent.change(nameInput, { target: { value: 'Festival Budaya 2026' } });

    const submitBtn = screen.getByRole('button', { name: /Simpan Acara/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.createProgram).toHaveBeenCalledWith(
        'tenant-panitia-1',
        expect.objectContaining({
          name: 'Festival Budaya 2026',
          status: 'planning',
        })
      );
      expect(mockToast.success).toHaveBeenCalledWith('Acara berhasil dibuat.');
    });
  });

  it('PANITIA-1F.4: displays error state with "Coba lagi" button when fetchPrograms fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    tenantOperationalService.fetchPrograms.mockRejectedValue(new Error('Koneksi terputus'));
    tenantOperationalService.fetchProgramsOverview.mockRejectedValue(new Error('Koneksi terputus'));

    renderPrograms();

    expect(await screen.findByText('Gagal memuat acara.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Coba lagi/i })).toBeTruthy();
    expect(screen.queryByText(/Tidak ada acara aktif/i)).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
