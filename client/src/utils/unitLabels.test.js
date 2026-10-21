import { describe, it, expect } from 'vitest';
import { selectNewUnitLabels } from './unitLabels';

describe('utils/unitLabels - selectNewUnitLabels (VERT-1.4)', () => {
  it('mengabaikan label yang sudah ada meskipun berbeda huruf besar/kecil dan spasi', () => {
    const existing = [{ label: 'Kamar 101' }, { label: '  kamar 102  ' }];
    const input = ['kamar 101', 'Kamar 102', 'Kamar 103'];
    const result = selectNewUnitLabels(existing, input);

    expect(result).toEqual(['Kamar 103']);
  });

  it('membuang duplikat di dalam input unitList itu sendiri', () => {
    const existing = [];
    const input = ['Kamar 101', 'kamar 101', '  KAMAR 101  ', 'Kamar 102'];
    const result = selectNewUnitLabels(existing, input);

    expect(result).toEqual(['Kamar 101', 'Kamar 102']);
  });

  it('menangani input array of objects maupun array of strings pada existing dan input', () => {
    const existing = ['Slot 1', { label: 'Slot 2' }];
    const input = [{ label: 'slot 1' }, { label: 'Slot 3' }, 'Slot 4'];
    const result = selectNewUnitLabels(existing, input);

    expect(result).toEqual(['Slot 3', 'Slot 4']);
  });

  it('menangani data kosong, string spasi, atau null/undefined secara aman', () => {
    expect(selectNewUnitLabels(null, null)).toEqual([]);
    expect(selectNewUnitLabels([], ['', '   ', null, undefined])).toEqual([]);
  });

  it('jika semua unit sudah ada, mengembalikan array kosong', () => {
    const existing = [{ label: 'A1' }, { label: 'A2' }];
    const input = ['a1', 'a2'];
    expect(selectNewUnitLabels(existing, input)).toEqual([]);
  });
});
