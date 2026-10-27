/**
 * rentDueReminder.js
 * Helper murni untuk kalkulasi tanggal pengingat jatuh tempo sewa dan banner portal penyewa (KOS-5.2b).
 * Menghitung selisih hari kalender dalam zona waktu Asia/Jakarta (WIB) tanpa pergeseran zona waktu.
 */

import { formatRupiah } from '../services/dataHelpers';

/**
 * Mengambil tanggal kalender hari ini dalam zona waktu Asia/Jakarta (WIB) sebagai string 'YYYY-MM-DD'.
 *
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Contoh: '2026-10-27'
 */
export function getTodayWib(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Menghitung selisih hari kalender murni antara dueDateStr ('YYYY-MM-DD') dan hari ini di WIB.
 * Menggunakan perbandingan UTC dari komponen tahun, bulan, hari agar imun terhadap DST dan timezone offset lokal.
 *
 * Nilai kembalian:
 * > 0: Belum jatuh tempo (misal 3 = 3 hari lagi)
 * = 0: Jatuh tempo hari ini
 * < 0: Sudah lewat / terlambat (misal -5 = terlambat 5 hari)
 *
 * @param {string} dueDateStr - Tanggal jatuh tempo ('YYYY-MM-DD')
 * @param {Date|string|number} [todayDate=new Date()] - Waktu acuan
 * @returns {number|null}
 */
export function getDiffDaysWib(dueDateStr, todayDate = new Date()) {
  if (!dueDateStr) return null;
  const match = String(dueDateStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;

  const [, dueY, dueM, dueD] = match.map(Number);
  const todayWibStr = getTodayWib(todayDate);
  const [, todayY, todayM, todayD] = todayWibStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/).map(Number);

  const dueUtc = Date.UTC(dueY, dueM - 1, dueD);
  const todayUtc = Date.UTC(todayY, todayM - 1, todayD);

  return Math.round((dueUtc - todayUtc) / (24 * 60 * 60 * 1000));
}

/**
 * Format nama periode tagihan (misal '2026-10' -> 'Oktober').
 *
 * @param {string} periodStr - 'YYYY-MM'
 * @returns {string}
 */
export function formatPeriodMonthOnly(periodStr) {
  if (!periodStr || typeof periodStr !== 'string' || !periodStr.includes('-')) {
    return periodStr || '';
  }
  const [, m] = periodStr.split('-');
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return months[parseInt(m, 10) - 1] || periodStr;
}

/**
 * Membentuk informasi banner pengingat jatuh tempo untuk tagihan penyewa (KOS-5.2b Requirement 9).
 *
 * Aturan tampilan:
 * - <= 3 hari sebelum jatuh tempo (diffDays 1..3): 'Tagihan <periode> jatuh tempo N hari lagi'
 * - Hari jatuh tempo (diffDays === 0): 'Tagihan <periode> jatuh tempo hari ini'
 * - Lewat jatuh tempo (diffDays < 0): 'Tagihan <periode> terlambat N hari' (+ denda bila ada)
 * - Lebih dari 3 hari sebelum jatuh tempo: null (tidak perlu banner peringatan)
 *
 * @param {object} bill - Objek billing_item { due_date, status, period, late_fee }
 * @param {Date|string|number} [todayDate=new Date()]
 * @returns {object|null}
 */
export function getRentDueBannerInfo(bill, todayDate = new Date()) {
  if (!bill) return null;
  const status = String(bill.status || '').toLowerCase();
  if (status !== 'unpaid' && status !== 'overdue') {
    return null;
  }

  const dueDate = bill.due_date;
  if (!dueDate) return null;

  const diffDays = getDiffDaysWib(dueDate, todayDate);
  if (diffDays === null) return null;

  const periodMonth = formatPeriodMonthOnly(bill.period);
  const periodPrefix = periodMonth ? `Tagihan ${periodMonth}` : 'Tagihan';
  const lateFee = Number(bill.late_fee || 0);

  if (diffDays > 3) {
    return null;
  }

  if (diffDays > 0) {
    // 1 sampai 3 hari lagi
    return {
      type: 'approaching',
      diffDays,
      headline: `${periodPrefix} jatuh tempo ${diffDays} hari lagi`,
      shortText: `Jatuh tempo ${diffDays} hari lagi`,
      variant: 'amber',
      isOverdue: false,
      lateFee,
    };
  }

  if (diffDays === 0) {
    // Hari ini
    return {
      type: 'today',
      diffDays: 0,
      headline: `${periodPrefix} jatuh tempo hari ini`,
      shortText: 'Jatuh tempo hari ini',
      variant: 'amber',
      isOverdue: false,
      lateFee,
    };
  }

  // diffDays < 0 (Terlambat)
  const daysLate = Math.abs(diffDays);
  const feeSuffix = lateFee > 0 ? `, denda Rp${Number(lateFee).toLocaleString('id-ID')}` : '';

  return {
    type: 'overdue',
    diffDays,
    daysLate,
    headline: `${periodPrefix} terlambat ${daysLate} hari${feeSuffix}`,
    shortText: `Terlambat ${daysLate} hari${feeSuffix}`,
    variant: 'rose',
    isOverdue: true,
    lateFee,
  };
}
