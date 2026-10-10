/**
 * members.js
 * Manajemen unit, registrasi anggota, kode undangan, dan approval anggota tenant.
 */

import { supabase, IS_DEMO } from './shared';

// In-memory cache unit untuk demo mode agar interaksi setup wizard terasa nyata
let demoTenantUnitsMap = new Map();

/**
 * Mengambil daftar unit milik tenant
 */
export async function fetchTenantUnits(tenantId) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    if (demoTenantUnitsMap.has(tenantId)) {
      return demoTenantUnitsMap.get(tenantId);
    }
    // Fallback default demo units
    const { mockUnits } = await import('../mockData');
    const formatted = mockUnits.map((u) => ({
      id: u.id,
      tenant_id: tenantId,
      label: `Blok ${u.block} No. ${u.unit_number}`,
      status: u.is_occupied ? 'active' : 'vacant',
      metadata: { block: u.block, unit_number: u.unit_number, size: u.size },
    }));
    demoTenantUnitsMap.set(tenantId, formatted);
    return formatted;
  }

  const { data, error } = await supabase
    .from('tenant_units')
    .select('id, tenant_id, label, status, metadata, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('id', { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantUnits error:', error);
    throw error;
  }

  return data || [];
}

/**
 * Membuat banyak unit sekaligus (bulk insert) untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {Array<{ label: string, status?: string, metadata?: object }>} unitsList
 */
export async function bulkCreateTenantUnits(tenantId, unitsList = []) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  if (!unitsList || unitsList.length === 0) return [];

  const rows = unitsList.map((u) => ({
    tenant_id: tenantId,
    label: typeof u === 'string' ? u.trim() : u.label.trim(),
    status: u.status || 'active',
    metadata: u.metadata || {},
  }));

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    const existing = demoTenantUnitsMap.get(tenantId) || [];
    const newItems = rows.map((r, idx) => ({
      ...r,
      id: Date.now() + idx,
      created_at: new Date().toISOString(),
    }));
    const combined = [...existing, ...newItems];
    demoTenantUnitsMap.set(tenantId, combined);
    return newItems;
  }

  const { data, error } = await supabase
    .from('tenant_units')
    .insert(rows)
    .select();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] bulkCreateTenantUnits error:', error);
    throw error;
  }

  return data;
}

/**
 * Mengambil informasi tenant dan unit via kode undangan
 */
export async function getInviteDetails(inviteCode) {
  if (!inviteCode) return { found: false, message: 'Kode undangan tidak boleh kosong.' };

  if (IS_DEMO) {
    return {
      found: true,
      tenant_id: 'demo-tenant-rtrw',
      tenant_name: 'Palm Village RT 05',
      tenant_type: 'rt_rw',
      address: 'Jl. Boulevard Palm No. 1',
      contact_phone: '081234567890',
      units: [
        { id: 1, label: 'Blok A-01', status: 'active' },
        { id: 2, label: 'Blok A-02', status: 'active' },
        { id: 3, label: 'Blok A-03', status: 'active' },
        { id: 4, label: 'Blok A-04', status: 'active' },
        { id: 5, label: 'Blok A-05', status: 'active' },
        { id: 6, label: 'Blok A-06', status: 'active' },
      ],
    };
  }

  const { data, error } = await supabase.rpc('get_invite_details', {
    p_code: inviteCode.trim(),
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] getInviteDetails error:', error);
    throw error;
  }

  return data;
}

/**
 * Mengajukan permohonan bergabung ke tenant (warga pendaftar)
 */
export async function requestJoinTenant({ tenantId, userId, unitId, fullName, phone, occupancyStatus }) {
  if (!tenantId || !userId) {
    throw new Error('Tenant ID dan User ID wajib disertakan.');
  }

  const payload = {
    tenant_id: tenantId,
    user_id: userId,
    unit_id: unitId ? Number(unitId) : null,
    full_name: fullName.trim(),
    phone: phone ? phone.trim() : null,
    occupancy_status: occupancyStatus || 'owner_occupied',
    status: 'pending',
  };

  if (IS_DEMO) {
    return { id: `mem-demo-${Date.now()}`, ...payload };
  }

  const { data, error } = await supabase
    .from('tenant_members')
    .insert(payload)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Anda sudah terdaftar atau pernah mengajukan pendaftaran di komunitas ini.');
    }
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] requestJoinTenant error:', error);
    throw error;
  }

  return data;
}

/**
 * Mengambil daftar pendaftar anggota yang masih pending di sebuah tenant
 */
export async function fetchPendingTenantMembers(tenantId) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return [
      {
        id: 'mock-pending-1',
        tenant_id: tenantId,
        user_id: 'user-p1',
        unit_id: 3,
        full_name: 'Budi Santoso',
        phone: '081298765432',
        role: 'anggota',
        status: 'pending',
        occupancy_status: 'owner_occupied',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        tenant_units: { id: 3, label: 'Blok A-03' },
      },
      {
        id: 'mock-pending-2',
        tenant_id: tenantId,
        user_id: 'user-p2',
        unit_id: 5,
        full_name: 'Dewi Lestari',
        phone: '081311223344',
        role: 'anggota',
        status: 'pending',
        occupancy_status: 'tenant',
        created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
        tenant_units: { id: 5, label: 'Blok A-05' },
      },
    ];
  }

  const { data, error } = await supabase
    .from('tenant_members')
    .select(`
      id,
      tenant_id,
      user_id,
      unit_id,
      full_name,
      phone,
      tenant_role_id,
      is_owner,
      status,
      occupancy_status,
      created_at,
      tenant_units:unit_id (
        id,
        label
      ),
      tenant_roles:tenant_role_id (
        id,
        name,
        is_owner_role,
        is_base_role
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchPendingTenantMembers error:', error);
    throw error;
  }

  return data || [];
}

/**
 * Mengambil seluruh anggota tenant (approved atau sesuai opsi status)
 * @param {string} tenantId
 * @param {object} opts - { status }
 */
export async function fetchTenantMembers(tenantId, opts = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('../mockData');
    return mock.mockResidents || [];
  }

  let query = supabase
    .from('tenant_members')
    .select(`
      id,
      tenant_id,
      user_id,
      unit_id,
      full_name,
      phone,
      tenant_role_id,
      is_owner,
      status,
      occupancy_status,
      created_at,
      tenant_units:unit_id (
        id,
        label,
        metadata
      ),
      tenant_roles:tenant_role_id (
        id,
        name,
        is_owner_role,
        is_base_role
      )
    `)
    .eq('tenant_id', tenantId);

  if (opts.status) {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantMembers error:', error);
    throw error;
  }

  return data || [];
}

/**
 * Menyetujui pendaftaran anggota tenant
 */
export async function approveTenantMember(memberId, { role = 'anggota', tenantRoleId, unitId, occupancyStatus } = {}) {
  if (!memberId) throw new Error('Member ID wajib disertakan.');

  const updateData = {
    status: 'approved',
    updated_at: new Date().toISOString(),
  };

  if (tenantRoleId) {
    updateData.tenant_role_id = tenantRoleId;
  }
  if (unitId !== undefined) updateData.unit_id = unitId ? Number(unitId) : null;
  if (occupancyStatus !== undefined) updateData.occupancy_status = occupancyStatus;

  if (IS_DEMO) {
    return { id: memberId, ...updateData };
  }

  const { data, error } = await supabase
    .from('tenant_members')
    .update(updateData)
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] approveTenantMember error:', error);
    throw error;
  }

  return data;
}

/**
 * Menolak pendaftaran anggota tenant
 */
export async function rejectTenantMember(memberId) {
  if (!memberId) throw new Error('Member ID wajib disertakan.');

  if (IS_DEMO) {
    return { id: memberId, status: 'rejected' };
  }

  const { data, error } = await supabase
    .from('tenant_members')
    .update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] rejectTenantMember error:', error);
    throw error;
  }

  return data;
}