/**
 * Helper validasi dan utilitas branding RuangWarga.
 */

/**
 * Memvalidasi apakah URL logo aman untuk dirender pada elemen <img>.
 * Hanya mengizinkan path absolut lokal (/... tetapi bukan //) dan protokol aman HTTPS (https://).
 * Menolak http://, data:, javascript:, protocol-relative (//), string kosong, serta nilai non-string.
 *
 * @param {any} url
 * @returns {boolean}
 */
export function isSafeLogoUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Path relatif/lokal: diawali '/' tetapi bukan protocol-relative '//'
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return true;
  }

  // URL eksternal: hanya HTTPS yang diizinkan
  if (trimmed.startsWith('https://')) {
    return true;
  }

  return false;
}
