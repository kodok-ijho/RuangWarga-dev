import { describe, it, expect } from 'vitest';
import { getLocalDateString } from './date';

describe('getLocalDateString (PANITIA-1F.6)', () => {
  it('getLocalDateString pada 2026-11-01T00:30:00+07:00 menghasilkan 2026-11-01', () => {
    expect(getLocalDateString(new Date('2026-11-01T00:30:00+07:00'))).toBe('2026-11-01');
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
