/**
 * arisan.js
 * Modul vertikal arisan: putaran, peserta, billing putaran, undian pemenang, dan siklus arisan.
 */

import { supabase, IS_DEMO } from './shared';
import { submitTenantPayment } from './payments';

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
        drawn_by: null,
        eligible_snapshot: null,
        excluded_snapshot: null,
        operator: null,
        winner: null,
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
      eligible_snapshot,
      excluded_snapshot,
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
 * Mengambil daftar tagihan iuran peserta untuk suatu putaran arisan (ARISAN-1.2)
 * Mencocokkan HANYA metadata->>round_id, membawa member:tenant_members(id, full_name, phone) dan status pembayaran terakhir.
 */
export async function fetchArisanRoundBills(tenantId, roundId) {
  if (!tenantId || !roundId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    const demoBills = [
      {
        id: `demo-bill-${roundId}-1`,
        tenant_id: tenantId,
        member_id: 'demo-member-1',
        amount: 300000,
        status: 'paid',
        period: 'Putaran 1',
        metadata: { round_id: String(roundId), type: 'arisan_contribution' },
        tenant_members: { id: 'demo-member-1', full_name: 'Ibu Rina', phone: '08123456789' },
        member: { id: 'demo-member-1', full_name: 'Ibu Rina', phone: '08123456789' },
        latestPayment: { id: 'demo-pay-1', status: 'approved', method: 'cash' },
        payments: { id: 'demo-pay-1', status: 'approved', method: 'cash' },
      },
      {
        id: `demo-bill-${roundId}-2`,
        tenant_id: tenantId,
        member_id: 'demo-member-2',
        amount: 300000,
        status: 'unpaid',
        period: 'Putaran 1',
        metadata: { round_id: String(roundId), type: 'arisan_contribution' },
        tenant_members: { id: 'demo-member-2', full_name: 'Pak Budi', phone: '08123456780' },
        member: { id: 'demo-member-2', full_name: 'Pak Budi', phone: '08123456780' },
        latestPayment: null,
        payments: null,
      },
      {
        id: `demo-bill-${roundId}-3`,
        tenant_id: tenantId,
        member_id: 'demo-member-3',
        amount: 300000,
        status: 'pending_verification',
        period: 'Putaran 1',
        metadata: { round_id: String(roundId), type: 'arisan_contribution' },
        tenant_members: { id: 'demo-member-3', full_name: 'Ibu Siti', phone: '08123456781' },
        member: { id: 'demo-member-3', full_name: 'Ibu Siti', phone: '08123456781' },
        latestPayment: { id: 'demo-pay-3', status: 'pending', method: 'transfer' },
        payments: { id: 'demo-pay-3', status: 'pending', method: 'transfer' },
      },
    ];
    return demoBills;
  }

  const { data, error } = await supabase
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
    .eq('tenant_id', tenantId)
    .filter('metadata->>round_id', 'eq', String(roundId))
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[tenantOperationalService] fetchArisanRoundBills error:', error);
    throw new Error(error.message || 'Gagal memuat tagihan putaran arisan.');
  }

  const billIds = (data || []).map((b) => b.id).filter(Boolean);
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

  return (data || []).map((b) => {
    const latest = latestPaymentsByBill.get(b.id) || null;
    const memberObj = b.tenant_members || b.member || null;
    return {
      ...b,
      member: memberObj,
      tenant_members: memberObj,
      payments: latest,
      latestPayment: latest,
    };
  });
}

/**
 * Mengambil daftar tagihan arisan milik anggota tertentu (ARISAN-1.2)
 * Difilter berdasarkan metadata->>type = 'arisan_contribution', diurutkan belum lunas dulu.
 */
export async function fetchMyArisanBills(tenantId, memberId) {
  if (!tenantId || !memberId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return [
      {
        id: 'demo-my-arisan-bill-1',
        tenant_id: tenantId,
        member_id: memberId,
        amount: 300000,
        status: 'unpaid',
        period: 'Putaran 2 - November 2026',
        due_date: '2026-11-10',
        metadata: {
          type: 'arisan_contribution',
          round_id: 'demo-round-2',
          round_number: 2,
          period_label: 'Putaran 2 - November 2026',
        },
        round_number: 2,
        round_label: 'Putaran 2 - November 2026',
        latestPayment: null,
        payments: null,
      },
      {
        id: 'demo-my-arisan-bill-2',
        tenant_id: tenantId,
        member_id: memberId,
        amount: 300000,
        status: 'paid',
        period: 'Putaran 1 - Oktober 2026',
        due_date: '2026-10-10',
        metadata: {
          type: 'arisan_contribution',
          round_id: 'demo-round-1',
          round_number: 1,
          period_label: 'Putaran 1 - Oktober 2026',
        },
        round_number: 1,
        round_label: 'Putaran 1 - Oktober 2026',
        latestPayment: { id: 'demo-pay-arisan-1', status: 'approved', method: 'transfer' },
        payments: { id: 'demo-pay-arisan-1', status: 'approved', method: 'transfer' },
      },
    ];
  }

  const { data, error } = await supabase
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
      metadata,
      created_at
    `)
    .eq('tenant_id', tenantId)
    .eq('member_id', memberId)
    .filter('metadata->>type', 'eq', 'arisan_contribution');

  if (error) {
    console.error('[tenantOperationalService] fetchMyArisanBills error:', error);
    throw new Error(error.message || 'Gagal memuat tagihan arisan saya.');
  }

  const billIds = (data || []).map((b) => b.id).filter(Boolean);
  const latestPaymentsByBill = new Map();

  if (billIds.length > 0) {
    const { data: payments, error: payErr } = await supabase
      .from('payments')
      .select('id, billing_item_id, status, method, paid_at, created_at, proof_url')
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

  const statusPriority = {
    unpaid: 1,
    pending_verification: 2,
    paid: 3,
    cancelled: 4,
  };

  const formatted = (data || []).map((b) => {
    const latest = latestPaymentsByBill.get(b.id) || null;
    return {
      ...b,
      round_number: b.metadata?.round_number || null,
      round_label: b.metadata?.period_label || b.period,
      latestPayment: latest,
      payments: latest,
    };
  });

  return formatted.sort((a, b) => {
    const pA = statusPriority[a.status] || 99;
    const pB = statusPriority[b.status] || 99;
    if (pA !== pB) return pA - pB;
    return String(b.due_date || b.created_at || '').localeCompare(String(a.due_date || a.created_at || ''));
  });
}

/**
 * Menghitung ringkasan kontribusi putaran arisan (murni tanpa efek samping) (ARISAN-1.2)
 * @param {Array} bills
 * @returns {{ total: number, paid: number, pending: number, unpaid: number, paidAmount: number }}
 */
export function getRoundContributionSummary(bills = []) {
  if (!Array.isArray(bills)) {
    return { total: 0, paid: 0, pending: 0, unpaid: 0, paidAmount: 0 };
  }

  let paid = 0;
  let pending = 0;
  let unpaid = 0;
  let paidAmount = 0;

  for (const b of bills) {
    const status = b.status || (b.latestPayment?.status === 'pending' ? 'pending_verification' : 'unpaid');
    if (status === 'paid') {
      paid += 1;
      paidAmount += Number(b.amount || 0);
    } else if (status === 'pending_verification' || b.latestPayment?.status === 'pending') {
      pending += 1;
    } else if (status === 'unpaid') {
      unpaid += 1;
    }
  }

  return {
    total: bills.length,
    paid,
    pending,
    unpaid,
    paidAmount,
  };
}

/**
 * Mencatat pembayaran manual (tunai) untuk iuran putaran arisan
 */
export async function payArisanBillManual(tenantId, billId) {
  if (!tenantId || !billId) throw new Error('Tenant ID dan Bill ID wajib diisi.');

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return { success: true, bill_id: billId, status: 'paid' };
  }

  const payment = await submitTenantPayment(tenantId, {
    billId,
    method: 'cash',
    isStaff: true,
    note: 'Setoran arisan dicatat pengurus',
  });

  return { success: true, payment };
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
