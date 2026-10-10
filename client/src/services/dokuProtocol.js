/**
 * Helper murni protokol DOKU SNAP untuk perhitungan biaya dan penandatanganan request.
 * Kompatibel dengan browser dan lingkungan Node/Vitest melalui Web Crypto API.
 */

/**
 * Tarif MDR QRIS resmi platform (0,75%).
 * Biaya dibebankan kepada tenant / pembayar.
 */
export const QRIS_FEE_RATE = 0.0075;

/**
 * Menghitung biaya QRIS MDR 0,75% (dibulatkan ke atas / Math.ceil).
 * @param {number|string} baseAmount - Nilai pokok tagihan
 * @returns {{ fee: number, total: number }}
 */
export function calculateQrisFee(baseAmount) {
  const validBase = Math.max(0, Math.floor(Number(baseAmount) || 0));
  if (validBase === 0) {
    return { fee: 0, total: 0 };
  }
  const fee = Math.ceil(validBase * QRIS_FEE_RATE);
  return { fee, total: validBase + fee };
}

/**
 * Format timestamp SNAP DOKU tanpa milidetik: YYYY-MM-DDTHH:mm:ssZ
 * @param {Date|string|number} [date=new Date()]
 * @returns {string}
 */
export function formatDokuTimestamp(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('.')[0] + 'Z';
}

/**
 * Membentuk string to sign untuk otorisasi B2B Token SNAP DOKU.
 * Format: {X-CLIENT-KEY}|{X-TIMESTAMP}
 * @param {string} clientId
 * @param {string} timestamp
 * @returns {string}
 */
export function buildB2BStringToSign(clientId, timestamp) {
  return `${clientId}|${timestamp}`;
}

/**
 * Membentuk string to sign untuk transaksi SNAP DOKU (MPM QRIS, Inquiry, dll).
 * Format: {HttpMethod}:{EndpointUrl}:{AccessToken}:{MinifiedBodyHashHexLower}:{X-TIMESTAMP}
 * @param {string} httpMethod - POST, GET, dll.
 * @param {string} endpointPath - Path URL (contoh: /services/v1.0/qr-dynamic/generate)
 * @param {string} accessToken - Token B2B Bearer tanpa prefiks "Bearer "
 * @param {string} bodyHashHexLower - Lowercase hex dari SHA-256 minified body
 * @param {string} timestamp - Format DOKU ISO
 * @returns {string}
 */
export function buildMpmStringToSign(httpMethod, endpointPath, accessToken, bodyHashHexLower, timestamp) {
  return `${httpMethod.toUpperCase()}:${endpointPath}:${accessToken}:${bodyHashHexLower}:${timestamp}`;
}

/**
 * Menghasilkan hash SHA-256 dalam bentuk lowercase hex menggunakan Web Crypto.
 * @param {string} data
 * @returns {Promise<string>}
 */
export async function sha256HexLower(data) {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toLowerCase();
}

/**
 * Menghasilkan HMAC-SHA512 Base64 menggunakan Web Crypto.
 * @param {string} data
 * @param {string} secret
 * @returns {Promise<string>}
 */
export async function hmacSha512Base64(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-512',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Perbandingan string konstan untuk mencegah timing attack.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
