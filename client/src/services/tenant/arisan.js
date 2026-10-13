/**
 * arisan.js
 * Modul vertikal arisan: putaran, peserta, billing putaran, undian pemenang, dan siklus arisan.
 */

import { supabase, IS_DEMO } from './shared';

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
