// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProgramLpj from './ProgramLpj';
import * as tenantOperationalService from '../../services/tenantOperationalService';
import { formatRupiah } from '../../services/dataHelpers';

let mockTenant = {
  id: 'tenant-panitia-1',
  name: 'Panitia Dies Natalis 2026',
  city: 'Jakarta',
};

vi.mock('../../context/TenantContext', () => ({
  useTenant: () => ({
    activeTenant: mockTenant,
  }),
}));

vi.mock('../../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../../services/tenantOperationalService');
  return {
    ...actual,
    fetchProgram: vi.fn(),
    fetchBudgetItems: vi.fn(),
    fetchProgramTransactions: vi.fn(),
    fetchProgramDocuments: vi.fn(),
    fetchTenantMembers: vi.fn(),
  };
});

function renderProgramLpj(initialEntry = '/t/tenant-panitia-1/programs/prog-1/lpj') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/t/:tenantId/programs/:programId/lpj" element={<ProgramLpj />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PANITIA-3.5: ProgramLpj Page', () => {
  const mockProgram = {
    id: 'prog-1',
    tenant_id: 'tenant-panitia-1',
    name: 'Pentas Seni Tahunan 2026',
    description: 'Pentas seni kolaboratif siswa',
    location: 'Aula Utama & Lapangan',
    starts_on: '2026-11-20',
    ends_on: '2026-11-21',
    status: 'done',
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
        category: 'Konsumsi',
        description: 'Snack rapat dan makan siang',
        date: '2026-11-05',
        receipt_file_path: 'tenants/tenant-panitia-1/expenses/exp-1-nota.jpg',
      },
    ],
    dues: [
      {
        id: 'due-1',
        tenant_id: 'tenant-panitia-1',
        program_id: 'prog-1',
        member_id: 'm-2',
        member: { full_name: 'Budi Santoso' },
        amount: 50000,
        status: 'paid',
        due_date: '2026-11-10',
      },
    ],
  };

  const mockDocuments = [
    {
      id: 'doc-1',
      program_id: 'prog-1',
      doc_type: 'proposal',
      title: 'Proposal Resmi Pentas Seni',
      file_name: 'Proposal_Pentas_Seni.pdf',
      file_size: 2097152, // 2 MB
      created_at: '2026-10-15T09:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenant = {
      id: 'tenant-panitia-1',
      name: 'Panitia Dies Natalis 2026',
      city: 'Jakarta',
    };

    tenantOperationalService.fetchProgram.mockResolvedValue(mockProgram);
    tenantOperationalService.fetchBudgetItems.mockResolvedValue(mockBudgetItems);
    tenantOperationalService.fetchProgramTransactions.mockResolvedValue(mockTransactions);
    tenantOperationalService.fetchProgramDocuments.mockResolvedValue(mockDocuments);
    tenantOperationalService.fetchTenantMembers.mockResolvedValue([
      { id: 'm-1', name: 'Ahmad Faiz', status: 'approved' },
      { id: 'm-2', name: 'Budi Santoso', status: 'approved' },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('LPJ merender semua 8 bagian dari data demo', async () => {
    renderProgramLpj();

    expect(await screen.findByText('Laporan Pertanggungjawaban (LPJ)')).toBeTruthy();

    // 1. Sampul
    const sec1 = screen.getByTestId('lpj-section-1');
    expect(within(sec1).getByText('Pentas Seni Tahunan 2026')).toBeTruthy();
    expect(within(sec1).getByText(/Aula Utama & Lapangan/i)).toBeTruthy();

    // 2. Ringkasan Keuangan
    expect(screen.getByTestId('lpj-section-2')).toBeTruthy();

    // 3. Anggaran vs Realisasi per Seksi
    const sec3 = screen.getByTestId('lpj-section-3');
    expect(within(sec3).getByText('Sponsorship')).toBeTruthy();
    expect(within(sec3).getByText('Konsumsi')).toBeTruthy();

    // 4. Rincian Pemasukan
    const sec4 = screen.getByTestId('lpj-section-4');
    expect(within(sec4).getByText('Bank XYZ')).toBeTruthy();
    expect(within(sec4).getByText('Pencairan sponsorship termin 1')).toBeTruthy();

    // 5. Rincian Pengeluaran
    const sec5 = screen.getByTestId('lpj-section-5');
    expect(within(sec5).getByText('Konsumsi')).toBeTruthy();
    expect(within(sec5).getByText('Snack rapat dan makan siang')).toBeTruthy();
    expect(within(sec5).getByText('nota ✓')).toBeTruthy();

    // 6. Rekap Iuran Panitia
    const sec6 = screen.getByTestId('lpj-section-6');
    expect(within(sec6).getByText('Budi Santoso')).toBeTruthy();
    expect(within(sec6).getByText('Lunas')).toBeTruthy();

    // 7. Dokumen Pendukung
    const sec7 = screen.getByTestId('lpj-section-7');
    expect(within(sec7).getByText('Proposal Resmi Pentas Seni')).toBeTruthy();
    expect(within(sec7).getByText('Proposal_Pentas_Seni.pdf')).toBeTruthy();
    expect(within(sec7).getByText('2 MB')).toBeTruthy();

    // 8. Pengesahan
    expect(screen.getByTestId('lpj-section-8')).toBeTruthy();
  });

  it('total di bagian 2 sama dengan summarizeProgram', async () => {
    renderProgramLpj();

    await screen.findByText('Laporan Pertanggungjawaban (LPJ)');

    const expectedSummary = tenantOperationalService.summarizeProgram(
      mockBudgetItems,
      mockTransactions.incomes,
      mockTransactions.expenses,
      mockTransactions.dues
    );

    const sec2 = screen.getByTestId('lpj-section-2');

    const matchCurrency = (amt) => {
      const formatted = amt.toLocaleString('id-ID');
      return new RegExp(`^Rp[\\s\\u00a0]*${formatted.replace(/\\./g, '\\.')}$`);
    };

    expect(within(sec2).getByText(matchCurrency(expectedSummary.planned.income))).toBeTruthy();
    expect(within(sec2).getByText(matchCurrency(expectedSummary.actual.income))).toBeTruthy();
    expect(within(sec2).getByText(matchCurrency(expectedSummary.planned.expense))).toBeTruthy();
    expect(within(sec2).getByText(matchCurrency(expectedSummary.actual.expense))).toBeTruthy();
    expect(within(sec2).getByText(matchCurrency(expectedSummary.dues.collected))).toBeTruthy();
    expect(within(sec2).getByText(matchCurrency(expectedSummary.actual.balance))).toBeTruthy();
  });

  it('input penandatangan muncul di teks cetak', async () => {
    renderProgramLpj();

    await screen.findByText('Laporan Pertanggungjawaban (LPJ)');

    // Ubah data penandatangan di panel input
    const cityInput = screen.getByLabelText(/^Kota$/i);
    const dateInput = screen.getByLabelText(/^Tanggal Pengesahan$/i);
    const leadInput = screen.getByLabelText(/^Ketua Acara$/i);
    const treasurerInput = screen.getByLabelText(/^Bendahara$/i);

    fireEvent.change(cityInput, { target: { value: 'Bandung' } });
    fireEvent.change(dateInput, { target: { value: '25 November 2026' } });
    fireEvent.change(leadInput, { target: { value: 'Dr. Ahmad Faiz, M.Sc' } });
    fireEvent.change(treasurerInput, { target: { value: 'Siti Rahmawati, S.E' } });

    // Cek bahwa teks yang tercantum di Bagian 8 (Pengesahan) diperbarui
    const sec8 = screen.getByTestId('lpj-section-8');
    expect(within(sec8).getByText(/Bandung, 25 November 2026/i)).toBeTruthy();
    expect(within(sec8).getByText('Dr. Ahmad Faiz, M.Sc')).toBeTruthy();
    expect(within(sec8).getByText('Siti Rahmawati, S.E')).toBeTruthy();
  });

  it('F.4: kota bawaan pengesahan kosong string bila tenant tidak memiliki city', async () => {
    mockTenant = {
      id: 'tenant-panitia-1',
      name: 'Panitia Dies Natalis 2026',
      city: '',
    };

    renderProgramLpj();
    await screen.findByText('Laporan Pertanggungjawaban (LPJ)');

    const cityInput = screen.getByLabelText(/^Kota$/i);
    expect(cityInput.value).toBe('');
  });

  describe('2F.1: Penanganan Galat Transaksi/Iuran di LPJ', () => {
    it('duesError: true → banner tampil dan tombol cetak nonaktif', async () => {
      tenantOperationalService.fetchProgramTransactions.mockResolvedValue({
        incomes: mockTransactions.incomes,
        expenses: mockTransactions.expenses,
        dues: [],
        duesError: true,
      });

      renderProgramLpj();
      await screen.findByText('Laporan Pertanggungjawaban (LPJ)');

      // Banner tampil
      const banner = await screen.findByTestId('lpj-transactions-error-banner');
      expect(banner).toBeTruthy();
      expect(banner.textContent).toContain(
        'Data transaksi/iuran gagal dimuat. Angka di LPJ ini belum lengkap. Muat ulang sebelum mencetak.'
      );
      expect(within(banner).getByRole('button', { name: /Coba lagi/i })).toBeTruthy();

      // Tombol Cetak nonaktif
      const printBtn = screen.getByRole('button', { name: /Cetak LPJ \(A4\)/i });
      expect(printBtn.disabled).toBe(true);
    });

    it('gagal total → banner tampil dan tombol cetak nonaktif', async () => {
      tenantOperationalService.fetchProgramTransactions.mockRejectedValue(
        new Error('Network error saat memuat transaksi acara')
      );

      renderProgramLpj();
      await screen.findByText('Laporan Pertanggungjawaban (LPJ)');

      const banner = await screen.findByTestId('lpj-transactions-error-banner');
      expect(banner).toBeTruthy();
      expect(banner.textContent).toContain(
        'Data transaksi/iuran gagal dimuat. Angka di LPJ ini belum lengkap. Muat ulang sebelum mencetak.'
      );

      const printBtn = screen.getByRole('button', { name: /Cetak LPJ \(A4\)/i });
      expect(printBtn.disabled).toBe(true);
    });

    it('data normal → tombol cetak aktif dan banner tidak tampil', async () => {
      tenantOperationalService.fetchProgramTransactions.mockResolvedValue(mockTransactions);

      renderProgramLpj();
      await screen.findByText('Laporan Pertanggungjawaban (LPJ)');

      expect(screen.queryByTestId('lpj-transactions-error-banner')).toBeNull();

      const printBtn = screen.getByRole('button', { name: /Cetak LPJ \(A4\)/i });
      expect(printBtn.disabled).toBe(false);
    });
  });
});
