/**
 * unitLabels.js
 * Utilitas pemrosesan label unit tenant (deduplikasi case-insensitive & trim).
 */

/**
 * Memilih label unit baru yang belum ada di database dan membuang duplikat di input.
 * Perbandingan dilakukan secara case-insensitive dan di-trim (RTRW-2.5).
 *
 * @param {Array<object|string>} existingUnits - Daftar unit yang sudah ada di database
 * @param {Array<object|string>} unitList - Daftar unit yang diinputkan pengguna
 * @returns {Array<string> & { skippedCount: number, newCount: number }} Array label baru
 */
export function selectNewUnitLabels(existingUnits = [], unitList = []) {
  const existingSet = new Set(
    (existingUnits || [])
      .map((u) => (typeof u === 'string' ? u : u?.label || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const seenInInput = new Set();
  const result = [];

  for (const item of (unitList || [])) {
    const rawLabel = typeof item === 'string' ? item : item?.label || '';
    const trimmed = rawLabel.trim();
    if (!trimmed) continue;

    const normalized = trimmed.toLowerCase();
    if (existingSet.has(normalized)) {
      continue;
    }
    if (seenInInput.has(normalized)) {
      continue;
    }

    seenInInput.add(normalized);
    result.push(trimmed);
  }

  return result;
}
