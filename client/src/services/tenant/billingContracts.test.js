import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeRentPeriods,
  fetchKosContracts,
  fetchActiveContractByUnit,
  createKosContract,
  resetDemoKosContractsStore,
} from './billing';

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
  });
});
