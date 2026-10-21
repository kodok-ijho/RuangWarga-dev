import { describe, it, expect } from 'vitest';
import { countOccupiedUnits } from './finance';

describe('countOccupiedUnits (KOS-1F.5)', () => {
  it('kos 3 kamar dengan 1 anggota approved di kamar vacant → terisi 1, kosong 2', () => {
    const units = [
      { id: '1', status: 'vacant' },
      { id: '2', status: 'vacant' },
      { id: '3', status: 'vacant' },
    ];
    const members = [
      { id: 'm1', status: 'approved', unit_id: '1' },
    ];

    const result = countOccupiedUnits(units, members, 'kos');
    expect(result).toEqual({
      total: 3,
      occupied: 1,
      vacant: 2,
    });
  });

  it('kamar occupied tanpa anggota → terisi', () => {
    const units = [
      { id: '1', status: 'occupied' },
    ];
    const members = [];

    const result = countOccupiedUnits(units, members, 'kos');
    expect(result).toEqual({
      total: 1,
      occupied: 1,
      vacant: 0,
    });
  });

  it('kamar inactive diabaikan (tidak dihitung baik sebagai terisi maupun kosong)', () => {
    const units = [
      { id: '1', status: 'vacant' },
      { id: '2', status: 'inactive' },
    ];
    const members = [];

    const result = countOccupiedUnits(units, members, 'kos');
    expect(result).toEqual({
      total: 1,
      occupied: 0,
      vacant: 1,
    });
  });

  it('rt_rw tidak berubah (status active / is_occupied)', () => {
    const units = [
      { id: '1', status: 'active' },
      { id: '2', status: 'vacant' },
      { id: '3', status: 'inactive', is_occupied: true },
    ];
    const members = [];

    const result = countOccupiedUnits(units, members, 'rt_rw');
    expect(result).toEqual({
      total: 3,
      occupied: 2,
      vacant: 1,
    });
  });
});
