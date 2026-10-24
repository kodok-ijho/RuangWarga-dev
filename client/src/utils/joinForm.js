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
 * - Untuk kos: membuang kamar yang memiliki kontrak aktif atau berstatus 'occupied' (KOS-2.8).
 * - Untuk kelas: membuang unit yang sudah terisi ('occupied').
 * - Mempertahankan urutan elemen unit asli.
 *
 * @param {Array<object>} units
 * @param {string} tenantType
 * @param {Array<object>} [contracts=null] - daftar kontrak opsional (untuk kos)
 * @returns {Array<object>}
 */
export function getJoinableUnits(units, tenantType, contracts = null) {
  if (!Array.isArray(units)) return [];

  const isKos = tenantType === 'kos';
  const isKelas = tenantType === 'kelas';

  let activeContractUnitIds = null;
  if (isKos && Array.isArray(contracts)) {
    activeContractUnitIds = new Set(
      contracts
        .filter((c) => c && c.status === 'active' && c.unit_id != null)
        .map((c) => String(c.unit_id))
    );
  }

  return units.filter((u) => {
    if (!u) return false;
    const status = u.status;
    if (status === 'inactive') return false;

    if (isKos) {
      if (activeContractUnitIds && activeContractUnitIds.has(String(u.id))) return false;
      if (u.has_active_contract || u.active_contract) return false;
      if (status === 'occupied') return false;
      return true;
    }

    if (isKelas && status === 'occupied') return false;
    return true;
  });
}
