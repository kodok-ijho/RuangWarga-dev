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

/**
 * Format tanggal dalam zona waktu Indonesia Barat (WIB / Asia/Jakarta) (PANITIA-ARISAN-1F / F.4)
 *
 * Nilai tanggal saja (YYYY-MM-DD) dibaca sebagai tanggal kalender tanpa pergeseran zona.
 *
 * @param {string|number|Date} value - Nilai tanggal ISO atau YYYY-MM-DD
 * @param {Intl.DateTimeFormatOptions} [opts] - Opsi Intl tambahan
 * @returns {string} Tanggal terformat (mis. "2 Feb 2026") atau '-' jika kosong
 */
export function formatDateWIB(value, opts = {}) {
  if (!value && value !== 0) return '-';

  const defaultOpts = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };
  const options = {
    ...defaultOpts,
    ...opts,
    timeZone: opts?.timeZone || 'Asia/Jakarta',
  };

  let dateObj;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [y, m, d] = value.trim().split('-').map(Number);
    // Jam 12:00:00 WIB (UTC+7) setara dengan 05:00:00 UTC, selalu berada di tengah hari tanggal tersebut
    dateObj = new Date(Date.UTC(y, m - 1, d, 5, 0, 0));
  } else {
    dateObj = value instanceof Date ? value : new Date(value);
  }

  if (isNaN(dateObj.getTime())) {
    return typeof value === 'string' ? value : '-';
  }

  return new Intl.DateTimeFormat('id-ID', options).format(dateObj);
}
