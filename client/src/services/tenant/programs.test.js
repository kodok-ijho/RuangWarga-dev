import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PROGRAM_STATUS_LABELS,
  countActivePrograms,
  summarizeProgram,
  getProgramAccessState,
  formatProgramAccessLabel,
  PANITIA_PRICING,
  fetchPrograms,
  fetchProgramsOverview,
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

    it('PANITIA-2.2: summarizeProgram dengan iuran (actual.income bertambah hanya dari yang lunas)', () => {
      const budgetItems = [
        {
          id: 'b-inc-1',
          kind: 'income',
          section: 'Sponsorship',
          amount: 5000000,
        },
      ];
      const incomes = [
        { id: 'i-1', amount: 3000000, budget_item_id: 'b-inc-1' },
      ];
      const expenses = [];
      const dues = [
        { id: 'd-1', amount: 50000, status: 'paid' },
        { id: 'd-2', amount: 50000, status: 'paid' },
        { id: 'd-3', amount: 50000, status: 'pending_verification' },
        { id: 'd-4', amount: 50000, status: 'unpaid' },
        { id: 'd-5', amount: 50000, status: 'cancelled' },
      ];

      const summary = summarizeProgram(budgetItems, incomes, expenses, dues);

      // planned income tetap 5.000.000 (tidak dipengaruhi iuran)
      expect(summary.planned.income).toBe(5000000);
      // actual income bertambah dari iuran lunas (3.000.000 + 100.000)
      expect(summary.actual.income).toBe(3100000);
      // unbudgeted income tidak terpengaruh
      expect(summary.unbudgeted.income).toBe(0);
      // dues summary hadir
      expect(summary.dues).toEqual({
        count: 4,
        billed: 200000,
        collected: 100000,
        pending: 50000,
        unpaidCount: 1,
      });
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

  describe('fetchProgramsOverview (PANITIA-1F.5)', () => {
    it('mode demo dengan 2 acara menghasilkan ringkasan yang sama dengan memanggil summarizeProgram per acara', async () => {
      const demoTenantId = 'demo-tenant-overview-test';

      // 1. Buat 2 acara di mode demo
      const prog1 = await createProgram(demoTenantId, {
        name: 'Acara Konser Amal',
        status: 'running',
      });
      const prog2 = await createProgram(demoTenantId, {
        name: 'Acara Donor Darah',
        status: 'planning',
      });

      // 2. Buat pos RAB
      const b1 = await createBudgetItem(demoTenantId, prog1.id, {
        kind: 'expense',
        section: 'Panggung',
        item: 'Sewa Panggung',
        quantity: 1,
        unitPrice: 3000000,
      });
      const b2 = await createBudgetItem(demoTenantId, prog2.id, {
        kind: 'income',
        section: 'Donatur',
        item: 'Sumbangan PT ABC',
        quantity: 1,
        unitPrice: 5000000,
      });

      // 3. Catat transaksi
      await createTenantIncome(demoTenantId, {
        amount: 5000000,
        category: 'Sumbangan',
        programId: prog2.id,
        budgetItemId: b2.id,
        sourceName: 'PT ABC',
      });
      await createTenantExpense(demoTenantId, {
        amount: 3200000,
        programId: prog1.id,
        budgetItemId: b1.id,
        category: 'acara',
        description: 'Pembayaran panggung',
      });

      // 4. Hitung ringkasan secara terpisah per acara
      const [trans1, budgetItems1] = await Promise.all([
        fetchProgramTransactions(demoTenantId, prog1.id),
        fetchBudgetItems(demoTenantId, prog1.id),
      ]);
      const expectedSummary1 = summarizeProgram(budgetItems1, trans1.incomes, trans1.expenses);

      const [trans2, budgetItems2] = await Promise.all([
        fetchProgramTransactions(demoTenantId, prog2.id),
        fetchBudgetItems(demoTenantId, prog2.id),
      ]);
      const expectedSummary2 = summarizeProgram(budgetItems2, trans2.incomes, trans2.expenses);

      // 5. Panggil fetchProgramsOverview
      const overview = await fetchProgramsOverview(demoTenantId);

      expect(overview).toHaveLength(2);

      const p1Overview = overview.find((p) => p.id === prog1.id);
      const p2Overview = overview.find((p) => p.id === prog2.id);

      expect(p1Overview).toBeDefined();
      expect(p2Overview).toBeDefined();

      expect(p1Overview.summary).toEqual(expectedSummary1);
      expect(p2Overview.summary).toEqual(expectedSummary2);
    });
  });

  describe('HARGA.2: Program Access & Pricing State Engine', () => {
    const baseNow = new Date(2026, 5, 1, 10, 0, 0); // 1 Juni 2026, 10:00:00

    it('PANITIA_PRICING memiliki konfigurasi yang sesuai', () => {
      expect(PANITIA_PRICING).toEqual({
        freeTrialMonths: 1,
        pricePerProgram: 25000,
        periodMonths: 12,
      });
    });

    it('kelima state akses program dihitung dengan benar', () => {
      const futureDate = new Date(2026, 6, 1, 10, 0, 0).toISOString();
      const pastDate = new Date(2026, 4, 1, 10, 0, 0).toISOString();

      // 1. Unlimited (bukan tenant panitia)
      const resUnlimited = getProgramAccessState(
        { access_until: null, is_free_trial: false },
        { tenantType: 'rt_rw', now: baseNow }
      );
      expect(resUnlimited).toEqual({ state: 'unlimited', until: null, writable: true });

      // 2. Free Trial (panitia, masa depan, is_free_trial true)
      const resFreeTrial = getProgramAccessState(
        { access_until: futureDate, is_free_trial: true },
        { tenantType: 'panitia', now: baseNow }
      );
      expect(resFreeTrial).toEqual({ state: 'free_trial', until: futureDate, writable: true });

      // 3. Active (panitia, masa depan, is_free_trial false)
      const resActive = getProgramAccessState(
        { access_until: futureDate, is_free_trial: false },
        { tenantType: 'panitia', now: baseNow }
      );
      expect(resActive).toEqual({ state: 'active', until: futureDate, writable: true });

      // 4. Expired (access_until lewat)
      const resExpiredPast = getProgramAccessState(
        { access_until: pastDate, is_free_trial: true },
        { tenantType: 'panitia', now: baseNow }
      );
      expect(resExpiredPast).toEqual({ state: 'expired', until: pastDate, writable: false });

      // 4b. Expired (access_until null tetapi is_free_trial true)
      const resExpiredNull = getProgramAccessState(
        { access_until: null, is_free_trial: true },
        { tenantType: 'panitia', now: baseNow }
      );
      expect(resExpiredNull).toEqual({ state: 'expired', until: null, writable: false });

      // 5. Inactive (null dan bukan gratis)
      const resInactive = getProgramAccessState(
        { access_until: null, is_free_trial: false },
        { tenantType: 'panitia', now: baseNow }
      );
      expect(resInactive).toEqual({ state: 'inactive', until: null, writable: false });
    });

    it('menguji batas tepat pada access_until', () => {
      const exactTime = new Date(2026, 5, 1, 10, 0, 0);
      const exactIso = exactTime.toISOString();

      // Tepat pada waktu kedaluwarsa -> expired, non-writable
      const atExact = getProgramAccessState(
        { access_until: exactIso, is_free_trial: false },
        { tenantType: 'panitia', now: exactTime }
      );
      expect(atExact.writable).toBe(false);
      expect(atExact.state).toBe('expired');

      // 1 ms sebelum kedaluwarsa -> active, writable
      const beforeExact = new Date(exactTime.getTime() - 1);
      const atBefore = getProgramAccessState(
        { access_until: exactIso, is_free_trial: false },
        { tenantType: 'panitia', now: beforeExact }
      );
      expect(atBefore.writable).toBe(true);
      expect(atBefore.state).toBe('active');
    });

    it('formatProgramAccessLabel menghasilkan label yang tepat sesuai state', () => {
      const d1 = new Date(2026, 1, 1, 12, 0, 0); // 1 Feb 2026
      const d2 = new Date(2027, 1, 2, 12, 0, 0); // 2 Feb 2027

      expect(formatProgramAccessLabel({ state: 'free_trial', until: d1.toISOString() })).toMatch(
        /Gratis sampai 1 Feb 2026/
      );
      expect(formatProgramAccessLabel({ state: 'active', until: d2.toISOString() })).toMatch(
        /Aktif sampai 2 Feb 2027/
      );
      expect(formatProgramAccessLabel({ state: 'inactive', until: null })).toBe('Belum aktif');
      expect(formatProgramAccessLabel({ state: 'expired', until: d1.toISOString() })).toMatch(
        /Masa aktif habis 1 Feb 2026/
      );
      expect(formatProgramAccessLabel({ state: 'unlimited', until: null })).toBe('Aktif');
      expect(formatProgramAccessLabel(null)).toBe('');
    });

    it('mode demo memberikan jatah gratis pada acara pertama dan inactive pada acara kedua', async () => {
      const demoTenantId = 'demo-tenant-panitia-harga';

      // 1. Acara pertama
      const prog1 = await createProgram(demoTenantId, { name: 'Acara Pertama Demo' });
      expect(prog1.is_free_trial).toBe(true);
      expect(prog1.isFreeTrial).toBe(true);
      expect(prog1.access_until).toBeDefined();
      expect(prog1.accessUntil).toBeDefined();

      const state1 = getProgramAccessState(prog1, { tenantType: 'panitia' });
      expect(state1.state).toBe('free_trial');
      expect(state1.writable).toBe(true);

      // 2. Acara kedua
      const prog2 = await createProgram(demoTenantId, { name: 'Acara Kedua Demo' });
      expect(prog2.is_free_trial).toBe(false);
      expect(prog2.isFreeTrial).toBe(false);
      expect(prog2.access_until).toBeNull();
      expect(prog2.accessUntil).toBeNull();

      const state2 = getProgramAccessState(prog2, { tenantType: 'panitia' });
      expect(state2.state).toBe('inactive');
      expect(state2.writable).toBe(false);

      // 3. fetchPrograms membawa field masa aktif
      const list = await fetchPrograms(demoTenantId);
      expect(list).toHaveLength(2);
      expect(list[0].accessUntil).toBeDefined();
      expect(list[1].accessUntil).toBeNull();
    });
  });

  describe('PANITIA-ARISAN-1F F.3: fetchProgramTransactions resilience', () => {
    it('dues gagal -> pemasukan dan pengeluaran tetap tampil dengan flag duesError: true', async () => {
      const demoTenantId = 'demo-tenant-panitia-f3';
      const prog = await createProgram(demoTenantId, { name: 'Acara Uji Dues Gagal' });
      await createTenantIncome(demoTenantId, {
        amount: 2500000,
        category: 'Donasi',
        programId: prog.id,
        sourceName: 'Donatur A',
      });

      const programDuesModule = await import('./programDues');
      const spyDues = vi.spyOn(programDuesModule, 'fetchProgramDues').mockRejectedValueOnce(new Error('Koneksi iuran terputus'));

      const res = await fetchProgramTransactions(demoTenantId, prog.id);
      expect(res.incomes).toHaveLength(1);
      expect(res.incomes[0].amount).toBe(2500000);
      expect(res.dues).toEqual([]);
      expect(res.duesError).toBe(true);

      spyDues.mockRestore();
    });
  });
});
