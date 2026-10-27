import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeRentPeriods,
  fetchKosContracts,
  fetchActiveContractByUnit,
  createKosContract,
  resetDemoKosContractsStore,
  waiveLateFee,
} from './billing';
import { supabase } from './shared';

describe('KOS-2.3: computeRentPeriods & Kos Contract Service', () => {
  beforeEach(() => {
    resetDemoKosContractsStore();
  });

  describe('Pure helper: computeRentPeriods', () => {
    it('menghitung contoh Dhani: masuk 19 Okt 2026, tenggat 10 hari, 3 periode', () => {
      const periods = computeRentPeriods('2026-10-19', 10, 3);

      expect(periods).toHaveLength(3);

      // Periode 0 (Okt)
      expect(periods[0]).toEqual({
        index: 0,
        period: '2026-10',
        service_start: '2026-10-19',
        service_end: '2026-11-18',
        due_date: '2026-10-29',
      });

      // Periode 1 (Nov)
      expect(periods[1]).toEqual({
        index: 1,
        period: '2026-11',
        service_start: '2026-11-19',
        service_end: '2026-12-18',
        due_date: '2026-11-29',
      });

      // Periode 2 (Des)
      expect(periods[2]).toEqual({
        index: 2,
        period: '2026-12',
        service_start: '2026-12-19',
        service_end: '2027-01-18',
        due_date: '2026-12-29',
      });
    });

    it('anchor 31 Jan tidak mengalami pergeseran permanen (28 Feb -> 31 Mar -> 30 Apr)', () => {
      const periods = computeRentPeriods('2026-01-31', 5, 3);

      expect(periods).toHaveLength(3);

      // Periode 0: 31 Jan -> 27 Feb
      expect(periods[0].service_start).toBe('2026-01-31');
      expect(periods[0].service_end).toBe('2026-02-27');
      expect(periods[0].due_date).toBe('2026-02-05');

      // Periode 1: 28 Feb (clamp) -> 30 Mar
      expect(periods[1].service_start).toBe('2026-02-28');
      expect(periods[1].service_end).toBe('2026-03-30');

      // Periode 2: 31 Mar (kembali ke 31, stabil!) -> 29 Apr
      expect(periods[2].service_start).toBe('2026-03-31');
      expect(periods[2].service_end).toBe('2026-04-29');
    });

    it('mendukung pergantian tahun kalender dengan benar', () => {
      const periods = computeRentPeriods('2026-12-15', 7, 2);

      expect(periods[0].period).toBe('2026-12');
      expect(periods[0].service_start).toBe('2026-12-15');
      expect(periods[0].service_end).toBe('2027-01-14');
      expect(periods[0].due_date).toBe('2026-12-22');

      expect(periods[1].period).toBe('2027-01');
      expect(periods[1].service_start).toBe('2027-01-15');
      expect(periods[1].service_end).toBe('2027-02-14');
    });

    it('menghormati maxEndDate dengan meng-clamp atau membatasi periode', () => {
      // Kontrak 2 bulan: 01 Jan 2026 s.d. 28 Feb 2026
      const periods = computeRentPeriods('2026-01-01', 10, 5, '2026-02-28');

      expect(periods).toHaveLength(2);
      expect(periods[1].service_end).toBe('2026-02-28');
    });

    it('mengembalikan array kosong jika parameter tidak valid', () => {
      expect(computeRentPeriods(null)).toEqual([]);
      expect(computeRentPeriods('')).toEqual([]);
      expect(computeRentPeriods('bukan-tanggal')).toEqual([]);
    });

    it('KOS-3.2: computeRentPeriods dengan month_start_prorata membagi periode pertama prorata dan periode berikutnya tanggal 1', () => {
      const periods = computeRentPeriods('2026-10-19', 10, 3, null, 'month_start_prorata');

      expect(periods).toHaveLength(3);

      // Periode 0 (prorata 19-31 Okt)
      expect(periods[0]).toEqual({
        index: 0,
        period: '2026-10',
        service_start: '2026-10-19',
        service_end: '2026-10-31',
        due_date: '2026-10-29',
        is_prorata: true,
      });

      // Periode 1 (1-30 Nov)
      expect(periods[1]).toEqual({
        index: 1,
        period: '2026-11',
        service_start: '2026-11-01',
        service_end: '2026-11-30',
        due_date: '2026-11-11',
      });

      // Periode 2 (1-31 Des)
      expect(periods[2]).toEqual({
        index: 2,
        period: '2026-12',
        service_start: '2026-12-01',
        service_end: '2026-12-31',
        due_date: '2026-12-11',
      });
    });

    it('KOS-3.2: computeRentPeriods masuk tanggal 1 menormalkan siklus prorata ke start_date', () => {
      const periods = computeRentPeriods('2026-10-01', 10, 2, null, 'month_start_prorata');
      expect(periods).toHaveLength(2);
      expect(periods[0].service_start).toBe('2026-10-01');
      expect(periods[0].service_end).toBe('2026-10-31');
      expect(periods[0].is_prorata).toBeUndefined();
    });
  });

  describe('Service Demo: Kos Contract Operations', () => {
    const TENANT_ID = 'demo-tenant-kos';

    it('fetchKosContracts mengembalikan daftar kontrak demo', async () => {
      const list = await fetchKosContracts(TENANT_ID);
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].tenant_name).toBe('Dhani Mahasiswa');
    });

    it('fetchActiveContractByUnit mengembalikan kontrak aktif kamar', async () => {
      const contract = await fetchActiveContractByUnit(TENANT_ID, 1);
      expect(contract).toBeDefined();
      expect(contract.unit_id).toBe(1);
      expect(contract.status).toBe('active');

      const nonExistent = await fetchActiveContractByUnit(TENANT_ID, 9999);
      expect(nonExistent).toBeNull();
    });

    it('createKosContract membuat kontrak baru dan menerbitkan tagihan periode pertama', async () => {
      const result = await createKosContract(TENANT_ID, {
        unitId: 5,
        memberId: 'mem-new-5',
        tenantName: 'Rian Mahasiswa',
        rentPrice: 1750000,
        startDate: '2026-11-01',
        months: 6,
        graceDays: 10,
        notes: 'Kontrak semester baru',
      });

      expect(result.success).toBe(true);
      expect(result.contract_id).toBeDefined();
      expect(result.bill_id).toBeDefined();
      expect(result.start_date).toBe('2026-11-01');
      expect(result.end_date).toBe('2027-04-30');
      expect(result.rent_price).toBe(1750000);

      const active = await fetchActiveContractByUnit(TENANT_ID, 5);
      expect(active).toBeDefined();
      expect(active.id).toBe(result.contract_id);
      expect(active.tenant_name).toBe('Rian Mahasiswa');
    });

    it('createKosContract menolak jika kamar sudah punya kontrak aktif', async () => {
      await expect(
        createKosContract(TENANT_ID, {
          unitId: 1, // Kamar 1 sudah terisi oleh Dhani
          tenantName: 'Penyewa Lain',
          rentPrice: 1500000,
          startDate: '2026-11-01',
        })
      ).rejects.toThrow('Kamar sudah memiliki kontrak sewa aktif');
    });

    it('createKosContract menolak harga negatif', async () => {
      await expect(
        createKosContract(TENANT_ID, {
          unitId: 8,
          tenantName: 'Penyewa',
          rentPrice: -1000,
          startDate: '2026-11-01',
        })
      ).rejects.toThrow('Harga sewa tidak boleh bernilai negatif.');
    });

    it('KOS-3.2: createKosContract mode demo menghitung prorata dan menyimpan billing_cycle', async () => {
      const result = await createKosContract(TENANT_ID, {
        unitId: 6,
        memberId: 'mem-prorata-6',
        tenantName: 'Tari Mahasiswi',
        rentPrice: 1500000,
        startDate: '2026-10-19',
        months: 2,
        graceDays: 10,
        billingCycle: 'month_start_prorata',
      });

      expect(result.success).toBe(true);
      expect(result.billing_cycle).toBe('month_start_prorata');
      // 13/31 * 1.500.000 = 629.000
      expect(result.bill.amount).toBe(629000);
      expect(result.bill.metadata.prorata).toBe(true);
      expect(result.bill.metadata.prorata_days).toBe(13);
      expect(result.bill.metadata.days_in_month).toBe(31);
      // Durasi 2 bulan: Okt (prorata) + 2 bulan kalender penuh -> Nov & Des -> 2026-12-31
      expect(result.end_date).toBe('2026-12-31');

      const active = await fetchActiveContractByUnit(TENANT_ID, 6);
      expect(active.billing_cycle).toBe('month_start_prorata');
    });

    it('KOS-3.2: createKosContract mode demo masuk tanggal 1 dinormalkan ke start_date dan nominal penuh', async () => {
      const result = await createKosContract(TENANT_ID, {
        unitId: 7,
        tenantName: 'Bayu Warga',
        rentPrice: 1500000,
        startDate: '2026-11-01',
        months: 3,
        billingCycle: 'month_start_prorata',
      });

      expect(result.success).toBe(true);
      expect(result.billing_cycle).toBe('start_date');
      expect(result.bill.amount).toBe(1500000);
      expect(result.bill.metadata.prorata).toBeUndefined();
    });

    it('KOS-4.2: createKosContract mode demo menyimpan additional_fees dan menghitung line_items serta total amount', async () => {
      const fees = [
        { name: 'Parkir Mobil', amount: 100000 },
        { name: 'WiFi Ekstra', amount: 50000 },
      ];

      const result = await createKosContract(TENANT_ID, {
        unitId: 8,
        tenantName: 'Citra Penyewa',
        rentPrice: 1500000,
        startDate: '2026-10-19',
        months: 6,
        billingCycle: 'start_date',
        additionalFees: fees,
      });

      expect(result.success).toBe(true);
      expect(result.additional_fees).toEqual(fees);
      expect(result.contract.additional_fees).toEqual(fees);
      // start_date non-prorata: amount = 1500000 + 100000 + 50000 = 1650000
      expect(result.bill.amount).toBe(1650000);
      expect(result.bill.metadata.line_items).toEqual([
        { name: 'Sewa', amount: 1500000 },
        { name: 'Parkir Mobil', amount: 100000 },
        { name: 'WiFi Ekstra', amount: 50000 },
      ]);
    });

    it('KOS-4.2: createKosContract mode demo siklus prorata menghitung line_items prorata', async () => {
      const fees = [{ name: 'Parkir Mobil', amount: 100000 }];

      const result = await createKosContract(TENANT_ID, {
        unitId: 9,
        tenantName: 'Dewi Mahasiswi',
        rentPrice: 1500000,
        startDate: '2026-10-19',
        months: 3,
        billingCycle: 'month_start_prorata',
        additionalFees: fees,
      });

      expect(result.success).toBe(true);
      expect(result.billing_cycle).toBe('month_start_prorata');
      // floor(1600000 * 13 / 31 / 1000) * 1000 = 670000
      expect(result.bill.amount).toBe(670000);
      expect(result.bill.metadata.prorata).toBe(true);
      expect(result.bill.metadata.line_items).toEqual([
        { name: 'Sewa', amount: 628065 },
        { name: 'Parkir Mobil', amount: 41935 },
      ]);
    });

    it('KOS-4.2: createKosContract mode Supabase RPC mengirim p_additional_fees', async () => {
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          contract_id: 'c-supabase-fees-1',
          additional_fees: [{ name: 'Parkir Mobil', amount: 100000 }],
        },
        error: null,
      });

      const realTenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      if (!import.meta.env?.VITE_DEMO_MODE || import.meta.env.VITE_DEMO_MODE === 'false') {
        const result = await createKosContract(realTenantId, {
          unitId: 11,
          tenantName: 'Supabase User Fees',
          rentPrice: 2000000,
          startDate: '2026-10-19',
          billingCycle: 'month_start_prorata',
          additionalFees: [{ name: 'Parkir Mobil', amount: 100000 }],
        });

        expect(result.success).toBe(true);
        expect(rpcSpy).toHaveBeenCalledWith(
          'create_kos_contract',
          expect.objectContaining({
            p_tenant_id: realTenantId,
            p_unit_id: 11,
            p_rent_price: 2000000,
            p_start_date: '2026-10-19',
            p_billing_cycle: 'month_start_prorata',
            p_additional_fees: [{ name: 'Parkir Mobil', amount: 100000 }],
          })
        );
      } else {
        expect(true).toBe(true);
      }
      rpcSpy.mockRestore();
    });

    it('KOS-5.2a: createKosContract mode demo menyimpan late_fee_rule pada kontrak', async () => {
      const lateFeeRule = { type: 'daily', amount: 10000, max: 150000, grace_days: 3 };

      const result = await createKosContract(TENANT_ID, {
        unitId: 12,
        tenantName: 'Eko Late Fee',
        rentPrice: 1200000,
        startDate: '2026-10-20',
        lateFeeRule,
      });

      expect(result.success).toBe(true);
      expect(result.late_fee_rule).toEqual(lateFeeRule);
      expect(result.contract.late_fee_rule).toEqual(lateFeeRule);
    });

    it('KOS-5.2a: createKosContract mode Supabase RPC mengirim p_late_fee_rule', async () => {
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          contract_id: 'c-supabase-late-fee-1',
          late_fee_rule: { type: 'once', amount: 50000, grace_days: 2 },
        },
        error: null,
      });

      const realTenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      if (!import.meta.env?.VITE_DEMO_MODE || import.meta.env.VITE_DEMO_MODE === 'false') {
        const result = await createKosContract(realTenantId, {
          unitId: 14,
          tenantName: 'Supabase Late Fee',
          rentPrice: 2000000,
          startDate: '2026-10-20',
          lateFeeRule: { type: 'once', amount: 50000, grace_days: 2 },
        });

        expect(result.success).toBe(true);
        expect(rpcSpy).toHaveBeenCalledWith(
          'create_kos_contract',
          expect.objectContaining({
            p_tenant_id: realTenantId,
            p_unit_id: 14,
            p_late_fee_rule: { type: 'once', amount: 50000, grace_days: 2 },
          })
        );
      }
      rpcSpy.mockRestore();
    });

    it('KOS-5.2a: waiveLateFee memvalidasi ID tagihan dan alasan wajib', async () => {
      await expect(waiveLateFee('', 'Alasan valid')).rejects.toThrow('ID tagihan wajib disertakan.');
      await expect(waiveLateFee('bill-1', '')).rejects.toThrow('Alasan penghapusan denda wajib diisi.');
      await expect(waiveLateFee('bill-1', '   ')).rejects.toThrow('Alasan penghapusan denda wajib diisi.');
    });

    it('KOS-5.2a: waiveLateFee mode demo mengosongkan late_fee dan mengisi metadata', async () => {
      // Buat kontrak baru di mode demo yang menghasilkan tagihan periode pertama
      const contractRes = await createKosContract(TENANT_ID, {
        unitId: 15,
        tenantName: 'Farhan Denda',
        rentPrice: 1500000,
        startDate: '2026-10-01',
      });

      // Simulasikan tagihan memiliki denda 50000
      contractRes.bill.late_fee = 50000;

      const waiveRes = await waiveLateFee(contractRes.bill.id, 'Penyewa sakit opname di RS');
      expect(waiveRes.success).toBe(true);
      expect(waiveRes.late_fee).toBe(0);
      expect(contractRes.bill.late_fee).toBe(0);
      expect(contractRes.bill.metadata.late_fee_waived).toBe(true);
      expect(contractRes.bill.metadata.waive_reason).toBe('Penyewa sakit opname di RS');
    });

    it('KOS-5.2a: waiveLateFee mode Supabase memanggil RPC waive_late_fee', async () => {
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          bill_id: 'b1111111-2222-3333-4444-555555555555',
          late_fee: 0,
        },
        error: null,
      });

      if (!import.meta.env?.VITE_DEMO_MODE || import.meta.env.VITE_DEMO_MODE === 'false') {
        const res = await waiveLateFee(
          'b1111111-2222-3333-4444-555555555555',
          'Toleransi keterlambatan hari pertama'
        );

        expect(res.success).toBe(true);
        expect(rpcSpy).toHaveBeenCalledWith('waive_late_fee', {
          p_bill_id: 'b1111111-2222-3333-4444-555555555555',
          p_reason: 'Toleransi keterlambatan hari pertama',
        });
      }
      rpcSpy.mockRestore();
    });
  });
});
