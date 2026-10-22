// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Papa from 'papaparse';
import ProgramDetail from './ProgramDetail';
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

vi.mock('papaparse', () => ({
  default: {
    unparse: vi.fn().mockReturnValue('mock,csv,string'),
  },
  unparse: vi.fn().mockReturnValue('mock,csv,string'),
}));

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
    fetchProgram: vi.fn(),
    updateProgram: vi.fn(),
    deleteProgram: vi.fn(),
    fetchBudgetItems: vi.fn(),
    createBudgetItem: vi.fn(),
    updateBudgetItem: vi.fn(),
    deleteBudgetItem: vi.fn(),
    fetchProgramTransactions: vi.fn(),
    fetchTenantMembers: vi.fn(),
  };
});

function renderProgramDetail(initialEntry = '/t/tenant-panitia-1/programs/prog-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/t/:tenantId/programs/:programId" element={<ProgramDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PANITIA-1.7: ProgramDetail Page', () => {
  const mockProgram = {
    id: 'prog-1',
    tenant_id: 'tenant-panitia-1',
    name: 'Pentas Seni Tahunan 2026',
    description: 'Pentas seni kolaboratif siswa',
    location: 'Aula Utama & Lapangan',
    starts_on: '2026-11-20',
    ends_on: '2026-11-21',
    status: 'running',
    lead_member: { id: 'm-1', name: 'Ahmad Faiz' },
  };

  const mockBudgetItems = [
    {
      id: 'b-1',
      tenant_id: 'tenant-panitia-1',
      program_id: 'prog-1',
      kind: 'income',
      section: 'Sponsorship',
      item: 'Sponsor Utama Bank XYZ',
      quantity: 1,
      unit_label: 'paket',
      unit_price: 15000000,
      amount: 15000000,
    },
    {
      id: 'b-2',
      tenant_id: 'tenant-panitia-1',
      program_id: 'prog-1',
      kind: 'expense',
      section: 'Konsumsi',
      item: 'Snack Rapat Panitia',
      quantity: 50,
      unit_label: 'kotak',
      unit_price: 20000,
      amount: 1000000,
    },
  ];

  const mockTransactions = {
    incomes: [
      {
        id: 'inc-1',
        tenant_id: 'tenant-panitia-1',
        program_id: 'prog-1',
        budget_item_id: 'b-1',
        amount: 15000000,
        source_name: 'Bank XYZ',
        description: 'Pencairan sponsorship termin 1',
        income_date: '2026-11-01',
      },
    ],
    expenses: [
      {
        id: 'exp-1',
        tenant_id: 'tenant-panitia-1',
        program_id: 'prog-1',
        budget_item_id: 'b-2',
        amount: 1200000,
        recipient: 'Catering Berkah',
        description: 'Snack rapat dan makan siang',
        date: '2026-11-05',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob');
    window.URL.revokeObjectURL = vi.fn();

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

    tenantOperationalService.fetchProgram.mockResolvedValue(mockProgram);
    tenantOperationalService.fetchBudgetItems.mockResolvedValue(mockBudgetItems);
    tenantOperationalService.fetchProgramTransactions.mockResolvedValue(mockTransactions);
    tenantOperationalService.fetchTenantMembers.mockResolvedValue([
      { id: 'm-1', name: 'Ahmad Faiz', status: 'approved' },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders program detail with correct financial summary metrics', async () => {
    renderProgramDetail();

    expect(await screen.findByText('Pentas Seni Tahunan 2026')).toBeTruthy();
    expect(screen.getByText(/Ahmad Faiz/i)).toBeTruthy();

    // Verify 5 metric cards:
    // Planned Income: 15.000.000
    // Actual Income: 15.000.000
    // Planned Expense: 1.000.000
    // Actual Expense: 1.200.000
    // Balance: 15.000.000 - 1.200.000 = 13.800.000
    expect(screen.getAllByText('Rencana Pemasukan').length).toBeGreaterThan(0);
    expect(screen.getByText('Realisasi Pemasukan')).toBeTruthy();
    expect(screen.getAllByText('Rencana Pengeluaran').length).toBeGreaterThan(0);
    expect(screen.getByText('Realisasi Pengeluaran')).toBeTruthy();
    expect(screen.getByText('Saldo Realisasi')).toBeTruthy();

    // Check section table: Konsumsi actual (1.200.000) exceeds planned (1.000.000)
    expect(screen.getAllByText('Konsumsi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sponsorship').length).toBeGreaterThan(0);
  });

  it('hides management and budget edit buttons for regular member', async () => {
    mockTenantAccess = {
      canManagePrograms: false,
      canManageBudget: false,
      canRecordIncome: false,
      canManageExpenses: false,
      canViewReports: true,
    };

    renderProgramDetail();

    await screen.findByText('Pentas Seni Tahunan 2026');

    // Management buttons should not be rendered
    expect(screen.queryByRole('button', { name: /Ubah Status/i })).toBeNull();
    expect(screen.queryByTitle(/Hapus Acara/i)).toBeNull();

    // Switch to Anggaran tab
    const budgetTab = screen.getByRole('button', { name: /Anggaran \(RAB\)/i });
    fireEvent.click(budgetTab);

    // "Tambah Pos Anggaran" button should not be rendered
    expect(screen.queryByRole('button', { name: /Tambah Pos Anggaran/i })).toBeNull();

    // Switch to Transaksi tab
    const transTab = screen.getByRole('button', { name: /Daftar Transaksi/i });
    fireEvent.click(transTab);

    // Recording buttons should not be rendered
    expect(screen.queryByRole('button', { name: /Catat Pemasukan/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Catat Pengeluaran/i })).toBeNull();
  });

  it('exports CSV report and calls Papa.unparse', async () => {
    renderProgramDetail();

    await screen.findByText('Pentas Seni Tahunan 2026');

    const exportBtn = screen.getByRole('button', { name: /Unduh CSV/i });
    fireEvent.click(exportBtn);

    expect(Papa.unparse).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Laporan CSV acara berhasil diunduh.');
  });

  it('PANITIA-1F.2: menyertakan ketiga bagian di DOM saat tab aktif Ringkasan serta memiliki judul cetak', async () => {
    renderProgramDetail();

    await screen.findByText('Pentas Seni Tahunan 2026');

    // Judul cetak ada dan berisi nama program & tanggal cetak
    const printHeader = screen.getByTestId('program-print-header');
    expect(printHeader).toBeTruthy();
    expect(printHeader.className).toContain('hidden');
    expect(printHeader.className).toContain('print:block');
    expect(printHeader.textContent).toContain('Pentas Seni Tahunan 2026');
    expect(printHeader.textContent).toContain('Tanggal Cetak:');

    // Ketiga tab section ada di DOM
    const summarySection = screen.getByTestId('tab-section-summary');
    const budgetSection = screen.getByTestId('tab-section-budget');
    const transSection = screen.getByTestId('tab-section-transactions');

    expect(summarySection).toBeTruthy();
    expect(budgetSection).toBeTruthy();
    expect(transSection).toBeTruthy();

    // Tab aktif (summary) terlihat normal
    expect(summarySection.className).toContain('block');

    // Tab tidak aktif memiliki class hidden dan print:block
    expect(budgetSection.className).toContain('hidden');
    expect(budgetSection.className).toContain('print:block');
    expect(transSection.className).toContain('hidden');
    expect(transSection.className).toContain('print:block');

    // Tombol aksi di tabel pos anggaran memiliki print:hidden
    const editBudgetBtns = screen.getAllByTitle('Ubah');
    expect(editBudgetBtns.length).toBeGreaterThan(0);
    const actionCell = editBudgetBtns[0].closest('td');
    expect(actionCell?.className).toContain('print:hidden');
  });
});
