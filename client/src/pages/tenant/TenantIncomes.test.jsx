// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TenantIncomes from './TenantIncomes';
import * as tenantOperationalService from '../../services/tenantOperationalService';

let mockTenant = {
  id: 'tenant-panitia-1',
  name: 'Panitia Dies Natalis 2026',
  type: 'panitia',
};

let mockTenantAccess = {
  canRecordIncome: true,
  canViewReports: true,
  canWrite: true,
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

vi.mock('../../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => ({
    incomeCategories: ['Sponsorship', 'Tiket', 'Donasi', 'Iuran Panitia'],
  }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantIncomes: vi.fn(),
    createTenantIncome: vi.fn(),
    updateTenantIncome: vi.fn(),
    deleteTenantIncome: vi.fn(),
    fetchPrograms: vi.fn(),
    fetchBudgetItems: vi.fn(),
  };
});

function renderTenantIncomes(initialEntry = '/t/tenant-panitia-1/incomes') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/t/:tenantId/incomes" element={<TenantIncomes />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PANITIA-1.6: TenantIncomes Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenant = {
      id: 'tenant-panitia-1',
      name: 'Panitia Dies Natalis 2026',
      type: 'panitia',
    };
    mockTenantAccess = {
      canRecordIncome: true,
      canViewReports: true,
      canWrite: true,
    };
    mockSubscriptionGate = {
      canTransact: true,
      isReadOnly: false,
    };

    tenantOperationalService.fetchTenantIncomes.mockResolvedValue([
      {
        id: 'inc-1',
        income_date: '2026-10-15',
        date: '2026-10-15',
        category: 'Sponsorship',
        source_name: 'PT Bank Maju',
        sourceName: 'PT Bank Maju',
        amount: 15000000,
        payment_method: 'bank_transfer',
        paymentMethod: 'bank_transfer',
        reference_number: 'TRX-101',
        description: 'Termin 1 sponsorship',
        program_id: 'prog-1',
        programId: 'prog-1',
      },
    ]);

    tenantOperationalService.fetchPrograms.mockResolvedValue([
      { id: 'prog-1', name: 'PenSi 2026' },
      { id: 'prog-2', name: 'Bazar Kampus' },
    ]);

    tenantOperationalService.fetchBudgetItems.mockResolvedValue([
      { id: 'b-1', kind: 'income', section: 'Sponsor', item: 'Sponsor Utama' },
      { id: 'b-2', kind: 'expense', section: 'Konsumsi', item: 'Snack' },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Render daftar pemasukan dengan benar', async () => {
    renderTenantIncomes();

    expect(await screen.findByText(/Pemasukan Kas Panitia Dies Natalis 2026/i)).toBeTruthy();
    expect(await screen.findAllByText('Sponsorship')).toBeTruthy();
    expect(await screen.findAllByText('PT Bank Maju')).toBeTruthy();
    expect(await screen.findAllByText(/15\.000\.000/)).toBeTruthy();
  });

  it('2. Simpan pemasukan baru dengan tautan acara dan pos anggaran', async () => {
    tenantOperationalService.createTenantIncome.mockResolvedValue({ id: 'inc-new' });

    renderTenantIncomes();

    const addBtn = await screen.findByRole('button', { name: /Catat Pemasukan/i });
    fireEvent.click(addBtn);

    expect(await screen.findByText('Catat Pemasukan Kas')).toBeTruthy();

    // Isi Sumber
    const sourceInput = screen.getByPlaceholderText(/Contoh: Sponsor Bank Mandiri/i);
    fireEvent.change(sourceInput, { target: { value: 'Donatur Alumni' } });

    // Isi Nominal
    const amountInput = screen.getByPlaceholderText(/Contoh: 15000000/i);
    fireEvent.change(amountInput, { target: { value: '2500000' } });

    // Pilih Acara
    const programSelect = await screen.findByRole('combobox', { name: /Tautkan ke Acara/i });
    fireEvent.change(programSelect, { target: { value: 'prog-1' } });

    // Tunggu fetchBudgetItems dipanggil dan pos terisi
    await waitFor(() => {
      expect(tenantOperationalService.fetchBudgetItems).toHaveBeenCalledWith('tenant-panitia-1', 'prog-1');
    });

    const budgetSelect = await screen.findByRole('combobox', { name: /Pos Anggaran \(RAB\)/i });
    fireEvent.change(budgetSelect, { target: { value: 'b-1' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Simpan Pemasukan/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.createTenantIncome).toHaveBeenCalledWith(
        'tenant-panitia-1',
        expect.objectContaining({
          sourceName: 'Donatur Alumni',
          amount: 2500000,
          programId: 'prog-1',
          budgetItemId: 'b-1',
        })
      );
    });
  });

  it('3. Tombol tulis tersembunyi tanpa izin pencatatan atau bila read-only', async () => {
    mockTenantAccess = {
      canRecordIncome: false,
      canViewReports: true,
      canWrite: false,
    };

    renderTenantIncomes();

    await screen.findByText(/Pemasukan Kas Panitia Dies Natalis 2026/i);

    const addBtn = screen.queryByRole('button', { name: /Catat Pemasukan/i });
    expect(addBtn).toBeNull();
  });

  it('4. Query param ?program=<id>&new=1 langsung membuka modal dengan acara terisi', async () => {
    renderTenantIncomes('/t/tenant-panitia-1/incomes?program=prog-1&new=1');

    expect(await screen.findByText('Catat Pemasukan Kas')).toBeTruthy();
    const programSelect = await screen.findByRole('combobox', { name: /Tautkan ke Acara/i });
    expect(programSelect.value).toBe('prog-1');
  });
});
