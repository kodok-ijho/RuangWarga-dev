/**
 * rbac.js
 * Manajemen peran dan izin (RBAC v2) tenant: izin platform, peran kustom, penugasan peran.
 */

import { supabase, IS_DEMO } from './shared';

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
  { key: 'post_listing', label: 'Kelola Iklan Komunitas', description: 'Melihat & mengelola semua iklan listing komunitas (warga tetap bisa memasang iklannya sendiri tanpa izin ini)' },
  { key: 'manage_tenant_users', label: 'Kelola User & Audit', description: 'CRUD akun/akses user tenant, ubah role, lihat audit log' },
  { key: 'manage_announcements', label: 'Kelola Pengumuman & Acara', description: 'Tulis, ubah, dan hapus pengumuman serta acara tenant' },
  { key: 'manage_programs', label: 'Kelola Acara & Anggaran', description: 'Membuat acara, mengubah status acara, dan menyusun anggaran (RAB)' },
];

let mockCustomRolesStore = [
  {
    id: 'mock-role-admin',
    tenant_id: 'demo-tenant-rtrw',
    name: 'Admin',
    is_owner_role: true,
    is_base_role: false,
    permissions: PLATFORM_PERMISSIONS.map((p) => p.key),
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mock-role-bendahara',
    tenant_id: 'demo-tenant-rtrw',
    name: 'Bendahara',
    is_owner_role: false,
    is_base_role: false,
    permissions: ['manage_billing_cash', 'manage_billing_transfer', 'manage_expenses', 'view_reports'],
    created_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 'mock-role-pengurus',
    tenant_id: 'demo-tenant-rtrw',
    name: 'Pengurus',
    is_owner_role: false,
    is_base_role: false,
    permissions: ['manage_billing_transfer', 'manage_members', 'view_reports'],
    created_at: '2026-01-03T00:00:00Z',
  },
  {
    id: 'mock-role-warga',
    tenant_id: 'demo-tenant-rtrw',
    name: 'Warga/Anggota',
    is_owner_role: false,
    is_base_role: true,
    permissions: [],
    created_at: '2026-01-01T00:00:00Z',
  },
];

/**
 * Mengambil daftar seluruh kamus permission platform
 */
export async function fetchPlatformPermissions() {
  if (IS_DEMO) {
    return PLATFORM_PERMISSIONS;
  }

  const { data, error } = await supabase
    .from('permissions')
    .select('key, label, description');

  if (error || !data || data.length === 0) {
    return PLATFORM_PERMISSIONS;
  }

  return data;
}

/**
 * Mengambil daftar role untuk sebuah tenant tertentu
 */
export async function fetchTenantRoles(tenantId) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return mockCustomRolesStore.map((r) => ({ ...r, tenant_id: tenantId }));
  }

  const { data, error } = await supabase
    .from('tenant_roles')
    .select(`
      id,
      tenant_id,
      name,
      is_owner_role,
      is_base_role,
      created_at,
      tenant_role_permissions (
        permission_key
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[tenantOperationalService] fetchTenantRoles error:', error);
    throw new Error(error.message || 'Gagal memuat daftar role.');
  }

  return (data || []).map((r) => ({
    ...r,
    permissions: (r.tenant_role_permissions || []).map((trp) => trp.permission_key),
  }));
}

/**
 * Membuat custom role baru untuk tenant
 */
export async function createTenantRole(tenantId, { name, permissions = [] }) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Nama role wajib diisi.');

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    const newRole = {
      id: `mock-role-${Date.now()}`,
      tenant_id: tenantId,
      name: trimmedName,
      is_owner_role: false,
      is_base_role: false,
      permissions,
      created_at: new Date().toISOString(),
    };
    mockCustomRolesStore.push(newRole);
    return newRole;
  }

  // 1. Insert ke tenant_roles
  const { data: roleRow, error: roleError } = await supabase
    .from('tenant_roles')
    .insert({
      tenant_id: tenantId,
      name: trimmedName,
      is_owner_role: false,
      is_base_role: false,
    })
    .select()
    .single();

  if (roleError) {
    console.error('[tenantOperationalService] createTenantRole error:', roleError);
    if (roleError.code === '23505') {
      throw new Error(`Role dengan nama "${trimmedName}" sudah ada di komunitas ini.`);
    }
    throw new Error(roleError.message || 'Gagal membuat role.');
  }

  // 2. Insert ke tenant_role_permissions
  if (permissions.length > 0) {
    const trpPayload = permissions.map((pKey) => ({
      tenant_role_id: roleRow.id,
      permission_key: pKey,
    }));

    const { error: permError } = await supabase
      .from('tenant_role_permissions')
      .insert(trpPayload);

    if (permError) {
      console.error('[tenantOperationalService] createTenantRole permissions error:', permError);
    }
  }

  return {
    ...roleRow,
    permissions,
  };
}

/**
 * Memperbarui custom role
 */
export async function updateTenantRole(roleId, { name, permissions }) {
  if (!roleId) throw new Error('Role ID wajib disertakan.');
  const trimmedName = name ? name.trim() : undefined;

  if (IS_DEMO || String(roleId).startsWith('mock-')) {
    const idx = mockCustomRolesStore.findIndex((r) => r.id === roleId);
    if (idx >= 0) {
      if (mockCustomRolesStore[idx].is_owner_role || mockCustomRolesStore[idx].is_base_role) {
        throw new Error('Role bawaan tidak dapat diedit atau diubah permission-nya.');
      }
      if (trimmedName) mockCustomRolesStore[idx].name = trimmedName;
      if (permissions) mockCustomRolesStore[idx].permissions = permissions;
      return mockCustomRolesStore[idx];
    }
    throw new Error('Role tidak ditemukan.');
  }

  // Cek apakah role bawaan
  const { data: currentRole, error: fetchErr } = await supabase
    .from('tenant_roles')
    .select('is_owner_role, is_base_role, tenant_id')
    .eq('id', roleId)
    .single();

  if (fetchErr || !currentRole) {
    throw new Error('Role tidak ditemukan.');
  }

  if (currentRole.is_owner_role || currentRole.is_base_role) {
    throw new Error('Role bawaan sistem tidak dapat dimodifikasi.');
  }

  // Update nama jika ada
  if (trimmedName) {
    const { error: updateErr } = await supabase
      .from('tenant_roles')
      .update({ name: trimmedName })
      .eq('id', roleId);

    if (updateErr) {
      if (updateErr.code === '23505') {
        throw new Error(`Role dengan nama "${trimmedName}" sudah ada.`);
      }
      throw new Error(updateErr.message || 'Gagal mengubah nama role.');
    }
  }

  // Update permissions jika ada
  if (Array.isArray(permissions)) {
    // Hapus permission lama
    await supabase
      .from('tenant_role_permissions')
      .delete()
      .eq('tenant_role_id', roleId);

    // Insert permission baru
    if (permissions.length > 0) {
      const trpPayload = permissions.map((pKey) => ({
        tenant_role_id: roleId,
        permission_key: pKey,
      }));

      await supabase
        .from('tenant_role_permissions')
        .insert(trpPayload);
    }
  }

  return { id: roleId, name: trimmedName, permissions };
}

/**
 * Menghapus custom role
 */
export async function deleteTenantRole(roleId) {
  if (!roleId) throw new Error('Role ID wajib disertakan.');

  if (IS_DEMO || String(roleId).startsWith('mock-')) {
    const idx = mockCustomRolesStore.findIndex((r) => r.id === roleId);
    if (idx >= 0) {
      if (mockCustomRolesStore[idx].is_owner_role || mockCustomRolesStore[idx].is_base_role) {
        throw new Error('Role bawaan sistem tidak dapat dihapus.');
      }
      mockCustomRolesStore.splice(idx, 1);
      return { success: true };
    }
    throw new Error('Role tidak ditemukan.');
  }

  // Cek apakah role bawaan
  const { data: currentRole, error: fetchErr } = await supabase
    .from('tenant_roles')
    .select('is_owner_role, is_base_role')
    .eq('id', roleId)
    .single();

  if (fetchErr || !currentRole) {
    throw new Error('Role tidak ditemukan.');
  }

  if (currentRole.is_owner_role || currentRole.is_base_role) {
    throw new Error('Role bawaan sistem tidak dapat dihapus.');
  }

  const { error } = await supabase
    .from('tenant_roles')
    .delete()
    .eq('id', roleId);

  if (error) {
    console.error('[tenantOperationalService] deleteTenantRole error:', error);
    throw new Error(error.message || 'Gagal menghapus role.');
  }

  return { success: true };
}

/**
 * Menugaskan peran (role) kepada seorang anggota tenant
 */
export async function assignMemberRole(memberId, tenantRoleId) {
  if (!memberId || !tenantRoleId) {
    throw new Error('Member ID dan Tenant Role ID wajib disertakan.');
  }

  if (IS_DEMO || String(memberId).startsWith('mock-') || String(memberId).startsWith('mem-')) {
    return {
      id: memberId,
      tenant_role_id: tenantRoleId,
      updated_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('tenant_members')
    .update({
      tenant_role_id: tenantRoleId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    console.error('[tenantOperationalService] assignMemberRole error:', error);
    throw new Error(error.message || 'Gagal menugaskan peran anggota.');
  }

  return data;
}

export const ROLE_TEMPLATES = {
  rt_rw: [
    {
      name: 'Ketua RT/RW',
      permissions: [
        'manage_billing_cash',
        'manage_billing_transfer',
        'generate_billing',
        'manage_expenses',
        'view_reports',
        'manage_members',
        'manage_settings',
        'manage_announcements',
      ],
    },
    {
      name: 'Wakil Ketua',
      permissions: [
        'manage_billing_cash',
        'manage_billing_transfer',
        'view_reports',
        'manage_members',
      ],
    },
    {
      name: 'Sekretaris',
      permissions: ['view_reports', 'manage_members', 'post_listing', 'manage_announcements'],
    },
    {
      name: 'Bendahara',
      permissions: [
        'manage_billing_cash',
        'manage_billing_transfer',
        'generate_billing',
        'manage_expenses',
        'view_reports',
      ],
    },
    {
      name: 'Koordinator Blok',
      permissions: ['manage_billing_cash', 'view_reports'],
    },
    {
      name: 'Humas',
      permissions: ['post_listing'],
    },
  ],
  panitia: [
    {
      name: 'Ketua',
      permissions: [
        'manage_programs',
        'manage_settings',
        'manage_members',
        'manage_announcements',
        'view_reports',
        'manage_expenses',
      ],
    },
    {
      name: 'Wakil Ketua',
      permissions: ['manage_programs', 'manage_members', 'view_reports'],
    },
    {
      name: 'Sekretaris',
      permissions: [
        'manage_programs',
        'manage_members',
        'manage_announcements',
        'view_reports',
      ],
    },
    {
      name: 'Bendahara',
      permissions: [
        'manage_expenses',
        'manage_billing_cash',
        'manage_billing_transfer',
        'generate_billing',
        'view_reports',
      ],
    },
    {
      name: 'Koordinator Seksi',
      permissions: ['view_reports'],
    },
  ],
};

/**
 * Menerapkan template jabatan pengurus untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} templateKey - Kunci template (default: 'rt_rw')
 * @returns {Promise<{ created: string[], skipped: string[] }>}
 */
export async function applyRoleTemplate(tenantId, templateKey = 'rt_rw') {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  const template = ROLE_TEMPLATES[templateKey];
  if (!template || !Array.isArray(template)) {
    throw new Error('Template jabatan tidak dikenal.');
  }

  const existingRoles = await fetchTenantRoles(tenantId);
  const existingNamesSet = new Set(
    (existingRoles || []).map((r) => (r.name || '').trim().toLowerCase())
  );

  const created = [];
  const skipped = [];

  for (const roleDef of template) {
    const trimmedName = (roleDef.name || '').trim();
    const normName = trimmedName.toLowerCase();

    if (existingNamesSet.has(normName)) {
      skipped.push(trimmedName);
    } else {
      await createTenantRole(tenantId, {
        name: trimmedName,
        permissions: roleDef.permissions,
      });
      created.push(trimmedName);
      existingNamesSet.add(normName);
    }
  }

  return { created, skipped };
}
