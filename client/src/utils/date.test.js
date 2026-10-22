import { describe, it, expect } from 'vitest';
import { getLocalDateString, formatDateWIB } from './date';

describe('getLocalDateString (PANITIA-1F.6)', () => {
  it('getLocalDateString pada 2026-11-01T00:30:00+07:00 menghasilkan 2026-11-01', () => {
    expect(getLocalDateString(new Date(2026, 10, 1, 0, 30))).toBe('2026-11-01');
    expect(getLocalDateString('2026-11-01T00:30:00+07:00')).toBe('2026-11-01');
  });

  it('menggunakan waktu lokal saat ini bila dipanggil tanpa argumen', () => {
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(getLocalDateString()).toBe(expected);
  });

  it('menangani input tidak valid dengan aman', () => {
    expect(getLocalDateString(null)).toBe('');
    expect(getLocalDateString('invalid-date')).toBe('');
  });
});

describe('formatDateWIB (PANITIA-ARISAN-1F / F.4)', () => {
  it('formatDateWIB 2026-02-01T18:30:00Z menghasilkan 2 Feb 2026 di TZ apa pun', () => {
    expect(formatDateWIB('2026-02-01T18:30:00Z')).toBe('2 Feb 2026');
  });

  it('nilai tanggal saja YYYY-MM-DD dibaca sebagai tanggal kalender tanpa pergeseran zona', () => {
    expect(formatDateWIB('2026-02-01')).toBe('1 Feb 2026');
    expect(formatDateWIB('2026-11-20')).toBe('20 Nov 2026');
  });

  it('menangani null/undefined dan string kosong dengan aman mengembalikan "-"', () => {
    expect(formatDateWIB(null)).toBe('-');
    expect(formatDateWIB(undefined)).toBe('-');
    expect(formatDateWIB('')).toBe('-');
  });
});
