import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '../supabaseClient';
import { drawArisanWinner, startNewArisanCycle, payArisanBillManual } from './arisan';
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
});
