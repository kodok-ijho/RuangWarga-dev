import { describe, it, expect } from 'vitest';
import {
  getOccupancyOptions,
  OCCUPANCY_STATUS,
  getMemberStatusBadge,
  formatUnitName,
  displayRoleName,
} from './dataHelpers';

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

describe('dataHelpers — getMemberStatusBadge (KOS-1.5)', () => {
  it('mengembalikan status Aktif untuk member approved', () => {
    const badge = getMemberStatusBadge({ status: 'approved' });
    expect(badge.label).toBe('Aktif');
    expect(badge.color).toContain('emerald');
  });

  it('mengembalikan status Menunggu persetujuan untuk member pending', () => {
    const badge = getMemberStatusBadge({ status: 'pending' });
    expect(badge.label).toBe('Menunggu persetujuan');
    expect(badge.color).toContain('amber');
  });

  it('mengembalikan status Ditolak untuk member rejected', () => {
    const badge = getMemberStatusBadge({ status: 'rejected' });
    expect(badge.label).toBe('Ditolak');
    expect(badge.color).toContain('rose');
  });

  it('fallback ke is_active untuk mode legacy', () => {
    expect(getMemberStatusBadge({ is_active: true }).label).toBe('Aktif');
    expect(getMemberStatusBadge({ is_active: false }).label).toBe('Non-aktif');
    expect(getMemberStatusBadge({ is_active: false }).color).toContain('slate');
  });

  it('fallback aman jika member null atau undefined', () => {
    expect(getMemberStatusBadge(null).label).toBe('Non-aktif');
    expect(getMemberStatusBadge(undefined).label).toBe('Non-aktif');
  });
});

describe('dataHelpers — formatUnitName (KOS-1F.2)', () => {
  it('tidak mengulang unitLabel bila label sudah diawali unitLabel', () => {
    expect(formatUnitName('Kamar', 'Kamar VIP')).toBe('Kamar VIP');
    expect(formatUnitName('Kamar', 'kamar 3')).toBe('kamar 3');
  });

  it('menggabungkan unitLabel dan label bila belum ada awalan', () => {
    expect(formatUnitName('Kamar', '101')).toBe('Kamar 101');
    expect(formatUnitName('Rumah', 'Blok A/12')).toBe('Rumah Blok A/12');
  });

  it('mengembalikan string kosong jika label kosong atau tidak valid', () => {
    expect(formatUnitName('Kamar', '')).toBe('');
    expect(formatUnitName('Kamar', '   ')).toBe('');
    expect(formatUnitName('Kamar', null)).toBe('');
    expect(formatUnitName('Kamar', undefined)).toBe('');
  });
});

describe('dataHelpers — displayRoleName (KOS-1F.4)', () => {
  const kosTemplate = { adminLabel: 'Pemilik Kos', memberLabel: 'Penyewa' };
  const rtRwTemplate = { adminLabel: 'Ketua RT/RW / Pengurus', memberLabel: 'Warga' };

  it('owner mengembalikan template.adminLabel', () => {
    expect(displayRoleName({ isOwner: true, template: kosTemplate })).toBe('Pemilik Kos');
    expect(displayRoleName({ isOwner: true, template: rtRwTemplate })).toBe('Ketua RT/RW / Pengurus');
  });

  it('role dasar mengembalikan template.memberLabel', () => {
    expect(displayRoleName({ isBaseRole: true, template: kosTemplate })).toBe('Penyewa');
    expect(displayRoleName({ isBaseRole: true, template: rtRwTemplate })).toBe('Warga');
  });

  it('role kustom mengembalikan roleName kustom', () => {
    expect(displayRoleName({ roleName: 'Bendahara', template: kosTemplate })).toBe('Bendahara');
  });

  it('fallback aman bila roleName kosong dan bukan owner/base', () => {
    expect(displayRoleName({ roleName: '', template: kosTemplate })).toBe('Anggota');
    expect(displayRoleName({ roleName: null })).toBe('Anggota');
  });
});
