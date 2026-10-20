import { describe, it, expect } from 'vitest';
import {
  getStartOfTodayJakarta,
  formatEventDateTimeWib,
  buildGoogleCalendarLink,
  buildEventShareText,
  buildEventShareUrl,
} from './eventLinks';

describe('eventLinks - Unit Tests (RTRW-3.2b)', () => {
  // ── (a) getStartOfTodayJakarta ─────────────────────────────────
  describe('(a) getStartOfTodayJakarta', () => {
    it('mengembalikan awal hari (00:00:00.000) zona WIB (UTC+7) dalam representasi Date', () => {
      // 2026-10-20 12:00:00 UTC = 2026-10-20 19:00:00 WIB
      const ref = new Date('2026-10-20T12:00:00.000Z');
      const startOfToday = getStartOfTodayJakarta(ref);

      // Awal hari 2026-10-20 00:00:00 WIB adalah 2026-10-19 17:00:00 UTC
      expect(startOfToday.toISOString()).toBe('2026-10-19T17:00:00.000Z');
    });

    it('bekerja dengan default waktu sekarang jika parameter tidak diberikan', () => {
      const startOfToday = getStartOfTodayJakarta();
      expect(startOfToday).toBeInstanceOf(Date);
      expect(Number.isNaN(startOfToday.getTime())).toBe(false);
    });
  });

  // ── (b) formatEventDateTimeWib ─────────────────────────────────
  describe('(b) formatEventDateTimeWib', () => {
    it('memformat rentang jam pada hari yang sama dengan akhiran WIB', () => {
      // 25 Okt 2026 00:00:00 UTC = 25 Okt 2026 07:00:00 WIB
      // 25 Okt 2026 03:00:00 UTC = 25 Okt 2026 10:00:00 WIB
      const startsAt = '2026-10-25T00:00:00.000Z';
      const endsAt = '2026-10-25T03:00:00.000Z';
      const formatted = formatEventDateTimeWib(startsAt, endsAt);

      expect(formatted).toBe('Minggu, 25 Oktober 2026, 07:00 - 10:00 WIB');
    });

    it('memformat hanya jam mulai jika ends_at kosong / null', () => {
      const startsAt = '2026-10-25T00:00:00.000Z';
      const formatted = formatEventDateTimeWib(startsAt, null);

      expect(formatted).toBe('Minggu, 25 Oktober 2026, 07:00 WIB');
    });

    it('memformat acara lintas hari dengan tanggal dan jam masing-masing', () => {
      const startsAt = '2026-10-24T12:00:00.000Z'; // 24 Okt 19:00 WIB
      const endsAt = '2026-10-24T23:00:00.000Z';   // 25 Okt 06:00 WIB
      const formatted = formatEventDateTimeWib(startsAt, endsAt);

      expect(formatted).toBe('Sabtu, 24 Oktober 2026 19:00 WIB - Minggu, 25 Oktober 2026 06:00 WIB');
    });

    it('mengembalikan string kosong jika starts_at tidak valid atau kosong', () => {
      expect(formatEventDateTimeWib('', '')).toBe('');
      expect(formatEventDateTimeWib(null)).toBe('');
      expect(formatEventDateTimeWib('tanggal-tidak-valid')).toBe('');
    });
  });

  // ── (c) buildGoogleCalendarLink ────────────────────────────────
  describe('(c) buildGoogleCalendarLink', () => {
    it('menghasilkan tautan Google Calendar yang valid dengan parameter dates dalam UTC', () => {
      const link = buildGoogleCalendarLink({
        title: 'Kerja Bakti Akbar',
        description: 'Pembersihan saluran air warga RT 05.',
        location: 'Balai RW 05',
        starts_at: '2026-10-25T00:00:00.000Z',
        ends_at: '2026-10-25T03:00:00.000Z',
      });

      expect(link.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
      expect(link).toContain('action=TEMPLATE');
      expect(link).toContain(`text=${encodeURIComponent('Kerja Bakti Akbar')}`);
      expect(link).toContain('dates=20261025T000000Z/20261025T030000Z');
      expect(link).toContain(`details=${encodeURIComponent('Pembersihan saluran air warga RT 05.')}`);
      expect(link).toContain(`location=${encodeURIComponent('Balai RW 05')}`);
    });

    it('menggunakan starts_at + 2 jam bila ends_at kosong atau null', () => {
      const link = buildGoogleCalendarLink({
        title: 'Rapat Ronda',
        starts_at: '2026-10-25T12:30:00.000Z',
        ends_at: null,
      });

      // starts_at = 12:30:00Z -> ends_at otomatis = 14:30:00Z
      expect(link).toContain('dates=20261025T123000Z/20261025T143000Z');
    });

    it('mengabaikan query details dan location jika bernilai falsy', () => {
      const link = buildGoogleCalendarLink({
        title: 'Acara Tanpa Lokasi',
        starts_at: '2026-10-25T00:00:00.000Z',
        ends_at: '2026-10-25T02:00:00.000Z',
      });

      expect(link).not.toContain('details=');
      expect(link).not.toContain('location=');
    });

    it('mengembalikan string kosong jika starts_at tidak ada atau tidak valid', () => {
      expect(buildGoogleCalendarLink({})).toBe('');
      expect(buildGoogleCalendarLink({ starts_at: 'bukan-tanggal' })).toBe('');
    });
  });

  // ── (d) buildEventShareText & buildEventShareUrl ───────────────
  describe('(d) buildEventShareText & buildEventShareUrl', () => {
    it('menyusun pesan WhatsApp lengkap dengan judul, waktu WIB, lokasi, deskripsi, dan link', () => {
      const event = {
        title: 'Kerja Bakti Warga',
        starts_at: '2026-10-25T00:00:00.000Z', // 07:00 WIB
        ends_at: '2026-10-25T03:00:00.000Z',   // 10:00 WIB
        location: 'Pos Satpam Blok A',
        description: 'Diharapkan membawa sapu lidi dan cangkul masing-masing.',
      };
      const appUrl = 'https://ruangwarga.test/t/tenant-123/events';

      const text = buildEventShareText(event, appUrl);

      expect(text).toContain('Kerja Bakti Warga');
      expect(text).toContain('📅 Waktu: Minggu, 25 Oktober 2026, 07:00 - 10:00 WIB');
      expect(text).toContain('📍 Lokasi: Pos Satpam Blok A');
      expect(text).toContain('Diharapkan membawa sapu lidi dan cangkul masing-masing.');
      expect(text).toContain('Selengkapnya: https://ruangwarga.test/t/tenant-123/events');
    });

    it('memotong deskripsi panjang di sekitar 400 karakter dengan elipsis', () => {
      const longDesc = 'X'.repeat(500);
      const event = {
        title: 'Acara Deskripsi Panjang',
        starts_at: '2026-10-25T00:00:00.000Z',
        description: longDesc,
      };

      const text = buildEventShareText(event);

      const expectedSnippet = `${'X'.repeat(400)}…`;
      expect(text).toContain(expectedSnippet);
      expect(text).not.toContain('X'.repeat(401));
    });

    it('menangani properti opsional yang kosong secara aman', () => {
      const event = {
        title: 'Pengajian Rutin',
        starts_at: '2026-10-25T00:00:00.000Z',
      };

      const text = buildEventShareText(event);

      expect(text).toContain('Pengajian Rutin');
      expect(text).toContain('📅 Waktu: Minggu, 25 Oktober 2026, 07:00 WIB');
      expect(text).not.toContain('📍 Lokasi:');
      expect(text).not.toContain('Selengkapnya:');
    });

    it('buildEventShareUrl menghasilkan tautan wa.me dengan teks ter-encode', () => {
      const event = {
        title: 'Rapat RW',
        starts_at: '2026-10-25T12:00:00.000Z',
      };
      const url = buildEventShareUrl(event, 'https://ruangwarga.test');

      expect(url.startsWith('https://wa.me/?text=')).toBe(true);
      expect(url).toContain(encodeURIComponent('Rapat RW'));
    });
  });
});
