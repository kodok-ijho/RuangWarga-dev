import { describe, it, expect } from 'vitest';
import { shouldAskOccupancy, shouldAskUnit, getJoinableUnits } from './joinForm';

describe('joinForm utilities (KOS-1.1 & PANITIA-1.3)', () => {
  describe('shouldAskOccupancy', () => {
    it('mengembalikan true hanya untuk rt_rw', () => {
      expect(shouldAskOccupancy('rt_rw')).toBe(true);
    });

    it('mengembalikan false untuk vertikal lain dan input tidak dikenal', () => {
      expect(shouldAskOccupancy('kos')).toBe(false);
      expect(shouldAskOccupancy('panitia')).toBe(false);
      expect(shouldAskOccupancy('kelas')).toBe(false);
      expect(shouldAskOccupancy('arisan')).toBe(false);
      expect(shouldAskOccupancy('')).toBe(false);
      expect(shouldAskOccupancy(null)).toBe(false);
      expect(shouldAskOccupancy(undefined)).toBe(false);
    });
  });

  describe('shouldAskUnit', () => {
    it('mengembalikan false untuk panitia', () => {
      expect(shouldAskUnit('panitia')).toBe(false);
    });

    it('mengembalikan true untuk vertikal lain yang menggunakan unit/kamar/slot', () => {
      expect(shouldAskUnit('rt_rw')).toBe(true);
      expect(shouldAskUnit('kos')).toBe(true);
      expect(shouldAskUnit('arisan')).toBe(true);
      expect(shouldAskUnit('kelas')).toBe(true);
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

    it('untuk kos: menyaring unit yang memiliki kontrak aktif meskipun statusnya vacant', () => {
      const kosUnits = [
        { id: 1, label: 'Kamar 101', status: 'vacant' },
        { id: 2, label: 'Kamar 102', status: 'vacant' },
      ];
      const contracts = [
        { unit_id: 1, status: 'active' },
      ];
      const res = getJoinableUnits(kosUnits, 'kos', contracts);
      expect(res.map((u) => u.id)).toEqual([2]);
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
