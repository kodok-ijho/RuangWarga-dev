/**
 * collections.js
 * Layanan penagihan sewa kos, pengingat harian (rent_reminders), dan laporan tunggakan (get_kos_arrears) (KOS-5.2b).
 */

import { supabase, IS_DEMO } from './shared';
import { getTodayWib } from '../../utils/rentDueReminder';

// Export ulang helper waktu WIB untuk kemudahan modul lain
export { getTodayWib, getDiffDaysWib, getRentDueBannerInfo } from '../../utils/rentDueReminder';

// ── IN-MEMORY MOCK STORE UNTUK MODE DEMO / TESTING ─────────────────────────
const initialMockReminders = [
  {
    id: 'rem-demo-1',
    tenant_id: 'tenant-kos-1',
    bill_id: 'bill-demo-1',
    member_id: 'member-demo-1',
    stage: 'h-3',
    remind_date: getTodayWib(),
    status: 'pending',
    sent_by: null,
    sent_at: null,
    bill: {
      id: 'bill-demo-1',
      period: '2026-10',
      amount: 1500000,
      late_fee: 0,
      due_date: '2026-10-30',
      status: 'unpaid',
      metadata: { member_name: 'Budi Santoso', phone: '081234567891' },
    },
    unit: { id: 101, label: 'Kamar 101' },
    member: { id: 'member-demo-1', full_name: 'Budi Santoso', phone: '081234567891' },
    residentName: 'Budi Santoso',
    phone: '081234567891',
    totalDue: 1500000,
  },
  {
    id: 'rem-demo-2',
    tenant_id: 'tenant-kos-1',
    bill_id: 'bill-demo-2',
    member_id: 'member-demo-2',
    stage: 'h0',
    remind_date: getTodayWib(),
    status: 'pending',
    sent_by: null,
    sent_at: null,
    bill: {
      id: 'bill-demo-2',
      period: '2026-10',
      amount: 1750000,
      late_fee: 0,
      due_date: getTodayWib(),
      status: 'unpaid',
      metadata: { member_name: 'Siti Aminah', phone: '085712345678' },
    },
    unit: { id: 102, label: 'Kamar 102' },
    member: { id: 'member-demo-2', full_name: 'Siti Aminah', phone: '085712345678' },
    residentName: 'Siti Aminah',
    phone: '085712345678',
    totalDue: 1750000,
  },
  {
    id: 'rem-demo-3',
    tenant_id: 'tenant-kos-1',
    bill_id: 'bill-demo-3',
    member_id: 'member-demo-3',
    stage: 'h+3',
    remind_date: getTodayWib(),
    status: 'pending',
    sent_by: null,
    sent_at: null,
    bill: {
      id: 'bill-demo-3',
      period: '2026-10',
      amount: 1600000,
      late_fee: 30000,
      due_date: '2026-10-24',
      status: 'unpaid',
      metadata: { member_name: 'Rudi Hermawan', phone: null },
    },
    unit: { id: 103, label: 'Kamar 103' },
    member: { id: 'member-demo-3', full_name: 'Rudi Hermawan', phone: null },
    residentName: 'Rudi Hermawan',
    phone: null, // Tanpa nomor HP (menguji penanda 'Nomor HP belum ada')
    totalDue: 1630000,
  },
  {
    id: 'rem-demo-4',
    tenant_id: 'tenant-kos-1',
    bill_id: 'bill-demo-4',
    member_id: 'member-demo-4',
    stage: 'h+7',
    remind_date: getTodayWib(),
    status: 'pending',
    sent_by: null,
    sent_at: null,
    bill: {
      id: 'bill-demo-4',
      period: '2026-10',
      amount: 2000000,
      late_fee: 70000,
      due_date: '2026-10-20',
      status: 'unpaid',
      metadata: { member_name: 'Dewi Lestari', phone: '082198765432' },
    },
    unit: { id: 104, label: 'Kamar 104' },
    member: { id: 'member-demo-4', full_name: 'Dewi Lestari', phone: '082198765432' },
    residentName: 'Dewi Lestari',
    phone: '082198765432',
    totalDue: 2070000,
  },
];

const initialMockArrears = [
  {
    member_id: 'member-demo-3',
    nama: 'Rudi Hermawan',
    unit: 'Kamar 103',
    total_due: 1630000,
    bills_count: 1,
    bill_count: 1,
    oldest_due_date: '2026-10-24',
    days_late: 3,
    bucket: '0-7',
    phone: null,
  },
  {
    member_id: 'member-demo-4',
    nama: 'Dewi Lestari',
    unit: 'Kamar 104',
    total_due: 2070000,
    bills_count: 1,
    bill_count: 1,
    oldest_due_date: '2026-10-20',
    days_late: 7,
    bucket: '0-7',
    phone: '082198765432',
  },
  {
    member_id: 'member-demo-5',
    nama: 'Ahmad Fauzi',
    unit: 'Kamar 105',
    total_due: 3200000,
    bills_count: 2,
    bill_count: 2,
    oldest_due_date: '2026-10-10',
    days_late: 17,
    bucket: '8-30',
    phone: '081345678901',
  },
  {
    member_id: 'member-demo-6',
    nama: 'Hendra Wijaya',
    unit: 'Kamar 106',
    total_due: 5100000,
    bills_count: 3,
    bill_count: 3,
    oldest_due_date: '2026-09-10',
    days_late: 47,
    bucket: '>30',
    phone: '081987654321',
  },
];

let demoRemindersStore = JSON.parse(JSON.stringify(initialMockReminders));
let demoArrearsStore = JSON.parse(JSON.stringify(initialMockArrears));

/**
 * Reset state in-memory mock store (berguna untuk testing).
 */
export function resetDemoCollectionsStore() {
  demoRemindersStore = JSON.parse(JSON.stringify(initialMockReminders));
  demoArrearsStore = JSON.parse(JSON.stringify(initialMockArrears));
}

/**
 * Mengambil daftar pengingat tagihan sewa kos untuk hari ini (WIB) dengan status pending.
 *
 * @param {string} tenantId - UUID tenant kos
 * @returns {Promise<Array>}
 */
export async function fetchTodayReminders(tenantId) {
  if (!tenantId) {
    throw new Error('ID tenant wajib disertakan.');
  }

  const todayStr = getTodayWib();
  const isDemoOrMock =
    (IS_DEMO && !String(tenantId).startsWith('tenant-real-')) ||
    String(tenantId).startsWith('demo-') ||
    tenantId === 'tenant-kos-1';

  if (isDemoOrMock) {
    return demoRemindersStore.filter(
      (r) =>
        (!r.tenant_id || r.tenant_id === tenantId || r.tenant_id === 'tenant-kos-1') &&
        r.status === 'pending'
    );
  }

  const { data, error } = await supabase
    .from('rent_reminders')
    .select(`
      id,
      tenant_id,
      bill_id,
      member_id,
      stage,
      remind_date,
      status,
      sent_by,
      sent_at,
      push_sent_at,
      created_at,
      billing_item:billing_items!bill_id (
        id,
        amount,
        late_fee,
        period,
        due_date,
        status,
        metadata,
        unit_id,
        tenant_units:unit_id (
          id,
          label,
          block,
          unit_number
        )
      ),
      tenant_members:member_id (
        id,
        full_name,
        phone
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('remind_date', todayStr)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[fetchTodayReminders] Supabase query error:', error);
    throw error;
  }

  return (data || []).map((row) => {
    const bill = row.billing_item || {};
    const unit = bill.tenant_units || {};
    const member = row.tenant_members || {};
    const amount = Number(bill.amount || 0);
    const lateFee = Number(bill.late_fee || 0);
    const totalDue = amount + lateFee;

    const residentName = member.full_name || bill.metadata?.member_name || 'Penyewa';
    const phone = member.phone || bill.metadata?.phone || null;
    const unitLabel = unit.label || (unit.block ? `Blok ${unit.block}/${unit.unit_number}` : 'Kamar');

    return {
      id: row.id,
      tenant_id: row.tenant_id,
      bill_id: row.bill_id,
      member_id: row.member_id,
      stage: row.stage,
      remind_date: row.remind_date,
      status: row.status,
      sent_by: row.sent_by,
      sent_at: row.sent_at,
      push_sent_at: row.push_sent_at,
      created_at: row.created_at,
      bill: {
        ...bill,
        amount,
        late_fee: lateFee,
      },
      unit: {
        id: unit.id || bill.unit_id,
        label: unitLabel,
      },
      member: {
        id: member.id || row.member_id,
        full_name: residentName,
        phone,
      },
      residentName,
      phone,
      totalDue,
    };
  });
}

/**
 * Menandai status pengingat sewa ('sent' atau 'skipped') via RPC mark_rent_reminder.
 *
 * @param {string} reminderId - UUID dari rent_reminders
 * @param {'sent'|'skipped'} status - Status baru
 * @returns {Promise<object>}
 */
export async function markRentReminder(reminderId, status) {
  if (!reminderId) {
    throw new Error('ID pengingat wajib disertakan.');
  }

  if (status !== 'sent' && status !== 'skipped') {
    throw new Error(`Status pengingat tidak valid: ${status} (harus 'sent' atau 'skipped').`);
  }

  const isDemoOrMock =
    (IS_DEMO && !String(reminderId).startsWith('rem-rpc-') && !String(reminderId).startsWith('rem-real-')) ||
    String(reminderId).startsWith('demo-') ||
    String(reminderId).startsWith('rem-demo-');

  if (isDemoOrMock) {
    const item = demoRemindersStore.find((r) => String(r.id) === String(reminderId));
    if (item) {
      item.status = status;
      item.sent_at = new Date().toISOString();
    }
    return {
      success: true,
      reminder_id: reminderId,
      status,
    };
  }

  const { data, error } = await supabase.rpc('mark_rent_reminder', {
    p_reminder_id: reminderId,
    p_status: status,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[markRentReminder] RPC error:', error);
    throw error;
  }

  return data;
}

/**
 * Mengambil ringkasan dan daftar tunggakan sewa kos per penyewa via RPC get_kos_arrears.
 *
 * @param {string} tenantId - UUID tenant kos
 * @returns {Promise<Array>}
 */
export async function fetchKosArrears(tenantId) {
  if (!tenantId) {
    throw new Error('ID tenant wajib disertakan.');
  }

  const isDemoOrMock =
    (IS_DEMO && !String(tenantId).startsWith('tenant-real-')) ||
    String(tenantId).startsWith('demo-') ||
    tenantId === 'tenant-kos-1';

  if (isDemoOrMock) {
    return JSON.parse(JSON.stringify(demoArrearsStore));
  }

  const { data, error } = await supabase.rpc('get_kos_arrears', {
    p_tenant_id: tenantId,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[fetchKosArrears] RPC error:', error);
    throw error;
  }

  return (data || []).map((row) => ({
    ...row,
    total_due: Number(row.total_due || 0),
    days_late: Number(row.days_late || 0),
    bills_count: Number(row.bills_count ?? row.bill_count ?? 1),
    bill_count: Number(row.bill_count ?? row.bills_count ?? 1),
  }));
}
