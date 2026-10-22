import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '../supabaseClient';
import {
  drawArisanWinner,
  startNewArisanCycle,
  payArisanBillManual,
  fetchArisanRoundBills,
  fetchMyArisanBills,
  getRoundContributionSummary,
} from './arisan';
import { submitTenantPayment } from './payments';

vi.mock('./payments', () => ({
  submitTenantPayment: vi.fn(),
}));

describe('tenant/arisan - Unit Tests (VERT-1)', () => {
  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const ROUND_ID = 'round-uuid-1234';
  const BILL_ID = 'bill-uuid-5678';

  let rpcSpy;
  let fromSpy;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (rpcSpy) {
      rpcSpy.mockRestore();
    }
    if (fromSpy) {
      fromSpy.mockRestore();
    }
  });

  describe('drawArisanWinner (VERT-1.1)', () => {
    it('memanggil supabase.rpc dengan p_operator_member_id: null', async () => {
      rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          round_id: ROUND_ID,
          winner_name: 'Pak Budi',
        },
        error: null,
      });

      const res = await drawArisanWinner(TENANT_ID, ROUND_ID);

      expect(rpcSpy).toHaveBeenCalledTimes(1);
      expect(rpcSpy).toHaveBeenCalledWith('draw_arisan_winner', {
        p_tenant_id: TENANT_ID,
        p_round_id: ROUND_ID,
        p_operator_member_id: null,
      });
      expect(res.winner_name).toBe('Pak Budi');
    });

    it('melempar error jika tenantId atau roundId tidak disertakan', async () => {
      await expect(drawArisanWinner(null, ROUND_ID)).rejects.toThrow('Tenant ID wajib disertakan.');
      await expect(drawArisanWinner(TENANT_ID, null)).rejects.toThrow('ID putaran arisan wajib disertakan.');
    });
  });

  describe('startNewArisanCycle (VERT-1.1)', () => {
    it('memanggil supabase.rpc dengan p_operator_member_id: null dan p_force: true', async () => {
      rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          tenant_id: TENANT_ID,
          new_cycle: 2,
        },
        error: null,
      });

      const res = await startNewArisanCycle(TENANT_ID, null, true);

      expect(rpcSpy).toHaveBeenCalledTimes(1);
      expect(rpcSpy).toHaveBeenCalledWith('start_new_arisan_cycle', {
        p_tenant_id: TENANT_ID,
        p_operator_member_id: null,
        p_force: true,
      });
      expect(res.new_cycle).toBe(2);
    });

    it('melempar error jika tenantId tidak disertakan', async () => {
      await expect(startNewArisanCycle(null, null, true)).rejects.toThrow('Tenant ID wajib disertakan.');
    });
  });

  describe('payArisanBillManual (VERT-1.2)', () => {
    it('memanggil submitTenantPayment dengan cash, isStaff: true, dan note pengurus', async () => {
      fromSpy = vi.spyOn(supabase, 'from');
      const fakePayment = { id: 'pay-123', status: 'completed', amount: 300000 };
      submitTenantPayment.mockResolvedValue(fakePayment);

      const res = await payArisanBillManual(TENANT_ID, BILL_ID);

      expect(submitTenantPayment).toHaveBeenCalledTimes(1);
      expect(submitTenantPayment).toHaveBeenCalledWith(TENANT_ID, {
        billId: BILL_ID,
        method: 'cash',
        isStaff: true,
        note: 'Setoran arisan dicatat pengurus',
      });
      expect(res).toEqual({ success: true, payment: fakePayment });

      // Memastikan tidak ada pemanggilan supabase.from('billing_items') untuk update
      expect(fromSpy).not.toHaveBeenCalled();
    });

    it('melempar error bila submitTenantPayment melempar error', async () => {
      submitTenantPayment.mockRejectedValue(new Error('Gagal simpan transaksi'));

      await expect(payArisanBillManual(TENANT_ID, BILL_ID)).rejects.toThrow('Gagal simpan transaksi');
    });

    it('mendukung mode demo tanpa memanggil submitTenantPayment', async () => {
      const res = await payArisanBillManual('demo-tenant', BILL_ID);

      expect(submitTenantPayment).not.toHaveBeenCalled();
      expect(res).toEqual({ success: true, bill_id: BILL_ID, status: 'paid' });
    });

    it('melempar error jika tenantId atau billId tidak diisi', async () => {
      await expect(payArisanBillManual(null, BILL_ID)).rejects.toThrow('Tenant ID dan Bill ID wajib diisi.');
      await expect(payArisanBillManual(TENANT_ID, null)).rejects.toThrow('Tenant ID dan Bill ID wajib diisi.');
    });
  });

  describe('ARISAN-1.2: getRoundContributionSummary (murni)', () => {
    it('menghitung ringkasan kontribusi dengan benar untuk status campuran', () => {
      const bills = [
        { id: 'b1', amount: 300000, status: 'paid' },
        { id: 'b2', amount: 300000, status: 'paid' },
        { id: 'b3', amount: 300000, status: 'pending_verification' },
        { id: 'b4', amount: 300000, status: 'unpaid' },
        { id: 'b5', amount: 300000, status: 'unpaid', latestPayment: { status: 'pending' } },
      ];

      const summary = getRoundContributionSummary(bills);

      expect(summary).toEqual({
        total: 5,
        paid: 2,
        pending: 2,
        unpaid: 1,
        paidAmount: 600000,
      });
    });

    it('mengembalikan 0 untuk array kosong atau non-array', () => {
      expect(getRoundContributionSummary([])).toEqual({
        total: 0,
        paid: 0,
        pending: 0,
        unpaid: 0,
        paidAmount: 0,
      });
      expect(getRoundContributionSummary(null)).toEqual({
        total: 0,
        paid: 0,
        pending: 0,
        unpaid: 0,
        paidAmount: 0,
      });
    });
  });

  describe('ARISAN-1.2: fetchArisanRoundBills', () => {
    it('mencocokkan HANYA metadata->>round_id dan mengabaikan fallback periode', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'bill-1',
              tenant_id: TENANT_ID,
              member_id: 'mem-1',
              amount: 300000,
              status: 'unpaid',
              metadata: { round_id: ROUND_ID },
              tenant_members: { id: 'mem-1', full_name: 'Ibu Ani', phone: '081111' },
            },
          ],
          error: null,
        }),
      };

      const mockPaymentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'pay-1',
              billing_item_id: 'bill-1',
              status: 'pending',
              method: 'transfer',
              created_at: '2026-10-22T10:00:00Z',
            },
          ],
          error: null,
        }),
      };

      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') return mockQuery;
        if (table === 'payments') return mockPaymentsQuery;
        return {};
      });

      // Panggil dengan roundId dan parameter ketiga (periode dummy) yang seharusnya diabaikan
      const result = await fetchArisanRoundBills(TENANT_ID, ROUND_ID, '2026-10');

      expect(fromSpy).toHaveBeenCalledWith('billing_items');
      expect(mockQuery.filter).toHaveBeenCalledWith('metadata->>round_id', 'eq', ROUND_ID);
      // Memastikan TIDAK ada eq('period', ...) yang dipanggil
      expect(mockQuery.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
      expect(mockQuery.eq).not.toHaveBeenCalledWith('period', '2026-10');

      expect(result).toHaveLength(1);
      expect(result[0].member.full_name).toBe('Ibu Ani');
      expect(result[0].latestPayment.status).toBe('pending');
    });

    it('mengembalikan array kosong jika tenantId atau roundId kosong', async () => {
      expect(await fetchArisanRoundBills(null, ROUND_ID)).toEqual([]);
      expect(await fetchArisanRoundBills(TENANT_ID, null)).toEqual([]);
    });
  });

  describe('ARISAN-1.2: fetchMyArisanBills', () => {
    it('mengembalikan tagihan arisan demo dengan urutan unpaid terlebih dahulu', async () => {
      const bills = await fetchMyArisanBills('demo-arisan', 'demo-member-1');

      expect(bills.length).toBeGreaterThanOrEqual(2);
      expect(bills[0].status).toBe('unpaid');
      expect(bills[0].round_label).toBeDefined();
      expect(bills[1].status).toBe('paid');
    });

    it('mengambil dari Supabase dan mengurutkan unpaid > pending_verification > paid', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        filter: vi.fn().mockResolvedValue({
          data: [
            { id: 'b-paid', status: 'paid', amount: 300000, period: 'Putaran 1', metadata: { round_number: 1 } },
            { id: 'b-unpaid', status: 'unpaid', amount: 300000, period: 'Putaran 3', metadata: { round_number: 3 } },
            { id: 'b-pending', status: 'pending_verification', amount: 300000, period: 'Putaran 2', metadata: { round_number: 2 } },
          ],
          error: null,
        }),
      };

      const mockPaymentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') return mockQuery;
        if (table === 'payments') return mockPaymentsQuery;
        return {};
      });

      const res = await fetchMyArisanBills(TENANT_ID, 'member-uuid-1');

      expect(mockQuery.filter).toHaveBeenCalledWith('metadata->>type', 'eq', 'arisan_contribution');
      expect(res.map((b) => b.id)).toEqual(['b-unpaid', 'b-pending', 'b-paid']);
      expect(res[0].round_number).toBe(3);
    });

    it('mengembalikan array kosong jika tenantId atau memberId null', async () => {
      expect(await fetchMyArisanBills(null, 'member-1')).toEqual([]);
      expect(await fetchMyArisanBills(TENANT_ID, null)).toEqual([]);
    });
  });
});
