/**
 * incomes.js
 * Modul operasional tenant: pencatatan pemasukan non-IPL/organisasi (public.non_ipl_incomes).
 * Ref: docs/handoff/PANITIA-1.md § PANITIA-1.5
 */

import { supabase, IS_DEMO } from './shared';

export const VALID_PAYMENT_METHODS = ['cash', 'bank_transfer', 'qris', 'other'];

// Store in-memory untuk mode demo
let demoIncomesStore = [
  {
    id: 'demo-inc-1',
    tenant_id: 'demo-tenant-panitia',
    income_date: '2026-01-15',
    amount: 15000000,
    category: 'Sponsorship',
    source_name: 'Bank XYZ',
    description: 'Pencairan termin 1 sponsorship PenSi',
    payment_method: 'bank_transfer',
    reference_number: 'TRX-BXYZ-001',
    program_id: 'demo-prog-1',
    budget_item_id: 'demo-budget-1',
    recorded_by: 'demo-member-1',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    deleted_at: null,
    deleted_by: null,
  },
];

export function resetDemoIncomesStore(initialIncomes = null) {
  if (initialIncomes) {
    demoIncomesStore = [...initialIncomes];
  } else {
    demoIncomesStore = [];
  }
}

/**
 * Validasi isian pemasukan
 */
function validateIncomeInput({ amount, category, sourceName, paymentMethod }) {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Nominal pemasukan harus berupa angka lebih besar dari 0.');
  }

  const trimmedCategory = typeof category === 'string' ? category.trim() : '';
  if (!trimmedCategory) {
    throw new Error('Kategori pemasukan wajib diisi.');
  }

  const trimmedSource = typeof sourceName === 'string' ? sourceName.trim() : '';
  if (!trimmedSource) {
    throw new Error('Sumber pemasukan wajib diisi.');
  }

  const method = paymentMethod || 'other';
  if (!VALID_PAYMENT_METHODS.includes(method)) {
    throw new Error(`Metode pembayaran harus salah satu dari: ${VALID_PAYMENT_METHODS.join(', ')}.`);
  }

  return {
    numAmount,
    trimmedCategory,
    trimmedSource,
    method,
  };
}

/**
 * Mengambil daftar pemasukan tenant (hanya yang aktif / deleted_at IS NULL)
 * @param {string} tenantId - UUID tenant
 * @param {object} [filters] - { programId, from, to }
 */
export async function fetchTenantIncomes(tenantId, { programId, from, to } = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    let list = demoIncomesStore.filter(
      (inc) => inc.tenant_id === tenantId && !inc.deleted_at
    );
    if (programId) {
      list = list.filter(
        (inc) => inc.program_id === programId || inc.programId === programId
      );
    }
    if (from) {
      list = list.filter((inc) => (inc.income_date || inc.date) >= from);
    }
    if (to) {
      list = list.filter((inc) => (inc.income_date || inc.date) <= to);
    }
    return list.map((inc) => ({
      ...inc,
      amount: Number(inc.amount || 0),
      date: inc.income_date || inc.date,
      incomeDate: inc.income_date || inc.date,
      sourceName: inc.source_name || inc.sourceName,
      paymentMethod: inc.payment_method || inc.paymentMethod || 'other',
      referenceNumber: inc.reference_number || inc.referenceNumber,
      programId: inc.program_id ?? inc.programId ?? null,
      budgetItemId: inc.budget_item_id ?? inc.budgetItemId ?? null,
    }));
  }

  let query = supabase
    .from('non_ipl_incomes')
    .select('*, program:tenant_programs(id, name), budget_item:program_budget_items(id, item, section)')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('income_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (programId) {
    query = query.eq('program_id', programId);
  }
  if (from) {
    query = query.gte('income_date', from);
  }
  if (to) {
    query = query.lte('income_date', to);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[incomes] fetchTenantIncomes error:', error);
    throw error;
  }

  return (data || []).map((row) => ({
    ...row,
    amount: Number(row.amount || 0),
    date: row.income_date,
    incomeDate: row.income_date,
    sourceName: row.source_name,
    paymentMethod: row.payment_method || 'other',
    referenceNumber: row.reference_number,
    programId: row.program_id,
    budgetItemId: row.budget_item_id,
  }));
}

/**
 * Mencatat pemasukan baru untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} param1 - data pemasukan
 */
export async function createTenantIncome(
  tenantId,
  {
    incomeDate,
    date,
    amount,
    category,
    sourceName,
    description = '',
    paymentMethod = 'other',
    referenceNumber = null,
    programId = null,
    budgetItemId = null,
    memberId = null,
  } = {}
) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  const { numAmount, trimmedCategory, trimmedSource, method } = validateIncomeInput({
    amount,
    category,
    sourceName,
    paymentMethod,
  });

  const finalDate = incomeDate || date || new Date().toISOString().substring(0, 10);

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const newInc = {
      id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tenant_id: tenantId,
      income_date: finalDate,
      date: finalDate,
      amount: numAmount,
      category: trimmedCategory,
      source_name: trimmedSource,
      sourceName: trimmedSource,
      description: description ? String(description).trim() : null,
      payment_method: method,
      paymentMethod: method,
      reference_number: referenceNumber ? String(referenceNumber).trim() : null,
      referenceNumber: referenceNumber ? String(referenceNumber).trim() : null,
      program_id: programId || null,
      programId: programId || null,
      budget_item_id: budgetItemId || null,
      budgetItemId: budgetItemId || null,
      recorded_by: memberId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    };
    demoIncomesStore.push(newInc);
    return newInc;
  }

  const payload = {
    tenant_id: tenantId,
    income_date: finalDate,
    amount: numAmount,
    category: trimmedCategory,
    source_name: trimmedSource,
    description: description ? String(description).trim() : null,
    payment_method: method,
    reference_number: referenceNumber ? String(referenceNumber).trim() : null,
    program_id: programId || null,
    budget_item_id: budgetItemId || null,
    recorded_by: memberId || null,
  };

  const { data, error } = await supabase
    .from('non_ipl_incomes')
    .insert(payload)
    .select('*, program:tenant_programs(id, name), budget_item:program_budget_items(id, item, section)')
    .single();

  if (error) {
    console.error('[incomes] createTenantIncome error:', error);
    throw error;
  }

  return {
    ...data,
    amount: Number(data.amount || 0),
    date: data.income_date,
    incomeDate: data.income_date,
    sourceName: data.source_name,
    paymentMethod: data.payment_method,
    referenceNumber: data.reference_number,
    programId: data.program_id,
    budgetItemId: data.budget_item_id,
  };
}

/**
 * Memperbarui data pemasukan tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} incomeId - UUID pemasukan
 * @param {object} fields - Field yang diperbarui
 */
export async function updateTenantIncome(tenantId, incomeId, fields = {}) {
  if (!tenantId || !incomeId) throw new Error('tenantId dan incomeId wajib disertakan.');

  const updatePayload = {};

  if (fields.amount !== undefined) {
    const num = Number(fields.amount);
    if (isNaN(num) || num <= 0) {
      throw new Error('Nominal pemasukan harus berupa angka lebih besar dari 0.');
    }
    updatePayload.amount = num;
  }

  if (fields.category !== undefined) {
    const trimmed = typeof fields.category === 'string' ? fields.category.trim() : '';
    if (!trimmed) throw new Error('Kategori pemasukan wajib diisi.');
    updatePayload.category = trimmed;
  }

  if (fields.sourceName !== undefined || fields.source_name !== undefined) {
    const src = fields.sourceName ?? fields.source_name;
    const trimmed = typeof src === 'string' ? src.trim() : '';
    if (!trimmed) throw new Error('Sumber pemasukan wajib diisi.');
    updatePayload.source_name = trimmed;
  }

  if (fields.paymentMethod !== undefined || fields.payment_method !== undefined) {
    const m = fields.paymentMethod ?? fields.payment_method;
    if (!VALID_PAYMENT_METHODS.includes(m)) {
      throw new Error(`Metode pembayaran harus salah satu dari: ${VALID_PAYMENT_METHODS.join(', ')}.`);
    }
    updatePayload.payment_method = m;
  }

  if (fields.description !== undefined) {
    updatePayload.description = fields.description ? String(fields.description).trim() : null;
  }

  if (fields.referenceNumber !== undefined || fields.reference_number !== undefined) {
    const ref = fields.referenceNumber ?? fields.reference_number;
    updatePayload.reference_number = ref ? String(ref).trim() : null;
  }

  if (fields.incomeDate !== undefined || fields.income_date !== undefined || fields.date !== undefined) {
    updatePayload.income_date = fields.incomeDate ?? fields.income_date ?? fields.date;
  }

  if (fields.programId !== undefined || fields.program_id !== undefined) {
    updatePayload.program_id = fields.programId ?? fields.program_id ?? null;
  }

  if (fields.budgetItemId !== undefined || fields.budget_item_id !== undefined) {
    updatePayload.budget_item_id = fields.budgetItemId ?? fields.budget_item_id ?? null;
  }

  updatePayload.updated_at = new Date().toISOString();

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const idx = demoIncomesStore.findIndex(
      (inc) => inc.id === incomeId && inc.tenant_id === tenantId && !inc.deleted_at
    );
    if (idx < 0) throw new Error('Pemasukan tidak ditemukan.');
    const existing = demoIncomesStore[idx];
    const updated = {
      ...existing,
      ...updatePayload,
      date: updatePayload.income_date ?? existing.income_date,
      incomeDate: updatePayload.income_date ?? existing.income_date,
      sourceName: updatePayload.source_name ?? existing.source_name,
      paymentMethod: updatePayload.payment_method ?? existing.payment_method,
      referenceNumber: updatePayload.reference_number ?? existing.reference_number,
      programId: updatePayload.program_id ?? existing.program_id,
      budgetItemId: updatePayload.budget_item_id ?? existing.budget_item_id,
    };
    demoIncomesStore[idx] = updated;
    return updated;
  }

  const { data, error } = await supabase
    .from('non_ipl_incomes')
    .update(updatePayload)
    .eq('tenant_id', tenantId)
    .eq('id', incomeId)
    .is('deleted_at', null)
    .select('*, program:tenant_programs(id, name), budget_item:program_budget_items(id, item, section)')
    .single();

  if (error) {
    console.error('[incomes] updateTenantIncome error:', error);
    throw error;
  }

  return {
    ...data,
    amount: Number(data.amount || 0),
    date: data.income_date,
    incomeDate: data.income_date,
    sourceName: data.source_name,
    paymentMethod: data.payment_method,
    referenceNumber: data.reference_number,
    programId: data.program_id,
    budgetItemId: data.budget_item_id,
  };
}

/**
 * Hapus lunak pemasukan tenant (mengisi deleted_at = now() dan deleted_by = memberId)
 * @param {string} tenantId - UUID tenant
 * @param {string} incomeId - UUID pemasukan
 * @param {object} [options] - { memberId }
 */
export async function deleteTenantIncome(tenantId, incomeId, { memberId = null } = {}) {
  if (!tenantId || !incomeId) throw new Error('tenantId dan incomeId wajib disertakan.');

  const nowIso = new Date().toISOString();

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const idx = demoIncomesStore.findIndex(
      (inc) => inc.id === incomeId && inc.tenant_id === tenantId
    );
    if (idx >= 0) {
      demoIncomesStore[idx].deleted_at = nowIso;
      demoIncomesStore[idx].deleted_by = memberId || null;
    }
    return true;
  }

  const { error } = await supabase
    .from('non_ipl_incomes')
    .update({
      deleted_at: nowIso,
      deleted_by: memberId || null,
      updated_at: nowIso,
    })
    .eq('tenant_id', tenantId)
    .eq('id', incomeId)
    .is('deleted_at', null);

  if (error) {
    console.error('[incomes] deleteTenantIncome error:', error);
    throw error;
  }

  return true;
}
