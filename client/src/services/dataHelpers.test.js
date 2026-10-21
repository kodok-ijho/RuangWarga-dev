import { describe, it, expect } from 'vitest';
import { getOccupancyOptions, OCCUPANCY_STATUS } from './dataHelpers';

describe('dataHelpers — getOccupancyOptions (KOS-1.2)', () => {
  it('mengembalikan opsi yang tepat untuk vertikal kos', () => {
    const opts = getOccupancyOptions('kos');
    expect(opts).toEqual([
      { value: 'tenant', label: 'Penyewa Aktif' },
      { value: 'booking', label: 'Dipesan / Booking' },
      { value: 'checkout', label: 'Selesai / Checkout' },
      { value: 'owner_occupied', label: 'Pemilik / Pengelola' },
    ]);
  });

  it('mengembalikan opsi yang tepat untuk vertikal kelas', () => {
    const opts = getOccupancyOptions('kelas');
    expect(opts).toEqual([
      { value: 'tenant', label: 'Siswa Terdaftar' },
      { value: 'booking', label: 'Calon Siswa / Dipesan' },
      { value: 'checkout', label: 'Lulus / Selesai' },
      { value: 'owner_occupied', label: 'Pengajar / Wali Kelas' },
    ]);
  });

  it('mengembalikan opsi yang tepat untuk vertikal arisan', () => {
    const opts = getOccupancyOptions('arisan');
    expect(opts).toEqual([
      { value: 'tenant', label: 'Peserta Aktif' },
      { value: 'booking', label: 'Calon Peserta' },
      { value: 'checkout', label: 'Selesai / Keluar' },
      { value: 'owner_occupied', label: 'Ketua Arisan' },
    ]);
  });

  it('mengembalikan empat entri OCCUPANCY_STATUS untuk rt_rw atau tipe tidak dikenal', () => {
    const expectedRtRw = Object.entries(OCCUPANCY_STATUS).map(([value, label]) => ({
      value,
      label,
    }));

    expect(getOccupancyOptions('rt_rw')).toEqual(expectedRtRw);
    expect(getOccupancyOptions(undefined)).toEqual(expectedRtRw);
    expect(getOccupancyOptions(null)).toEqual(expectedRtRw);
    expect(getOccupancyOptions('unknown_type')).toEqual(expectedRtRw);
  });
});
