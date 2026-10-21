import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchTenantIncomes,
  createTenantIncome,
  updateTenantIncome,
  deleteTenantIncome,
  resetDemoIncomesStore,
} from './incomes';
import { supabase } from './shared';

describe('PANITIA-1.5: Tenant Incomes Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDemoIncomesStore();
  });

  describe('Validasi Input Pemasukan', () => {
    const tenantId = 'demo-tenant-panitia';

    it('melempar error jika tenantId tidak disertakan', async () => {
      await expect(createTenantIncome('', { amount: 1000 })).rejects.toThrow(
        'Tenant ID wajib disertakan.'
      );
    });

    it('melempar error jika nominal amount <= 0 atau bukan angka', async () => {
      await expect(
        createTenantIncome(tenantId, {
          amount: 0,
          category: 'Donasi',
          sourceName: 'Hamba Allah',
        })
      ).rejects.toThrow('Nominal pemasukan harus berupa angka lebih besar dari 0.');

      await expect(
        createTenantIncome(tenantId, {
          amount: -50000,
          category: 'Donasi',
          sourceName: 'Hamba Allah',
        })
      ).rejects.toThrow('Nominal pemasukan harus berupa angka lebih besar dari 0.');

      await expect(
        createTenantIncome(tenantId, {
          amount: 'abc',
          category: 'Donasi',
          sourceName: 'Hamba Allah',
        })
      ).rejects.toThrow('Nominal pemasukan harus berupa angka lebih besar dari 0.');
    });

    it('melempar error jika kategori kosong atau hanya spasi', async () => {
      await expect(
        createTenantIncome(tenantId, {
          amount: 100000,
          category: '   ',
          sourceName: 'Hamba Allah',
        })
      ).rejects.toThrow('Kategori pemasukan wajib diisi.');
    });

    it('melempar error jika sumber kosong atau hanya spasi', async () => {
      await expect(
        createTenantIncome(tenantId, {
          amount: 100000,
          category: 'Donasi',
          sourceName: '   ',
        })
      ).rejects.toThrow('Sumber pemasukan wajib diisi.');
    });

    it('melempar error jika paymentMethod tidak termasuk yang diizinkan', async () => {
      await expect(
        createTenantIncome(tenantId, {
          amount: 100000,
          category: 'Donasi',
          sourceName: 'Hamba Allah',
          paymentMethod: 'crypto',
        })
      ).rejects.toThrow('Metode pembayaran harus salah satu dari: cash, bank_transfer, qris, other.');
    });
  });

  describe('CRUD Pemasukan (Mode Demo)', () => {
    const tenantId = 'demo-tenant-panitia';

    it('bisa membuat, membaca, memperbarui, dan menghapus secara soft-delete', async () => {
      // 1. Create
      const created = await createTenantIncome(tenantId, {
        incomeDate: '2026-10-21',
        amount: 2500000,
        category: 'Tiket',
        sourceName: 'Penjualan Presale 1',
        paymentMethod: 'qris',
        referenceNumber: 'QR-12345',
        programId: 'prog-demo-1',
      });

      expect(created.id).toBeTruthy();
      expect(created.amount).toBe(2500000);
      expect(created.category).toBe('Tiket');
      expect(created.paymentMethod).toBe('qris');

      // 2. Fetch
      const list = await fetchTenantIncomes(tenantId, { programId: 'prog-demo-1' });
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(created.id);

      // 3. Update
      const updated = await updateTenantIncome(tenantId, created.id, {
        amount: 3000000,
        description: 'Update nominal tiket terjual',
      });
      expect(updated.amount).toBe(3000000);
      expect(updated.description).toBe('Update nominal tiket terjual');

      // 4. Soft Delete
      const deleted = await deleteTenantIncome(tenantId, created.id, { memberId: 'member-audit-1' });
      expect(deleted).toBe(true);

      // Setelah di-delete, fetchTenantIncomes tidak lagi menampilkannya
      const afterDeleteList = await fetchTenantIncomes(tenantId, { programId: 'prog-demo-1' });
      expect(afterDeleteList).toHaveLength(0);
    });
  });

  describe('Soft Delete di Supabase', () => {
    it('mengisi deleted_at dan deleted_by pada record Supabase', async () => {
      const updateSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });

      vi.spyOn(supabase, 'from').mockReturnValue({
        update: updateSpy,
      });

      const res = await deleteTenantIncome(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        { memberId: '33333333-3333-3333-3333-333333333333' }
      );

      expect(res).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          deleted_at: expect.any(String),
          deleted_by: '33333333-3333-3333-3333-333333333333',
        })
      );
    });
  });
});
