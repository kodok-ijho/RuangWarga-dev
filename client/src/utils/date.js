/**
 * Helper tanggal lokal (PANITIA-1F.6)
 *
 * Mengembalikan tanggal lokal dalam format YYYY-MM-DD.
 * Berbeda dari toISOString() yang berbasis UTC (yang bisa bergeser ke hari sebelumnya
 * di zona waktu seperti UTC+7 bila dipanggil dini hari), fungsi ini mengambil
 * tahun, bulan, dan tanggal lokal dari perangkat atau objek Date yang diberikan.
 *
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Tanggal dalam format YYYY-MM-DD
 */
export function getLocalDateString(date = new Date()) {
  if (!date && date !== 0) return '';

  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match && /[+-]\d{2}:\d{2}$/.test(date)) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
