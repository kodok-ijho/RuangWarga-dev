import { describe, it, expect } from 'vitest';
import { countOccupiedUnits } from './finance';

describe('countOccupiedUnits (KOS-1F.5, KOS-2.8)', () => {
  it('KOS-2.8 kos: anggota approved di kamar vacant TANPA kontrak aktif TIDAK dihitung terisi (terisi 0, kosong 3)', () => {
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
      occupied: 0,
      vacant: 3,
    });
  });

  it('KOS-2.8 kos: keterisian dihitung dari daftar kontrak aktif', () => {
    const units = [
      { id: '1', status: 'vacant' },
      { id: '2', status: 'vacant' },
      { id: '3', status: 'vacant' },
    ];
    const members = [
      { id: 'm1', status: 'approved', unit_id: '1' },
      { id: 'm2', status: 'approved', unit_id: '2' },
    ];
    const contracts = [
      { unit_id: '1', status: 'active' },
      { unit_id: '2', status: 'ended' }, // sudah checkout, bukan aktif
    ];

    const result = countOccupiedUnits(units, members, 'kos', contracts);
    expect(result).toEqual({
      total: 3,
      occupied: 1,
      vacant: 2,
    });
  });

  it('kamar occupied tanpa parameter contracts → terisi', () => {
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

  it('vertikal kelas: anggota approved di unit vacant tetap dihitung terisi (aturan kelas tidak berubah)', () => {
    const units = [
      { id: '1', status: 'vacant' },
      { id: '2', status: 'vacant' },
      { id: '3', status: 'vacant' },
    ];
    const members = [
      { id: 'm1', status: 'approved', unit_id: '1' },
    ];

    const result = countOccupiedUnits(units, members, 'kelas');
    expect(result).toEqual({
      total: 3,
      occupied: 1,
      vacant: 2,
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
