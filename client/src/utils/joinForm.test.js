import { describe, it, expect } from 'vitest';
import { shouldAskOccupancy, getJoinableUnits } from './joinForm';

describe('joinForm utilities (KOS-1.1)', () => {
  describe('shouldAskOccupancy', () => {
    it('mengembalikan true hanya untuk rt_rw', () => {
      expect(shouldAskOccupancy('rt_rw')).toBe(true);
    });

    it('mengembalikan false untuk vertikal lain dan input tidak dikenal', () => {
      expect(shouldAskOccupancy('kos')).toBe(false);
      expect(shouldAskOccupancy('kelas')).toBe(false);
      expect(shouldAskOccupancy('arisan')).toBe(false);
      expect(shouldAskOccupancy('')).toBe(false);
      expect(shouldAskOccupancy(null)).toBe(false);
      expect(shouldAskOccupancy(undefined)).toBe(false);
    });
  });

  describe('getJoinableUnits', () => {
    const sampleUnits = [
      { id: 1, label: 'Unit 1', status: 'active' },
      { id: 2, label: 'Unit 2', status: 'vacant' },
      { id: 3, label: 'Unit 3', status: 'occupied' },
      { id: 4, label: 'Unit 4', status: 'inactive' },
    ];

    it('untuk rt_rw: menyaring inactive, mempertahankan active, vacant, dan occupied', () => {
      const res = getJoinableUnits(sampleUnits, 'rt_rw');
      expect(res.map((u) => u.id)).toEqual([1, 2, 3]);
    });

    it('untuk arisan: menyaring inactive, mempertahankan active, vacant, dan occupied', () => {
      const res = getJoinableUnits(sampleUnits, 'arisan');
      expect(res.map((u) => u.id)).toEqual([1, 2, 3]);
    });

    it('untuk kos: menyaring inactive dan occupied, hanya menyisakan active dan vacant', () => {
      const res = getJoinableUnits(sampleUnits, 'kos');
      expect(res.map((u) => u.id)).toEqual([1, 2]);
    });

    it('untuk kelas: menyaring inactive dan occupied, hanya menyisakan active dan vacant', () => {
      const res = getJoinableUnits(sampleUnits, 'kelas');
      expect(res.map((u) => u.id)).toEqual([1, 2]);
    });

    it('mempertahankan urutan input asli', () => {
      const reverseUnits = [
        { id: 2, label: 'Kamar 102', status: 'vacant' },
        { id: 1, label: 'Kamar 101', status: 'active' },
      ];
      const res = getJoinableUnits(reverseUnits, 'kos');
      expect(res.map((u) => u.id)).toEqual([2, 1]);
    });

    it('mengembalikan array kosong jika input tidak valid', () => {
      expect(getJoinableUnits(null, 'kos')).toEqual([]);
      expect(getJoinableUnits(undefined, 'rt_rw')).toEqual([]);
      expect(getJoinableUnits('not-an-array', 'kos')).toEqual([]);
    });
  });
});
