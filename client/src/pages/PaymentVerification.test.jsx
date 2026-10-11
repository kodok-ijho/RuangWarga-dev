import { describe, it, expect } from 'vitest';
import {
  resolveVerificationUnit,
  resolveVerificationResident,
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
});
