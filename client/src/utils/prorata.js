/**
 * prorata.js — Helper murni untuk kalkulasi tagihan sewa prorata kos (KOS-3).
 *
 * Aturan:
 * - default 'start_date': tagihan dihitung penuh per tanggal masuk
 * - 'month_start_prorata':
 *   - hari masuk = 1: dinormalkan menjadi 'start_date' (nominal penuh)
 *   - hari masuk > 1:
 *     hari_terpakai = hari_dalam_bulan - tanggal_masuk + 1
 *     nominal = floor(rent * hari_terpakai / hari_dalam_bulan / 1000) * 1000
 *
 * Catatan Zona Waktu:
 * Menggunakan penguraian string kalender (YYYY-MM-DD) dan Date.UTC
 * untuk mencegah pergeseran zona waktu antara UTC dan WIB/Asia/Jakarta.
 */

const INDO_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

/**
 * Parsing tanggal kalender 'YYYY-MM-DD' secara murni tanpa pergeseran zona waktu
 *
 * @param {string|Date} dateVal
 * @returns {{ year: number, month: number, day: number } | null}
 */
export function parseDateParts(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal === 'string') {
    const cleanStr = dateVal.trim().slice(0, 10);
    const parts = cleanStr.split('-').map(Number);
    if (parts.length === 3 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1]) && !Number.isNaN(parts[2])) {
      return { year: parts[0], month: parts[1], day: parts[2] };
    }
  }
  if (dateVal instanceof Date && !Number.isNaN(dateVal.getTime())) {
    return {
      year: dateVal.getUTCFullYear(),
      month: dateVal.getUTCMonth() + 1,
      day: dateVal.getUTCDate(),
    };
  }
  return null;
}

/**
 * Menghitung jumlah hari dalam bulan tertentu berbasis UTC
 *
 * @param {number} year
 * @param {number} month - 1-indexed (1 = Januari, 12 = Desember)
 * @returns {number}
 */
export function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Menghitung nominal sewa prorata kos (KOS-3)
 *
 * @param {string} startDate - Tanggal mulai sewa (YYYY-MM-DD)
 * @param {number|string} rentPrice - Harga sewa per bulan
 * @param {string} [billingCycle='month_start_prorata'] - 'start_date' | 'month_start_prorata'
 * @param {Array<{ name: string, amount: number|string }>} [additionalFees=[]] - Daftar biaya tambahan
 * @returns {{
 *   billingCycle: 'start_date' | 'month_start_prorata',
 *   isProrata: boolean,
 *   amount: number,
 *   daysInMonth: number,
 *   prorataDays: number,
 *   serviceStart: string,
 *   serviceEnd: string,
 *   period: string,
 *   monthLabel: string,
 *   lineItems: Array<{ name: string, amount: number }>,
 *   rentPrice: number,
 *   totalAdditionalFees: number,
 * }}
 */
export function calculateKosProrata(
  startDate,
  rentPrice,
  billingCycle = 'month_start_prorata',
  additionalFees = []
) {
  const parts = parseDateParts(startDate);
  const rawRent = Math.max(0, Math.floor(Number(rentPrice) || 0));
  const fees = Array.isArray(additionalFees)
    ? additionalFees
        .filter((f) => f && typeof f === 'object' && f.name && String(f.name).trim())
        .map((f) => ({
          name: String(f.name).trim(),
          amount: Math.max(0, Math.floor(Number(f.amount) || 0)),
        }))
    : [];
  const totalAdditionalFees = fees.reduce((sum, f) => sum + f.amount, 0);
  const totalBase = rawRent + totalAdditionalFees;

  if (!parts) {
    const baseLineItems = [{ name: 'Sewa', amount: rawRent }, ...fees];
    return {
      billingCycle: billingCycle === 'month_start_prorata' ? 'month_start_prorata' : 'start_date',
      isProrata: false,
      amount: totalBase,
      daysInMonth: 30,
      prorataDays: 30,
      serviceStart: '',
      serviceEnd: '',
      period: '',
      monthLabel: '',
      lineItems: baseLineItems,
      rentPrice: rawRent,
      totalAdditionalFees,
    };
  }

  const { year, month, day } = parts;
  const daysInMonth = getDaysInMonth(year, month);
  const period = `${year}-${String(month).padStart(2, '0')}`;
  const monthLabel = INDO_MONTH_NAMES[month - 1] || '';

  // Tanggal 1 -> nominal penuh dan siklus dinormalkan ke start_date
  if (billingCycle !== 'month_start_prorata' || day === 1) {
    const lineItems = [{ name: 'Sewa', amount: rawRent }, ...fees];
    return {
      billingCycle: 'start_date',
      isProrata: false,
      amount: totalBase,
      daysInMonth,
      prorataDays: daysInMonth,
      serviceStart: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      serviceEnd: `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`,
      period,
      monthLabel,
      lineItems,
      rentPrice: rawRent,
      totalAdditionalFees,
    };
  }

  // Hari terpakai = hari dalam bulan - tanggal masuk + 1
  const prorataDays = Math.max(1, daysInMonth - day + 1);

  // total prorata = floor((sewa + biaya) * hari_terpakai / hari_dalam_bulan / 1000) * 1000
  const nominal = Math.floor((totalBase * prorataDays / daysInMonth) / 1000) * 1000;

  // line_items prorata: per fee floor ke rupiah, baris Sewa = total prorata - jumlah biaya prorata
  const feeLineItems = fees.map((f) => ({
    name: f.name,
    amount: Math.floor(f.amount * prorataDays / daysInMonth),
  }));
  const sumFeeLines = feeLineItems.reduce((acc, f) => acc + f.amount, 0);
  const rentLineAmount = nominal - sumFeeLines;
  const lineItems = [{ name: 'Sewa', amount: rentLineAmount }, ...feeLineItems];

  return {
    billingCycle: 'month_start_prorata',
    isProrata: true,
    amount: nominal,
    daysInMonth,
    prorataDays,
    serviceStart: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    serviceEnd: `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`,
    period,
    monthLabel,
    lineItems,
    rentPrice: rawRent,
    totalAdditionalFees,
  };
}

/**
 * Format string pratinjau prorata bulan pertama (mis. "Okt 19–31: Rp629.000")
 *
 * @param {string} startDate - Tanggal mulai (YYYY-MM-DD)
 * @param {number} amount - Nominal prorata
 * @returns {string}
 */
export function formatProrataPreview(startDate, amount) {
  const parts = parseDateParts(startDate);
  if (!parts) return '';
  const { year, month, day } = parts;
  const daysInMonth = getDaysInMonth(year, month);
  const monthLabel = INDO_MONTH_NAMES[month - 1] || '';
  const formattedNominal = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);

  return `${monthLabel} ${day}–${daysInMonth}: ${formattedNominal}`;
}

export const calculateProrataRent = calculateKosProrata;
