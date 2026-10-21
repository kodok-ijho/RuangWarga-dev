/**
 * Utility functions untuk form pendaftaran (Join Tenant)
 * Ref: docs/handoff/KOS-1.md § KOS-1.1
 */

/**
 * Menentukan apakah pertanyaan "Status Tinggal" perlu diajukan pada form pendaftaran.
 * Status tinggal hanya relevan untuk tenant bertipe RT/RW.
 *
 * @param {string} tenantType
 * @returns {boolean}
 */
export function shouldAskOccupancy(tenantType) {
  return tenantType === 'rt_rw';
}

/**
 * Menentukan apakah pilihan unit perlu ditampilkan pada form pendaftaran.
 * Tenant bertipe 'panitia' tidak menggunakan unit/kamar/slot.
 *
 * @param {string} tenantType
 * @returns {boolean}
 */
export function shouldAskUnit(tenantType) {
  return tenantType !== 'panitia';
}

/**
 * Menyaring daftar unit yang dapat dipilih oleh calon pendaftar.
 * - Membuang unit non-aktif ('inactive').
 * - Untuk kos dan kelas, membuang juga unit yang sudah terisi ('occupied').
 * - Mempertahankan urutan elemen unit asli.
 *
 * @param {Array<object>} units
 * @param {string} tenantType
 * @returns {Array<object>}
 */
export function getJoinableUnits(units, tenantType) {
  if (!Array.isArray(units)) return [];

  const isKosOrKelas = tenantType === 'kos' || tenantType === 'kelas';

  return units.filter((u) => {
    if (!u) return false;
    const status = u.status;
    if (status === 'inactive') return false;
    if (isKosOrKelas && status === 'occupied') return false;
    return true;
  });
}
