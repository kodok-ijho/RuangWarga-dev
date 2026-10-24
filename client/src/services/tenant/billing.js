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
      const member = unitMemberMap.get(u.id) || null;
      if (!member) {
        skipped.push({
          unit_id: u.id,
          label: u.label,
          unit_label: u.label,
          reason: 'no_student',
        });
        return;
      }

      const sppPrice = Number(u.metadata?.expected_spp || settings.spp_amount || 200000);

      preview.push({
        tenant_id: tenantId,
        unit_id: u.id,
        member_id: member.id,
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
          member_name: member.full_name || 'Slot Siswa',
          auto_generated: true,
        },
        unit_info: u.label,
        resident_name: member.full_name || 'Slot Siswa',
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

    if (billErr) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] generateTenantBillingItems existing bills query error:', billErr);
      throw billErr;
    }

    if (existingBills) {
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
        if (insertErr.code === '23505') {
          throw new Error('Tagihan IPL periode ini sudah dibuat.');
        }
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
const demoBillingItemsMap = new Map();

function getInitialDemoBillingItems(tenantId) {
  if (demoBillingItemsMap.has(tenantId)) {
    return demoBillingItemsMap.get(tenantId);
  }
  const initial = [
    {
      id: 'demo-bill-1',
      tenant_id: tenantId,
      unit_id: 1,
      member_id: 'demo-mem-1',
      period: '2026-10',
      amount: 1500000,
      late_fee: 0,
      due_date: '2026-10-29',
      status: 'unpaid',
      contract_start: '2026-10-19',
      contract_end: null,
      metadata: {
        bill_type: 'rent',
        service_start: '2026-10-19',
        service_end: '2026-11-18',
        notes: 'Tagihan sewa Oktober 2026',
      },
      tenant_units: { id: 1, label: 'Kamar 101' },
      tenant_members: { id: 'demo-mem-1', full_name: 'Dhani Mahasiswa', phone: '08123456789' },
    },
  ];
  demoBillingItemsMap.set(tenantId, initial);
  return initial;
}

export async function fetchTenantBillingItems(tenantId, { period, status, unitId } = {}) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    let list = [...getInitialDemoBillingItems(tenantId)];
    if (unitId !== undefined && unitId !== null) {
      list = list.filter((b) => Number(b.unit_id) === Number(unitId));
    }
    if (period) list = list.filter((b) => b.period === period);
    if (status) list = list.filter((b) => b.status === status);
    return list;
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
    const list = getInitialDemoBillingItems(tenantId);
    const newBill = {
      id: `mock-bill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...row,
    };
    list.unshift(newBill);
    return newBill;
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
 * Menghitung periode sewa bulanan berulang berdasarkan tanggal masuk (KOS-2)
 * Rumus selalu dihitung dari startDate (bukan berantai) untuk mencegah pergeseran tanggal akhir bulan.
 *
 * @param {string} startDate - Tanggal mulai sewa (YYYY-MM-DD)
 * @param {number} [graceDays=10] - Tenggat bayar (jumlah hari setelah service_start)
 * @param {number} [count=3] - Jumlah periode yang ingin dihasilkan
 * @param {string|null} [maxEndDate=null] - Batas akhir sewa jika ada (YYYY-MM-DD)
 * @returns {Array<{ index: number, period: string, service_start: string, service_end: string, due_date: string }>}
 */
export function computeRentPeriods(startDate, graceDays = 10, count = 3, maxEndDate = null) {
  if (!startDate) return [];
  const parts = String(startDate).slice(0, 10).split('-').map(Number);
  if (parts.length < 3 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]) || Number.isNaN(parts[2])) {
    return [];
  }
  const [startYear, startMonth, startDay] = parts;
  const periods = [];

  for (let n = 0; n < count; n += 1) {
    const totalMonths = (startYear * 12 + (startMonth - 1)) + n;
    const yearN = Math.floor(totalMonths / 12);
    const monthN = (totalMonths % 12) + 1;
    const daysInMonth = new Date(Date.UTC(yearN, monthN, 0)).getUTCDate();
    const dayN = Math.min(startDay, daysInMonth);
    const serviceStart = `${yearN}-${String(monthN).padStart(2, '0')}-${String(dayN).padStart(2, '0')}`;

    if (maxEndDate && serviceStart > maxEndDate) {
      break;
    }

    const totalMonthsNext = totalMonths + 1;
    const yearNext = Math.floor(totalMonthsNext / 12);
    const monthNext = (totalMonthsNext % 12) + 1;
    const daysInNextMonth = new Date(Date.UTC(yearNext, monthNext, 0)).getUTCDate();
    const dayNext = Math.min(startDay, daysInNextMonth);
    const nextStartUtc = Date.UTC(yearNext, monthNext - 1, dayNext);
    const prevDay = new Date(nextStartUtc - 24 * 60 * 60 * 1000);
    let serviceEnd = prevDay.toISOString().slice(0, 10);

    if (maxEndDate && serviceEnd > maxEndDate) {
      serviceEnd = maxEndDate;
    }

    const dueDateObj = new Date(Date.UTC(yearN, monthN - 1, dayN + Number(graceDays || 0)));
    const dueDate = dueDateObj.toISOString().slice(0, 10);
    const period = `${yearN}-${String(monthN).padStart(2, '0')}`;

    periods.push({
      index: n,
      period,
      service_start: serviceStart,
      service_end: serviceEnd,
      due_date: dueDate,
    });
  }

  return periods;
}

// Store demo untuk kontrak kos (KOS-2.3)
const demoKosContractsMap = new Map();

function getInitialDemoContracts(tenantId) {
  if (demoKosContractsMap.has(tenantId)) {
    return demoKosContractsMap.get(tenantId);
  }
  const initial = [
    {
      id: 'demo-contract-1',
      tenant_id: tenantId,
      unit_id: 1,
      member_id: 'demo-mem-1',
      tenant_name: 'Dhani Mahasiswa',
      rent_price: 1500000,
      start_date: '2026-10-19',
      end_date: null,
      grace_days: 10,
      status: 'active',
      notes: 'Kontrak sewa mahasiswa',
      created_at: '2026-10-19T00:00:00Z',
      unit: { id: 1, label: 'Kamar 101', status: 'occupied' },
      member: { id: 'demo-mem-1', full_name: 'Dhani Mahasiswa', phone: '08123456789', status: 'approved' },
    },
  ];
  demoKosContractsMap.set(tenantId, initial);
  return initial;
}

export function resetDemoKosContractsStore() {
  demoKosContractsMap.clear();
  demoBillingItemsMap.clear();
}

/**
 * Membuat kontrak sewa kos baru pada mode demo
 */
async function createDemoKosContract(tenantId, {
  unitId,
  memberId = null,
  tenantName = null,
  rentPrice,
  startDate,
  months = null,
  graceDays = 10,
  notes = null,
}) {
  const contracts = getInitialDemoContracts(tenantId);
  const numericUnitId = Number(unitId);

  // Cek apakah kamar sudah punya kontrak aktif
  const existingUnitContract = contracts.find(
    (c) => c.unit_id === numericUnitId && c.status === 'active'
  );
  if (existingUnitContract) {
    throw new Error('Kamar sudah memiliki kontrak sewa aktif');
  }

  // Cek apakah member sudah punya kontrak aktif
  if (memberId) {
    const existingMemberContract = contracts.find(
      (c) => c.member_id === memberId && c.status === 'active'
    );
    if (existingMemberContract) {
      throw new Error('Penyewa sudah memiliki kontrak sewa aktif di kamar lain');
    }
  }

  const periods = computeRentPeriods(startDate, graceDays, 1);
  const firstPeriod = periods[0] || {
    period: startDate.slice(0, 7),
    service_start: startDate,
    service_end: startDate,
    due_date: startDate,
  };

  let endDate = null;
  if (months && Number(months) > 0) {
    const allPeriods = computeRentPeriods(startDate, graceDays, Number(months));
    const lastP = allPeriods[allPeriods.length - 1];
    endDate = lastP ? lastP.service_end : null;
  }

  const contractId = `demo-contract-${Date.now()}`;
  const newContract = {
    id: contractId,
    tenant_id: tenantId,
    unit_id: numericUnitId,
    member_id: memberId || null,
    tenant_name: tenantName || 'Penyewa Kamar',
    rent_price: Number(rentPrice || 0),
    start_date: startDate,
    end_date: endDate,
    grace_days: Number(graceDays || 10),
    status: 'active',
    notes: notes || null,
    created_at: new Date().toISOString(),
    unit: { id: numericUnitId, label: `Kamar ${numericUnitId}`, status: 'occupied' },
    member: memberId ? { id: memberId, full_name: tenantName || 'Penyewa Kamar', status: 'approved' } : null,
  };

  contracts.unshift(newContract);
  demoKosContractsMap.set(tenantId, contracts);

  // Buat tagihan periode pertama di billing_items
  const bill = await createTenantBillingItem(tenantId, {
    unit_id: numericUnitId,
    member_id: memberId || null,
    period: firstPeriod.period,
    amount: Number(rentPrice || 0),
    due_date: firstPeriod.due_date,
    contract_start: startDate,
    contract_end: endDate,
    metadata: {
      bill_type: 'rent',
      billing_type: 'rent',
      auto_generated: false,
      contract_id: contractId,
      service_start: firstPeriod.service_start,
      service_end: firstPeriod.service_end,
      notes: notes || 'Tagihan sewa periode pertama (kontrak baru)',
    },
  });

  return {
    success: true,
    contract_id: contractId,
    bill_id: bill.id,
    unit_id: numericUnitId,
    member_id: memberId || null,
    tenant_name: newContract.tenant_name,
    rent_price: Number(rentPrice || 0),
    start_date: startDate,
    end_date: endDate,
    grace_days: newContract.grace_days,
    contract: newContract,
    bill,
  };
}

/**
 * Membuat kontrak sewa kos master dan menerbitkan tagihan periode pertama (KOS-2)
 *
 * @param {string} tenantId - UUID tenant kos
 * @param {object} params - { unitId, memberId, tenantName, rentPrice, startDate, months, graceDays, notes }
 */
export async function createKosContract(tenantId, {
  unitId,
  memberId = null,
  tenantName = null,
  rentPrice,
  startDate,
  months = null,
  graceDays = 10,
  notes = null,
} = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  if (!unitId) throw new Error('Kamar (unitId) wajib dipilih.');
  if (!startDate) throw new Error('Tanggal mulai sewa wajib diisi.');
  if (rentPrice === undefined || rentPrice === null || rentPrice < 0) {
    throw new Error('Harga sewa tidak boleh bernilai negatif.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    return createDemoKosContract(tenantId, {
      unitId,
      memberId,
      tenantName,
      rentPrice,
      startDate,
      months,
      graceDays,
      notes,
    });
  }

  const { data, error } = await supabase.rpc('create_kos_contract', {
    p_tenant_id: tenantId,
    p_unit_id: Number(unitId),
    p_member_id: memberId || null,
    p_tenant_name: tenantName || null,
    p_rent_price: Number(rentPrice || 0),
    p_start_date: startDate,
    p_months: months ? Number(months) : null,
    p_grace_days: graceDays !== undefined && graceDays !== null ? Number(graceDays) : null,
    p_notes: notes || null,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[createKosContract] RPC error:', error);
    throw new Error(error.message || 'Gagal membuat kontrak sewa kos.');
  }

  return data;
}

/**
 * Mengambil daftar kontrak sewa untuk tenant kos
 *
 * @param {string} tenantId - UUID tenant kos
 */
export async function fetchKosContracts(tenantId) {
  if (!tenantId) return [];
  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    return getInitialDemoContracts(tenantId);
  }

  const { data, error } = await supabase
    .from('kos_contracts')
    .select('*, unit:tenant_units(id, label, status), member:tenant_members(id, full_name, phone, status)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[fetchKosContracts] error:', error);
    throw new Error(error.message || 'Gagal memuat data kontrak kos.');
  }

  return data || [];
}

/**
 * Mengambil kontrak sewa aktif untuk kamar tertentu
 *
 * @param {string} tenantId - UUID tenant kos
 * @param {string|number} unitId - ID kamar
 */
export async function fetchActiveContractByUnit(tenantId, unitId) {
  if (!tenantId || !unitId) return null;
  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const list = getInitialDemoContracts(tenantId);
    return list.find((c) => c.unit_id === Number(unitId) && c.status === 'active') || null;
  }

  const { data, error } = await supabase
    .from('kos_contracts')
    .select('*, unit:tenant_units(id, label, status), member:tenant_members(id, full_name, phone, status)')
    .eq('tenant_id', tenantId)
    .eq('unit_id', Number(unitId))
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[fetchActiveContractByUnit] error:', error);
    throw new Error(error.message || 'Gagal memuat kontrak aktif kamar.');
  }

  return data || null;
}

/**
 * Menetapkan penyewa ke kamar kos dan mengaktifkan kontrak sewa.
 * Pembungkus backward-compatible yang mendelegasikan ke createKosContract (KOS-2.3, KOS-2.8).
 * Menghapus update langsung tenant_units.status dari browser (status kamar diturunkan dari kontrak).
 * 
 * @param {string} tenantId - UUID tenant
 * @param {object} params - { unitId, memberId, tenantName, contractStart, contractEnd, rentPrice, dueDate, notes }
 */
export async function assignRoomContract(tenantId, {
  unitId,
  memberId,
  tenantName,
  contractStart,
  contractEnd,
  rentPrice,
  dueDate,
  notes,
} = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  if (!unitId) throw new Error('Kamar (unitId) wajib dipilih.');
  if (!contractStart) {
    throw new Error('Tanggal mulai kontrak sewa wajib diisi.');
  }

  let months = null;
  if (contractStart && contractEnd) {
    const s = new Date(contractStart);
    const e = new Date(contractEnd);
    if (e <= s) {
      throw new Error('Tanggal selesai kontrak harus lebih besar dari tanggal mulai kontrak.');
    }
    const diffMonths = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
    if (diffMonths > 0) months = diffMonths;
  }

  return createKosContract(tenantId, {
    unitId,
    memberId,
    tenantName,
    startDate: contractStart,
    months,
    rentPrice,
    notes,
  });
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

    // Akhiri kontrak aktif kamar di demo store
    const contracts = getInitialDemoContracts(tenantId);
    const activeContract = contracts.find(
      (c) => c.unit_id === Number(unitId) && c.status === 'active'
    );
    if (activeContract) {
      activeContract.status = 'ended';
      activeContract.end_date = checkoutDate;
      activeContract.ended_at = new Date().toISOString();
      activeContract.end_reason = reason || 'Checkout penyewa';
    }

    let cancelledFutureBills = 0;
    if (cancelFutureBills) {
      const bills = getInitialDemoBillingItems(tenantId);
      bills.forEach((b) => {
        if (Number(b.unit_id) === Number(unitId) && b.status !== 'paid' && b.status !== 'cancelled') {
          const sStart = b.metadata?.service_start || b.contract_start || b.period;
          if (sStart && sStart > checkoutDate) {
            b.status = 'cancelled';
            cancelledFutureBills += 1;
          }
        }
      });
    }

    return {
      success: true,
      unit_id: Number(unitId),
      unit_label: targetUnit?.label || `Kamar ${unitId}`,
      status: 'vacant',
      checkout_date: checkoutDate,
      cancelled_future_bills: cancelledFutureBills,
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

const mockBillingAutoRuns = {
  'demo-tenant-rtrw': [
    {
      id: 'mock-auto-run-1',
      period: '2026-10',
      run_at: '2026-10-10T00:05:00+07:00',
      created_count: 42,
      skipped_count: 0,
      error: null,
    },
    {
      id: 'mock-auto-run-2',
      period: '2026-09',
      run_at: '2026-09-10T00:05:00+07:00',
      created_count: 40,
      skipped_count: 2,
      error: null,
    },
    {
      id: 'mock-auto-run-3',
      period: '2026-08',
      run_at: '2026-08-10T00:05:00+07:00',
      created_count: 38,
      skipped_count: 4,
      error: null,
    },
  ],
  'demo-tenant-kos': [
    {
      id: 'mock-auto-run-kos-1',
      period: '2026-10',
      run_at: '2026-10-05T00:05:00+07:00',
      created_count: 12,
      skipped_count: 1,
      error: null,
    },
    {
      id: 'mock-auto-run-kos-2',
      period: '2026-09',
      run_at: '2026-09-05T00:05:00+07:00',
      created_count: 11,
      skipped_count: 2,
      error: null,
    },
  ],
};

const defaultMockBillingAutoRuns = [
  {
    id: 'mock-auto-run-def-1',
    period: '2026-10',
    run_at: '2026-10-10T00:05:00+07:00',
    created_count: 20,
    skipped_count: 1,
    error: null,
  },
  {
    id: 'mock-auto-run-def-2',
    period: '2026-09',
    run_at: '2026-09-10T00:05:00+07:00',
    created_count: 19,
    skipped_count: 2,
    error: null,
  },
];

/**
 * Mengambil riwayat penerbitan tagihan otomatis (BILL-AUTO-1.2)
 *
 * @param {string} tenantId - UUID tenant
 * @param {number} [limit=6] - Batas maksimal baris riwayat
 * @returns {Promise<Array<{ id: string, period: string, run_at: string, created_count: number, skipped_count: number, error: string|null }>>}
 */
export async function fetchBillingAutoRuns(tenantId, limit = 6) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    const list = mockBillingAutoRuns[tenantId] || defaultMockBillingAutoRuns;
    return list.slice(0, limit);
  }

  try {
    const { data, error } = await supabase
      .from('billing_auto_runs')
      .select('id, period, run_at, created_count, skipped_count, error')
      .eq('tenant_id', tenantId)
      .order('run_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[tenantOperationalService] fetchBillingAutoRuns error:', err);
    return [];
  }
}
