/**
 * eventLinks.js
 * Helper murni (tanpa React) untuk pembuatan link kalender Google Calendar,
 * pembentukan teks Bagikan Acara ke WhatsApp, dan format tanggal/jam zona WIB (Asia/Jakarta).
 *
 * Ref: docs/handoff/RTRW-3.md § RTRW-3.2
 */

/**
 * Mendapatkan objek Date untuk awal hari (00:00:00.000) pada zona waktu Asia/Jakarta (WIB, UTC+7).
 *
 * @param {Date|string|number} [referenceDate=new Date()]
 * @returns {Date}
 */
export function getStartOfTodayJakarta(referenceDate = new Date()) {
  const d = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return new Date(`${year}-${month}-${day}T00:00:00+07:00`);
}

/**
 * Mengubah objek Date ke format tanggal UTC kompak standar Google Calendar (YYYYMMDDTHHMMSSZ).
 *
 * @param {Date} date
 * @returns {string} Contoh: '20261025T070000Z'
 */
function formatUtcForGCal(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Membuat link template Google Calendar untuk menambahkan acara ke kalender Google.
 * Parameter waktu dikonversi ke UTC dalam format YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ.
 * Jika ends_at kosong atau tidak valid, durasi otomatis diatur starts_at + 2 jam.
 *
 * @param {object} params
 * @param {string} [params.title] - Judul acara
 * @param {string} [params.description] - Deskripsi/detail acara
 * @param {string} [params.location] - Lokasi acara
 * @param {string|Date} params.starts_at - Waktu mulai acara (ISO string atau Date)
 * @param {string|Date} [params.ends_at] - Waktu selesai acara (ISO string atau Date)
 * @returns {string} URL template Google Calendar
 */
export function buildGoogleCalendarLink({
  title,
  description,
  location,
  starts_at,
  ends_at,
} = {}) {
  if (!starts_at) return '';
  const startDate = new Date(starts_at);
  if (Number.isNaN(startDate.getTime())) return '';

  let endDate;
  if (ends_at) {
    const parsedEnd = new Date(ends_at);
    endDate = Number.isNaN(parsedEnd.getTime())
      ? new Date(startDate.getTime() + 2 * 60 * 60 * 1000)
      : parsedEnd;
  } else {
    endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  }

  const datesParam = `${formatUtcForGCal(startDate)}/${formatUtcForGCal(endDate)}`;

  const queryParts = [
    'action=TEMPLATE',
    `text=${encodeURIComponent(title || '')}`,
    `dates=${datesParam}`,
  ];

  if (description) {
    queryParts.push(`details=${encodeURIComponent(description)}`);
  }
  if (location) {
    queryParts.push(`location=${encodeURIComponent(location)}`);
  }

  return `https://calendar.google.com/calendar/render?${queryParts.join('&')}`;
}

/**
 * Memformat waktu mulai dan selesai acara ke dalam format ramah pembaca zona Asia/Jakarta (WIB).
 * Contoh output:
 * - "Minggu, 25 Oktober 2026, 07:00 - 10:00 WIB" (acara satu hari dengan rentang jam)
 * - "Minggu, 25 Oktober 2026, 07:00 WIB" (acara tanpa ends_at)
 * - "Sabtu, 24 Oktober 2026 19:00 WIB - Minggu, 25 Oktober 2026 06:00 WIB" (lintas hari)
 *
 * @param {string|Date} startsAt
 * @param {string|Date} [endsAt]
 * @returns {string}
 */
export function formatEventDateTimeWib(startsAt, endsAt) {
  if (!startsAt) return '';
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';

  const dateFormatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const timeFormatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const startDateStr = dateFormatter.format(start);
  const startTimeStr = timeFormatter.format(start).replace('.', ':');

  if (!endsAt) {
    return `${startDateStr}, ${startTimeStr} WIB`;
  }

  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) {
    return `${startDateStr}, ${startTimeStr} WIB`;
  }

  const endDateStr = dateFormatter.format(end);
  const endTimeStr = timeFormatter.format(end).replace('.', ':');

  if (startDateStr === endDateStr) {
    return `${startDateStr}, ${startTimeStr} - ${endTimeStr} WIB`;
  }

  return `${startDateStr} ${startTimeStr} WIB - ${endDateStr} ${endTimeStr} WIB`;
}

/**
 * Membentuk teks ringkasan acara untuk dibagikan via WhatsApp.
 * Memuat: judul, tanggal & jam WIB, lokasi, potongan deskripsi (~400 karakter dengan elipsis), dan link aplikasi.
 *
 * @param {object} event - Objek acara ({ title, description, location, starts_at, ends_at })
 * @param {string} [appUrl] - URL aplikasi/halaman detail acara
 * @returns {string}
 */
export function buildEventShareText(event = {}, appUrl = '') {
  const title = event.title || 'Acara Warga';
  const timeStr = formatEventDateTimeWib(event.starts_at, event.ends_at);
  const location = event.location ? String(event.location).trim() : '';
  const descRaw = typeof event.description === 'string' ? event.description.trim() : '';
  const descSnippet = descRaw.length > 400 ? `${descRaw.slice(0, 400)}…` : descRaw;
  const link = appUrl ? String(appUrl).trim() : '';

  const sections = [];

  // 1. Judul
  sections.push(title);

  // 2. Waktu & Lokasi
  const metaLines = [];
  if (timeStr) {
    metaLines.push(`📅 Waktu: ${timeStr}`);
  }
  if (location) {
    metaLines.push(`📍 Lokasi: ${location}`);
  }
  if (metaLines.length > 0) {
    sections.push(metaLines.join('\n'));
  }

  // 3. Deskripsi acara (bila ada)
  if (descSnippet) {
    sections.push(descSnippet);
  }

  // 4. Link detail acara (bila ada)
  if (link) {
    sections.push(`Selengkapnya: ${link}`);
  }

  return sections.join('\n\n');
}

/**
 * Membentuk URL wa.me untuk membagikan acara langsung ke WhatsApp.
 *
 * @param {object} event
 * @param {string} [appUrl]
 * @returns {string}
 */
export function buildEventShareUrl(event, appUrl) {
  const text = buildEventShareText(event, appUrl);
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
