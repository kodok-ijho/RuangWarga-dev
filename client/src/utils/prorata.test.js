import { describe, it, expect } from 'vitest';
import {
  parseDateParts,
  getDaysInMonth,
  calculateKosProrata,
  calculateProrataRent,
  formatProrataPreview,
} from './prorata';

describe('prorata.js (KOS-3.2)', () => {
  describe('parseDateParts & getDaysInMonth', () => {
    it('mengurai string tanggal kalender YYYY-MM-DD secara tepat tanpa pergeseran zona waktu', () => {
      const parts = parseDateParts('2026-10-19');
      expect(parts).toEqual({ year: 2026, month: 10, day: 19 });
    });

    it('mengembalikan jumlah hari bulan yang tepat termasuk tahun kabisat', () => {
      expect(getDaysInMonth(2026, 10)).toBe(31); // Oktober 2026
      expect(getDaysInMonth(2026, 2)).toBe(28);  // Februari 2026 (non-kabisat)
      expect(getDaysInMonth(2024, 2)).toBe(29);  // Februari 2024 (kabisat)
      expect(getDaysInMonth(2026, 4)).toBe(30);  // April 2026
    });

    it('menangani input tidak valid dengan anggun', () => {
      expect(parseDateParts(null)).toBeNull();
      expect(parseDateParts('')).toBeNull();
      expect(parseDateParts('bukan-tanggal')).toBeNull();
    });
  });

  describe('calculateKosProrata / calculateProrataRent', () => {
    it('19 Okt 2026, Rp1.500.000 menghasilkan prorata Rp629.000 (13 hari terpakai dari 31 hari)', () => {
      const res = calculateKosProrata('2026-10-19', 1500000, 'month_start_prorata');
      expect(res.billingCycle).toBe('month_start_prorata');
      expect(res.isProrata).toBe(true);
      expect(res.prorataDays).toBe(13); // 31 - 19 + 1 = 13
      expect(res.daysInMonth).toBe(31);
      expect(res.amount).toBe(629000); // floor(1500000 * 13 / 31 / 1000) * 1000 = 629000
      expect(res.serviceStart).toBe('2026-10-19');
      expect(res.serviceEnd).toBe('2026-10-31');
      expect(res.period).toBe('2026-10');
    });

    it('masuk tanggal 1 dinormalkan ke start_date dan nominal penuh (1 Okt 2026 → Rp1.500.000)', () => {
      const res = calculateKosProrata('2026-10-01', 1500000, 'month_start_prorata');
      expect(res.billingCycle).toBe('start_date');
      expect(res.isProrata).toBe(false);
      expect(res.amount).toBe(1500000);
      expect(res.prorataDays).toBe(31);
      expect(res.daysInMonth).toBe(31);
      expect(res.serviceStart).toBe('2026-10-01');
      expect(res.serviceEnd).toBe('2026-10-31');
    });

    it('siklus start_date tetap nominal penuh dan tidak prorata', () => {
      const res = calculateKosProrata('2026-10-19', 1500000, 'start_date');
      expect(res.billingCycle).toBe('start_date');
      expect(res.isProrata).toBe(false);
      expect(res.amount).toBe(1500000);
    });

    it('31 Okt 2026 (hari terakhir, 1 hari terpakai) → floor(1.500.000 * 1 / 31) dibulatkan ke bawah ke ribuan', () => {
      const res = calculateKosProrata('2026-10-31', 1500000, 'month_start_prorata');
      expect(res.isProrata).toBe(true);
      expect(res.prorataDays).toBe(1);
      // 1500000 * 1 / 31 = 48387.09... -> floor(... / 1000) * 1000 = 48000
      expect(res.amount).toBe(48000);
    });

    it('15 Feb 2024 (kabisat 29 hari) dengan sewa 1.000.000', () => {
      const res = calculateKosProrata('2024-02-15', 1000000, 'month_start_prorata');
      expect(res.daysInMonth).toBe(29);
      expect(res.prorataDays).toBe(15); // 29 - 15 + 1 = 15
      // 1000000 * 15 / 29 = 517241.37... -> 517000
      expect(res.amount).toBe(517000);
    });

    it('15 Feb 2025 (non-kabisat 28 hari) dengan sewa 1.000.000', () => {
      const res = calculateKosProrata('2025-02-15', 1000000, 'month_start_prorata');
      expect(res.daysInMonth).toBe(28);
      expect(res.prorataDays).toBe(14); // 28 - 15 + 1 = 14
      // 1000000 * 14 / 28 = 500000
      expect(res.amount).toBe(500000);
    });

    it('alias calculateProrataRent berfungsi identik dengan calculateKosProrata', () => {
      expect(calculateProrataRent('2026-10-19', 1500000)).toEqual(
        calculateKosProrata('2026-10-19', 1500000, 'month_start_prorata')
      );
    });
  });

  describe('formatProrataPreview', () => {
    it('memformat teks pratinjau nominal prorata bulan pertama dengan benar', () => {
      const text = formatProrataPreview('2026-10-19', 629000);
      expect(text).toContain('Okt 19–31');
      expect(text).toMatch(/629\.000/);
    });
  });
});
