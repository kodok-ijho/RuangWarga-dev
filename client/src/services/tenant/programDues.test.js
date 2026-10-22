import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  summarizeProgramDues,
  createProgramDues,
  updateProgramDuesAmount,
  cancelProgramDues,
  recordProgramDuesCash,
  fetchProgramDues,
  fetchMyProgramDues,
  resetDemoProgramDuesStore,
} from './programDues';
import { submitMemberTransfer } from './payments';

describe('PANITIA-2.2: programDues Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDemoProgramDuesStore();
  });

  describe('summarizeProgramDues (Pure Function)', () => {
    it('menghitung count, billed, collected, pending, dan unpaidCount dengan benar', () => {
      const bills = [
        { id: 'b1', amount: 50000, status: 'unpaid' },
        { id: 'b2', amount: 50000, status: 'paid' },
        { id: 'b3', amount: 75000, status: 'pending_verification' },
        { id: 'b4', amount: 100000, status: 'cancelled' }, // harus diabaikan
        { id: 'b5', amount: 25000, status: 'unpaid' },
      ];

      const summary = summarizeProgramDues(bills);

      expect(summary.count).toBe(4);
      expect(summary.billed).toBe(200000);
      expect(summary.collected).toBe(50000);
      expect(summary.pending).toBe(75000);
      expect(summary.unpaidCount).toBe(2);
    });

    it('menangani input array kosong dan null', () => {
      expect(summarizeProgramDues([])).toEqual({
        count: 0,
        billed: 0,
        collected: 0,
        pending: 0,
        unpaidCount: 0,
      });
      expect(summarizeProgramDues(null)).toEqual({
        count: 0,
        billed: 0,
        collected: 0,
        pending: 0,
        unpaidCount: 0,
      });
    });
  });

  describe('createProgramDues Validation', () => {
    it('menolak nominal <= 0 atau tidak valid', async () => {
      await expect(
        createProgramDues('demo-t1', 'demo-p1', {
          amount: 0,
          dueDate: '2026-11-20',
          memberIds: ['m1'],
        })
      ).rejects.toThrow('Nominal iuran harus lebih besar dari 0.');

      await expect(
        createProgramDues('demo-t1', 'demo-p1', {
          amount: -5000,
          dueDate: '2026-11-20',
          memberIds: ['m1'],
        })
      ).rejects.toThrow('Nominal iuran harus lebih besar dari 0.');
    });

    it('menolak tanggal jatuh tempo yang formatnya bukan YYYY-MM-DD', async () => {
      await expect(
        createProgramDues('demo-t1', 'demo-p1', {
          amount: 50000,
          dueDate: '20-11-2026',
          memberIds: ['m1'],
        })
      ).rejects.toThrow('Tanggal jatuh tempo tidak valid');

      await expect(
        createProgramDues('demo-t1', 'demo-p1', {
          amount: 50000,
          dueDate: '',
          memberIds: ['m1'],
        })
      ).rejects.toThrow('Tanggal jatuh tempo tidak valid');
    });

    it('menolak daftar memberIds yang kosong', async () => {
      await expect(
        createProgramDues('demo-t1', 'demo-p1', {
          amount: 50000,
          dueDate: '2026-11-20',
          memberIds: [],
        })
      ).rejects.toThrow('Pilih setidaknya satu anggota.');
    });
  });

  describe('Alur Demo: Terbitkan, Lewati yang Ada, Bayar Tunai, dan Ringkasan', () => {
    it('menjalankan siklus lengkap iuran acara di mode demo', async () => {
      const tenantId = 'demo-tenant-panitia';
      const programId = 'demo-prog-1';

      // 1. Terbitkan 2 iuran untuk m1 dan m2
      const res1 = await createProgramDues(tenantId, programId, {
        amount: 50000,
        dueDate: '2026-11-20',
        memberIds: ['m1', 'm2'],
        programName: 'Pentas Seni 2026',
      });
      expect(res1).toEqual({ created: 2, skipped: 0 });

      // 2. Terbitkan untuk m2 (sudah ada) dan m3 (baru) -> 1 dibuat, 1 dilewati
      const res2 = await createProgramDues(tenantId, programId, {
        amount: 50000,
        dueDate: '2026-11-20',
        memberIds: ['m2', 'm3'],
        programName: 'Pentas Seni 2026',
      });
      expect(res2).toEqual({ created: 1, skipped: 1 });

      // Ambil daftar iuran (total 3 iuran)
      const dues = await fetchProgramDues(tenantId, programId);
      expect(dues.length).toBe(3);

      // 3. Bayar tunai untuk salah satu tagihan (m1)
      const billM1 = dues.find((b) => b.member_id === 'm1');
      expect(billM1).toBeTruthy();
      expect(billM1.status).toBe('unpaid');

      await recordProgramDuesCash(tenantId, billM1.id, { note: 'Titip uang tunai di sekretariat' });

      // 4. Ambil ulang dan ringkas
      const updatedDues = await fetchProgramDues(tenantId, programId);
      const paidBill = updatedDues.find((b) => b.id === billM1.id);
      expect(paidBill.status).toBe('paid');
      expect(paidBill.payments?.method).toBe('cash');

      const summary = summarizeProgramDues(updatedDues);
      expect(summary.count).toBe(3);
      expect(summary.billed).toBe(150000);
      expect(summary.collected).toBe(50000);
      expect(summary.pending).toBe(0);
      expect(summary.unpaidCount).toBe(2);
    });
  });

  describe('updateProgramDuesAmount & cancelProgramDues', () => {
    it('mengubah nominal hanya bila status unpaid', async () => {
      const tenantId = 'demo-tenant-panitia';
      const programId = 'demo-prog-1';

      await createProgramDues(tenantId, programId, {
        amount: 50000,
        dueDate: '2026-11-20',
        memberIds: ['m1'],
      });

      const dues = await fetchProgramDues(tenantId, programId);
      const bill = dues[0];

      // Update nominal berhasil
      const updated = await updateProgramDuesAmount(tenantId, bill.id, 75000);
      expect(updated.amount).toBe(75000);

      // Bayar
      await recordProgramDuesCash(tenantId, bill.id);

      // Update setelah lunas gagal
      await expect(
        updateProgramDuesAmount(tenantId, bill.id, 100000)
      ).rejects.toThrow('Hanya tagihan dengan status belum bayar');
    });

    it('membatalkan tagihan hanya bila status unpaid', async () => {
      const tenantId = 'demo-tenant-panitia';
      const programId = 'demo-prog-1';

      await createProgramDues(tenantId, programId, {
        amount: 50000,
        dueDate: '2026-11-20',
        memberIds: ['m1'],
      });

      const dues = await fetchProgramDues(tenantId, programId);
      const bill = dues[0];

      const cancelled = await cancelProgramDues(tenantId, bill.id);
      expect(cancelled.status).toBe('cancelled');

      // Membatalkan lagi gagal karena sudah cancelled
      await expect(
        cancelProgramDues(tenantId, bill.id)
      ).rejects.toThrow('Hanya tagihan dengan status belum bayar');
    });
  });

  describe('fetchMyProgramDues', () => {
    it('mengembalikan iuran anggota dengan prioritas belum lunas lebih dulu', async () => {
      const tenantId = 'demo-tenant-panitia';

      resetDemoProgramDuesStore([
        {
          id: 'b-paid',
          tenant_id: tenantId,
          program_id: 'p1',
          member_id: 'user-1',
          amount: 50000,
          due_date: '2026-11-25',
          status: 'paid',
          metadata: { program_name: 'Pentas Seni' },
        },
        {
          id: 'b-unpaid',
          tenant_id: tenantId,
          program_id: 'p2',
          member_id: 'user-1',
          amount: 30000,
          due_date: '2026-11-10',
          status: 'unpaid',
          metadata: { program_name: 'Bazar' },
        },
        {
          id: 'b-cancelled',
          tenant_id: tenantId,
          program_id: 'p3',
          member_id: 'user-1',
          amount: 20000,
          due_date: '2026-11-01',
          status: 'cancelled',
          metadata: { program_name: 'Lomba' },
        },
      ]);

      const myDues = await fetchMyProgramDues(tenantId, 'user-1');
      // Cancelled tidak ikut
      expect(myDues.length).toBe(2);
      // Unpaid di depan
      expect(myDues[0].id).toBe('b-unpaid');
      expect(myDues[1].id).toBe('b-paid');
      expect(myDues[0].program?.name).toBe('Bazar');
    });
  });

  describe('submitMemberTransfer Validation', () => {
    it('menolak pengajuan pembayaran tanpa bukti transfer', async () => {
      await expect(
        submitMemberTransfer('demo-tenant-1', {
          billId: 'b-1',
          proofFile: null,
          memberId: 'm-1',
        })
      ).rejects.toThrow('Bukti transfer wajib diunggah.');

      await expect(
        submitMemberTransfer('demo-tenant-1', {
          billId: 'b-1',
          proofFile: '',
          memberId: 'm-1',
        })
      ).rejects.toThrow('Bukti transfer wajib diunggah.');
    });

    it('menolak file bukti yang ukurannya > 5 MB', async () => {
      const largeFile = {
        name: 'bukti.jpg',
        size: 6 * 1024 * 1024,
        type: 'image/jpeg',
      };

      await expect(
        submitMemberTransfer('demo-tenant-1', {
          billId: 'b-1',
          proofFile: largeFile,
          memberId: 'm-1',
        })
      ).rejects.toThrow('Ukuran file bukti maksimal 5 MB.');
    });

    it('menolak format file yang tidak didukung', async () => {
      const invalidFile = {
        name: 'dokumen.docx',
        size: 1024,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };

      await expect(
        submitMemberTransfer('demo-tenant-1', {
          billId: 'b-1',
          proofFile: invalidFile,
          memberId: 'm-1',
        })
      ).rejects.toThrow('Format file bukti harus berupa JPG, PNG, WebP, atau PDF.');
    });

    it('menerima file bukti yang valid (JPG <= 5 MB)', async () => {
      const validFile = {
        name: 'bukti_transfer.jpg',
        size: 1024 * 100,
        type: 'image/jpeg',
      };

      const res = await submitMemberTransfer('demo-tenant-1', {
        billId: 'b-1',
        proofFile: validFile,
        memberId: 'm-1',
        note: 'Sudah ditransfer',
      });

      expect(res).toBeDefined();
    });
  });
});
