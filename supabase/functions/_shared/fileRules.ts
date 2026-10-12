/**
 * Aturan validasi file & path canonical untuk penyimpanan R2.
 * Modul murni (tanpa import jaringan, tanpa Deno.env) agar dapat diuji di Vitest maupun Edge Functions.
 *
 * Ref: docs/handoff/STOR-1.md (STOR-1.2), STOR-1-requirement.md, STOR-1-plan.md
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedMimeType = typeof ALLOWED_MIME[number];

export const MIME_TO_EXTENSION: Record<AllowedMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

// Regex path canonical disalin persis dari client/src/utils/storagePolicy.js
export const EXPENSE_RECEIPT_PATH_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/expenses\/[12][0-9]{3}\/[a-zA-Z0-9_\-.]+$/;
export const PAYMENT_PROOF_PATH_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/payments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-zA-Z0-9_\-.]+$/;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^[12][0-9]{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/;

/**
 * Memeriksa apakah string adalah format UUID standar.
 */
export function isUuid(s: unknown): boolean {
  if (!s || typeof s !== 'string') return false;
  return UUID_REGEX.test(s.trim());
}

/**
 * Mendeteksi tipe MIME dari magic bytes file.
 * Hanya mengembalikan MIME jika cocok dengan JPEG, PNG, WebP, atau PDF.
 * Selain itu mengembalikan null.
 */
export function detectMime(bytes: Uint8Array | null | undefined): AllowedMimeType | null {
  if (!bytes || !(bytes instanceof Uint8Array) || bytes.length < 3) {
    return null;
  }

  // 1. JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4E &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0D &&
    bytes[5] === 0x0A &&
    bytes[6] === 0x1A &&
    bytes[7] === 0x0A
  ) {
    return 'image/png';
  }

  // 3. WebP: 'RIFF'(0-3) + 'WEBP'(8-11)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // 'R'
    bytes[1] === 0x49 && // 'I'
    bytes[2] === 0x46 && // 'F'
    bytes[3] === 0x46 && // 'F'
    bytes[8] === 0x57 && // 'W'
    bytes[9] === 0x45 && // 'E'
    bytes[10] === 0x42 && // 'B'
    bytes[11] === 0x50 // 'P'
  ) {
    return 'image/webp';
  }

  // 4. PDF: '%PDF'(0-3)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 && // '%'
    bytes[1] === 0x50 && // 'P'
    bytes[2] === 0x44 && // 'D'
    bytes[3] === 0x46 // 'F'
  ) {
    return 'application/pdf';
  }

  return null;
}

/**
 * Membersihkan nama file:
 * - Hanya karakter [a-zA-Z0-9_\-.]
 * - Menghilangkan path traversal ('..', '/', '\\')
 * - Membatasi panjang maksimal yang wajar
 * - Default 'file' jika nama kosong atau tidak valid
 */
export function sanitizeFileName(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'file';

  const trimmed = name.trim();
  if (!trimmed) return 'file';

  // Ambil hanya basename (buang directory path jika ada)
  const basename = trimmed.split(/[/\\]/).pop() || 'file';

  // Ganti karakter terlarang dengan '_'
  let cleaned = basename.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // Tolak / hilangkan '..' berulang
  while (cleaned.includes('..')) {
    cleaned = cleaned.replace(/\.\./g, '_');
  }

  // Jika setelah dibersihkan tidak menyisakan karakter alfanumerik (mis. hanya spasi atau simbol)
  const withoutSpecial = cleaned.replace(/[._-]/g, '').trim();
  if (!withoutSpecial) return 'file';

  // Batasi panjang wajar (maksimal 100 karakter), pertahankan ekstensi jika ada
  if (cleaned.length > 100) {
    const lastDot = cleaned.lastIndexOf('.');
    if (lastDot > 0 && lastDot > cleaned.length - 15) {
      const ext = cleaned.substring(lastDot);
      cleaned = cleaned.substring(0, 100 - ext.length) + ext;
    } else {
      cleaned = cleaned.substring(0, 100);
    }
  }

  return cleaned || 'file';
}

/**
 * Menyesuaikan ekstensi nama file agar selaras dengan MIME hasil deteksi magic bytes.
 * Mencegah nama file menyesatkan (misal file.exe atau file.png berisikan JPEG).
 */
export function adjustFileNameExtension(fileName: string, mime?: string | null): string {
  if (!mime || !(mime in MIME_TO_EXTENSION)) {
    return fileName;
  }
  const targetExt = MIME_TO_EXTENSION[mime as AllowedMimeType];
  const lastDot = fileName.lastIndexOf('.');

  if (lastDot === -1) {
    return `${fileName}${targetExt}`;
  }

  const currentExt = fileName.substring(lastDot).toLowerCase();
  // Untuk JPEG, izinkan baik .jpg maupun .jpeg
  if (mime === 'image/jpeg' && (currentExt === '.jpg' || currentExt === '.jpeg')) {
    return fileName;
  }

  if (currentExt === targetExt) {
    return fileName;
  }

  return `${fileName.substring(0, lastDot)}${targetExt}`;
}

/**
 * Validasi ketat path penyimpanan canonical:
 * - Menolak traversal ('..'), leading slash ('/'), dan backslash ('\')
 * - Memverifikasi kesesuaian pola regex per kind ('payment_proof' atau 'expense_receipt')
 */
export function isValidPath(kind: string, path: unknown): boolean {
  if (!path || typeof path !== 'string') return false;
  if (path.includes('..') || path.startsWith('/') || path.startsWith('\\') || path.includes('\\')) {
    return false;
  }

  if (kind === 'payment_proof') {
    return PAYMENT_PROOF_PATH_REGEX.test(path);
  }

  if (kind === 'expense_receipt') {
    return EXPENSE_RECEIPT_PATH_REGEX.test(path);
  }

  return false;
}

/**
 * Menyusun canonical path untuk bukti pembayaran warga:
 * Format: {tenant_id}/payments/{billing_item_id}/{timestamp}_{safe_name}
 */
export function buildPaymentProofPath(
  tenantId: string,
  billingItemId: string,
  fileName: string,
  now: number | string = Date.now(),
  detectedMime?: string | null
): string {
  if (!isUuid(tenantId)) {
    throw new Error('tenantId harus berupa UUID yang valid');
  }
  if (!isUuid(billingItemId)) {
    throw new Error('billingItemId harus berupa UUID yang valid');
  }
  if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
    throw new Error('fileName wajib diisi');
  }

  const timestamp = typeof now === 'number' ? Math.floor(now) : String(now).trim();
  if (!timestamp || isNaN(Number(timestamp)) || Number(timestamp) <= 0) {
    throw new Error('Timestamp now harus berupa angka positif yang valid');
  }

  let finalName = fileName;
  if (detectedMime) {
    finalName = adjustFileNameExtension(finalName, detectedMime);
  }
  const safeName = sanitizeFileName(finalName);

  const path = `${tenantId.trim().toLowerCase()}/payments/${billingItemId.trim().toLowerCase()}/${timestamp}_${safeName}`;

  if (!isValidPath('payment_proof', path)) {
    throw new Error('Path bukti pembayaran tidak valid atau melanggar struktur canonical');
  }

  return path;
}

/**
 * Menyusun canonical path untuk nota pengeluaran:
 * Format: {tenant_id}/expenses/{YYYY}/{uuid}_{safe_name}
 */
export function buildExpenseReceiptPath(
  tenantId: string,
  expenseDate: string,
  fileName: string,
  uuid?: string,
  detectedMime?: string | null
): string {
  if (!isUuid(tenantId)) {
    throw new Error('tenantId harus berupa UUID yang valid');
  }
  if (!expenseDate || typeof expenseDate !== 'string') {
    throw new Error('expenseDate wajib diisi');
  }

  const trimmedDate = expenseDate.trim();
  const dateMatch = trimmedDate.match(ISO_DATE_REGEX);
  if (!dateMatch) {
    throw new Error('expenseDate harus dalam format YYYY-MM-DD yang valid');
  }
  const year = dateMatch[0].substring(0, 4);

  if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
    throw new Error('fileName wajib diisi');
  }

  const generatedUuid = uuid || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '');
  if (!isUuid(generatedUuid)) {
    throw new Error('uuid untuk file receipt harus berupa UUID yang valid');
  }

  let finalName = fileName;
  if (detectedMime) {
    finalName = adjustFileNameExtension(finalName, detectedMime);
  }
  const safeName = sanitizeFileName(finalName);

  const path = `${tenantId.trim().toLowerCase()}/expenses/${year}/${generatedUuid.trim().toLowerCase()}_${safeName}`;

  if (!isValidPath('expense_receipt', path)) {
    throw new Error('Path nota pengeluaran tidak valid atau melanggar struktur canonical');
  }

  return path;
}
