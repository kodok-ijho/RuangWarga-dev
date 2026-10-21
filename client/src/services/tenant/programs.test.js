import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PROGRAM_STATUS_LABELS,
  countActivePrograms,
  summarizeProgram,
  fetchPrograms,
  fetchProgram,
  createProgram,
  updateProgram,
  deleteProgram,
  fetchBudgetItems,
  createBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  fetchProgramTransactions,
  resetDemoProgramsStore,
} from './programs';
import { createTenantIncome, resetDemoIncomesStore } from './incomes';
import { createTenantExpense } from './finance';
import { supabase } from './shared';

describe('PANITIA-1.5: Program & Budget (RAB) Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDemoProgramsStore();
    resetDemoIncomesStore();
  });

  describe('countActivePrograms', () => {
    it('mengembalikan 0 bila array kosong atau input tidak valid', () => {
      expect(countActivePrograms([])).toBe(0);
      expect(countActivePrograms(null)).toBe(0);
      expect(countActivePrograms(undefined)).toBe(0);
    });

    it('hanya menghitung acara berstatus planning atau running', () => {
      const programs = [
        { id: 'p1', status: 'planning' },
        { id: 'p2', status: 'running' },
        { id: 'p3', status: 'done' },
        { id: 'p4', status: 'archived' },
        { id: 'p5', status: 'running' },
      ];
      expect(countActivePrograms(programs)).toBe(3);
    });
  });

  describe('summarizeProgram (Pure Engine)', () => {
    it('meringkas dengan tepat: dua seksi, transaksi tanpa pos, dan kondisi melebihi anggaran', () => {
      const budgetItems = [
        {
          id: 'b-inc-1',
          kind: 'income',
          section: 'Sponsorship',
          item: 'Sponsor Gold',
          quantity: 2,
          unit_price: 5000000,
          amount: 10000000,
        },
        {
          id: 'b-exp-1',
          kind: 'expense',
          section: 'Konsumsi',
          item: 'Snack Peserta',
          quantity: 100,
          unit_price: 15000,
          amount: 1500000,
        },
        {
          id: 'b-exp-2',
          kind: 'expense',
          section: 'Perlengkapan',
          item: 'Sewa Tenda',
          quantity: 1,
          unit_price: 2000000,
          amount: 2000000,
        },
      ];

      const incomes = [
        // Realisasi pos b-inc-1
        {
          id: 'i-1',
          amount: 10000000,
          budget_item_id: 'b-inc-1',
        },
        // Pemasukan tanpa pos (unbudgeted)
        {
          id: 'i-2',
          amount: 500000,
          budget_item_id: null,
        },
        // Pemasukan yang sudah di-soft-delete (harus diabaikan)
        {
          id: 'i-3',
          amount: 9999999,
          budget_item_id: 'b-inc-1',
          deleted_at: '2026-10-21T00:00:00Z',
        },
      ];

      const expenses = [
        // Pos Konsumsi: rencana 1.500.000, realisasi 1.800.000 (melebihi anggaran)
        {
          id: 'e-1',
          amount: 1800000,
          budget_item_id: 'b-exp-1',
        },
        // Pos Perlengkapan: rencana 2.000.000, realisasi 1.500.000
        {
          id: 'e-2',
          amount: 1500000,
          budget_item_id: 'b-exp-2',
        },
        // Pengeluaran tanpa pos (unbudgeted)
        {
          id: 'e-3',
          amount: 300000,
          budget_item_id: null,
        },
      ];

      const summary = summarizeProgram(budgetItems, incomes, expenses);

      // Planned
      expect(summary.planned.income).toBe(10000000);
      expect(summary.planned.expense).toBe(3500000);
      expect(summary.planned.balance).toBe(6500000);

      // Actual (semua termasuk unbudgeted)
      expect(summary.actual.income).toBe(10500000);
      expect(summary.actual.expense).toBe(3600000);
      expect(summary.actual.balance).toBe(6900000);

      // Unbudgeted
      expect(summary.unbudgeted.income).toBe(500000);
      expect(summary.unbudgeted.expense).toBe(300000);

      // Sections
      expect(summary.sections).toHaveLength(3);

      const konsumsi = summary.sections.find((s) => s.section === 'Konsumsi');
      expect(konsumsi).toBeDefined();
      expect(konsumsi.planned).toBe(1500000);
      expect(konsumsi.actual).toBe(1800000);
      expect(konsumsi.variance).toBe(300000); // 1.800.000 - 1.500.000 (melebihi anggaran)
      expect(konsumsi.percent).toBe(120);

      const perlengkapan = summary.sections.find((s) => s.section === 'Perlengkapan');
      expect(perlengkapan).toBeDefined();
      expect(perlengkapan.planned).toBe(2000000);
      expect(perlengkapan.actual).toBe(1500000);
      expect(perlengkapan.variance).toBe(-500000);
      expect(perlengkapan.percent).toBe(75);

      const sponsorship = summary.sections.find((s) => s.section === 'Sponsorship');
      expect(sponsorship).toBeDefined();
      expect(sponsorship.planned).toBe(10000000);
      expect(sponsorship.actual).toBe(10000000);
      expect(sponsorship.variance).toBe(0);
      expect(sponsorship.percent).toBe(100);
    });

    it('memberi nama Seksi "Lainnya" bila section kosong/whitespace', () => {
      const budgetItems = [
        {
          id: 'b-1',
          kind: 'expense',
          section: '   ',
          item: 'Biaya Tak Terduga',
          quantity: 1,
          unit_price: 100000,
          amount: 100000,
        },
      ];
      const summary = summarizeProgram(budgetItems, [], []);
      expect(summary.sections[0].section).toBe('Lainnya');
    });
  });

  describe('Alur Demo: Buat Acara, Tambah RAB, Catat Pemasukan/Pengeluaran, & Ringkasan', () => {
    const demoTenantId = 'demo-tenant-panitia';

    it('menjalankan siklus operasional acara di mode demo secara lengkap', async () => {
      // 1. Buat acara
      const newProgram = await createProgram(demoTenantId, {
        name: 'PenSi Dies Natalis 2026',
        description: 'Perayaan tahunan sekolah',
        location: 'Lapangan Utama',
        startsOn: '2026-11-15',
        endsOn: '2026-11-16',
        status: 'running',
      });
      expect(newProgram.id).toBeTruthy();
      expect(newProgram.name).toBe('PenSi Dies Natalis 2026');

      // 2. Tambah RAB (Pemasukan & Pengeluaran)
      const bItemInc = await createBudgetItem(demoTenantId, newProgram.id, {
        kind: 'income',
        section: 'Sponsorship',
        item: 'Paket Platinum',
        quantity: 1,
        unitLabel: 'paket',
        unitPrice: 20000000,
      });
      expect(bItemInc.amount).toBe(20000000);

      const bItemExp = await createBudgetItem(demoTenantId, newProgram.id, {
        kind: 'expense',
        section: 'Panggung & Musik',
        item: 'Sewa Rigging & Panggung',
        quantity: 1,
        unitLabel: 'set',
        unitPrice: 8000000,
      });
      expect(bItemExp.amount).toBe(8000000);

      // 3. Catat pemasukan
      const inc = await createTenantIncome(demoTenantId, {
        incomeDate: '2026-11-01',
        amount: 20000000,
        category: 'Sponsorship',
        sourceName: 'PT Maju Bersama',
        paymentMethod: 'bank_transfer',
        programId: newProgram.id,
        budgetItemId: bItemInc.id,
      });
      expect(inc.programId).toBe(newProgram.id);

      // 4. Catat pengeluaran
      const exp = await createTenantExpense(demoTenantId, {
        date: '2026-11-05',
        category: 'Perlengkapan',
        amount: 8500000,
        description: 'Pembayaran sewa panggung dan rigging',
        programId: newProgram.id,
        budgetItemId: bItemExp.id,
      });
      expect(exp.programId).toBe(newProgram.id);

      // 5. Ambil transaksi program
      const txs = await fetchProgramTransactions(demoTenantId, newProgram.id);
      expect(txs.incomes).toHaveLength(1);
      expect(txs.expenses).toHaveLength(1);

      // 6. Ambil budget items program
      const budgetItems = await fetchBudgetItems(demoTenantId, newProgram.id);
      expect(budgetItems).toHaveLength(2);

      // 7. Hitung ringkasan
      const summary = summarizeProgram(budgetItems, txs.incomes, txs.expenses);
      expect(summary.planned.income).toBe(20000000);
      expect(summary.planned.expense).toBe(8000000);
      expect(summary.planned.balance).toBe(12000000);

      expect(summary.actual.income).toBe(20000000);
      expect(summary.actual.expense).toBe(8500000);
      expect(summary.actual.balance).toBe(11500000);

      const panggung = summary.sections.find((s) => s.section === 'Panggung & Musik');
      expect(panggung.planned).toBe(8000000);
      expect(panggung.actual).toBe(8500000);
      expect(panggung.variance).toBe(500000); // Melebihi anggaran 500k

      // 8. Cek pencegahan hapus acara jika ada transaksi
      await expect(deleteProgram(demoTenantId, newProgram.id)).rejects.toThrow(
        'Acara yang sudah punya transaksi tidak bisa dihapus. Ubah statusnya menjadi Arsip.'
      );
    });
  });

  describe('deleteProgram FK Error Translation (Supabase)', () => {
    it('menerjemahkan error FK postgres 23503 menjadi pesan ramah pengguna', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: {
                code: '23503',
                message: 'update or delete on table "tenant_programs" violates foreign key constraint "fk_expenses_program"',
              },
            }),
          }),
        }),
      });

      await expect(
        deleteProgram('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
      ).rejects.toThrow(
        'Acara yang sudah punya transaksi tidak bisa dihapus. Ubah statusnya menjadi Arsip.'
      );
    });
  });
});
