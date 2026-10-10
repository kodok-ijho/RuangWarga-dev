/**
 * rbac.js
 * Manajemen peran dan izin (RBAC v2) tenant: izin platform, peran kustom, penugasan peran.
 */

import { supabase, IS_DEMO } from './shared';

// ============================================================
// RBAC v2: MANAJEMEN ROLE & PERMISSION (Spec §2.1, §7.4, T12.9)
// ============================================================

export const PLATFORM_PERMISSIONS = [
  { key: 'manage_billing_cash', label: 'Catat Pembayaran Tunai', description: 'Mencatat pembayaran tunai langsung' },
  { key: 'manage_billing_transfer', label: 'Catat & Verifikasi Transfer', description: 'Mencatat & memverifikasi bukti transfer' },
  { key: 'generate_billing', label: 'Terbitkan Tagihan', description: 'Generate tagihan berkala (IPL/sewa/kontribusi/iuran)' },
  { key: 'manage_members', label: 'Kelola Anggota', description: 'CRUD anggota, approve/reject pendaftaran, impor CSV' },
  { key: 'manage_settings', label: 'Kelola Pengaturan', description: 'Edit konfigurasi tenant' },
  { key: 'manage_expenses', label: 'Kelola Pengeluaran', description: 'CRUD pengeluaran' },
  { key: 'view_reports', label: 'Lihat Laporan', description: 'Akses laporan keuangan (read-only)' },
  { key: 'run_special_action', label: 'Jalankan Aksi Khusus', description: 'Kocok arisan, checkout kos, mulai siklus baru' },
  { key: 'post_listing', label: 'Pasang Iklan', description: 'Posting listing publik' },
  { key: 'manage_tenant_users', label: 'Kelola User & Audit', description: 'CRUD akun/akses user tenant, ubah role, lihat audit log' },
];

let mockCustomRolesStore = [
  {
    id: 'role-mock-1',
    tenant_id: 'demo-tenant-kos',
    name: 'Pengawas Kamar',
    is_base_role: false,
    permissions: ['manage_members', 'manage_expenses'],
    member_count: 1,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: 'role-mock-2',
    tenant_id: 'demo-tenant-rtrw',
    name: 'Seksi Keamanan & Ketertiban',
    is_base_role: false,
    permissions: ['manage_members'],
    member_count: 2,
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'role-mock-3',
    tenant_id: 'demo-tenant-rtrw',
    name: 'Humas & Publikasi',
    is_base_role: false,
    permissions: ['post_listing', 'view_reports'],
    member_count: 1,
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
];

/**
 * Mengambil daftar seluruh permission platform yang dapat dikonfigurasi pada custom role.
 */
export async function fetchPlatformPermissions() {
  return PLATFORM_PERMISSIONS;
}

/**
 * Mengambil daftar seluruh peran (base roles + custom roles) untuk sebuah tenant.
 * Termasuk jumlah anggota aktif yang ditugaskan ke peran tersebut.
 *
 * @param {string} tenantId - UUID tenant
 * @returns {Promise<Array<Object>>}
 */
export async function fetchTenantRoles(tenantId) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    return mockCustomRolesStore.filter((r) => r.tenant_id === tenantId);
  }

  const { data, error } = await supabase
    .from('tenant_roles')
    .select(`
      id,
      tenant_id,
      name,
      is_base_role,
      permissions,
      created_at,
      updated_at,
      tenant_members (count)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantRoles error:', error);
    throw new Error(error.message || 'Gagal memuat daftar peran tenant.');
  }

  return (data || []).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    is_base_role: row.is_base_role,
    permissions: row.permissions || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    member_count: Array.isArray(row.tenant_members)
      ? row.tenant_members[0]?.count || 0
      : row.tenant_members?.count || 0,
  }));
}

/**
 * Membuat custom role baru pada tenant dengan serangkaian permissions yang dipilih.
 *
 * @param {string} tenantId - UUID tenant
 * @param {Object} params
 * @param {string} params.name - Nama peran (misal: "Seksi Keamanan")
 * @param {Array<string>} [params.permissions=[]] - Array of permission keys
 * @returns {Promise<Object>}
 */
export async function createTenantRole(tenantId, { name, permissions = [] }) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Nama peran wajib diisi.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const existing = mockCustomRolesStore.find(
      (r) => r.tenant_id === tenantId && r.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existing) {
      throw new Error(`Peran dengan nama "${trimmedName}" sudah ada.`);
    }

    const newRole = {
      id: `role-mock-${Date.now()}`,
      tenant_id: tenantId,
      name: trimmedName,
      is_base_role: false,
      permissions: Array.isArray(permissions) ? permissions : [],
      member_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockCustomRolesStore.push(newRole);
    return newRole;
  }

  const { data, error } = await supabase
    .from('tenant_roles')
    .insert([
      {
        tenant_id: tenantId,
        name: trimmedName,
        is_base_role: false,
        permissions: Array.isArray(permissions) ? permissions : [],
      },
    ])
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] createTenantRole error:', error);
    if (error.code === '23505') {
      throw new Error(`Peran dengan nama "${trimmedName}" sudah ada pada komunitas ini.`);
    }
    throw new Error(error.message || 'Gagal membuat peran kustom baru.');
  }

  return {
    ...data,
    member_count: 0,
  };
}

/**
 * Memperbarui nama dan/atau permissions dari sebuah peran kustom.
 * Base roles (admin, bendahara, sekretaris, anggota) diproteksi dari pengubahan.
 *
 * @param {string} roleId - UUID peran
 * @param {Object} params
 * @param {string} [params.name] - Nama baru peran
 * @param {Array<string>} [params.permissions] - Array permission keys baru
 * @returns {Promise<Object>}
 */
export async function updateTenantRole(roleId, { name, permissions }) {
  if (!roleId) throw new Error('Role ID wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(roleId).startsWith('role-mock-');
  if (isDemoOrMock) {
    const idx = mockCustomRolesStore.findIndex((r) => r.id === roleId);
    if (idx === -1) throw new Error('Peran tidak ditemukan.');
    if (mockCustomRolesStore[idx].is_base_role) {
      throw new Error('Peran sistem bawaan (base role) tidak dapat diubah.');
    }

    const updated = {
      ...mockCustomRolesStore[idx],
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(permissions !== undefined ? { permissions } : {}),
      updated_at: new Date().toISOString(),
    };
    mockCustomRolesStore[idx] = updated;
    return updated;
  }

  // Validasi peran bawaan sebelum update
  const { data: existing, error: fetchErr } = await supabase
    .from('tenant_roles')
    .select('is_base_role')
    .eq('id', roleId)
    .single();

  if (fetchErr || !existing) {
    throw new Error('Peran tidak ditemukan.');
  }
  if (existing.is_base_role) {
    throw new Error('Peran sistem bawaan (base role) tidak dapat diubah.');
  }

  const payload = {
    updated_at: new Date().toISOString(),
  };
  if (name !== undefined) payload.name = name.trim();
  if (permissions !== undefined) payload.permissions = permissions;

  const { data, error } = await supabase
    .from('tenant_roles')
    .update(payload)
    .eq('id', roleId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantRole error:', error);
    if (error.code === '23505') {
      throw new Error('Nama peran sudah digunakan oleh peran lain pada komunitas ini.');
    }
    throw new Error(error.message || 'Gagal memperbarui peran.');
  }

  return data;
}

/**
 * Menghapus peran kustom jika tidak ada anggota aktif yang ditugaskan ke peran tersebut.
 *
 * @param {string} roleId - UUID peran
 * @returns {Promise<boolean>}
 */
export async function deleteTenantRole(roleId) {
  if (!roleId) throw new Error('Role ID wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(roleId).startsWith('role-mock-');
  if (isDemoOrMock) {
    const role = mockCustomRolesStore.find((r) => r.id === roleId);
    if (!role) throw new Error('Peran tidak ditemukan.');
    if (role.is_base_role) {
      throw new Error('Peran sistem bawaan (base role) tidak dapat dihapus.');
    }
    if (role.member_count > 0) {
      throw new Error(`Tidak dapat menghapus peran "${role.name}" karena masih memiliki ${role.member_count} anggota aktif.`);
    }

    mockCustomRolesStore = mockCustomRolesStore.filter((r) => r.id !== roleId);
    return true;
  }

  // 1. Cek base role dan jumlah anggota yang masih aktif menggunakan peran ini
  const { data: role, error: fetchErr } = await supabase
    .from('tenant_roles')
    .select('name, is_base_role, tenant_members (count)')
    .eq('id', roleId)
    .single();

  if (fetchErr || !role) {
    throw new Error('Peran tidak ditemukan.');
  }
  if (role.is_base_role) {
    throw new Error('Peran sistem bawaan (base role) tidak dapat dihapus.');
  }

  const assignedCount = Array.isArray(role.tenant_members)
    ? role.tenant_members[0]?.count || 0
    : role.tenant_members?.count || 0;

  if (assignedCount > 0) {
    throw new Error(
      `Tidak dapat menghapus peran "${role.name}" karena masih ada ${assignedCount} anggota aktif yang ditugaskan. Pindahkan anggota ke peran lain terlebih dahulu.`
    );
  }

  const { error } = await supabase
    .from('tenant_roles')
    .delete()
    .eq('id', roleId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] deleteTenantRole error:', error);
    throw new Error(error.message || 'Gagal menghapus peran.');
  }

  return true;
}

/**
 * Menugaskan peran (tenant_role_id) ke seorang anggota tenant.
 * Dapat mengosongkan peran khusus (set ke null) sehingga anggota kembali ke base role 'anggota'.
 *
 * @param {string} memberId - UUID tenant_members
 * @param {string|null} tenantRoleId - UUID tenant_roles atau null
 * @returns {Promise<Object>}
 */
export async function assignMemberRole(memberId, tenantRoleId) {
  if (!memberId) throw new Error('Member ID wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(memberId).startsWith('mem-');
  if (isDemoOrMock) {
    return {
      id: memberId,
      tenant_role_id: tenantRoleId || null,
      updated_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('tenant_members')
    .update({
      tenant_role_id: tenantRoleId ? tenantRoleId : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] assignMemberRole error:', error);
    throw new Error(error.message || 'Gagal menugaskan peran anggota.');
  }

  return data;
}
