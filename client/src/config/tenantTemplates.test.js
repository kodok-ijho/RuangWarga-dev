import { describe, it, expect } from 'vitest';
import { getTenantTemplate, TENANT_TEMPLATES } from './tenantTemplates';
import { occupancyStatusLabel, occupancyStatusColor, roleLabel } from '../services/dataHelpers';

describe('tenantTemplates & Dynamic Naming (T7.5 & T9.3)', () => {
  describe('Template Vertikal Kos-kosan', () => {
    it('mengembalikan istilah Kamar, Penyewa, dan Sewa untuk tipe kos', () => {
      const kosTemplate = getTenantTemplate('kos');

      expect(kosTemplate).toBeDefined();
      expect(kosTemplate.unitLabel).toBe('Kamar');
      expect(kosTemplate.unitPluralLabel).toBe('Kamar / Pintu');
      expect(kosTemplate.memberLabel).toBe('Penyewa');
      expect(kosTemplate.memberPluralLabel).toBe('Daftar Penyewa');
      expect(kosTemplate.billLabel).toBe('Sewa');
      expect(kosTemplate.billPluralLabel).toBe('Tagihan Sewa Kamar');
      expect(kosTemplate.emptyUnitLabel).toBe('Kamar Kosong');
      expect(kosTemplate.occupiedUnitLabel).toBe('Tersewa');
      expect(kosTemplate.headerResidentUnit).toBe('Kamar / Penyewa');
      expect(kosTemplate.contractLabel).toBe('Kontrak Sewa');
      expect(kosTemplate.feeLabel).toBe('Tarif Sewa');
      expect(kosTemplate.features.hasRoomStatus).toBe(true);
    });

    it('mengembalikan istilah Rumah, Warga, dan IPL untuk tipe default rt_rw', () => {
      const rtTemplate = getTenantTemplate('rt_rw');

      expect(rtTemplate).toBeDefined();
      expect(rtTemplate.unitLabel).toBe('Rumah');
      expect(rtTemplate.memberLabel).toBe('Warga');
      expect(rtTemplate.billLabel).toBe('IPL');
      expect(rtTemplate.emptyUnitLabel).toBe('Rumah Kosong');
      expect(rtTemplate.occupiedUnitLabel).toBe('Dihuni');
      expect(rtTemplate.headerResidentUnit).toBe('Rumah / Warga');
    });

    it('fallback ke rt_rw jika tipe tenant tidak dikenal', () => {
      const fallbackTemplate = getTenantTemplate('unknown_type');
      expect(fallbackTemplate.type).toBe('rt_rw');
      expect(fallbackTemplate.unitLabel).toBe('Rumah');
    });
  });

  describe('Template Vertikal Kelas (T9.3)', () => {
    it('mengembalikan istilah Slot, Siswa, dan Iuran/SPP untuk tipe kelas', () => {
      const kelasTemplate = getTenantTemplate('kelas');

      expect(kelasTemplate).toBeDefined();
      expect(kelasTemplate.type).toBe('kelas');
      expect(kelasTemplate.name).toBe('Kelas & Kursus');
      expect(kelasTemplate.unitLabel).toBe('Slot');
      expect(kelasTemplate.unitPluralLabel).toBe('Slot Siswa');
      expect(kelasTemplate.memberLabel).toBe('Siswa');
      expect(kelasTemplate.memberPluralLabel).toBe('Daftar Siswa');
      expect(kelasTemplate.billLabel).toBe('Iuran');
      expect(kelasTemplate.billPluralLabel).toBe('SPP & Iuran Kelas');
      expect(kelasTemplate.adminLabel).toBe('Pengajar / Pengelola');
      expect(kelasTemplate.treasurerLabel).toBe('Bendahara Kelas');
      expect(kelasTemplate.communityLabel).toBe('Kelas Belajar');
      expect(kelasTemplate.emptyUnitLabel).toBe('Slot Terbuka');
      expect(kelasTemplate.occupiedUnitLabel).toBe('Siswa Terdaftar');
      expect(kelasTemplate.paymentActionLabel).toBe('Bayar Iuran / SPP');
      expect(kelasTemplate.headerResidentUnit).toBe('Slot / Siswa');
      expect(kelasTemplate.contractLabel).toBe('Status Pendaftaran');
      expect(kelasTemplate.feeLabel).toBe('Iuran SPP');
      expect(kelasTemplate.features.hasStudentAttendance).toBe(true);
      expect(kelasTemplate.features.hasArisanDraw).toBe(false);
    });

    it('menghasilkan label status hunian yang disesuaikan untuk kelas', () => {
      expect(occupancyStatusLabel('tenant', 'kelas')).toBe('Siswa Terdaftar');
      expect(occupancyStatusLabel('student', 'kelas')).toBe('Siswa Terdaftar');
      expect(occupancyStatusLabel('owner_occupied', 'kelas')).toBe('Pengajar / Wali Kelas');
      expect(occupancyStatusLabel('owner_rented', 'kelas')).toBe('Slot Terisi');
      expect(occupancyStatusLabel('owner_vacant', 'kelas')).toBe('Slot Terbuka');
      expect(occupancyStatusLabel('checkout', 'kelas')).toBe('Lulus / Selesai');
      expect(occupancyStatusLabel('booking', 'kelas')).toBe('Calon Siswa / Dipesan');
    });

    it('menghasilkan roleLabel yang disesuaikan untuk kelas', () => {
      expect(roleLabel('warga', 'kelas')).toBe('Siswa / Wali Murid');
      expect(roleLabel('anggota', 'kelas')).toBe('Siswa / Wali Murid');
      expect(roleLabel('admin', 'kelas')).toBe('Pengajar / Pengelola');
      expect(roleLabel('bendahara', 'kelas')).toBe('Bendahara Kelas');
      expect(roleLabel('pengurus', 'kelas')).toBe('Staf Pengajar');
    });
  });

  describe('Dynamic Occupancy Status Helpers', () => {
    it('menghasilkan label status hunian yang disesuaikan untuk kos', () => {
      expect(occupancyStatusLabel('tenant', 'kos')).toBe('Penyewa Aktif');
      expect(occupancyStatusLabel('owner_occupied', 'kos')).toBe('Pemilik / Pengelola');
      expect(occupancyStatusLabel('checkout', 'kos')).toBe('Selesai / Checkout');
      expect(occupancyStatusLabel('booking', 'kos')).toBe('Dipesan / Booking');
    });

    it('menghasilkan label status hunian standar untuk rt_rw', () => {
      expect(occupancyStatusLabel('tenant', 'rt_rw')).toBe('Kontrak');
      expect(occupancyStatusLabel('owner_occupied', 'rt_rw')).toBe('Tetap / Owner - Dihuni');
    });

    it('memberikan warna badge yang sesuai untuk status checkout dan booking', () => {
      expect(occupancyStatusColor('checkout')).toContain('bg-gray-100');
      expect(occupancyStatusColor('booking')).toContain('bg-amber-100');
    });
  });

  describe('Template Vertikal Kepanitiaan & Acara (PANITIA-1.3)', () => {
    it('mengembalikan template panitia dengan hasUnits=false dan hasPrograms=true', () => {
      const panitiaTemplate = getTenantTemplate('panitia');

      expect(panitiaTemplate).toBeDefined();
      expect(panitiaTemplate.type).toBe('panitia');
      expect(panitiaTemplate.name).toBe('Kepanitiaan & Acara');
      expect(panitiaTemplate.icon).toBe('🎪');
      expect(panitiaTemplate.memberLabel).toBe('Anggota Panitia');
      expect(panitiaTemplate.memberPluralLabel).toBe('Daftar Panitia');
      expect(panitiaTemplate.adminLabel).toBe('Ketua');
      expect(panitiaTemplate.treasurerLabel).toBe('Bendahara');
      expect(panitiaTemplate.communityLabel).toBe('Kepanitiaan');
      expect(panitiaTemplate.billLabel).toBe('Iuran');
      expect(panitiaTemplate.billPluralLabel).toBe('Iuran Panitia');
      expect(panitiaTemplate.programLabel).toBe('Acara');
      expect(panitiaTemplate.eventsLabel).toBe('Agenda');
      expect(panitiaTemplate.unitLabel).toBe('Seksi');

      expect(panitiaTemplate.features.hasUnits).toBe(false);
      expect(panitiaTemplate.features.hasPrograms).toBe(true);

      expect(panitiaTemplate.incomeCategories).toEqual([
        'Sponsor',
        'Donasi',
        'Penjualan Tiket',
        'Dana Organisasi',
        'Iuran Panitia',
        'Lain-lain',
      ]);
      expect(panitiaTemplate.expenseCategories).toEqual([
        'Konsumsi',
        'Perlengkapan',
        'Dekorasi',
        'Publikasi & Desain',
        'Transportasi',
        'Sewa Tempat & Alat',
        'Pengisi Acara',
        'Perizinan',
        'Lain-lain',
      ]);
    });

    it('memastikan semua template vertikal memiliki boolean features.hasUnits', () => {
      Object.entries(TENANT_TEMPLATES).forEach(([type, tmpl]) => {
        expect(typeof tmpl.features.hasUnits).toBe('boolean');
        if (type === 'panitia') {
          expect(tmpl.features.hasUnits).toBe(false);
        } else {
          expect(tmpl.features.hasUnits).toBe(true);
        }
      });
    });

    it('menghasilkan roleLabel yang disesuaikan untuk panitia', () => {
      expect(roleLabel('admin', 'panitia')).toBe('Ketua Panitia');
      expect(roleLabel('bendahara', 'panitia')).toBe('Bendahara Panitia');
      expect(roleLabel('pengurus', 'panitia')).toBe('Koordinator Seksi');
      expect(roleLabel('anggota', 'panitia')).toBe('Anggota Panitia');
      expect(roleLabel('warga', 'panitia')).toBe('Anggota Panitia');
    });

    it('menghasilkan occupancyStatusLabel yang disesuaikan untuk panitia', () => {
      expect(occupancyStatusLabel('tenant', 'panitia')).toBe('Panitia Aktif');
      expect(occupancyStatusLabel('owner_occupied', 'panitia')).toBe('Ketua Panitia');
      expect(occupancyStatusLabel('checkout', 'panitia')).toBe('Selesai / Demisioner');
      expect(occupancyStatusLabel('booking', 'panitia')).toBe('Calon Panitia');
    });
  });
});
