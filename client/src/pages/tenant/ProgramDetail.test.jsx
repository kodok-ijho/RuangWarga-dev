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
  canGenerateBilling: true,
  canRecordCash: true,
  canVerifyPayments: true,
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
    createProgramDues: vi.fn(),
    updateProgramDuesAmount: vi.fn(),
    cancelProgramDues: vi.fn(),
    recordProgramDuesCash: vi.fn(),
    getTenantBankAccount: vi.fn(),
    fetchProgramDocuments: vi.fn(),
    uploadProgramDocument: vi.fn(),
    deleteProgramDocument: vi.fn(),
    getProgramDocumentUrl: vi.fn(),
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
    is_free_trial: true,
    access_until: '2099-01-01T00:00:00Z',
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
      canGenerateBilling: true,
      canRecordCash: true,
      canVerifyPayments: true,
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
    tenantOperationalService.fetchProgramDocuments.mockResolvedValue([
      {
        id: 'doc-1',
        program_id: 'prog-1',
        doc_type: 'proposal',
        title: 'Proposal Pentas Seni',
        file_path: 'tenants/tenant-panitia-1/programs/prog-1/documents/doc-1.pdf',
        file_name: 'Proposal_Pentas_Seni.pdf',
        mime_type: 'application/pdf',
        file_size: 1048576,
        created_at: '2026-03-01T10:00:00Z',
      },
      {
        id: 'doc-2',
        program_id: 'prog-1',
        doc_type: 'rab',
        title: 'RAB Final',
        file_path: 'tenants/tenant-panitia-1/programs/prog-1/documents/doc-2.xlsx',
        file_name: 'RAB_Final.xlsx',
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        file_size: 512000,
        created_at: '2026-03-02T10:00:00Z',
      },
    ]);
    tenantOperationalService.uploadProgramDocument.mockResolvedValue({ id: 'doc-new' });
    tenantOperationalService.deleteProgramDocument.mockResolvedValue(true);
    tenantOperationalService.getProgramDocumentUrl.mockResolvedValue('https://signed-url.example/doc-1.pdf');
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

  it('exports CSV report and calls Papa.unparse with consistent variance (realisasi - rencana)', async () => {
    renderProgramDetail();

    await screen.findByText('Pentas Seni Tahunan 2026');

    const exportBtn = screen.getByRole('button', { name: /Unduh CSV/i });
    fireEvent.click(exportBtn);

    expect(Papa.unparse).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Laporan CSV acara berhasil diunduh.');

    // PANITIA-1F.3: baris "Total Pengeluaran" bernilai realisasi - rencana
    const csvData = Papa.unparse.mock.calls[0][0];
    const totalExpenseRow = csvData.find((row) => row[0] === 'Total Pengeluaran');
    expect(totalExpenseRow).toBeTruthy();
    expect(totalExpenseRow[2]).toBe(1000000); // rencana
    expect(totalExpenseRow[3]).toBe(1200000); // realisasi
    expect(totalExpenseRow[4]).toBe(1200000 - 1000000); // realisasi - rencana = +200000
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

  it('PANITIA-1F.6: tombol simpan status di ProgramDetail nonaktif selama proses', async () => {
    let resolveUpdate;
    const updatePromise = new Promise((resolve) => {
      resolveUpdate = resolve;
    });
    tenantOperationalService.updateProgram.mockReturnValue(updatePromise);

    renderProgramDetail();

    await screen.findByText('Pentas Seni Tahunan 2026');

    const statusBtn = screen.getByRole('button', { name: /Ubah Status/i });
    fireEvent.click(statusBtn);

    expect(await screen.findByText('Ubah Status Acara')).toBeTruthy();

    const saveBtn = screen.getByRole('button', { name: /^Simpan$/i });
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveBtn.disabled).toBe(true);
      expect(screen.getByRole('button', { name: /Menyimpan\.\.\./i })).toBeTruthy();
    });

    resolveUpdate({
      id: 'prog-1',
      name: 'Pentas Seni Tahunan 2026',
      status: 'planning',
    });

    await waitFor(() => {
      expect(screen.queryByText('Ubah Status Acara')).toBeNull();
    });
  });

  describe('PANITIA-2.3: Tab Iuran di ProgramDetail', () => {
    const mockDues = [
      {
        id: 'due-1',
        member_id: 'm-1',
        member: { id: 'm-1', full_name: 'Budi Santoso', phone: '081234567890' },
        amount: 50000,
        due_date: '2026-11-20',
        status: 'unpaid',
      },
      {
        id: 'due-2',
        member_id: 'm-2',
        member: { id: 'm-2', full_name: 'Siti Aminah', phone: '089876543210' },
        amount: 50000,
        due_date: '2026-11-20',
        status: 'paid',
      },
    ];

    beforeEach(() => {
      tenantOperationalService.fetchProgram.mockResolvedValue(mockProgram);
      tenantOperationalService.fetchBudgetItems.mockResolvedValue(mockBudgetItems);
      tenantOperationalService.fetchProgramTransactions.mockResolvedValue({
        incomes: mockTransactions.incomes,
        expenses: mockTransactions.expenses,
        dues: mockDues,
      });
      tenantOperationalService.fetchTenantMembers.mockResolvedValue([
        { id: 'm-1', full_name: 'Budi Santoso', phone: '081234567890', status: 'approved' },
        { id: 'm-2', full_name: 'Siti Aminah', phone: '089876543210', status: 'approved' },
        { id: 'm-3', full_name: 'Doni Pratama', phone: '081122334455', status: 'approved' },
      ]);
      tenantOperationalService.createProgramDues.mockResolvedValue({ created: 1, skipped: 2 });
    });

    it('tab Iuran menampilkan status anggota dan ringkasan', async () => {
      renderProgramDetail();

      await screen.findByText('Pentas Seni Tahunan 2026');

      // Klik tab Iuran
      const duesTabBtn = screen.getByRole('button', { name: /^Iuran/i });
      fireEvent.click(duesTabBtn);

      // Anggota dan badge status tampil
      expect(await screen.findByText('Budi Santoso')).toBeTruthy();
      expect(screen.getByText('Siti Aminah')).toBeTruthy();
      expect(screen.getByText('Belum bayar')).toBeTruthy();
      expect(screen.getByText('Lunas')).toBeTruthy();

      // Ringkasan iuran
      expect(screen.getByText('Total Ditagih')).toBeTruthy();
      expect(screen.getByText('Terkumpul')).toBeTruthy();
    });

    it('form menerbitkan memanggil createProgramDues dengan anggota terpilih', async () => {
      renderProgramDetail();

      await screen.findByText('Pentas Seni Tahunan 2026');

      const duesTabBtn = screen.getByRole('button', { name: /^Iuran/i });
      fireEvent.click(duesTabBtn);

      const terbitkanBtn = await screen.findByRole('button', { name: /Terbitkan Iuran/i });
      fireEvent.click(terbitkanBtn);

      expect(await screen.findByText('Terbitkan Iuran Acara')).toBeTruthy();

      // Isi nominal
      const amountInput = screen.getByLabelText(/Nominal per Anggota/i);
      fireEvent.change(amountInput, { target: { value: '75000' } });

      // Submit
      const submitButtons = screen.getAllByRole('button', { name: /^Terbitkan Iuran$/i });
      const submitBtn = submitButtons.find((b) => b.getAttribute('type') === 'submit') || submitButtons[submitButtons.length - 1];
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(tenantOperationalService.createProgramDues).toHaveBeenCalledWith(
          'tenant-panitia-1',
          'prog-1',
          expect.objectContaining({
            amount: 75000,
            memberIds: expect.any(Array),
          })
        );
      });
    });

    it('tombol tulis tersembunyi untuk anggota biasa', async () => {
      mockTenantAccess = {
        canManagePrograms: false,
        canManageBudget: false,
        canRecordIncome: false,
        canManageExpenses: false,
        canViewReports: true,
        canGenerateBilling: false,
        canRecordCash: false,
        canVerifyPayments: false,
      };

      renderProgramDetail();

      await screen.findByText('Pentas Seni Tahunan 2026');

      const duesTabBtn = screen.getByRole('button', { name: /^Iuran/i });
      fireEvent.click(duesTabBtn);

      // Pastikan tabel iuran tampil tapi tombol-tombol aksi tulis tidak tampil
      expect(await screen.findByText('Budi Santoso')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Terbitkan Iuran/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Catat Tunai/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Ubah Nominal/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Batalkan/i })).toBeNull();

      // Reset mockTenantAccess
      mockTenantAccess = {
        canManagePrograms: true,
        canManageBudget: true,
        canRecordIncome: true,
        canManageExpenses: true,
        canViewReports: true,
        canGenerateBilling: true,
        canRecordCash: true,
        canVerifyPayments: true,
      };
    });

    it('tombol WA membentuk link wa.me', async () => {
      renderProgramDetail();

      await screen.findByText('Pentas Seni Tahunan 2026');

      const duesTabBtn = screen.getByRole('button', { name: /^Iuran/i });
      fireEvent.click(duesTabBtn);

      const waLink = await screen.findByRole('link', { name: /Ingatkan via WA/i });
      expect(waLink).toBeTruthy();
      const href = waLink.getAttribute('href');
      expect(href).toContain('https://wa.me/6281234567890?text=');
      expect(href).toContain(encodeURIComponent('Pentas Seni Tahunan 2026'));
      expect(href).toContain(encodeURIComponent('50.000'));
    });

    it('F.3: tombol WA tersembunyi untuk anggota biasa tanpa izin tagihan/kas/verifikasi', async () => {
      mockTenantAccess = {
        canManagePrograms: false,
        canManageBudget: false,
        canRecordIncome: false,
        canManageExpenses: false,
        canViewReports: false,
        canGenerateBilling: false,
        canRecordCash: false,
        canVerifyPayments: false,
      };

      renderProgramDetail();
      await screen.findByText('Pentas Seni Tahunan 2026');

      const duesTabBtn = screen.getByRole('button', { name: /^Iuran/i });
      fireEvent.click(duesTabBtn);

      await screen.findByText('Budi Santoso');
      expect(screen.queryByRole('link', { name: /Ingatkan via WA/i })).toBeNull();
    });

    it('2F.4: nomor HP anggota hanya tampil untuk pengurus (canGenerateBilling || canRecordCash || canVerifyPayments)', async () => {
      // 1. Kasus anggota biasa tanpa izin tagihan/kas/verifikasi -> nomor HP tidak tampil
      mockTenantAccess = {
        canManagePrograms: false,
        canManageBudget: false,
        canRecordIncome: false,
        canManageExpenses: false,
        canViewReports: false,
        canGenerateBilling: false,
        canRecordCash: false,
        canVerifyPayments: false,
      };

      const { unmount } = renderProgramDetail();
      await screen.findByText('Pentas Seni Tahunan 2026');

      const duesTabBtn = screen.getByRole('button', { name: /^Iuran/i });
      fireEvent.click(duesTabBtn);

      await screen.findByText('Budi Santoso');
      expect(screen.queryByText('081234567890')).toBeNull();
      expect(screen.queryByText('089876543210')).toBeNull();

      unmount();

      // 2. Kasus bendahara dengan izin -> nomor HP tampil
      mockTenantAccess = {
        canManagePrograms: true,
        canManageBudget: true,
        canRecordIncome: true,
        canManageExpenses: true,
        canViewReports: true,
        canGenerateBilling: true,
        canRecordCash: true,
        canVerifyPayments: true,
      };

      renderProgramDetail();
      await screen.findByText('Pentas Seni Tahunan 2026');

      const duesTabBtnStaff = screen.getByRole('button', { name: /^Iuran/i });
      fireEvent.click(duesTabBtnStaff);

      expect(await screen.findByText('081234567890')).toBeTruthy();
      expect(screen.getByText('089876543210')).toBeTruthy();
    });

    it('F.3: dues gagal memuat -> pemasukan tetap tampil dan alert iuran muncul', async () => {
      tenantOperationalService.fetchProgramTransactions.mockResolvedValueOnce({
        incomes: mockTransactions.incomes,
        expenses: mockTransactions.expenses,
        dues: [],
        duesError: true,
      });

      renderProgramDetail();
      await screen.findByText('Pentas Seni Tahunan 2026');

      const txTabBtn = screen.getByRole('button', { name: /Daftar Transaksi/i });
      fireEvent.click(txTabBtn);
      expect(await screen.findByText('Pencairan sponsorship termin 1')).toBeTruthy();

      const duesTabBtn = screen.getByRole('button', { name: /^Iuran/i });
      fireEvent.click(duesTabBtn);
      expect(await screen.findByText(/Data iuran gagal dimuat/i)).toBeTruthy();
    });
  });

  describe('PANITIA-3.4: Tab Dokumen', () => {
    it('daftar dokumen tampil dikelompokkan per tipe', async () => {
      renderProgramDetail();
      await screen.findByText('Pentas Seni Tahunan 2026');

      const docTabBtn = screen.getByRole('button', { name: /^Dokumen/i });
      fireEvent.click(docTabBtn);

      expect(await screen.findByText('Proposal Pentas Seni')).toBeTruthy();
      expect(screen.getByText('Proposal_Pentas_Seni.pdf')).toBeTruthy();
      expect(screen.getByText('RAB Final')).toBeTruthy();
      expect(screen.getByText('RAB_Final.xlsx')).toBeTruthy();
      expect(screen.getByText('1 MB')).toBeTruthy();
    });

    it('form unggah memanggil uploadProgramDocument dengan tipe dan judul', async () => {
      renderProgramDetail();
      await screen.findByText('Pentas Seni Tahunan 2026');

      const docTabBtn = screen.getByRole('button', { name: /^Dokumen/i });
      fireEvent.click(docTabBtn);

      const unggahBtn = await screen.findByRole('button', { name: /Unggah Dokumen/i });
      fireEvent.click(unggahBtn);

      expect(await screen.findByText('Unggah Dokumen Acara')).toBeTruthy();

      const titleInput = screen.getByLabelText(/Judul Dokumen/i);
      fireEvent.change(titleInput, { target: { value: 'Rundown Acara Hari H' } });

      const fileInput = screen.getByTestId('doc-file-input');
      const testFile = new File(['dummy content'], 'rundown.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [testFile] } });

      const submitButtons = screen.getAllByRole('button', { name: /^Unggah Dokumen$/i });
      const submitBtn =
        submitButtons.find((b) => b.getAttribute('type') === 'submit') ||
        submitButtons[submitButtons.length - 1];
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(tenantOperationalService.uploadProgramDocument).toHaveBeenCalledWith(
          'tenant-panitia-1',
          'prog-1',
          expect.objectContaining({
            title: 'Rundown Acara Hari H',
            file: testFile,
          })
        );
      });
    });

    it('tombol unggah dan hapus tersembunyi untuk anggota biasa', async () => {
      mockTenantAccess = {
        canManagePrograms: false,
        canManageBudget: false,
        canRecordIncome: false,
        canManageExpenses: false,
        canViewReports: true,
        canGenerateBilling: false,
        canRecordCash: false,
        canVerifyPayments: false,
      };

      renderProgramDetail();
      await screen.findByText('Pentas Seni Tahunan 2026');

      const docTabBtn = screen.getByRole('button', { name: /^Dokumen/i });
      fireEvent.click(docTabBtn);

      expect(await screen.findByText('Proposal Pentas Seni')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Unggah Dokumen/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Hapus/i })).toBeNull();

      // Reset
      mockTenantAccess = {
        canManagePrograms: true,
        canManageBudget: true,
        canRecordIncome: true,
        canManageExpenses: true,
        canViewReports: true,
        canGenerateBilling: true,
        canRecordCash: true,
        canVerifyPayments: true,
      };
    });

    it('F.4: tombol Buka dokumen membuka tab kosong sinkron lalu assign href', async () => {
      const mockWin = { location: { href: '' }, opener: 'test', close: vi.fn() };
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWin);
      tenantOperationalService.getProgramDocumentUrl.mockResolvedValueOnce('https://r2.ruangwarga.test/mock-url.pdf');

      renderProgramDetail();
      await screen.findByText('Pentas Seni Tahunan 2026');

      const docTabBtn = screen.getByRole('button', { name: /^Dokumen/i });
      fireEvent.click(docTabBtn);

      const bukaButtons = await screen.findAllByRole('button', { name: /Buka/i });
      fireEvent.click(bukaButtons[0]);

      expect(openSpy).toHaveBeenCalledWith('', '_blank');
      await waitFor(() => {
        expect(mockWin.location.href).toBe('https://r2.ruangwarga.test/mock-url.pdf');
        expect(mockWin.opener).toBeNull();
      });

      openSpy.mockRestore();
    });
  });

  describe('HARGA.3: Penguncian transaksi berdasarkan masa aktif acara', () => {
    it('tombol transaksi nonaktif untuk acara inactive dan aktif untuk free_trial', async () => {
      // 1. Acara inactive
      tenantOperationalService.fetchProgram.mockResolvedValueOnce({
        ...mockProgram,
        is_free_trial: false,
        access_until: null,
      });

      const { unmount } = renderProgramDetail();
      await screen.findByText('Pentas Seni Tahunan 2026');

      expect(screen.getAllByText('Belum aktif').length).toBeGreaterThanOrEqual(1);

      // Transaksi tab
      const txTabBtn = screen.getByRole('button', { name: /Daftar Transaksi/i });
      fireEvent.click(txTabBtn);

      const incomeBtn = screen.getByRole('button', { name: /Catat Pemasukan/i });
      const expenseBtn = screen.getByRole('button', { name: /Catat Pengeluaran/i });
      expect(incomeBtn.disabled).toBe(true);
      expect(expenseBtn.disabled).toBe(true);
      expect(incomeBtn.getAttribute('title')).toContain('Acara belum aktif / masa aktif habis');

      // Iuran tab
      const duesTabBtn = screen.getByRole('button', { name: /^Iuran/i });
      fireEvent.click(duesTabBtn);

      const terbitkanBtn = screen.getByRole('button', { name: /Terbitkan Iuran/i });
      expect(terbitkanBtn.disabled).toBe(true);

      unmount();

      // 2. Acara free_trial
      tenantOperationalService.fetchProgram.mockResolvedValueOnce({
        ...mockProgram,
        is_free_trial: true,
        access_until: '2099-01-01T00:00:00Z',
      });

      renderProgramDetail();
      await screen.findByText('Pentas Seni Tahunan 2026');

      expect(screen.getAllByText(/Gratis sampai/i).length).toBeGreaterThanOrEqual(1);

      const txTabBtn2 = screen.getByRole('button', { name: /Daftar Transaksi/i });
      fireEvent.click(txTabBtn2);

      const incomeBtn2 = screen.getByRole('button', { name: /Catat Pemasukan/i });
      const expenseBtn2 = screen.getByRole('button', { name: /Catat Pengeluaran/i });
      expect(incomeBtn2.disabled).toBe(false);
      expect(expenseBtn2.disabled).toBe(false);
    });

    it('HARGA.4: panel masa aktif acara tampil untuk pengelola dengan tombol aktifkan/perpanjang', async () => {
      tenantOperationalService.fetchProgram.mockResolvedValueOnce({
        ...mockProgram,
        is_free_trial: true,
        access_until: '2099-03-01T00:00:00Z',
      });

      renderProgramDetail();
      await screen.findByText('Pentas Seni Tahunan 2026');

      const panel = screen.getByTestId('program-access-panel');
      expect(panel).toBeTruthy();
      expect(panel.textContent).toMatch(/Rp\s*25\.000 \/ 12 bulan/);
      expect(panel.textContent).toContain('Gratis sampai');
      expect(panel.textContent).toMatch(/Setelah itu aktifkan Rp\s*25\.000 \/ 12 bulan/);

      const btn = screen.getByRole('button', { name: /Aktifkan \/ Perpanjang/i });
      expect(btn.disabled).toBe(true);
      expect(panel.textContent).toContain('Pembayaran QRIS segera tersedia');
    });
  });
});
