import { describe, it, expect } from 'vitest';
import {
  resolveVerificationUnit,
  resolveVerificationResident,
  getPaymentUnitDisplay,
} from './PaymentVerification';
import { getUnitById, getProfileById } from '../services/mockData';

describe('PaymentVerification - Unit & Resident Resolution (DEBT-1F.2)', () => {
  const sampleUnits = [
    { id: 101, block: 'A', unit_number: '01' },
    { id: 102, block: 'A', unit_number: '02' },
  ];

  const sampleResidents = [
    { id: 'res-1', full_name: 'Warga Asli 1' },
    { id: 'res-2', full_name: 'Warga Asli 2' },
  ];

  describe('resolveVerificationUnit', () => {
    it('mengembalikan unit dari list jika unitId cocok', () => {
      const result = resolveVerificationUnit(sampleUnits, 101, false);
      expect(result).toEqual({ id: 101, block: 'A', unit_number: '01' });
    });

    it('mengembalikan null jika unitId tidak ditemukan dan isDemo = false (tidak fallback ke mock)', () => {
      // 1 adalah ID unit di mockData, tetapi di produksi (isDemo = false) tidak boleh fallback ke mockData
      const result = resolveVerificationUnit(sampleUnits, 1, false);
      expect(result).toBeNull();
    });

    it('fallback ke getUnitById jika unitId tidak ditemukan dan isDemo = true', () => {
      const mockUnit1 = getUnitById(1);
      const result = resolveVerificationUnit(sampleUnits, 1, true);
      expect(result).toEqual(mockUnit1);
    });

    it('mengembalikan null jika unitId kosong atau null', () => {
      expect(resolveVerificationUnit(sampleUnits, null, false)).toBeNull();
      expect(resolveVerificationUnit(sampleUnits, undefined, false)).toBeNull();
      expect(resolveVerificationUnit(sampleUnits, '', false)).toBeNull();
    });
  });

  describe('resolveVerificationResident', () => {
    it('mengembalikan warga dari list jika residentId cocok', () => {
      const result = resolveVerificationResident(sampleResidents, 'res-1', false);
      expect(result).toEqual({ id: 'res-1', full_name: 'Warga Asli 1' });
    });

    it('mengembalikan null jika residentId tidak ditemukan dan isDemo = false (tidak fallback ke mock)', () => {
      // 'res-1' di mockData ada (Ibu Ratna / Pak RT dsb.), tapi dengan isDemo = false harus null bila ID tidak di daftar
      const result = resolveVerificationResident(sampleResidents, 1, false);
      expect(result).toBeNull();
    });

    it('fallback ke getProfileById jika residentId tidak ditemukan dan isDemo = true', () => {
      const mockProfile1 = getProfileById(1);
      const result = resolveVerificationResident(sampleResidents, 1, true);
      expect(result).toEqual(mockProfile1);
    });

    it('mengembalikan null jika residentId kosong atau null', () => {
      expect(resolveVerificationResident(sampleResidents, null, false)).toBeNull();
      expect(resolveVerificationResident(sampleResidents, undefined, false)).toBeNull();
      expect(resolveVerificationResident(sampleResidents, '', false)).toBeNull();
    });
  });

  describe('PANITIA-2.5: getPaymentUnitDisplay', () => {
    it('baris verifikasi iuran menampilkan nama acara', () => {
      // 1. Tagihan dengan program_id dan program_name
      const payment1 = {
        program_id: 'prog-1',
        program_name: 'Pentas Seni Tahunan',
      };
      const display1 = getPaymentUnitDisplay(payment1, null);
      expect(display1).toBe('Iuran: Pentas Seni Tahunan');
      expect(display1).not.toContain('Blok');
      expect(display1).not.toBe('-');

      // 2. Tagihan dengan metadata.bill_type === 'program_dues'
      const payment2 = {
        metadata: {
          bill_type: 'program_dues',
          program_name: 'Lomba Kemerdekaan',
        },
      };
      const display2 = getPaymentUnitDisplay(payment2, null);
      expect(display2).toBe('Iuran: Lomba Kemerdekaan');
      expect(display2).not.toContain('Blok');

      // 3. Tagihan dengan _bill.program.name
      const payment3 = {
        _bill: {
          program_id: 'prog-2',
          program: { name: 'Malam Keakraban' },
        },
      };
      const display3 = getPaymentUnitDisplay(payment3, null);
      expect(display3).toBe('Iuran: Malam Keakraban');
      expect(display3).not.toContain('Blok');
    });

    it('baris RT/RW tetap "Blok …"', () => {
      // 1. Tagihan RT/RW dengan unit block dan unit_number
      const paymentRtrw = {
        unit_id: 101,
      };
      const unitRtrw = {
        id: 101,
        block: 'B',
        unit_number: '12',
      };
      const displayRtrw = getPaymentUnitDisplay(paymentRtrw, unitRtrw);
      expect(displayRtrw).toBe('Blok B/12');

      // 2. Tagihan RT/RW tanpa unit menampilkan "-"
      expect(getPaymentUnitDisplay(paymentRtrw, null)).toBe('-');
    });
  });
});
