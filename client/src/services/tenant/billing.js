/**
 * billing.js
 * Preview tagihan, billing items generik, kontrak & tagihan kos, serta SPP kelas.
 */

import { supabase, IS_DEMO } from './shared';
import { fetchTenantDetails } from './settings';
import { fetchTenantUnits } from './members';

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
 * Menghasilkan tagihan SPP berkala untuk tenant tipe kelas (T9.2)
 * @param {string} tenantId - UUID tenant kelas
 * @param {object} options - { period: 'YYYY-MM', dry_run: boolean }
 */
export async function generateKelasSppBilling(tenantId, { period, dry_run = false } = {}) {
  return generateTenantBillingItems(tenantId, { period, dry_run });
}