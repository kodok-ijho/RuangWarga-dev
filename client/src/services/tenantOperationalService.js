/**
 * tenantOperationalService.js
 *
 * Layanan operasional generik multi-tenant untuk manajemen unit,
 * pengaturan tenant (komponen tagihan, rekening kas), dan data operasional.
 * Mendukung dual-mode: Supabase production & Mock Demo mode.
 */

import { supabase } from './supabaseClient';
import { mockUnits, mockProfiles } from './mockData';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// In-memory cache unit untuk demo mode agar interaksi setup wizard terasa nyata
let demoTenantUnitsMap = new Map();

/**
 * Generate kode undangan unik berbasis nama tenant (misal: "RW-PALM-9F2B")
 */
export function generateInviteCode(tenantName = '') {
  const clean = tenantName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'RW';
  const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RW-${clean}-${randomHex}`;
}

/**
 * Mengambil detail tenant beserta settings
 */
export async function fetchTenantDetails(tenantId) {
  if (!tenantId) return null;

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    const isKos = String(tenantId).includes('kos');
    if (isKos) {
      return {
        id: tenantId,
        name: 'Kos Melati Harmoni',
        type: 'kos',
        address: 'Jl. Melati Raya No. 12, Sleman',
        contact_phone: '081234567891',
        settings: {
          default_rent_price: 1200000,
          billing_cycle: 'monthly',
          due_day: 1,
          bank_account: {
            bank_name: 'BCA',
            account_number: '8830998877',
            account_holder: 'Pengelola Kos Melati',
          },
          invite_code: 'RW-KOS-2026',
          onboarding_completed: false,
        },
      };
    }

    return {
      id: tenantId,
      name: 'Palm Village RT 05',
      type: 'rt_rw',
      address: 'Jl. Boulevard Palm No. 1',
      contact_phone: '081234567890',
      settings: {
        ipl_components: [
          { name: 'Keamanan', amount: 80000 },
          { name: 'Kebersihan', amount: 30000 },
          { name: 'Kas RT', amount: 20000 },
          { name: 'DDC (Sosial)', amount: 10000 },
        ],
        due_day: 10,
        bank_account: {
          bank_name: 'BCA',
          account_number: '8830123456',
          account_holder: 'Kas RT 05 Palm Village',
        },
        invite_code: 'RW-PALM-2026',
        onboarding_completed: true,
      },
    };
  }

  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, type, owner_id, address, contact_phone, settings, created_at, updated_at')
    .eq('id', tenantId)
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantDetails error:', error);
    throw error;
  }

  return data;
}

/**
 * Memperbarui profil dan settings tenant
 */
export async function updateTenantProfileAndSettings(tenantId, { name, address, contact_phone, settings }) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (name !== undefined) payload.name = name.trim();
  if (address !== undefined) payload.address = address ? address.trim() : null;
  if (contact_phone !== undefined) payload.contact_phone = contact_phone ? contact_phone.trim() : null;
  if (settings !== undefined) payload.settings = settings;

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return { id: tenantId, ...payload };
  }

  const { data, error } = await supabase
    .from('tenants')
    .update(payload)
    .eq('id', tenantId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantProfileAndSettings error:', error);
    throw error;
  }

  return data;
}

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
    const mock = await import('./mockData');
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
 * Pure calculation helper untuk menyusun preview tagihan bulanan
 */
export function calculateBillingPreview({
  tenantId,
  tenantType = 'rt_rw',
  period,
  units = [],
  settings = {},
  existingUnitIds = new Set(),
  unitMemberMap = new Map(),
}) {
  const isKos = tenantType === 'kos';
  const isKelas = tenantType === 'kelas';

  const iplComponents = settings.ipl_components || [
    { name: 'Keamanan Lingkungan', amount: 80000 },
    { name: 'Kebersihan & Sampah', amount: 30000 },
    { name: 'Kas Paguyuban / RT', amount: 20000 },
    { name: 'Dana Duka Cita (Sosial)', amount: 10000 },
  ];
  const defaultIplAmount = iplComponents.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const dueDay = Number(isKos ? (settings.billing_due_day || settings.due_day || 5) : (settings.due_day || 10));
  const dueDate = `${period}-${String(dueDay).padStart(2, '0')}`;

  const activeUnits = units.filter((u) => u.status !== 'inactive');
  const preview = [];
  const skipped = [];

  activeUnits.forEach((u) => {
    if (existingUnitIds.has(u.id)) {
      skipped.push({
        unit_id: u.id,
        label: u.label,
        reason: 'already_exists',
      });
      return;
    }

    if (isKos) {
      if (u.status === 'vacant') {
        skipped.push({
          unit_id: u.id,
          label: u.label,
          reason: 'room_vacant',
        });
        return;
      }

      const meta = u.metadata || {};
      const cStart = meta.contract_start;
      const cEnd = meta.contract_end;

      if (!cStart || !cEnd) {
        skipped.push({
          unit_id: u.id,
          label: u.label,
          reason: 'no_contract',
        });
        return;
      }

      const startMonth = cStart.slice(0, 7);
      const endMonth = cEnd.slice(0, 7);
      if (period < startMonth || period > endMonth) {
        skipped.push({
          unit_id: u.id,
          label: u.label,
          reason: 'contract_inactive',
        });
        return;
      }

      const rentPrice = Number(meta.rent_price || meta.default_rent_price || settings.default_rent_price || 0);
      const member = unitMemberMap.get(u.id) || null;

      preview.push({
        tenant_id: tenantId,
        unit_id: u.id,
        member_id: member?.id || meta.tenant_member_id || null,
        period,
        amount: rentPrice,
        late_fee: 0,
        due_date: dueDate,
        status: 'unpaid',
        contract_start: cStart,
        contract_end: cEnd,
        metadata: {
          bill_type: 'rent',
          billing_type: 'rent',
          auto_generated: true,
          unit_label: u.label,
          member_name: member?.full_name || 'Penyewa Kamar',
        },
        unit_info: u.label,
        resident_name: member?.full_name || 'Penyewa Kamar',
      });
      return;
    }

    if (isKelas) {
      const sppPrice = Number(u.metadata?.expected_spp || settings.spp_amount || 200000);
      const member = unitMemberMap.get(u.id) || null;

      preview.push({
        tenant_id: tenantId,
        unit_id: u.id,
        member_id: member?.id || null,
        period,
        amount: sppPrice,
        late_fee: 0,
        due_date: dueDate,
        status: 'unpaid',
        metadata: {
          bill_type: 'spp',
          billing_type: 'spp',
          class_type: settings.class_type || 'reguler',
          subject: settings.subject || '',
          instructor_name: settings.instructor_name || '',
          unit_label: u.label,
          member_name: member?.full_name || 'Slot Siswa',
          auto_generated: true,
        },
        unit_info: u.label,
        resident_name: member?.full_name || 'Slot Siswa',
      });
      return;
    }

    const member = unitMemberMap.get(u.id) || null;

    preview.push({
      tenant_id: tenantId,
      unit_id: u.id,
      member_id: member?.id || null,
      period,
      amount: defaultIplAmount,
      late_fee: 0,
      due_date: dueDate,
      status: 'unpaid',
      metadata: {
        bill_type: 'ipl',
        components: iplComponents,
        unit_label: u.label,
        member_name: member?.full_name || 'Belum Terdaftar / Kosong',
      },
      unit_info: u.label,
      resident_name: member?.full_name || 'Belum Terdaftar / Kosong',
    });
  });

  return {
    period,
    totalAmount: isKos || isKelas ? preview.reduce((acc, p) => acc + p.amount, 0) : defaultIplAmount,
    grandTotalAmount: preview.reduce((acc, p) => acc + p.amount, 0),
    dueDate,
    preview,
    skipped,
  };
}

/**
 * Generate tagihan berkala (IPL bulanan) untuk seluruh unit aktif dalam sebuah tenant.
 * Membaca komponen IPL dan due_day yang telah diinputkan pada SetupWizard (tenants.settings).
 * 
 * @param {string} tenantId - UUID tenant
 * @param {object} options - { period: 'YYYY-MM', dry_run: boolean }
 */
export async function generateTenantBillingItems(tenantId, { period, dry_run = false } = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('Format periode harus YYYY-MM.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');

  // 1. Ambil detail tenant (settings: ipl_components, due_day)
  const tenant = await fetchTenantDetails(tenantId);
  const settings = tenant?.settings || {};

  // 2. Ambil seluruh unit aktif milik tenant
  const units = await fetchTenantUnits(tenantId);

  // 3. Ambil data anggota yang menempati unit (approved members)
  let unitMemberMap = new Map();
  if (isDemoOrMock) {
    // Demo mock mapping
    units.forEach((u) => {
      unitMemberMap.set(u.id, {
        id: `mock-member-${u.id}`,
        full_name: `Penghuni ${u.label}`,
      });
    });
  } else {
    const { data: members, error: memErr } = await supabase
      .from('tenant_members')
      .select('id, unit_id, full_name, status, tenant_role_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'approved')
      .not('unit_id', 'is', null);

    if (!memErr && members) {
      members.forEach((m) => {
        unitMemberMap.set(m.unit_id, m);
      });
    }
  }

  // 4. Periksa tagihan yang sudah ada untuk periode ini agar tidak duplikat
  let existingUnitIds = new Set();
  if (!isDemoOrMock) {
    const { data: existingBills, error: billErr } = await supabase
      .from('billing_items')
      .select('unit_id')
      .eq('tenant_id', tenantId)
      .eq('period', period);

    if (!billErr && existingBills) {
      existingBills.forEach((b) => {
        if (b.unit_id) existingUnitIds.add(b.unit_id);
      });
    }
  }

  const { preview, skipped } = calculateBillingPreview({
    tenantId,
    tenantType: tenant?.type || 'rt_rw',
    period,
    units,
    settings,
    existingUnitIds,
    unitMemberMap,
  });

  // 5. Simpan ke database jika bukan dry_run
  if (!dry_run && preview.length > 0) {
    if (isDemoOrMock) {
      // Pada demo mode, preview dianggap berhasil dibuat
    } else {
      const rowsToInsert = preview.map((p) => ({
        tenant_id: p.tenant_id,
        unit_id: p.unit_id,
        member_id: p.member_id,
        period: p.period,
        amount: p.amount,
        late_fee: p.late_fee,
        due_date: p.due_date,
        status: p.status,
        contract_start: p.contract_start || null,
        contract_end: p.contract_end || null,
        metadata: p.metadata,
      }));

      const { error: insertErr } = await supabase
        .from('billing_items')
        .insert(rowsToInsert);

      if (insertErr) {
        // eslint-disable-next-line no-console
        console.error('[tenantOperationalService] generateTenantBillingItems insert error:', insertErr);
        throw new Error(insertErr.message || 'Gagal menyimpan tagihan ke database.');
      }
    }
  }

  return {
    dry_run,
    period,
    total_preview: preview.length,
    generated_count: dry_run ? 0 : preview.length,
    preview,
    skipped_count: skipped.length,
    skipped,
  };
}

/**
 * Mengambil daftar billing_items milik tenant (dengan filter period, status, unitId)
 */
export async function fetchTenantBillingItems(tenantId, { period, status, unitId } = {}) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return [];
  }

  let query = supabase
    .from('billing_items')
    .select(`
      id,
      tenant_id,
      unit_id,
      member_id,
      period,
      amount,
      late_fee,
      due_date,
      status,
      qris_ref,
      contract_start,
      contract_end,
      metadata,
      created_at,
      tenant_units:unit_id (
        id,
        label
      ),
      tenant_members:member_id (
        id,
        full_name,
        phone
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (period) query = query.eq('period', period);
  if (status) query = query.eq('status', status);
  if (unitId) query = query.eq('unit_id', unitId);

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantBillingItems error:', error);
    throw error;
  }

  return data || [];
}

/**
 * Membuat satu baris tagihan baru di billing_items
 * Mendukung penetapan kontrak sewa (contract_start, contract_end) untuk vertikal kos
 * 
 * @param {string} tenantId - UUID tenant
 * @param {object} payload - { unit_id, member_id, period, amount, late_fee, due_date, status, contract_start, contract_end, metadata }
 */
export async function createTenantBillingItem(tenantId, payload = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  if (!payload.period || !/^\d{4}-\d{2}$/.test(payload.period)) {
    throw new Error('Periode tagihan wajib diisi dengan format YYYY-MM.');
  }
  if (payload.amount === undefined || Number(payload.amount) < 0) {
    throw new Error('Nominal tagihan harus berupa angka positif atau nol.');
  }

  const row = {
    tenant_id: tenantId,
    unit_id: payload.unit_id ? Number(payload.unit_id) : null,
    member_id: payload.member_id || null,
    period: payload.period,
    amount: Number(payload.amount),
    late_fee: Number(payload.late_fee || 0),
    due_date: payload.due_date || null,
    status: payload.status || 'unpaid',
    contract_start: payload.contract_start || null,
    contract_end: payload.contract_end || null,
    metadata: payload.metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    return {
      id: `mock-bill-${Date.now()}`,
      ...row,
    };
  }

  const { data, error } = await supabase
    .from('billing_items')
    .insert([row])
    .select(`
      id,
      tenant_id,
      unit_id,
      member_id,
      period,
      amount,
      late_fee,
      due_date,
      status,
      qris_ref,
      contract_start,
      contract_end,
      metadata,
      created_at
    `)
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] createTenantBillingItem error:', error);
    throw error;
  }

  return data;
}

/**
 * Menetapkan penyewa ke kamar kos dan mengaktifkan kontrak sewa
 * Memperbarui status unit (vacant -> occupied), menyimpan metadata kontrak,
 * serta membuat tagihan sewa awal di billing_items dengan contract_start & contract_end.
 * 
 * @param {string} tenantId - UUID tenant
 * @param {object} params - { unitId, memberId, contractStart, contractEnd, rentPrice, dueDate, notes }
 */
export async function assignRoomContract(tenantId, {
  unitId,
  memberId,
  contractStart,
  contractEnd,
  rentPrice,
  dueDate,
  notes,
} = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  if (!unitId) throw new Error('Kamar (unitId) wajib dipilih.');
  if (!contractStart || !contractEnd) {
    throw new Error('Tanggal mulai dan selesai kontrak sewa wajib diisi.');
  }

  const startDate = new Date(contractStart);
  const endDate = new Date(contractEnd);
  if (endDate <= startDate) {
    throw new Error('Tanggal selesai kontrak harus lebih besar dari tanggal mulai kontrak.');
  }

  const period = contractStart.slice(0, 7);
  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');

  // 1. Update unit status menjadi 'occupied' beserta metadata kontrak
  if (!isDemoOrMock) {
    const { data: currentUnit } = await supabase
      .from('tenant_units')
      .select('metadata')
      .eq('id', unitId)
      .single();

    const currentMeta = currentUnit?.metadata || {};
    const updatedMeta = {
      ...currentMeta,
      contract_start: contractStart,
      contract_end: contractEnd,
      tenant_member_id: memberId || null,
      rent_price: Number(rentPrice || currentMeta.default_rent_price || 0),
      notes: notes || '',
    };

    await supabase
      .from('tenant_units')
      .update({
        status: 'occupied',
        metadata: updatedMeta,
        updated_at: new Date().toISOString(),
      })
      .eq('id', unitId);
  }

  // 2. Buat billing_item sewa untuk periode awal kontrak
  const bill = await createTenantBillingItem(tenantId, {
    unit_id: unitId,
    member_id: memberId || null,
    period,
    amount: Number(rentPrice || 0),
    due_date: dueDate || contractStart,
    contract_start: contractStart,
    contract_end: contractEnd,
    metadata: {
      billing_type: 'rent',
      notes: notes || 'Kontrak sewa kamar',
    },
  });

  return {
    unitId,
    memberId,
    contractStart,
    contractEnd,
    bill,
  };
}

/**
 * Auto-generate tagihan sewa bulanan untuk tenant bertipe kos.
 * Memanggil RPC public.auto_generate_kos_billing di Supabase,
 * atau melakukan perhitungan lokal pada demo/mock mode.
 * 
 * @param {string} tenantId - UUID tenant
 * @param {object} options - { period: 'YYYY-MM', dryRun: boolean }
 */
export async function autoGenerateKosBilling(tenantId, { period, dryRun = false } = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  const targetPeriod = period || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(targetPeriod)) {
    throw new Error('Format periode harus YYYY-MM.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const tenant = await fetchTenantDetails(tenantId);
    const units = await fetchTenantUnits(tenantId);
    const settings = tenant?.settings || {};

    const dueDay = Number(settings.billing_due_day || settings.due_day || 5);
    const dueDate = `${targetPeriod}-${String(dueDay).padStart(2, '0')}`;

    let generatedCount = 0;
    let skippedCount = 0;
    const items = [];

    units.forEach((u) => {
      if (u.status !== 'occupied') {
        skippedCount++;
        return;
      }

      const meta = u.metadata || {};
      const contractStart = meta.contract_start;
      const contractEnd = meta.contract_end;

      if (!contractStart || !contractEnd) {
        skippedCount++;
        return;
      }

      const startMonth = contractStart.slice(0, 7);
      const endMonth = contractEnd.slice(0, 7);

      if (targetPeriod < startMonth || targetPeriod > endMonth) {
        skippedCount++;
        return;
      }

      const rentPrice = Number(meta.rent_price || meta.default_rent_price || settings.default_rent_price || 0);

      generatedCount++;
      items.push({
        id: `mock-kos-bill-${u.id}-${targetPeriod}`,
        tenant_id: tenantId,
        unit_id: u.id,
        unit_label: u.label,
        period: targetPeriod,
        amount: rentPrice,
        due_date: dueDate,
        status: 'unpaid',
      });
    });

    return {
      success: true,
      period: targetPeriod,
      generated_count: generatedCount,
      skipped_count: skippedCount,
      items,
      dry_run: dryRun,
    };
  }

  const { data, error } = await supabase.rpc('auto_generate_kos_billing', {
    p_period: targetPeriod,
    p_tenant_id: tenantId,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] autoGenerateKosBilling error:', error);
    throw error;
  }

  return {
    ...data,
    dry_run: dryRun,
  };
}

/**
 * Melakukan proses checkout penyewa dari kamar kos.
 * Mengubah status unit menjadi 'vacant', membersihkan metadata kontrak aktif,
 * melepaskan penugasan unit dari penyewa, dan membatalkan tagihan belum bayar di masa depan.
 * 
 * @param {string} tenantId - UUID tenant (kos)
 * @param {object} params - { unitId, checkoutDate, reason, cancelFutureBills }
 */
export async function checkoutKosRoom(tenantId, {
  unitId,
  checkoutDate = new Date().toISOString().slice(0, 10),
  reason = '',
  cancelFutureBills = true,
} = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  if (!unitId) throw new Error('Kamar (unitId) wajib ditentukan untuk checkout.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const units = await fetchTenantUnits(tenantId);
    const targetUnit = units.find((u) => String(u.id) === String(unitId));
    if (targetUnit) {
      targetUnit.status = 'vacant';
      const meta = targetUnit.metadata || {};
      targetUnit.metadata = {
        ...meta,
        last_checkout: {
          checkout_date: checkoutDate,
          reason: reason || 'Checkout penyewa',
          previous_member_id: meta.tenant_member_id || null,
          previous_contract_start: meta.contract_start || null,
          previous_contract_end: meta.contract_end || null,
        },
      };
      delete targetUnit.metadata.contract_start;
      delete targetUnit.metadata.contract_end;
      delete targetUnit.metadata.tenant_member_id;
      delete targetUnit.metadata.notes;
    }

    return {
      success: true,
      unit_id: Number(unitId),
      unit_label: targetUnit?.label || `Kamar ${unitId}`,
      status: 'vacant',
      checkout_date: checkoutDate,
      cancelled_future_bills: 0,
    };
  }

  const { data, error } = await supabase.rpc('checkout_kos_room', {
    p_tenant_id: tenantId,
    p_unit_id: Number(unitId),
    p_checkout_date: checkoutDate,
    p_reason: reason || null,
    p_cancel_future_bills: cancelFutureBills,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] checkoutKosRoom error:', error);
    throw error;
  }

  return data;
}

/**
 * Mengambil dan membentuk matriks tagihan multi-bulan (12 periode) generik untuk sebuah tenant
 * @param {string} tenantId - UUID tenant
 * @param {number} year - Tahun buku (misal 2026 -> Jul 2026 s/d Jun 2027)
 * @param {object} opts - { scopeUnitId }
 */
export async function fetchTenantBillMatrix(tenantId, year = 2026, opts = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.getBillMatrix(year, opts);
  }

  // 1. Tentukan 12 periode tahun buku (Juli YYYY s/d Juni YYYY+1)
  const periods = [
    `${year}-07`, `${year}-08`, `${year}-09`, `${year}-10`, `${year}-11`, `${year}-12`,
    `${year + 1}-01`, `${year + 1}-02`, `${year + 1}-03`, `${year + 1}-04`, `${year + 1}-05`, `${year + 1}-06`
  ];

  // 2. Ambil units
  let units = await fetchTenantUnits(tenantId);
  if (opts.scopeUnitId) {
    units = units.filter((u) => Number(u.id) === Number(opts.scopeUnitId));
  }

  // 3. Ambil approved members
  const { data: members } = await supabase
    .from('tenant_members')
    .select('id, unit_id, full_name, phone, occupancy_status, tenant_role_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'approved');

  const unitMemberMap = new Map();
  (members || []).forEach((m) => {
    if (m.unit_id) unitMemberMap.set(m.unit_id, m);
  });

  // 4. Ambil billing_items untuk rentang 12 periode ini
  let billQuery = supabase
    .from('billing_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('period', periods);

  if (opts.scopeUnitId) {
    billQuery = billQuery.eq('unit_id', opts.scopeUnitId);
  }

  const { data: bills } = await billQuery;
  const billMap = new Map();
  const billIds = [];
  (bills || []).forEach((b) => {
    billMap.set(`${b.unit_id}_${b.period}`, b);
    billIds.push(b.id);
  });

  // 5. Ambil payments jika ada billIds
  const paymentMap = new Map();
  if (billIds.length > 0) {
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('billing_item_id', billIds);

    (payments || []).forEach((p) => {
      paymentMap.set(p.billing_item_id, p);
    });
  }

  // 6. Susun struktur baris matriks sesuai format konsisten PortalWarga
  const rows = units.map((unit) => {
    const resident = unitMemberMap.get(unit.id) || null;

    const cells = periods.map((period) => {
      const bill = billMap.get(`${unit.id}_${period}`) || null;
      const payment = bill ? paymentMap.get(bill.id) || null : null;

      return {
        period,
        status: bill ? bill.status : 'none',
        bill: bill
          ? {
              ...bill,
              unit_id: unit.id,
              amount: Number(bill.amount || 0),
              late_fee: Number(bill.late_fee || 0),
            }
          : null,
        payment: payment || null,
      };
    });

    return {
      unit: {
        id: unit.id,
        label: unit.label,
        block: unit.metadata?.block || unit.label,
        unit_number: unit.metadata?.unit_number || '',
        is_occupied: Boolean(resident),
        occupancy_status: resident?.occupancy_status || (resident ? 'owner_occupied' : 'owner_vacant'),
      },
      resident,
      residents: resident ? [resident] : [],
      cells,
    };
  });

  return rows;
}

/**
 * Mengambil daftar pembayaran tenant generik (payments + billing_items + members + units)
 * @param {string} tenantId - UUID tenant
 * @param {object} opts - { status }
 */
export async function fetchTenantPayments(tenantId, opts = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.mockPayments;
  }

  let query = supabase
    .from('payments')
    .select(`
      id,
      tenant_id,
      billing_item_id,
      member_id,
      amount,
      method,
      transaction_id,
      status,
      proof_url,
      verified_by,
      verified_at,
      paid_at,
      metadata,
      created_at,
      updated_at,
      billing_items:billing_item_id (
        id,
        period,
        amount,
        late_fee,
        unit_id,
        status,
        tenant_units:unit_id (
          id,
          label,
          metadata
        )
      ),
      tenant_members:member_id (
        id,
        full_name,
        phone,
        tenant_role_id,
        occupancy_status
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (opts.status) {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantPayments error:', error);
    throw error;
  }

  return (data || []).map((p) => {
    const bill = p.billing_items || {};
    const unit = bill.tenant_units || {};
    const member = p.tenant_members || {};
    const meta = p.metadata || {};

    const proofFileUrl = p.proof_url || meta.proof_file_url || meta.proof_url || '';
    const proofFileName =
      meta.proof_file_name ||
      meta.receipt_file ||
      (proofFileUrl ? proofFileUrl.split('/').pop().split('?')[0] : '');

    return {
      ...p,
      id: p.id,
      tenant_id: p.tenant_id,
      billing_item_id: p.billing_item_id || bill.id || '',
      resident_id: p.member_id || member.id || '',
      unit_id: bill.unit_id || unit.id || '',
      period: bill.period || meta.period || '',
      amount: Number(p.amount ?? bill.amount ?? 0),
      method: p.method || 'bank_transfer',
      status: p.status === 'completed' ? 'verified' : p.status,
      paid_at: p.paid_at || p.created_at,
      verified_by: meta.verified_by_name || p.verified_by || '',
      verified_at: p.verified_at,
      rejection_reason: meta.rejection_reason || '',
      proof_file_url: proofFileUrl,
      proof_file_name: proofFileName,
      receipt_file: proofFileName,
      metadata: meta,
      _bill: {
        id: bill.id,
        period: bill.period,
        amount: Number(bill.amount || 0),
        unit_id: bill.unit_id,
        status: bill.status,
      },
      _profile: member.id ? member : null,
      _unit: unit.id
        ? {
            id: unit.id,
            label: unit.label,
            block: unit.metadata?.block || unit.label,
            unit_number: unit.metadata?.unit_number || '',
          }
        : null,
    };
  });
}

/**
 * Memverifikasi / menyetujui pembayaran manual (bank_transfer/cash) untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} paymentId - UUID payment
 * @param {object} param2 - { verifiedBy, note }
 */
export async function verifyTenantPayment(tenantId, paymentId, { verifiedBy, note } = {}) {
  if (!tenantId || !paymentId) throw new Error('tenantId dan paymentId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    const payment = mock.verifyPayment(paymentId, { verifiedBy, note });
    return {
      success: true,
      paymentId,
      status: 'verified',
      payment: payment || { id: paymentId, status: 'verified', verified_by: verifiedBy },
    };
  }

  const { data: currentPayment, error: fetchErr } = await supabase
    .from('payments')
    .select('id, billing_item_id, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .single();

  if (fetchErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] verifyTenantPayment fetch error:', fetchErr);
    throw fetchErr;
  }

  const updatedMetadata = {
    ...(currentPayment.metadata || {}),
    verified_by_name: verifiedBy || 'Pengurus',
    verification_note: note || '',
  };

  const { error: payErr } = await supabase
    .from('payments')
    .update({
      status: 'completed',
      verified_at: new Date().toISOString(),
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', paymentId);

  if (payErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] verifyTenantPayment update error:', payErr);
    throw payErr;
  }

  if (currentPayment.billing_item_id) {
    const { error: billErr } = await supabase
      .from('billing_items')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', currentPayment.billing_item_id);

    if (billErr) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] verifyTenantPayment billing update error:', billErr);
    }
  }

  return { success: true, paymentId, status: 'completed' };
}

/**
 * Menolak bukti pembayaran manual untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} paymentId - UUID payment
 * @param {object} param2 - { rejectedBy, reason }
 */
export async function rejectTenantPayment(tenantId, paymentId, { rejectedBy, reason } = {}) {
  if (!tenantId || !paymentId) throw new Error('tenantId dan paymentId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    const payment = mock.rejectPayment(paymentId, { rejectedBy, reason });
    return {
      success: true,
      paymentId,
      status: 'rejected',
      payment: payment || { id: paymentId, status: 'rejected', rejected_by: rejectedBy, rejection_reason: reason },
    };
  }

  const { data: currentPayment, error: fetchErr } = await supabase
    .from('payments')
    .select('id, billing_item_id, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .single();

  if (fetchErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] rejectTenantPayment fetch error:', fetchErr);
    throw fetchErr;
  }

  const updatedMetadata = {
    ...(currentPayment.metadata || {}),
    rejected_by_name: rejectedBy || 'Pengurus',
    rejection_reason: reason || '',
    rejected_at: new Date().toISOString(),
  };

  const { error: payErr } = await supabase
    .from('payments')
    .update({
      status: 'rejected',
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', paymentId);

  if (payErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] rejectTenantPayment update error:', payErr);
    throw payErr;
  }

  if (currentPayment.billing_item_id) {
    const { error: billErr } = await supabase
      .from('billing_items')
      .update({
        status: 'unpaid',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', currentPayment.billing_item_id);

    if (billErr) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] rejectTenantPayment billing update error:', billErr);
    }
  }

  return { success: true, paymentId, status: 'rejected' };
}

/**
 * Mengajukan pembayaran manual (transfer / tunai) untuk tenant.
 * Membuat baris di tabel payments dengan status 'pending_verification' (atau 'completed' jika dibuat oleh staff/cash)
 * dan memperbarui status billing_items ke 'pending_verification'.
 */
export async function submitTenantPayment(tenantId, {
  billId,
  method = 'bank_transfer',
  amount,
  proofFile,
  proofUrl,
  note,
  paidAt,
  memberId,
  isStaff = false,
  verifiedBy = null,
} = {}) {
  if (!tenantId || !billId) {
    throw new Error('Tenant ID dan Bill ID wajib disertakan.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.recordResidentPayment([billId], {
      method,
      receiptFile: proofFile?.name || (typeof proofFile === 'string' ? proofFile : null),
      note,
    });
  }

  // 1. Ambil detail tagihan untuk memastikan nominal dan status
  const { data: bill, error: billFetchErr } = await supabase
    .from('billing_items')
    .select('id, amount, late_fee, member_id, status')
    .eq('tenant_id', tenantId)
    .eq('id', billId)
    .single();

  if (billFetchErr || !bill) {
    throw new Error('Tagihan tidak ditemukan untuk tenant ini.');
  }

  const paymentAmount = amount !== undefined && amount !== null && amount !== ''
    ? Number(amount)
    : (Number(bill.amount || 0) + Number(bill.late_fee || 0));

  const initialStatus = isStaff && method === 'cash' ? 'completed' : 'pending_verification';

  // 2. Upload bukti transfer jika berupa File
  let resolvedProofUrl = proofUrl || '';
  let proofFileName = proofFile?.name || (typeof proofFile === 'string' ? proofFile : '');

  if (proofFile && typeof proofFile === 'object' && proofFile.size) {
    try {
      const ext = (proofFile.name || '').split('.').pop() || 'jpg';
      const storagePath = `payments/${tenantId}/${billId}_${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('payment-proofs')
        .upload(storagePath, proofFile, { upsert: true });

      if (!uploadErr && uploadData?.path) {
        const { data: pubUrl } = supabase.storage
          .from('payment-proofs')
          .getPublicUrl(uploadData.path);
        resolvedProofUrl = pubUrl?.publicUrl || '';
      }
    } catch {
      // jika storage upload gagal / bucket belum ada, simpan nama file di metadata
    }
  }

  // 3. Insert record ke payments
  const paymentPayload = {
    tenant_id: tenantId,
    billing_item_id: billId,
    member_id: memberId || bill.member_id || null,
    amount: paymentAmount,
    method: method || 'bank_transfer',
    status: initialStatus,
    proof_url: resolvedProofUrl || null,
    paid_at: paidAt || new Date().toISOString(),
    metadata: {
      note: note || '',
      proof_file_name: proofFileName,
      submitted_at: new Date().toISOString(),
      ...(verifiedBy ? { verified_by_name: verifiedBy } : {}),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: insertedPayment, error: payErr } = await supabase
    .from('payments')
    .insert([paymentPayload])
    .select()
    .single();

  if (payErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] submitTenantPayment error:', payErr);
    throw payErr;
  }

  // 4. Update status billing_items
  const nextBillStatus = initialStatus === 'completed' ? 'paid' : 'pending_verification';
  const { error: billUpdateErr } = await supabase
    .from('billing_items')
    .update({
      status: nextBillStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', billId);

  if (billUpdateErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] submitTenantPayment bill update error:', billUpdateErr);
  }

  return insertedPayment;
}

/**
 * Memperbarui rincian pembayaran untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} paymentId - UUID payment
 * @param {object} param2 - { unit_id, amount, method, paid_at, note }
 */
export async function updateTenantPayment(tenantId, paymentId, { unit_id, amount, method, paid_at, note } = {}) {
  if (!tenantId || !paymentId) throw new Error('tenantId dan paymentId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.updatePayment(paymentId, { unit_id, amount, method, paid_at, note });
  }

  const updateFields = {
    updated_at: new Date().toISOString(),
  };
  if (amount !== undefined && amount !== null && amount !== '') updateFields.amount = Number(amount);
  if (method) updateFields.method = method;
  if (paid_at) updateFields.paid_at = paid_at;

  const { data: current, error: fetchErr } = await supabase
    .from('payments')
    .select('id, metadata, billing_item_id')
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .single();

  if (fetchErr) throw fetchErr;

  if (note !== undefined) {
    updateFields.metadata = {
      ...(current.metadata || {}),
      note: String(note).trim(),
    };
  }

  const { data, error } = await supabase
    .from('payments')
    .update(updateFields)
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantPayment error:', error);
    throw error;
  }

  if (unit_id && current.billing_item_id) {
    await supabase
      .from('billing_items')
      .update({ unit_id, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', current.billing_item_id);
  }

  return data;
}

/**
 * Mengambil daftar pengeluaran kas tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} filters - { category, month }
 */
export async function fetchTenantExpenses(tenantId, filters = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.mockExpenses || [];
  }

  let query = supabase
    .from('expenses')
    .select('id, tenant_id, category, amount, description, receipt_url, recorded_by, metadata, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.category) {
    query = query.eq('category', filters.category);
  }

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantExpenses error:', error);
    throw error;
  }

  return (data || []).map((exp) => {
    const meta = exp.metadata || {};
    const date = meta.date || (exp.created_at ? exp.created_at.substring(0, 10) : '');
    const receiptFile = exp.receipt_url ? exp.receipt_url.split('/').pop().split('?')[0] : '';
    return {
      ...exp,
      amount: Number(exp.amount || 0),
      date,
      expense_date: date,
      receipt_file_url: exp.receipt_url || '',
      file_url: exp.receipt_url || '',
      receipt_file: receiptFile,
    };
  });
}

/**
 * Mencatat pengeluaran baru untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} param1 - { date, category, amount, description, file, recordedBy }
 */
export async function createTenantExpense(tenantId, { date, category, amount, description, file, recordedBy } = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.addExpense({
      date,
      category,
      amount,
      description,
      receipt_file: file ? file.name : null,
    });
  }

  const expenseDate = date || new Date().toISOString().substring(0, 10);
  const payload = {
    tenant_id: tenantId,
    category: category || 'Lain-lain',
    amount: Number(amount || 0),
    description: description ? description.trim() : null,
    receipt_url: file ? file.name : null,
    recorded_by: recordedBy || null,
    metadata: {
      date: expenseDate,
      file_name: file ? file.name : null,
    },
    created_at: new Date(expenseDate).toISOString(),
  };

  const { data, error } = await supabase
    .from('expenses')
    .insert(payload)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] createTenantExpense error:', error);
    throw error;
  }

  return data;
}

/**
 * Memperbarui pengeluaran tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} expenseId - UUID expense
 * @param {object} param2 - { date, category, amount, description, file }
 */
export async function updateTenantExpense(tenantId, expenseId, { date, category, amount, description, file } = {}) {
  if (!tenantId || !expenseId) throw new Error('tenantId dan expenseId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.updateExpense(expenseId, {
      date,
      category,
      amount,
      description,
      receipt_file: file ? file.name : null,
    });
  }

  const updateFields = {
    updated_at: new Date().toISOString(),
  };
  if (category) updateFields.category = category;
  if (amount !== undefined && amount !== '') updateFields.amount = Number(amount);
  if (description !== undefined) updateFields.description = description ? description.trim() : null;
  if (file) updateFields.receipt_url = file.name;

  if (date) {
    updateFields.metadata = { date };
    updateFields.created_at = new Date(date).toISOString();
  }

  const { data, error } = await supabase
    .from('expenses')
    .update(updateFields)
    .eq('tenant_id', tenantId)
    .eq('id', expenseId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantExpense error:', error);
    throw error;
  }

  return data;
}

/**
 * Menghapus pengeluaran tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} expenseId - UUID expense
 */
export async function deleteTenantExpense(tenantId, expenseId) {
  if (!tenantId || !expenseId) throw new Error('tenantId dan expenseId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.deleteExpense(expenseId);
  }

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', expenseId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] deleteTenantExpense error:', error);
    throw error;
  }

  return { success: true, id: expenseId };
}

/**
 * Mengambil ringkasan laporan keuangan bulanan tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} param1 - { year, month }
 */
export async function fetchTenantMonthlyFinance(tenantId, { year, month }) {
  if (!tenantId) throw new Error('tenantId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const baseReport = mock.computeReport(period);
    const expenses = mock.getExpensesForPeriod(period);
    const totalExpense = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalIncome = Number(baseReport?.totalCollected || 0);
    return {
      report: {
        ...baseReport,
        total_income: totalIncome,
        total_expense: totalExpense,
        net_income: totalIncome - totalExpense,
        cash_inflow: totalIncome,
        cash_outflow: totalExpense,
        balance: totalIncome - totalExpense,
      },
      expenses,
      cashPayments: mock.getPaymentsByMonth(year, month),
    };
  }

  const periodStr = `${year}-${String(month).padStart(2, '0')}`;

  // 1. Ambil seluruh payment completed/verified pada tenant ini
  const { data: payments } = await supabase
    .from('payments')
    .select(`
      id,
      amount,
      method,
      status,
      paid_at,
      created_at,
      billing_items:billing_item_id (
        id,
        period,
        unit_id
      )
    `)
    .eq('tenant_id', tenantId)
    .in('status', ['completed', 'verified']);

  // Filter payments untuk bulan yang bersangkutan
  const monthlyPayments = (payments || []).filter((p) => {
    const billPeriod = p.billing_items?.period;
    const paidMonth = (p.paid_at || p.created_at || '').substring(0, 7);
    return billPeriod === periodStr || paidMonth === periodStr;
  });

  const totalIncome = monthlyPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // 2. Ambil expenses pada bulan yang bersangkutan
  const allExpenses = await fetchTenantExpenses(tenantId);
  const monthlyExpenses = allExpenses.filter((e) => {
    const expDate = e.date || e.expense_date || (e.created_at ? e.created_at.substring(0, 7) : '');
    return expDate.startsWith(periodStr);
  });

  const totalExpense = monthlyExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const netIncome = totalIncome - totalExpense;

  return {
    report: {
      period: periodStr,
      total_income: totalIncome,
      total_expense: totalExpense,
      net_income: netIncome,
      cash_inflow: totalIncome,
      cash_outflow: totalExpense,
      balance: netIncome,
    },
    expenses: monthlyExpenses,
    cashPayments: monthlyPayments,
  };
}

/**
 * Mengambil saldo kas berjalan tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} param1 - { year, month }
 */
export async function fetchTenantRunningBalance(tenantId, { year, month }) {
  if (!tenantId) throw new Error('tenantId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return { chain: mock.computeRunningBalance(year, month) };
  }

  // Sederhanakan kalkulasi chain bulanan dari data tenant
  const monthly = await fetchTenantMonthlyFinance(tenantId, { year, month });
  const currentNet = monthly.report?.net_income || 0;

  return {
    chain: [
      {
        month: Number(month),
        year: Number(year),
        period: `${year}-${String(month).padStart(2, '0')}`,
        income: monthly.report?.total_income || 0,
        totalIncome: monthly.report?.total_income || 0,
        expense: monthly.report?.total_expense || 0,
        totalExpense: monthly.report?.total_expense || 0,
        balance: currentNet,
        closingBalance: currentNet,
        openingBalance: 0,
      },
    ],
  };
}

export function resolveCitizenObligationAndUnit({
  units = [],
  members = [],
  billMatrix = [],
  resolvedPeriod,
  userId,
  userEmail,
  unitId,
  isDemo = false,
}) {
  let matchedUnitId = unitId || null;
  let matchedUnitLabel = null;

  if (isDemo) {
    if (!matchedUnitId && (userId || userEmail)) {
      const p = (mockProfiles || []).find((mp) => mp.id === userId || mp.email === userEmail);
      if (p && p.unit_id) {
        matchedUnitId = p.unit_id;
      }
    }
    if (matchedUnitId) {
      const u = (mockUnits || []).find((mu) => Number(mu.id) === Number(matchedUnitId));
      if (u) {
        matchedUnitLabel = `Blok ${u.block} No. ${u.unit_number}`;
      }
    }
  } else {
    // Production / Supabase mode
    if (!matchedUnitId && (userId || userEmail)) {
      const m = (members || []).find(
        (mem) => (userId && (mem.user_id === userId || mem.id === userId)) || (userEmail && (mem.email === userEmail || mem.phone === userEmail))
      );
      if (m) {
        matchedUnitId = m.unit_id;
        matchedUnitLabel = m.tenant_units?.label || null;
      }
    }
    if (matchedUnitId && !matchedUnitLabel) {
      const u = (units || []).find((un) => Number(un.id) === Number(matchedUnitId));
      if (u) {
        matchedUnitLabel = u.label || null;
      }
    }
  }

  // Cari kewajiban (obligation) untuk matchedUnitId pada periode resolvedPeriod
  let myObligation = null;
  if (matchedUnitId) {
    const row = (billMatrix || []).find(
      (r) => r.unit?.id === matchedUnitId || Number(r.unit?.id) === Number(matchedUnitId)
    );
    const targetCell = row?.cells?.find(
      (c) => c?.period === resolvedPeriod || c?.bill?.period === resolvedPeriod
    );

    if (targetCell?.bill) {
      const bill = targetCell.bill;
      const payment = targetCell.payment;

      let status = 'unpaid';
      if (
        payment?.status === 'pending' ||
        payment?.status === 'pending_verification' ||
        bill.status === 'pending'
      ) {
        status = 'pending';
      } else if (
        payment?.status === 'verified' ||
        payment?.status === 'approved' ||
        bill.status === 'paid'
      ) {
        status = 'paid';
      } else if (bill.status === 'unpaid') {
        status = 'unpaid';
      } else {
        status = bill.status || 'unpaid';
      }

      myObligation = {
        id: bill.id,
        period: bill.period || resolvedPeriod,
        amount: Number(bill.amount),
        status,
        dueDate: bill.due_date || null,
        payment: payment || null,
      };
    }
  }

  return {
    myUnit: matchedUnitLabel,
    myObligation,
  };
}

/**
 * Mengambil ringkasan data operasional & dashboard tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} options - { role, period, userId, userEmail, unitId }
 */
export async function fetchTenantDashboardData(
  tenantId,
  { role = 'admin', period, userId, userEmail, unitId } = {}
) {
  if (!tenantId) throw new Error('tenantId wajib disertakan.');

  const resolvedPeriod = period || new Date().toISOString().slice(0, 7);
  const [yearStr, monthStr] = resolvedPeriod.split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');

  if (isDemoOrMock) {
    const [units, members, pendingMembers, pendingPayments, monthlyFinance, billMatrix] = await Promise.all([
      fetchTenantUnits(tenantId),
      fetchTenantMembers(tenantId),
      fetchPendingTenantMembers(tenantId),
      fetchTenantPayments(tenantId, { status: 'pending' }),
      fetchTenantMonthlyFinance(tenantId, { year, month }),
      fetchTenantBillMatrix(tenantId, year),
    ]);

    const totalUnits = units.length;
    const occupiedUnits = units.filter((u) => u.status === 'active' || u.is_occupied).length;
    const vacantUnits = totalUnits - occupiedUnits;

    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let billCount = 0;

    (billMatrix || []).forEach((row) => {
      const targetCell = row.cells?.find((c) => c?.bill?.period === resolvedPeriod) || row.cells?.[0];
      if (targetCell?.bill) {
        billCount++;
        const amt = Number(targetCell.bill.amount || 0);
        totalBilled += amt;
        if (targetCell.status === 'paid' || targetCell.bill.status === 'paid') {
          totalCollected += amt;
        } else {
          totalOutstanding += amt;
        }
      }
    });

    if (billCount === 0 && totalUnits > 0) {
      billCount = totalUnits;
    }

    const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

    const { myUnit, myObligation } = resolveCitizenObligationAndUnit({
      units,
      members,
      billMatrix,
      resolvedPeriod,
      userId,
      userEmail,
      unitId,
      isDemo: true,
    });

    return {
      period: resolvedPeriod,
      year,
      month,
      pendingRegistrationCount: pendingMembers.length,
      pendingPaymentCount: pendingPayments.length,
      units: {
        total: totalUnits,
        occupied: occupiedUnits,
        vacant: vacantUnits,
      },
      members: {
        total: members.length,
      },
      finance: {
        totalIncome: monthlyFinance.report?.total_income || 0,
        totalExpense: monthlyFinance.report?.total_expense || 0,
        netCashflow: monthlyFinance.report?.net_income || 0,
      },
      billing: {
        totalBilled,
        totalCollected,
        totalOutstanding,
        billCount,
        collectionRate,
      },
      recentPayments: pendingPayments.slice(0, 5),
      myUnit,
      myObligation,
    };
  }

  // Production Mode dengan Supabase
  const [units, members, pendingMembers, pendingPayments, monthlyFinance, billMatrix] = await Promise.all([
    fetchTenantUnits(tenantId).catch(() => []),
    fetchTenantMembers(tenantId).catch(() => []),
    fetchPendingTenantMembers(tenantId).catch(() => []),
    fetchTenantPayments(tenantId, { status: 'pending' }).catch(() => []),
    fetchTenantMonthlyFinance(tenantId, { year, month }).catch(() => ({ report: {} })),
    fetchTenantBillMatrix(tenantId, year).catch(() => []),
  ]);

  const totalUnits = units.length;
  const occupiedUnits = units.filter((u) => u.status === 'active').length;
  const vacantUnits = totalUnits - occupiedUnits;

  let totalBilled = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;
  let billCount = 0;

  (billMatrix || []).forEach((row) => {
    const targetCell = row.cells?.find((c) => c?.bill?.period === resolvedPeriod) || row.cells?.[0];
    if (targetCell?.bill) {
      billCount++;
      const amt = Number(targetCell.bill.amount || 0);
      totalBilled += amt;
      if (targetCell.status === 'paid' || targetCell.bill.status === 'paid') {
        totalCollected += amt;
      } else {
        totalOutstanding += amt;
      }
    }
  });

  if (billCount === 0 && totalUnits > 0) {
    billCount = totalUnits;
  }

  const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

  const { myUnit, myObligation } = resolveCitizenObligationAndUnit({
    units,
    members,
    billMatrix,
    resolvedPeriod,
    userId,
    userEmail,
    unitId,
    isDemo: false,
  });

  return {
    period: resolvedPeriod,
    year,
    month,
    pendingRegistrationCount: pendingMembers.length,
    pendingPaymentCount: pendingPayments.length,
    units: {
      total: totalUnits,
      occupied: occupiedUnits,
      vacant: vacantUnits,
    },
    members: {
      total: members.length,
    },
    finance: {
      totalIncome: monthlyFinance.report?.total_income || 0,
      totalExpense: monthlyFinance.report?.total_expense || 0,
      netCashflow: monthlyFinance.report?.net_income || 0,
    },
    billing: {
      totalBilled,
      totalCollected,
      totalOutstanding,
      billCount,
      collectionRate,
    },
    recentPayments: pendingPayments.slice(0, 5),
    myUnit,
    myObligation,
  };
}

// ── VERTIKAL ARISAN HELPERS (T8.2 - T8.7) ──────────────────────────

/**
 * Mengambil daftar putaran arisan milik tenant
 */
export async function fetchArisanRounds(tenantId) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return [
      {
        id: 'demo-round-1',
        tenant_id: tenantId,
        round_number: 1,
        period: 'Putaran 1 - Oktober 2026',
        status: 'collecting',
        total_pool_amount: 3000000,
        winner_member_id: null,
        drawn_at: null,
        created_at: new Date().toISOString(),
      },
    ];
  }

  const { data, error } = await supabase
    .from('arisan_rounds')
    .select(`
      id,
      tenant_id,
      round_number,
      period,
      status,
      winner_member_id,
      total_pool_amount,
      drawn_at,
      drawn_by,
      notes,
      created_at,
      winner:winner_member_id (
        id,
        full_name,
        phone
      ),
      operator:drawn_by (
        id,
        full_name
      )
    `)
    .eq('tenant_id', tenantId)
    .order('round_number', { ascending: true });

  if (error) {
    console.error('[tenantOperationalService] fetchArisanRounds error:', error);
    throw new Error(error.message || 'Gagal memuat daftar putaran arisan.');
  }

  return data || [];
}

/**
 * Membuat putaran arisan baru
 */
export async function createArisanRound(tenantId, roundData) {
  if (!tenantId) throw new Error('Tenant ID wajib diisi.');

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return {
      id: `demo-round-${Date.now()}`,
      tenant_id: tenantId,
      round_number: roundData.round_number || 1,
      period: roundData.period || 'Putaran Baru',
      status: 'collecting',
      total_pool_amount: roundData.total_pool_amount || 0,
      created_at: new Date().toISOString(),
    };
  }

  const payload = {
    tenant_id: tenantId,
    round_number: roundData.round_number || 1,
    period: roundData.period,
    status: roundData.status || 'collecting',
    total_pool_amount: roundData.total_pool_amount || 0,
    notes: roundData.notes || null,
  };

  const { data, error } = await supabase
    .from('arisan_rounds')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('[tenantOperationalService] createArisanRound error:', error);
    throw new Error(error.message || 'Gagal membuat putaran arisan baru.');
  }

  return data;
}

/**
 * Mengambil daftar peserta arisan beserta status apakah sudah menang
 */
export async function fetchArisanParticipants(tenantId) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return [];
  }

  const { data, error } = await supabase
    .from('arisan_participants')
    .select(`
      id,
      tenant_id,
      member_id,
      unit_slot_id,
      has_won,
      won_at_round_id,
      won_at,
      created_at,
      member:member_id (
        id,
        full_name,
        phone,
        role,
        status
      ),
      slot:unit_slot_id (
        id,
        label,
        metadata
      ),
      won_round:won_at_round_id (
        id,
        period,
        round_number
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[tenantOperationalService] fetchArisanParticipants error:', error);
    throw new Error(error.message || 'Gagal memuat peserta arisan.');
  }

  return data || [];
}

/**
 * Mendaftarkan peserta ke kelompok arisan
 */
export async function enrollArisanParticipants(tenantId, participants) {
  if (!tenantId || !participants?.length) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return participants;
  }

  const rows = participants.map((p) => ({
    tenant_id: tenantId,
    member_id: p.member_id,
    unit_slot_id: p.unit_slot_id || null,
    has_won: false,
  }));

  const { data, error } = await supabase
    .from('arisan_participants')
    .upsert(rows, { onConflict: 'tenant_id,member_id' })
    .select();

  if (error) {
    console.error('[tenantOperationalService] enrollArisanParticipants error:', error);
    throw new Error(error.message || 'Gagal mendaftarkan peserta arisan.');
  }

  return data || [];
}

/**
 * Memicu penerbitan tagihan kontribusi serentak untuk seluruh peserta putaran arisan
 */
export async function generateArisanRoundBills(tenantId, roundId, { dueDate } = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  if (!roundId) throw new Error('ID putaran arisan wajib disertakan.');

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return {
      success: true,
      round_id: roundId,
      total_generated: 10,
      total_skipped: 0,
      contribution_amount: 300000,
    };
  }

  const { data, error } = await supabase.rpc('generate_arisan_round_bills', {
    p_tenant_id: tenantId,
    p_round_id: roundId,
    p_due_date: dueDate || null,
  });

  if (error) {
    console.error('[tenantOperationalService] generateArisanRoundBills error:', error);
    throw new Error(error.message || 'Gagal menerbitkan tagihan iuran arisan.');
  }

  return data;
}

/**
 * Mengambil daftar tagihan iuran peserta untuk suatu putaran arisan
 */
export async function fetchArisanRoundBills(tenantId, roundId, period) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return [
      {
        id: 'demo-bill-1',
        tenant_id: tenantId,
        member_id: 'demo-member-1',
        amount: 300000,
        status: 'paid',
        period: period || 'Putaran 1',
        tenant_members: { full_name: 'Ibu Rina', phone: '08123456789' },
      },
      {
        id: 'demo-bill-2',
        tenant_id: tenantId,
        member_id: 'demo-member-2',
        amount: 300000,
        status: 'unpaid',
        period: period || 'Putaran 1',
        tenant_members: { full_name: 'Pak Budi', phone: '08123456780' },
      },
    ];
  }

  let query = supabase
    .from('billing_items')
    .select(`
      id,
      tenant_id,
      unit_id,
      member_id,
      period,
      amount,
      status,
      due_date,
      metadata,
      created_at,
      tenant_members:member_id (
        id,
        full_name,
        phone
      ),
      tenant_units:unit_id (
        id,
        label
      )
    `)
    .eq('tenant_id', tenantId);

  if (roundId) {
    query = query.filter('metadata->>round_id', 'eq', String(roundId));
  } else if (period) {
    query = query.eq('period', period);
  }

  const { data, error } = await query.order('created_at', { ascending: true });

  if (error) {
    console.error('[tenantOperationalService] fetchArisanRoundBills error:', error);
    throw new Error(error.message || 'Gagal memuat tagihan putaran arisan.');
  }

  return data || [];
}

/**
 * Mencatat pembayaran manual (tunai/transfer) untuk iuran putaran arisan
 */
export async function payArisanBillManual(tenantId, billId) {
  if (!tenantId || !billId) throw new Error('Tenant ID dan Bill ID wajib diisi.');

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return { success: true, bill_id: billId, status: 'paid' };
  }

  // 1. Update status billing_item menjadi paid
  const { data: updatedBill, error: billErr } = await supabase
    .from('billing_items')
    .update({
      status: 'paid',
      updated_at: new Date().toISOString(),
    })
    .eq('id', billId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (billErr) {
    console.error('[tenantOperationalService] payArisanBillManual update error:', billErr);
    throw new Error(billErr.message || 'Gagal memperbarui status tagihan arisan.');
  }

  // 2. Buat record transaksi di tabel payments
  const { error: payErr } = await supabase.from('payments').insert([
    {
      tenant_id: tenantId,
      billing_item_id: billId,
      amount: updatedBill.amount,
      method: 'manual_transfer',
      status: 'verified',
      verified_at: new Date().toISOString(),
      metadata: {
        note: 'Pembayaran manual iuran arisan dikonfirmasi admin',
        round_id: updatedBill.metadata?.round_id || null,
      },
    },
  ]);

  if (payErr) {
    console.warn('[tenantOperationalService] payArisanBillManual payment log warning:', payErr);
  }

  return { success: true, bill: updatedBill };
}

/**
 * Mengambil daftar kandidat peserta arisan yang memenuhi syarat (has_won = false)
 */
export async function fetchArisanCandidates(tenantId) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return [
      {
        id: 'demo-cand-1',
        member_id: 'demo-mem-1',
        has_won: false,
        member: { full_name: 'Pak Budi', phone: '08123456780' },
        slot: { label: 'Slot #01' },
      },
      {
        id: 'demo-cand-2',
        member_id: 'demo-mem-2',
        has_won: false,
        member: { full_name: 'Ibu Siti', phone: '08123456781' },
        slot: { label: 'Slot #02' },
      },
    ];
  }

  const { data, error } = await supabase
    .from('arisan_participants')
    .select(`
      id,
      tenant_id,
      member_id,
      unit_slot_id,
      has_won,
      member:member_id (
        id,
        full_name,
        phone,
        status
      ),
      slot:unit_slot_id (
        id,
        label
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('has_won', false);

  if (error) {
    console.error('[tenantOperationalService] fetchArisanCandidates error:', error);
    throw new Error(error.message || 'Gagal memuat kandidat peserta arisan.');
  }

  return data || [];
}

/**
 * Menjalankan pengocokan pemenang putaran arisan secara acak atomik (RPC draw_arisan_winner)
 */
export async function drawArisanWinner(tenantId, roundId, operatorMemberId = null) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  if (!roundId) throw new Error('ID putaran arisan wajib disertakan.');

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return {
      success: true,
      round_id: roundId,
      round_number: 1,
      period: 'Putaran 1',
      winner_member_id: 'demo-mem-1',
      winner_name: 'Pak Budi',
      winner_phone: '08123456780',
      slot_label: 'Slot #01',
      drawn_at: new Date().toISOString(),
      total_prize: 3000000,
      remaining_candidates: 4,
      is_cycle_completed: false,
    };
  }

  const { data, error } = await supabase.rpc('draw_arisan_winner', {
    p_tenant_id: tenantId,
    p_round_id: roundId,
    p_operator_member_id: operatorMemberId || null,
  });

  if (error) {
    console.error('[tenantOperationalService] drawArisanWinner RPC error:', error);
    throw new Error(error.message || 'Gagal menjalankan pengocokan arisan.');
  }

  return data;
}

/**
 * Memulai siklus arisan baru dengan mereset status has_won seluruh peserta (RPC start_new_arisan_cycle)
 */
export async function startNewArisanCycle(tenantId, operatorMemberId = null, force = false) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return {
      success: true,
      tenant_id: tenantId,
      new_cycle: 2,
      total_participants_reset: 10,
      reset_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase.rpc('start_new_arisan_cycle', {
    p_tenant_id: tenantId,
    p_operator_member_id: operatorMemberId || null,
    p_force: force,
  });

  if (error) {
    console.error('[tenantOperationalService] startNewArisanCycle RPC error:', error);
    throw new Error(error.message || 'Gagal memulai siklus arisan baru.');
  }

  return data;
}

/**
 * Menghasilkan tagihan SPP berkala untuk tenant tipe kelas (T9.2)
 * @param {string} tenantId - UUID tenant kelas
 * @param {object} options - { period: 'YYYY-MM', dry_run: boolean }
 */
export async function generateKelasSppBilling(tenantId, { period, dry_run = false } = {}) {
  return generateTenantBillingItems(tenantId, { period, dry_run });
}

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
