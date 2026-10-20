import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '../supabaseClient';
import { drawArisanWinner, startNewArisanCycle } from './arisan';

describe('tenant/arisan - VERT-1.1 Unit Tests', () => {
  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const ROUND_ID = 'round-uuid-1234';

  let rpcSpy;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (rpcSpy) {
      rpcSpy.mockRestore();
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
});
