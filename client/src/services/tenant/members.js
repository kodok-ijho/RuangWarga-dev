/**
 * members.js
 * Manajemen unit, registrasi anggota, kode undangan, dan approval anggota tenant.
 */

import { supabase, IS_DEMO } from './shared';
import Papa from 'papaparse';

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
 * Mengajukan permohonan bergabung ke tenant (warga pendaftar) via RPC request_join_tenant
 */
export async function requestJoinTenant({ code, unitId, fullName, phone, occupancyStatus }) {
  if (!code || !code.trim()) {
    throw new Error('Kode undangan wajib disertakan.');
  }

  const trimmedCode = code.trim();
  const trimmedName = fullName ? fullName.trim() : '';
  if (!trimmedName) {
    throw new Error('Nama lengkap wajib diisi.');
  }

  if (IS_DEMO) {
    return {
      member_id: `mem-demo-${Date.now()}`,
      tenant_id: 'demo-tenant-rtrw',
      unit_id: unitId ? Number(unitId) : null,
      full_name: trimmedName,
      phone: phone ? phone.trim() : null,
      occupancy_status: occupancyStatus || 'owner_occupied',
      status: 'pending',
    };
  }

  const { data, error } = await supabase.rpc('request_join_tenant', {
    p_code: trimmedCode,
    p_unit_id: unitId ? Number(unitId) : null,
    p_full_name: trimmedName,
    p_phone: phone ? phone.trim() : null,
    p_occupancy_status: occupancyStatus || 'owner_occupied',
  });

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

/**
 * Helper murni untuk menormalisasi data penghuni unit.
 * Membersihkan string (trim), menyaring phone agar hanya digit dan +,
 * serta memvalidasi occupancy_status ('owner_occupied' | 'tenant').
 *
 * @param {Object} [occupant] - { name, phone, occupancy_status, note }
 * @returns {Object}
 */
export function normalizeOccupant(occupant) {
  if (!occupant || typeof occupant !== 'object') {
    return {};
  }

  const result = {};

  if (occupant.name !== undefined && occupant.name !== null) {
    const cleanName = String(occupant.name).trim();
    if (cleanName) result.name = cleanName;
  }

  if (occupant.phone !== undefined && occupant.phone !== null) {
    const cleanPhone = String(occupant.phone).trim().replace(/[^\d+]/g, '');
    if (cleanPhone) result.phone = cleanPhone;
  }

  if (occupant.occupancy_status !== undefined && occupant.occupancy_status !== null) {
    const cleanStatus = String(occupant.occupancy_status).trim();
    if (cleanStatus === 'owner_occupied' || cleanStatus === 'tenant') {
      result.occupancy_status = cleanStatus;
    }
  }

  if (occupant.note !== undefined && occupant.note !== null) {
    const cleanNote = String(occupant.note).trim();
    if (cleanNote) result.note = cleanNote;
  }

  return result;
}

export function validateRentPrice(rentPrice) {
  if (rentPrice === undefined || rentPrice === null || rentPrice === '') return undefined;
  const num = Number(rentPrice);
  if (isNaN(num) || num < 0) {
    throw new Error('Harga sewa harus berupa angka yang lebih besar atau sama dengan 0.');
  }
  return num;
}

export function validateFacilities(facilities) {
  if (facilities === undefined || facilities === null) return undefined;
  if (!Array.isArray(facilities)) {
    throw new Error('Fasilitas harus berupa array.');
  }
  const cleanList = [];
  const seen = new Set();
  for (const item of facilities) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      cleanList.push(trimmed);
    }
  }
  return cleanList;
}

/**
 * Parsing konten CSV unit menjadi baris terstruktur untuk importTenantUnitsCSV.
 * Menerima variasi header case-insensitive: label, nama_penghuni, hp, status_tinggal, catatan.
 * Memetakan status_tinggal (pemilik -> owner_occupied, penyewa/kontrak -> tenant).
 *
 * @param {string} text - Teks mentah file CSV
 * @returns {Array<{ label: string, occupant_name: string, occupant_phone: string, occupancy_status: string, note: string }>}
 */
export function parseUnitsCsv(text) {
  if (!text || typeof text !== 'string') return [];

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
  });

  if (!parsed.data || !Array.isArray(parsed.data)) {
    return [];
  }

  return parsed.data.map((row) => {
    const getField = (...keys) => {
      for (const key of keys) {
        const target = key.toLowerCase();
        for (const rawKey of Object.keys(row)) {
          if (rawKey.trim().toLowerCase() === target) {
            return row[rawKey];
          }
        }
      }
      return '';
    };

    const rawLabel = getField('label');
    const rawName = getField('nama_penghuni', 'nama', 'occupant_name', 'penghuni');
    const rawPhone = getField('hp', 'no_hp', 'telepon', 'phone', 'occupant_phone', 'kontak');
    const rawStatus = getField('status_tinggal', 'occupancy_status', 'status');
    const rawNote = getField('catatan', 'note', 'keterangan');

    let mappedStatus = '';
    const cleanStatus = String(rawStatus || '').trim().toLowerCase();
    if (cleanStatus === 'pemilik' || cleanStatus === 'owner_occupied') {
      mappedStatus = 'owner_occupied';
    } else if (cleanStatus === 'penyewa' || cleanStatus === 'kontrak' || cleanStatus === 'tenant') {
      mappedStatus = 'tenant';
    }

    return {
      label: rawLabel !== undefined && rawLabel !== null ? String(rawLabel).trim() : '',
      occupant_name: rawName !== undefined && rawName !== null ? String(rawName).trim() : '',
      occupant_phone: rawPhone !== undefined && rawPhone !== null ? String(rawPhone).trim() : '',
      occupancy_status: mappedStatus,
      note: rawNote !== undefined && rawNote !== null ? String(rawNote).trim() : '',
    };
  });
}

/**
 * Membuat satu unit baru untuk tenant.
 * Menolak jika label sudah ada di tenant (case-insensitive + trim).
 *
 * @param {string} tenantId
 * @param {Object} payload - { label: string, occupant?: Object }
 */
export async function createTenantUnit(
  tenantId,
  { label, occupant, status, rentPrice, facilities } = {}
) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  const trimmedLabel = typeof label === 'string' ? label.trim() : '';
  if (!trimmedLabel) {
    throw new Error('Label unit wajib diisi.');
  }

  const validStatus = status === 'vacant' ? 'vacant' : (status === 'inactive' ? 'inactive' : 'active');
  const validatedPrice = validateRentPrice(rentPrice);
  const validatedFacilities = validateFacilities(facilities);

  const normOcc = normalizeOccupant(occupant);
  const initialMetadata = {};
  if (Object.keys(normOcc).length > 0) {
    initialMetadata.occupant = normOcc;
  }
  if (validatedPrice !== undefined) {
    initialMetadata.default_rent_price = validatedPrice;
  }
  if (validatedFacilities !== undefined) {
    initialMetadata.facilities = validatedFacilities;
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');

  if (isDemoOrMock) {
    const currentList = await fetchTenantUnits(tenantId);
    const isDup = currentList.some(
      (u) => u.label && u.label.trim().toLowerCase() === trimmedLabel.toLowerCase()
    );
    if (isDup) {
      throw new Error(`Unit dengan label "${trimmedLabel}" sudah ada.`);
    }

    const newUnit = {
      id: Date.now(),
      tenant_id: tenantId,
      label: trimmedLabel,
      status: validStatus,
      metadata: initialMetadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    demoTenantUnitsMap.set(tenantId, [...currentList, newUnit]);
    return newUnit;
  }

  const { data: existingUnits, error: checkErr } = await supabase
    .from('tenant_units')
    .select('id, label')
    .eq('tenant_id', tenantId);

  if (checkErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] createTenantUnit check error:', checkErr);
    throw checkErr;
  }

  const isDup = (existingUnits || []).some(
    (u) => u.label && u.label.trim().toLowerCase() === trimmedLabel.toLowerCase()
  );
  if (isDup) {
    throw new Error(`Unit dengan label "${trimmedLabel}" sudah ada.`);
  }

  const payload = {
    tenant_id: tenantId,
    label: trimmedLabel,
    status: validStatus,
    metadata: initialMetadata,
  };

  const { data, error } = await supabase
    .from('tenant_units')
    .insert(payload)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] createTenantUnit error:', error);
    throw error;
  }

  return data;
}

/**
 * Memperbarui unit tenant (label, status, occupant).
 * Mempertahankan kunci metadata lain dan menggabungkan data occupant baru (merge).
 *
 * @param {string} tenantId
 * @param {number|string} unitId
 * @param {Object} fields - { label?: string, status?: string, occupant?: Object }
 */
export async function updateTenantUnit(
  tenantId,
  unitId,
  { label, status, occupant, rentPrice, facilities } = {}
) {
  if (!tenantId || !unitId) {
    throw new Error('Tenant ID dan Unit ID wajib disertakan.');
  }

  const validatedPrice = validateRentPrice(rentPrice);
  const validatedFacilities = validateFacilities(facilities);

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');

  if (isDemoOrMock) {
    const currentList = await fetchTenantUnits(tenantId);
    const oldUnit = currentList.find((u) => String(u.id) === String(unitId));
    if (!oldUnit) {
      throw new Error('Unit tidak ditemukan.');
    }

    let updatedLabel = oldUnit.label;
    if (label !== undefined) {
      const trimmed = typeof label === 'string' ? label.trim() : '';
      if (!trimmed) throw new Error('Label unit tidak boleh kosong.');
      if (trimmed.toLowerCase() !== oldUnit.label.trim().toLowerCase()) {
        const isDup = currentList.some(
          (u) => String(u.id) !== String(unitId) && u.label && u.label.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (isDup) {
          throw new Error(`Unit dengan label "${trimmed}" sudah ada.`);
        }
      }
      updatedLabel = trimmed;
    }

    let updatedStatus = oldUnit.status;
    if (status !== undefined) {
      if (status !== 'active' && status !== 'inactive' && status !== 'vacant') {
        throw new Error('Status unit hanya boleh "active", "inactive", atau "vacant".');
      }
      updatedStatus = status;
    }

    let updatedMetadata = { ...(oldUnit.metadata || {}) };
    if (occupant !== undefined) {
      const oldOccupant =
        updatedMetadata && typeof updatedMetadata.occupant === 'object' && updatedMetadata.occupant !== null
          ? updatedMetadata.occupant
          : {};
      const cleanOccupant = normalizeOccupant(occupant);
      updatedMetadata.occupant = {
        ...oldOccupant,
        ...cleanOccupant,
      };
    }
    if (validatedPrice !== undefined) {
      updatedMetadata.default_rent_price = validatedPrice;
    }
    if (validatedFacilities !== undefined) {
      updatedMetadata.facilities = validatedFacilities;
    }

    const updatedUnit = {
      ...oldUnit,
      label: updatedLabel,
      status: updatedStatus,
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    };

    demoTenantUnitsMap.set(
      tenantId,
      currentList.map((u) => (String(u.id) === String(unitId) ? updatedUnit : u))
    );
    return updatedUnit;
  }

  const { data: oldUnit, error: fetchErr } = await supabase
    .from('tenant_units')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', unitId)
    .single();

  if (fetchErr || !oldUnit) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantUnit fetch error:', fetchErr);
    throw fetchErr || new Error('Unit tidak ditemukan.');
  }

  const updatePayload = {
    updated_at: new Date().toISOString(),
  };

  if (label !== undefined) {
    const trimmed = typeof label === 'string' ? label.trim() : '';
    if (!trimmed) throw new Error('Label unit tidak boleh kosong.');
    if (trimmed.toLowerCase() !== oldUnit.label.trim().toLowerCase()) {
      const { data: existingUnits, error: checkErr } = await supabase
        .from('tenant_units')
        .select('id, label')
        .eq('tenant_id', tenantId)
        .neq('id', unitId);

      if (checkErr) {
        // eslint-disable-next-line no-console
        console.error('[tenantOperationalService] updateTenantUnit check error:', checkErr);
        throw checkErr;
      }

      const isDup = (existingUnits || []).some(
        (u) => u.label && u.label.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (isDup) {
        throw new Error(`Unit dengan label "${trimmed}" sudah ada.`);
      }
    }
    updatePayload.label = trimmed;
  }

  if (status !== undefined) {
    if (status !== 'active' && status !== 'inactive' && status !== 'vacant') {
      throw new Error('Status unit hanya boleh "active", "inactive", atau "vacant".');
    }
    updatePayload.status = status;
  }

  const oldMetadata =
    oldUnit.metadata && typeof oldUnit.metadata === 'object' && oldUnit.metadata !== null
      ? oldUnit.metadata
      : {};
  let updatedMetadata = { ...oldMetadata };
  let hasMetadataChange = false;

  if (occupant !== undefined) {
    const oldOccupant =
      oldMetadata.occupant && typeof oldMetadata.occupant === 'object' && oldMetadata.occupant !== null
        ? oldMetadata.occupant
        : {};
    const cleanOccupant = normalizeOccupant(occupant);
    updatedMetadata.occupant = {
      ...oldOccupant,
      ...cleanOccupant,
    };
    hasMetadataChange = true;
  }

  if (validatedPrice !== undefined) {
    updatedMetadata.default_rent_price = validatedPrice;
    hasMetadataChange = true;
  }

  if (validatedFacilities !== undefined) {
    updatedMetadata.facilities = validatedFacilities;
    hasMetadataChange = true;
  }

  if (hasMetadataChange) {
    updatePayload.metadata = updatedMetadata;
  }

  const { data, error } = await supabase
    .from('tenant_units')
    .update(updatePayload)
    .eq('tenant_id', tenantId)
    .eq('id', unitId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantUnit error:', error);
    throw error;
  }

  return data;
}

/**
 * Mengubah status unit menjadi 'active', 'inactive', atau 'vacant'.
 * Status 'occupied' sengaja tidak diizinkan di sini (hanya dapat diaktifkan lewat kontrak sewa).
 *
 * @param {string} tenantId
 * @param {number|string} unitId
 * @param {'active'|'inactive'|'vacant'} status
 */
export async function setTenantUnitStatus(tenantId, unitId, status) {
  if (status !== 'active' && status !== 'inactive' && status !== 'vacant') {
    throw new Error('Status unit hanya boleh "active", "inactive", atau "vacant".');
  }
  return await updateTenantUnit(tenantId, unitId, { status });
}

/**
 * Menghapus unit tenant.
 * Menolak penghapusan bila unit sudah memiliki riwayat tagihan di billing_items.
 *
 * @param {string} tenantId
 * @param {number|string} unitId
 */
export async function deleteTenantUnit(tenantId, unitId) {
  if (!tenantId || !unitId) {
    throw new Error('Tenant ID dan Unit ID wajib disertakan.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');

  if (isDemoOrMock) {
    if (Number(unitId) === 1) {
      throw new Error('Unit ini sudah memiliki tagihan dan tidak dapat dihapus. Nonaktifkan saja.');
    }
    const currentList = await fetchTenantUnits(tenantId);
    demoTenantUnitsMap.set(
      tenantId,
      currentList.filter((u) => String(u.id) !== String(unitId))
    );
    return { success: true, id: unitId };
  }

  const { count, error: countErr } = await supabase
    .from('billing_items')
    .select('id', { count: 'exact', head: true })
    .eq('unit_id', unitId);

  if (countErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] deleteTenantUnit count error:', countErr);
    throw countErr;
  }

  if (count && count > 0) {
    throw new Error('Unit ini sudah memiliki tagihan dan tidak dapat dihapus. Nonaktifkan saja.');
  }

  const { error: delErr } = await supabase
    .from('tenant_units')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', unitId);

  if (delErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] deleteTenantUnit delete error:', delErr);
    throw delErr;
  }

  return { success: true, id: unitId };
}

/**
 * Mengimpor daftar unit via baris data CSV.
 * Label baru dibuat (batch insert), label yang sudah ada diperbarui metadata occupant-nya.
 * Duplikat label di dalam file dilewati (skipped). Baris tanpa label dilewati.
 *
 * @param {string} tenantId
 * @param {Array<Object>} rows - [{ label, occupant_name, occupant_phone, occupancy_status, note }]
 * @returns {Promise<{ created: number, updated: number, skipped: Array<{ row: Object, reason: string }> }>}
 */
export async function importTenantUnitsCSV(tenantId, rows = []) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  const result = {
    created: 0,
    updated: 0,
    skipped: [],
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return result;
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  let existingUnits = [];

  if (isDemoOrMock) {
    existingUnits = await fetchTenantUnits(tenantId);
  } else {
    const { data, error: fetchErr } = await supabase
      .from('tenant_units')
      .select('id, label, metadata')
      .eq('tenant_id', tenantId);

    if (fetchErr) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] importTenantUnitsCSV fetch error:', fetchErr);
      throw fetchErr;
    }
    existingUnits = data || [];
  }

  const existingMap = new Map();
  existingUnits.forEach((u) => {
    if (u.label) {
      existingMap.set(u.label.trim().toLowerCase(), u);
    }
  });

  const seenInFile = new Set();
  const toInsert = [];
  const toUpdate = [];

  for (const row of rows) {
    const rawLabel = row && row.label !== undefined && row.label !== null ? String(row.label).trim() : '';
    if (!rawLabel) {
      result.skipped.push({ row, reason: 'Label unit kosong.' });
      continue;
    }

    const lowerLabel = rawLabel.toLowerCase();
    if (seenInFile.has(lowerLabel)) {
      result.skipped.push({ row, reason: 'Duplikat label di dalam file CSV.' });
      continue;
    }
    seenInFile.add(lowerLabel);

    const occupantData = normalizeOccupant({
      name: row.occupant_name || row.nama_penghuni || row.nama,
      phone: row.occupant_phone || row.hp || row.telepon || row.phone,
      occupancy_status: row.occupancy_status || row.status_tinggal,
      note: row.note || row.catatan || row.keterangan,
    });

    if (existingMap.has(lowerLabel)) {
      const existingUnit = existingMap.get(lowerLabel);
      toUpdate.push({
        unit: existingUnit,
        occupantData,
      });
    } else {
      toInsert.push({
        tenant_id: tenantId,
        label: rawLabel,
        status: 'active',
        metadata: Object.keys(occupantData).length > 0 ? { occupant: occupantData } : {},
      });
    }
  }

  if (isDemoOrMock) {
    if (toInsert.length > 0) {
      const newUnits = toInsert.map((item, idx) => ({
        ...item,
        id: Date.now() + idx,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      const current = demoTenantUnitsMap.get(tenantId) || [];
      demoTenantUnitsMap.set(tenantId, [...current, ...newUnits]);
      result.created = newUnits.length;
    }

    if (toUpdate.length > 0) {
      let current = demoTenantUnitsMap.get(tenantId) || [];
      for (const item of toUpdate) {
        const oldMetadata = item.unit.metadata || {};
        const oldOccupant =
          oldMetadata.occupant && typeof oldMetadata.occupant === 'object' && oldMetadata.occupant !== null
            ? oldMetadata.occupant
            : {};
        const mergedMetadata = {
          ...oldMetadata,
          occupant: {
            ...oldOccupant,
            ...item.occupantData,
          },
        };
        current = current.map((u) =>
          u.id === item.unit.id ? { ...u, metadata: mergedMetadata, updated_at: new Date().toISOString() } : u
        );
        result.updated += 1;
      }
      demoTenantUnitsMap.set(tenantId, current);
    }

    return result;
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase
      .from('tenant_units')
      .insert(toInsert);

    if (insErr) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] importTenantUnitsCSV insert error:', insErr);
      throw insErr;
    }
    result.created = toInsert.length;
  }

  for (const item of toUpdate) {
    const oldMetadata =
      item.unit.metadata && typeof item.unit.metadata === 'object' && item.unit.metadata !== null
        ? item.unit.metadata
        : {};
    const oldOccupant =
      oldMetadata.occupant && typeof oldMetadata.occupant === 'object' && oldMetadata.occupant !== null
        ? oldMetadata.occupant
        : {};
    const mergedMetadata = {
      ...oldMetadata,
      occupant: {
        ...oldOccupant,
        ...item.occupantData,
      },
    };

    const { error: updErr } = await supabase
      .from('tenant_units')
      .update({
        metadata: mergedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', item.unit.id);

    if (updErr) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] importTenantUnitsCSV update error:', updErr);
      throw updErr;
    }
    result.updated += 1;
  }

  return result;
}

/**
 * Memperbarui data profil/unit anggota tenant.
 * Hanya kolom yang diizinkan (full_name, phone, unit_id, occupancy_status) yang dapat diperbarui.
 *
 * @param {string} tenantId
 * @param {string} memberId
 * @param {Object} fields - { full_name?: string, phone?: string, unit_id?: number|null, occupancy_status?: string|null }
 */
export async function updateTenantMember(tenantId, memberId, { full_name, phone, unit_id, occupancy_status } = {}) {
  if (!tenantId || !memberId) {
    throw new Error('Tenant ID dan Member ID wajib disertakan.');
  }

  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (full_name !== undefined) {
    const trimmedName = typeof full_name === 'string' ? full_name.trim() : '';
    if (!trimmedName) throw new Error('Nama lengkap tidak boleh kosong.');
    payload.full_name = trimmedName;
  }

  if (phone !== undefined) {
    payload.phone = phone ? String(phone).trim() : null;
  }

  if (unit_id !== undefined) {
    payload.unit_id = unit_id ? Number(unit_id) : null;
  }

  if (occupancy_status !== undefined) {
    payload.occupancy_status = occupancy_status ? String(occupancy_status).trim() : null;
  }

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return { id: memberId, tenant_id: tenantId, ...payload };
  }

  const { data, error } = await supabase
    .from('tenant_members')
    .update(payload)
    .eq('tenant_id', tenantId)
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantMember error:', error);
    throw error;
  }

  return data;
}

/**
 * Mengeluarkan anggota dari tenant.
 * Menolak jika anggota yang bersangkutan adalah pemilik komunitas (is_owner = true).
 *
 * @param {string} tenantId
 * @param {string} memberId
 */
export async function removeTenantMember(tenantId, memberId) {
  if (!tenantId || !memberId) {
    throw new Error('Tenant ID dan Member ID wajib disertakan.');
  }

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    if (memberId === 'demo-admin' || memberId === 'owner' || String(memberId).includes('owner')) {
      throw new Error('Pemilik komunitas tidak dapat dikeluarkan.');
    }
    return { success: true, id: memberId };
  }

  const { data: member, error: fetchErr } = await supabase
    .from('tenant_members')
    .select('id, is_owner')
    .eq('tenant_id', tenantId)
    .eq('id', memberId)
    .single();

  if (fetchErr || !member) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] removeTenantMember fetch error:', fetchErr);
    throw fetchErr || new Error('Anggota tidak ditemukan.');
  }

  if (member.is_owner) {
    throw new Error('Pemilik komunitas tidak dapat dikeluarkan.');
  }

  const { error: delErr } = await supabase
    .from('tenant_members')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', memberId);

  if (delErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] removeTenantMember delete error:', delErr);
    throw delErr;
  }

  return { success: true, id: memberId };
}