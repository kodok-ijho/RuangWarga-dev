/**
 * waReminder.js
 * Helper murni (tanpa React) untuk fitur pengingat tagihan via WhatsApp.
 */

/**
 * Normalisasi nomor HP untuk tautan WhatsApp (wa.me).
 * Aturan:
 * - Ambil digit saja.
 * - Awalan '0' diganti '62'.
 * - Awalan '62' dibiarkan.
 * - Awalan '8' diberi '62' di depan.
 * - Kurang dari 10 digit atau lebih dari 15 digit dianggap tidak valid dan mengembalikan null.
 *
 * @param {string|number} phone
 * @returns {string|null}
 */
export function normalizeWaPhone(phone) {
  if (phone == null) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;

  let normalized = digits;
  if (digits.startsWith('0')) {
    normalized = '62' + digits.slice(1);
  } else if (digits.startsWith('62')) {
    normalized = digits;
  } else if (digits.startsWith('8')) {
    normalized = '62' + digits;
  }

  if (normalized.length < 10 || normalized.length > 15) {
    return null;
  }

  return normalized;
}

/**
 * Ambil daftar tagihan 'unpaid' dengan period <= currentPeriod ('YYYY-MM'),
 * diurutkan berdasarkan periode secara ascending.
 *
 * @param {Array} cells - Sel matriks satu baris
 * @param {string} [currentPeriod] - Batas periode maksimum ('YYYY-MM')
 * @returns {Array} Array objek bill
 */
export function getUnpaidBillsForReminder(cells, currentPeriod) {
  if (!Array.isArray(cells)) return [];

  const unpaidBills = [];
  for (const item of cells) {
    if (!item) continue;
    const bill = item.bill ? item.bill : (item.period && (item.amount !== undefined || item.status) ? item : null);
    if (!bill) continue;

    const status = bill.status || item.status;
    const period = bill.period || item.period;

    if (status === 'unpaid' && period) {
      if (!currentPeriod || String(period) <= String(currentPeriod)) {
        unpaidBills.push(bill);
      }
    }
  }

  return unpaidBills.sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')));
}

/**
 * Mengambil periode bulan berjalan ('YYYY-MM') dalam zona waktu Asia/Jakarta.
 *
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Contoh: '2026-10'
 */
export function getCurrentPeriodJakarta(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

/**
 * Format nama bulan bahasa Indonesia lengkap + tahun ('Oktober 2026').
 */
function formatPeriodLong(period) {
  if (!period || typeof period !== 'string' || !period.includes('-')) {
    return String(period || '-');
  }
  const [y, m] = period.split('-');
  const monthsLong = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const monthName = monthsLong[parseInt(m, 10) - 1] || m;
  return `${monthName} ${y}`;
}

/**
 * Format tanggal jatuh tempo Indonesia ringkas ('10 Okt 2026').
 */
function formatDueDate(dueDateStr) {
  if (!dueDateStr) return '';
  const match = String(dueDateStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
  if (match) {
    const [, y, m, d] = match;
    const monthName = monthsShort[parseInt(m, 10) - 1] || m;
    return `${parseInt(d, 10)} ${monthName} ${y}`;
  }
  const d = new Date(dueDateStr);
  if (!isNaN(d.getTime())) {
    return `${d.getDate()} ${monthsShort[d.getMonth()]} ${d.getFullYear()}`;
  }
  return String(dueDateStr);
}

/**
 * Format nominal Rupiah tanpa desimal (mis. 'Rp150.000').
 */
function formatRupiahWa(amount) {
  return 'Rp' + Number(amount || 0).toLocaleString('id-ID');
}

/**
 * Susun pesan WhatsApp pengingat tagihan.
 *
 * Contoh:
 * Halo {nama},
 *
 * Pengingat tagihan {billLabel} {unitLabel} {label unit}:
 * - Oktober 2026: Rp150.000 (jatuh tempo 10 Okt 2026)
 * Total: Rp150.000
 *
 * Pembayaran bisa ditransfer ke {bank} {nomor rekening} a.n. {pemilik}, lalu unggah bukti bayar di aplikasi: {appUrl}
 *
 * Terima kasih.
 * Pengurus {tenantName}
 *
 * @param {object} params
 * @param {string} [params.residentName]
 * @param {string} [params.billLabel]
 * @param {string} [params.unitLabel]
 * @param {string} [params.unitName]
 * @param {Array} params.bills
 * @param {object|null} [params.bankAccount]
 * @param {string} [params.appUrl]
 * @param {string} [params.tenantName]
 * @returns {string}
 */
export function buildBillReminderMessage({
  residentName,
  billLabel,
  unitLabel,
  unitName,
  bills = [],
  bankAccount,
  appUrl,
  tenantName,
}) {
  const name = residentName && String(residentName).trim() ? String(residentName).trim() : 'Bapak/Ibu';
  const bLabel = billLabel && String(billLabel).trim() ? String(billLabel).trim() : 'Tagihan';
  const uLabel = unitLabel && String(unitLabel).trim() ? String(unitLabel).trim() : 'Unit';
  const uName = unitName && String(unitName).trim() ? String(unitName).trim() : '';

  const headerUnit = ['Pengingat tagihan', bLabel, uLabel, uName].filter(Boolean).join(' ') + ':';

  let totalAmount = 0;
  const billLines = (Array.isArray(bills) ? bills : []).map((bill) => {
    const amount = Number(bill.amount || 0) + Number(bill.late_fee || 0);
    totalAmount += amount;
    const monthText = formatPeriodLong(bill.period);
    const amountText = formatRupiahWa(amount);
    const dueText = formatDueDate(bill.due_date);
    const dueSuffix = dueText ? ` (jatuh tempo ${dueText})` : '';
    return `- ${monthText}: ${amountText}${dueSuffix}`;
  });

  const totalLine = `Total: ${formatRupiahWa(totalAmount)}`;
  const tagihanSection = [...billLines, totalLine].join('\n');

  const resolvedAppUrl = appUrl || '';
  const hasCompleteBank = Boolean(
    bankAccount &&
      typeof bankAccount === 'object' &&
      bankAccount.bank_name &&
      String(bankAccount.bank_name).trim() &&
      bankAccount.account_number &&
      String(bankAccount.account_number).trim() &&
      bankAccount.account_holder &&
      String(bankAccount.account_holder).trim()
  );

  let paymentLine = '';
  if (hasCompleteBank) {
    const bank = String(bankAccount.bank_name).trim();
    const accNo = String(bankAccount.account_number).trim();
    const holder = String(bankAccount.account_holder).trim();
    paymentLine = `Pembayaran bisa ditransfer ke ${bank} ${accNo} a.n. ${holder}, lalu unggah bukti bayar di aplikasi: ${resolvedAppUrl}`;
  } else {
    paymentLine = `Konfirmasi pembayaran di aplikasi: ${resolvedAppUrl}`;
  }

  const tName = tenantName && String(tenantName).trim() ? String(tenantName).trim() : '';
  const senderLine = tName ? `Pengurus ${tName}` : 'Pengurus';
  const closingSection = `Terima kasih.\n${senderLine}`;

  return `Halo ${name},\n\n${headerUnit}\n${tagihanSection}\n\n${paymentLine}\n\n${closingSection}`;
}

/**
 * Susun pesan WhatsApp pengingat iuran panitia per acara (PANITIA-2.2).
 * Pola teks mengikuti buildBillReminderMessage.
 *
 * @param {object} params
 * @param {string} [params.memberName]
 * @param {string} [params.programName]
 * @param {number} params.amount
 * @param {string} [params.dueDate]
 * @param {object|null} [params.bankAccount]
 * @param {string} [params.tenantName]
 * @param {string} [params.appUrl]
 * @returns {string}
 */
export function buildProgramDuesReminderMessage({
  memberName,
  programName,
  amount,
  dueDate,
  bankAccount,
  tenantName,
  appUrl,
}) {
  const name = memberName && String(memberName).trim() ? String(memberName).trim() : 'Bapak/Ibu';
  const pName = programName && String(programName).trim() ? String(programName).trim() : 'Acara';

  const header = `Pengingat iuran acara ${pName}:`;

  const amountVal = Number(amount || 0);
  const amountText = formatRupiahWa(amountVal);
  const dueText = formatDueDate(dueDate);
  const dueSuffix = dueText ? ` (jatuh tempo ${dueText})` : '';

  const tagihanLine = `- Iuran ${pName}: ${amountText}${dueSuffix}`;
  const totalLine = `Total: ${amountText}`;
  const tagihanSection = `${tagihanLine}\n${totalLine}`;

  const resolvedAppUrl = appUrl || '';
  const hasCompleteBank = Boolean(
    bankAccount &&
      typeof bankAccount === 'object' &&
      bankAccount.bank_name &&
      String(bankAccount.bank_name).trim() &&
      bankAccount.account_number &&
      String(bankAccount.account_number).trim() &&
      bankAccount.account_holder &&
      String(bankAccount.account_holder).trim()
  );

  let paymentLine = '';
  if (hasCompleteBank) {
    const bank = String(bankAccount.bank_name).trim();
    const accNo = String(bankAccount.account_number).trim();
    const holder = String(bankAccount.account_holder).trim();
    paymentLine = `Pembayaran bisa ditransfer ke ${bank} ${accNo} a.n. ${holder}, lalu unggah bukti bayar di aplikasi: ${resolvedAppUrl}`;
  } else {
    paymentLine = `Konfirmasi pembayaran di aplikasi: ${resolvedAppUrl}`;
  }

  const tName = tenantName && String(tenantName).trim() ? String(tenantName).trim() : '';
  const senderLine = tName ? `Pengurus ${tName}` : 'Pengurus';
  const closingSection = `Terima kasih.\n${senderLine}`;

  return `Halo ${name},\n\n${header}\n${tagihanSection}\n\n${paymentLine}\n\n${closingSection}`;
}

/**
 * Memformat tanggal dan jam dalam zona waktu Asia/Jakarta (WIB).
 * Contoh output: "22 Oktober 2026, 17:30 WIB"
 *
 * @param {Date|string|number} dateInput
 * @returns {string}
 */
export function formatDateTimeWib(dateInput) {
  if (!dateInput) return '-';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '-';

  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const day = parts.find((p) => p.type === 'day')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const year = parts.find((p) => p.type === 'year')?.value;
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;

  return `${day} ${month} ${year}, ${hour}:${minute} WIB`;
}

/**
 * Susun pesan WhatsApp pengingat setoran arisan per putaran (ARISAN-1.2).
 *
 * @param {object} params
 * @param {string} [params.memberName]
 * @param {string} [params.roundLabel]
 * @param {number} params.amount
 * @param {string} [params.dueDate]
 * @param {object|null} [params.bankAccount]
 * @param {string} [params.tenantName]
 * @param {string} [params.appUrl]
 * @returns {string}
 */
export function buildArisanReminderMessage({
  memberName,
  roundLabel,
  amount,
  dueDate,
  bankAccount,
  tenantName,
  appUrl,
}) {
  const name = memberName && String(memberName).trim() ? String(memberName).trim() : 'Bapak/Ibu';
  const rLabel = roundLabel && String(roundLabel).trim() ? String(roundLabel).trim() : 'Arisan';

  const header = `Pengingat setoran arisan ${rLabel}:`;

  const amountVal = Number(amount || 0);
  const amountText = formatRupiahWa(amountVal);
  const dueText = formatDueDate(dueDate);
  const dueSuffix = dueText ? ` (jatuh tempo ${dueText})` : '';

  const tagihanLine = `- Setoran ${rLabel}: ${amountText}${dueSuffix}`;
  const totalLine = `Total: ${amountText}`;
  const tagihanSection = `${tagihanLine}\n${totalLine}`;

  const resolvedAppUrl = appUrl || '';
  const hasCompleteBank = Boolean(
    bankAccount &&
      typeof bankAccount === 'object' &&
      bankAccount.bank_name &&
      String(bankAccount.bank_name).trim() &&
      bankAccount.account_number &&
      String(bankAccount.account_number).trim() &&
      bankAccount.account_holder &&
      String(bankAccount.account_holder).trim()
  );

  let paymentLine = '';
  if (hasCompleteBank) {
    const bank = String(bankAccount.bank_name).trim();
    const accNo = String(bankAccount.account_number).trim();
    const holder = String(bankAccount.account_holder).trim();
    paymentLine = `Pembayaran bisa ditransfer ke ${bank} ${accNo} a.n. ${holder}, lalu unggah bukti bayar di aplikasi: ${resolvedAppUrl}`;
  } else {
    paymentLine = `Konfirmasi pembayaran di aplikasi: ${resolvedAppUrl}`;
  }

  const tName = tenantName && String(tenantName).trim() ? String(tenantName).trim() : '';
  const senderLine = tName ? `Pengurus ${tName}` : 'Pengurus Arisan';
  const closingSection = `Terima kasih.\n${senderLine}`;

  return `Halo ${name},\n\n${header}\n${tagihanSection}\n\n${paymentLine}\n\n${closingSection}`;
}

/**
 * Membentuk teks pengumuman hasil kocokan arisan untuk dibagikan via WhatsApp (ARISAN-1.2).
 *
 * @param {object} params
 * @param {string} [params.tenantName]
 * @param {string} [params.roundLabel]
 * @param {Date|string|number} [params.drawnAt]
 * @param {string} [params.operatorName]
 * @param {string} params.winnerName
 * @param {string} [params.slotLabel]
 * @param {number} params.totalPrize
 * @param {Array} [params.eligible]
 * @param {Array} [params.excluded]
 * @param {string} [params.appUrl]
 * @returns {string}
 */
export function buildArisanDrawShareText({
  tenantName,
  roundLabel,
  drawnAt,
  operatorName,
  winnerName,
  slotLabel,
  totalPrize,
  eligible = [],
  excluded = [],
  appUrl,
}) {
  const tName = tenantName && String(tenantName).trim() ? String(tenantName).trim() : 'Arisan';
  const rLabel = roundLabel && String(roundLabel).trim() ? String(roundLabel).trim() : 'Putaran Arisan';
  const opName = operatorName && String(operatorName).trim() ? String(operatorName).trim() : 'Pengurus';
  const winName = winnerName && String(winnerName).trim() ? String(winnerName).trim() : '-';
  const slotSuffix = slotLabel && String(slotLabel).trim() ? ` (${String(slotLabel).trim()})` : '';
  const prizeText = formatRupiahWa(Number(totalPrize || 0));

  const timeWib = formatDateTimeWib(drawnAt);

  const extractName = (item) => {
    if (!item) return '';
    if (typeof item === 'string') return item.trim();
    return String(item.full_name || item.name || item.member_name || '').trim();
  };

  const eligibleList = Array.isArray(eligible) ? eligible.map(extractName).filter(Boolean) : [];
  const eligibleText = eligibleList.length > 0 ? eligibleList.join(', ') : '-';

  const excludedList = Array.isArray(excluded) ? excluded.map(extractName).filter(Boolean) : [];

  let text = `*HASIL KOCOKAN ARISAN*\n${tName} — ${rLabel}\n\n`;
  text += `Selamat kepada:\n*${winName}*${slotSuffix}\n`;
  text += `Total Hadiah: *${prizeText}*\n\n`;
  text += `Waktu Kocok: ${timeWib}\n`;
  text += `Operator: ${opName}\n\n`;
  text += `Peserta yang ikut kocok (setoran lunas):\n${eligibleText}\n`;

  if (excludedList.length > 0) {
    text += `\nBelum lunas (tidak ikut kocok): ${excludedList.join(', ')}\n`;
  }

  text += `\nHasil kocok tercatat permanen di RuangWarga dan tidak bisa diulang.`;

  if (appUrl && String(appUrl).trim()) {
    text += `\n\nDetail putaran: ${String(appUrl).trim()}`;
  }

  return text;
}

/**
 * Buat tautan wa.me dengan teks ter-encode.
 * Bila nomor tidak ada/null, kembalikan 'https://wa.me/?text=...'.
 *
 * @param {string|null} phone
 * @param {string} text
 * @returns {string}
 */
export function buildWaLink(phone, text) {
  const normalized = phone ? normalizeWaPhone(phone) : null;
  const encodedText = encodeURIComponent(text || '');
  if (!normalized) {
    return `https://wa.me/?text=${encodedText}`;
  }
  return `https://wa.me/${normalized}?text=${encodedText}`;
}

/**
 * Membentuk teks pengumuman untuk dibagikan ke WhatsApp.
 * Format: judul + baris kosong + isi (potong sekitar 500 karakter dengan '…') + baris kosong + 'Selengkapnya: ' + window.location.origin + '/t/' + tenantId + '/announcements'
 *
 * @param {object} params
 * @param {string} params.title - Judul pengumuman
 * @param {string} [params.body] - Isi pengumuman
 * @param {string} params.tenantId - UUID atau slug tenant
 * @param {string} [params.origin] - window.location.origin
 * @returns {string}
 */
export function buildAnnouncementShareText({ title, body, tenantId, origin }) {
  const judul = title || '';
  const isiRaw = typeof body === 'string' ? body : '';
  const isiTrim = isiRaw.trim();
  const potongIsi = isiTrim.length > 500 ? isiTrim.slice(0, 500) + '…' : isiTrim;
  const baseUrl = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  const selengkapnya = `Selengkapnya: ${baseUrl}/t/${tenantId}/announcements`;

  if (potongIsi) {
    return `${judul}\n\n${potongIsi}\n\n${selengkapnya}`;
  }
  return `${judul}\n\n${selengkapnya}`;
}

/**
 * Membentuk URL wa.me untuk membagikan pengumuman.
 *
 * @param {object} params
 * @returns {string}
 */
export function buildAnnouncementShareUrl(params) {
  const text = buildAnnouncementShareText(params);
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ── EVENT LINKS & SHARING (RTRW-3.2) ─────────────────────────
export {
  getStartOfTodayJakarta,
  buildGoogleCalendarLink,
  formatEventDateTimeWib,
  buildEventShareText,
  buildEventShareUrl,
} from './eventLinks';


