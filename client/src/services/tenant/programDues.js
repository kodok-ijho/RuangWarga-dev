/**
 * programDues.js
 * Manajemen iuran panitia per acara (PANITIA-2).
 * Tagihan per anggota tanpa unit (unit_id: null, program_id: programId).
 */

import { supabase } from '../supabaseClient';
import { submitTenantPayment } from './payments';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// ==============================================================================
// IN-MEMORY DEMO STORE
// ==============================================================================

let demoProgramDuesStore = [];

/**
 * Reset demo store iuran acara (untuk testing dan demo mode)
 * @param {Array|null} initialDues
 */
export function resetDemoProgramDuesStore(initialDues = null) {
  if (Array.isArray(initialDues)) {
    demoProgramDuesStore = [...initialDues];
  } else {
    demoProgramDuesStore = [];
  }
}

/**
 * Mendapatkan seluruh iuran demo untuk tenant tertentu (helper internal)
 * @param {string} tenantId
 * @returns {Array}
 */
export function getDemoProgramDues(tenantId) {
  if (!tenantId) return [];
  return demoProgramDuesStore.filter((d) => d.tenant_id === tenantId);
}

// ==============================================================================
// PURE HELPER
// ==============================================================================

/**
 * Meringkas kalkulasi iuran program acara (murni)
 * Iuran yang 'cancelled' tidak dihitung.
 * collected = jumlah tagihan 'paid'.
 *
 * @param {Array} bills - Daftar billing_items acara
 * @returns {{ count: number, billed: number, collected: number, pending: number, unpaidCount: number }}
 */
export function summarizeProgramDues(bills = []) {
  const safeBills = (Array.isArray(bills) ? bills : []).filter(
    (b) => b && b.status !== 'cancelled'
  );

  let count = safeBills.length;
  let billed = 0;
  let collected = 0;
  let pending = 0;
  let unpaidCount = 0;

  for (const b of safeBills) {
    const amt = Number(b.amount || 0);
    billed += amt;
    if (b.status === 'paid') {
      collected += amt;
    } else if (b.status === 'pending_verification') {
      pending += amt;
    } else if (b.status === 'unpaid') {
      unpaidCount += 1;
    }
  }

  return {
    count,
    billed: Math.round(billed * 100) / 100,
    collected: Math.round(collected * 100) / 100,
    pending: Math.round(pending * 100) / 100,
    unpaidCount,
  };
}

// ==============================================================================
// OPERATIONAL SERVICES
// ==============================================================================

/**
 * Mengambil daftar iuran untuk acara tertentu
 * @param {string} tenantId
 * @param {string} programId
 * @returns {Promise<Array>}
 */
export async function fetchProgramDues(tenantId, programId) {
  if (!tenantId || !programId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const list = demoProgramDuesStore.filter(
      (d) => d.tenant_id === tenantId && d.program_id === programId
    );

    return [...list].sort((a, b) => {
      const nameA = a.member?.full_name || '';
      const nameB = b.member?.full_name || '';
      return nameA.localeCompare(nameB);
    });
  }

  const { data: bills, error: billsErr } = await supabase
    .from('billing_items')
    .select(`
      *,
      member:tenant_members(id, full_name, phone)
    `)
    .eq('tenant_id', tenantId)
    .eq('program_id', programId)
    .order('created_at', { ascending: true });

  if (billsErr) {
    // eslint-disable-next-line no-console
    console.error('[programDues] fetchProgramDues error:', billsErr);
    throw billsErr;
  }

  const sorted = [...(bills || [])].sort((a, b) => {
    const nameA = a.member?.full_name || '';
    const nameB = b.member?.full_name || '';
    return nameA.localeCompare(nameB);
  });

  const billIds = sorted.map((b) => b.id).filter(Boolean);
  const latestPaymentsByBill = new Map();

  if (billIds.length > 0) {
    const { data: payments, error: payErr } = await supabase
      .from('payments')
      .select('id, billing_item_id, status, method, paid_at, created_at')
      .eq('tenant_id', tenantId)
      .in('billing_item_id', billIds)
      .order('created_at', { ascending: false });

    if (!payErr && payments) {
      for (const p of payments) {
        if (!latestPaymentsByBill.has(p.billing_item_id)) {
          latestPaymentsByBill.set(p.billing_item_id, p);
        }
      }
    }
  }

  return sorted.map((b) => {
    const latest = latestPaymentsByBill.get(b.id) || null;
    return {
      ...b,
      payments: latest,
      latestPayment: latest,
    };
  });
}

/**
 * Menerbitkan iuran acara untuk daftar anggota
 * @param {string} tenantId
 * @param {string} programId
 * @param {object} params
 * @param {number} params.amount
 * @param {string} params.dueDate - Format 'YYYY-MM-DD'
 * @param {Array<string>} params.memberIds
 * @param {string} [params.note]
 * @param {string} [params.programName]
 * @returns {Promise<{ created: number, skipped: number }>}
 */
export async function createProgramDues(
  tenantId,
  programId,
  { amount, dueDate, memberIds, note, programName } = {}
) {
  if (!tenantId || !programId) {
    throw new Error('Tenant ID dan Program ID wajib disertakan.');
  }

  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) {
    throw new Error('Nominal iuran harus lebih besar dari 0.');
  }

  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate))) {
    throw new Error('Tanggal jatuh tempo tidak valid (format YYYY-MM-DD).');
  }

  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    throw new Error('Pilih setidaknya satu anggota.');
  }

  const period = String(dueDate).slice(0, 7);
  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');

  if (isDemoOrMock) {
    const existingActiveMembers = new Set(
      demoProgramDuesStore
        .filter(
          (d) =>
            d.tenant_id === tenantId &&
            d.program_id === programId &&
            d.status !== 'cancelled'
        )
        .map((d) => d.member_id)
    );

    let created = 0;
    let skipped = 0;

    for (const mid of memberIds) {
      if (existingActiveMembers.has(mid)) {
        skipped += 1;
      } else {
        const newBill = {
          id: `demo-due-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          tenant_id: tenantId,
          program_id: programId,
          member_id: mid,
          unit_id: null,
          amount: numAmount,
          period,
          due_date: dueDate,
          status: 'unpaid',
          metadata: {
            bill_type: 'program_dues',
            program_id: programId,
            program_name: programName || '',
            note: note || '',
          },
          member: {
            id: mid,
            full_name: `Anggota ${mid}`,
            phone: '',
          },
          payments: null,
          latestPayment: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        demoProgramDuesStore.push(newBill);
        existingActiveMembers.add(mid);
        created += 1;
      }
    }

    return { created, skipped };
  }

  // 1. Ambil iuran aktif yang sudah ada untuk anggota di acara ini
  const { data: existingBills, error: checkErr } = await supabase
    .from('billing_items')
    .select('member_id')
    .eq('tenant_id', tenantId)
    .eq('program_id', programId)
    .neq('status', 'cancelled');

  if (checkErr) {
    // eslint-disable-next-line no-console
    console.error('[programDues] createProgramDues check existing error:', checkErr);
    throw checkErr;
  }

  const existingMemberSet = new Set((existingBills || []).map((b) => b.member_id));

  const toInsert = [];
  let skipped = 0;

  for (const mid of memberIds) {
    if (existingMemberSet.has(mid)) {
      skipped += 1;
    } else {
      toInsert.push({
        tenant_id: tenantId,
        program_id: programId,
        member_id: mid,
        unit_id: null,
        amount: numAmount,
        period,
        due_date: dueDate,
        status: 'unpaid',
        metadata: {
          bill_type: 'program_dues',
          program_id: programId,
          program_name: programName || '',
          note: note || '',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      existingMemberSet.add(mid);
    }
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('billing_items')
      .insert(toInsert);

    if (insertErr) {
      // eslint-disable-next-line no-console
      console.error('[programDues] createProgramDues insert error:', insertErr);
      throw insertErr;
    }
  }

  return { created: toInsert.length, skipped };
}

/**
 * Mengubah nominal iuran acara (hanya bila status 'unpaid')
 * @param {string} tenantId
 * @param {string} billId
 * @param {number} amount
 */
export async function updateProgramDuesAmount(tenantId, billId, amount) {
  if (!tenantId || !billId) {
    throw new Error('Tenant ID dan Bill ID wajib disertakan.');
  }

  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) {
    throw new Error('Nominal iuran harus lebih besar dari 0.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const bill = demoProgramDuesStore.find(
      (b) => b.tenant_id === tenantId && b.id === billId
    );
    if (!bill) throw new Error('Tagihan tidak ditemukan.');
    if (bill.status !== 'unpaid') {
      throw new Error('Hanya tagihan dengan status belum bayar yang dapat diubah.');
    }
    bill.amount = numAmount;
    bill.updated_at = new Date().toISOString();
    return bill;
  }

  const { data: bill, error: fetchErr } = await supabase
    .from('billing_items')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('id', billId)
    .single();

  if (fetchErr || !bill) throw new Error('Tagihan tidak ditemukan.');
  if (bill.status !== 'unpaid') {
    throw new Error('Hanya tagihan dengan status belum bayar yang dapat diubah.');
  }

  const { data: updated, error: updateErr } = await supabase
    .from('billing_items')
    .update({ amount: numAmount, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', billId)
    .select()
    .single();

  if (updateErr) {
    // eslint-disable-next-line no-console
    console.error('[programDues] updateProgramDuesAmount error:', updateErr);
    throw updateErr;
  }

  return updated;
}

/**
 * Membatalkan iuran acara (hanya bila status 'unpaid', menjadi 'cancelled')
 * @param {string} tenantId
 * @param {string} billId
 */
export async function cancelProgramDues(tenantId, billId) {
  if (!tenantId || !billId) {
    throw new Error('Tenant ID dan Bill ID wajib disertakan.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const bill = demoProgramDuesStore.find(
      (b) => b.tenant_id === tenantId && b.id === billId
    );
    if (!bill) throw new Error('Tagihan tidak ditemukan.');
    if (bill.status !== 'unpaid') {
      throw new Error('Hanya tagihan dengan status belum bayar yang dapat dibatalkan.');
    }
    bill.status = 'cancelled';
    bill.updated_at = new Date().toISOString();
    return bill;
  }

  const { data: bill, error: fetchErr } = await supabase
    .from('billing_items')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('id', billId)
    .single();

  if (fetchErr || !bill) throw new Error('Tagihan tidak ditemukan.');
  if (bill.status !== 'unpaid') {
    throw new Error('Hanya tagihan dengan status belum bayar yang dapat dibatalkan.');
  }

  const { data: updated, error: updateErr } = await supabase
    .from('billing_items')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', billId)
    .select()
    .single();

  if (updateErr) {
    // eslint-disable-next-line no-console
    console.error('[programDues] cancelProgramDues error:', updateErr);
    throw updateErr;
  }

  return updated;
}

/**
 * Mencatat pembayaran tunai untuk iuran acara oleh staf/pengurus
 * @param {string} tenantId
 * @param {string} billId
 * @param {object} [params]
 * @param {string} [params.note]
 */
export async function recordProgramDuesCash(tenantId, billId, { note } = {}) {
  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const bill = demoProgramDuesStore.find(
      (b) => b.tenant_id === tenantId && b.id === billId
    );
    if (bill) {
      bill.status = 'paid';
      const payRecord = {
        id: `demo-pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        billing_item_id: billId,
        status: 'completed',
        method: 'cash',
        paid_at: new Date().toISOString(),
        metadata: { note: note || '' },
      };
      bill.payments = payRecord;
      bill.latestPayment = payRecord;
      bill.updated_at = new Date().toISOString();
    }
  }

  return submitTenantPayment(tenantId, {
    billId,
    method: 'cash',
    isStaff: true,
    note,
  });
}

/**
 * Mengambil iuran milik anggota (semua acara)
 * Urutan: belum lunas dulu, lalu terbaru.
 * @param {string} tenantId
 * @param {string} memberId
 * @returns {Promise<Array>}
 */
export async function fetchMyProgramDues(tenantId, memberId) {
  if (!tenantId || !memberId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const list = demoProgramDuesStore.filter(
      (d) =>
        d.tenant_id === tenantId &&
        d.member_id === memberId &&
        d.status !== 'cancelled'
    );

    return [...list]
      .map((d) => ({
        ...d,
        program: d.program || {
          id: d.program_id,
          name: d.metadata?.program_name || 'Acara',
        },
      }))
      .sort((a, b) => {
        const isUnpaidA = a.status !== 'paid' ? 0 : 1;
        const isUnpaidB = b.status !== 'paid' ? 0 : 1;
        if (isUnpaidA !== isUnpaidB) return isUnpaidA - isUnpaidB;
        const dateA = a.due_date || a.created_at || '';
        const dateB = b.due_date || b.created_at || '';
        return dateB.localeCompare(dateA);
      });
  }

  const { data, error } = await supabase
    .from('billing_items')
    .select(`
      *,
      program:tenant_programs(id, name)
    `)
    .eq('tenant_id', tenantId)
    .eq('member_id', memberId)
    .not('program_id', 'is', null)
    .neq('status', 'cancelled');

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[programDues] fetchMyProgramDues error:', error);
    throw error;
  }

  const sorted = [...(data || [])].sort((a, b) => {
    const isUnpaidA = a.status !== 'paid' ? 0 : 1;
    const isUnpaidB = b.status !== 'paid' ? 0 : 1;
    if (isUnpaidA !== isUnpaidB) return isUnpaidA - isUnpaidB;
    const dateA = a.due_date || a.created_at || '';
    const dateB = b.due_date || b.created_at || '';
    return dateB.localeCompare(dateA);
  });

  return sorted;
}
