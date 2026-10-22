/**
 * programs.js
 * Modul operasional tenant: acara, agenda kerja, anggaran (RAB), dan laporan realisasi program.
 * Ref: docs/handoff/PANITIA-1.md § PANITIA-1.5
 */

import { supabase, IS_DEMO } from './shared';
import { fetchTenantIncomes } from './incomes';
import { fetchTenantExpenses } from './finance';
import { summarizeProgramDues, getDemoProgramDues, fetchProgramDues } from './programDues';
import { PANITIA_PRICING } from '../../config/panitiaPricing';
import { formatDate } from '../dataHelpers';
import { formatDateWIB } from '../../utils/date';

export { PANITIA_PRICING };

export const PROGRAM_STATUS_LABELS = {
  planning: 'Perencanaan',
  running: 'Berjalan',
  completed: 'Selesai',
  done: 'Selesai',
  archived: 'Arsip',
};

// ==============================================================================
// IN-MEMORY DEMO STORE
// ==============================================================================

let demoProgramsStore = [
  {
    id: 'demo-prog-1',
    tenant_id: 'demo-tenant-panitia',
    name: 'Pentas Seni Tahunan 2026',
    description: 'Pentas seni kolaboratif siswa dan pertunjukan musik tahunan',
    location: 'Aula Utama & Lapangan Basket',
    starts_on: '2026-11-20',
    ends_on: '2026-11-21',
    status: 'running',
    lead_member_id: 'demo-member-1',
    lead_member: { id: 'demo-member-1', name: 'Ahmad Faiz' },
    created_at: '2026-01-10T08:00:00Z',
    updated_at: '2026-01-10T08:00:00Z',
    access_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    accessUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    is_free_trial: true,
    isFreeTrial: true,
  },
];

let demoBudgetItemsStore = [
  {
    id: 'demo-budget-1',
    tenant_id: 'demo-tenant-panitia',
    program_id: 'demo-prog-1',
    kind: 'income',
    section: 'Sponsorship',
    item: 'Sponsor Utama Bank XYZ',
    quantity: 1,
    unit_label: 'paket',
    unit_price: 15000000,
    amount: 15000000,
    notes: 'MoU sudah ditandatangani',
    sort_order: 1,
    created_at: '2026-01-11T09:00:00Z',
  },
  {
    id: 'demo-budget-2',
    tenant_id: 'demo-tenant-panitia',
    program_id: 'demo-prog-1',
    kind: 'expense',
    section: 'Konsumsi',
    item: 'Snack Rapat Panitia',
    quantity: 50,
    unit_label: 'kotak',
    unit_price: 20000,
    amount: 1000000,
    notes: 'Untuk gladi resik',
    sort_order: 1,
    created_at: '2026-01-11T10:00:00Z',
  },
  {
    id: 'demo-budget-3',
    tenant_id: 'demo-tenant-panitia',
    program_id: 'demo-prog-1',
    kind: 'expense',
    section: 'Perlengkapan',
    item: 'Sewa Sound System & Lighting',
    quantity: 2,
    unit_label: 'hari',
    unit_price: 3500000,
    amount: 7000000,
    notes: 'Vendor ProAudio',
    sort_order: 2,
    created_at: '2026-01-11T11:00:00Z',
  },
];

let demoFreeTrialClaimedTenants = new Set(['demo-tenant-panitia']);

export function resetDemoProgramsStore(
  initialPrograms = null,
  initialBudgetItems = null,
  initialClaimedTenants = null
) {
  if (initialPrograms) {
    demoProgramsStore = [...initialPrograms];
  } else {
    demoProgramsStore = [];
  }
  if (initialBudgetItems) {
    demoBudgetItemsStore = [...initialBudgetItems];
  } else {
    demoBudgetItemsStore = [];
  }
  if (Array.isArray(initialClaimedTenants)) {
    demoFreeTrialClaimedTenants = new Set(initialClaimedTenants);
  } else if (!initialPrograms) {
    demoFreeTrialClaimedTenants = new Set();
  } else {
    demoFreeTrialClaimedTenants = new Set(['demo-tenant-panitia']);
  }
}

// ==============================================================================
// PURE HELPER FUNCTIONS
// ==============================================================================

/**
 * Menghitung jumlah acara aktif (status planning atau running)
 * @param {Array} programs - Daftar acara
 * @returns {number}
 */
export function countActivePrograms(programs = []) {
  if (!Array.isArray(programs)) return 0;
  return programs.filter(
    (p) => p && (p.status === 'planning' || p.status === 'running')
  ).length;
}

/**
 * Menghitung status masa aktif dan hak tulis transaksi suatu acara (HARGA.2)
 * @param {object} program - Data program (memiliki access_until / is_free_trial atau alias camelCase)
 * @param {object} [options] - { tenantType, now }
 * @returns {{ state: 'unlimited'|'free_trial'|'active'|'expired'|'inactive', until: string|null, writable: boolean }}
 */
export function getProgramAccessState(program, { tenantType, now = new Date() } = {}) {
  if (tenantType !== 'panitia') {
    return {
      state: 'unlimited',
      until: null,
      writable: true,
    };
  }

  const accessUntil = program?.access_until ?? program?.accessUntil ?? null;
  const isFreeTrial = Boolean(program?.is_free_trial ?? program?.isFreeTrial);

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const untilMs = accessUntil ? new Date(accessUntil).getTime() : null;

  if (untilMs !== null) {
    if (untilMs <= nowMs) {
      return {
        state: 'expired',
        until: accessUntil,
        writable: false,
      };
    }
    // Masa depan
    if (isFreeTrial) {
      return {
        state: 'free_trial',
        until: accessUntil,
        writable: true,
      };
    }
    return {
      state: 'active',
      until: accessUntil,
      writable: true,
    };
  }

  // untilMs === null
  if (isFreeTrial) {
    return {
      state: 'expired',
      until: null,
      writable: false,
    };
  }

  return {
    state: 'inactive',
    until: null,
    writable: false,
  };
}

/**
 * Format label status masa aktif untuk ditampilkan di UI (HARGA.2)
 * @param {{ state: string, until: string|null }} stateObj
 * @returns {string}
 */
export function formatProgramAccessLabel(stateObj) {
  if (!stateObj) return '';
  const { state, until } = stateObj;

  switch (state) {
    case 'free_trial':
      return `Gratis sampai ${formatDateWIB(until)}`;
    case 'active':
      return `Aktif sampai ${formatDateWIB(until)}`;
    case 'expired':
      return until ? `Masa aktif habis ${formatDateWIB(until)}` : 'Masa aktif habis';
    case 'inactive':
      return 'Belum aktif';
    case 'unlimited':
      return 'Aktif';
    default:
      return '';
  }
}

/**
 * Meringkas kalkulasi anggaran vs realisasi program (PANITIA-2.2: mendukung iuran panitia)
 * @param {Array} budgetItems - Daftar item anggaran (RAB)
 * @param {Array} incomes - Daftar transaksi pemasukan
 * @param {Array} expenses - Daftar transaksi pengeluaran
 * @param {Array} [dues] - Daftar tagihan iuran acara (billing_items)
 * @returns {object} Ringkasan planned, actual, sections, unbudgeted, dan dues
 */
export function summarizeProgram(budgetItems = [], incomes = [], expenses = [], dues = []) {
  const safeItems = Array.isArray(budgetItems) ? budgetItems : [];
  const safeIncomes = (Array.isArray(incomes) ? incomes : []).filter(
    (inc) => inc && !inc.deleted_at
  );
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const duesSummary = summarizeProgramDues(dues);

  // Map budget item ID -> item object
  const budgetItemMap = new Map();
  for (const item of safeItems) {
    if (item && item.id) {
      budgetItemMap.set(String(item.id), item);
    }
  }

  let plannedIncome = 0;
  let plannedExpense = 0;

  // Track sections: map key `${kind}:::${sectionName}` -> section record
  const sectionMap = new Map();

  for (const item of safeItems) {
    const kind = item.kind === 'income' ? 'income' : 'expense';
    const rawSection = item.section ? String(item.section).trim() : '';
    const sectionName = rawSection || 'Lainnya';
    const key = `${kind}:::${sectionName}`;

    const qty = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unit_price ?? item.unitPrice ?? 0);
    const itemAmount = item.amount != null
      ? Number(item.amount)
      : Math.round(qty * unitPrice * 100) / 100;

    if (kind === 'income') {
      plannedIncome += itemAmount;
    } else {
      plannedExpense += itemAmount;
    }

    if (!sectionMap.has(key)) {
      sectionMap.set(key, {
        kind,
        section: sectionName,
        planned: 0,
        actual: 0,
      });
    }
    const sec = sectionMap.get(key);
    sec.planned += itemAmount;
  }

  // Tally incomes
  let actualIncome = 0;
  let unbudgetedIncome = 0;

  for (const inc of safeIncomes) {
    const amt = Number(inc.amount || 0);
    actualIncome += amt;

    const bId = inc.budget_item_id || inc.budgetItemId;
    const bItem = bId ? budgetItemMap.get(String(bId)) : null;

    if (bItem) {
      const kind = bItem.kind === 'income' ? 'income' : 'expense';
      const rawSection = bItem.section ? String(bItem.section).trim() : '';
      const sectionName = rawSection || 'Lainnya';
      const key = `${kind}:::${sectionName}`;
      if (sectionMap.has(key)) {
        sectionMap.get(key).actual += amt;
      } else {
        sectionMap.set(key, {
          kind,
          section: sectionName,
          planned: 0,
          actual: amt,
        });
      }
    } else {
      unbudgetedIncome += amt;
    }
  }

  // Tally expenses
  let actualExpense = 0;
  let unbudgetedExpense = 0;

  for (const exp of safeExpenses) {
    const amt = Number(exp.amount || 0);
    actualExpense += amt;

    const bId = exp.budget_item_id || exp.budgetItemId;
    const bItem = bId ? budgetItemMap.get(String(bId)) : null;

    if (bItem) {
      const kind = bItem.kind === 'income' ? 'income' : 'expense';
      const rawSection = bItem.section ? String(bItem.section).trim() : '';
      const sectionName = rawSection || 'Lainnya';
      const key = `${kind}:::${sectionName}`;
      if (sectionMap.has(key)) {
        sectionMap.get(key).actual += amt;
      } else {
        sectionMap.set(key, {
          kind,
          section: sectionName,
          planned: 0,
          actual: amt,
        });
      }
    } else {
      unbudgetedExpense += amt;
    }
  }

  // Tambah pemasukan dari iuran panitia yang lunas (PANITIA-2.2)
  actualIncome += duesSummary.collected;

  const sections = Array.from(sectionMap.values()).map((sec) => {
    const variance = sec.actual - sec.planned;
    const percent = sec.planned > 0
      ? Math.round((sec.actual / sec.planned) * 10000) / 100
      : (sec.actual > 0 ? 100 : 0);
    return {
      kind: sec.kind,
      section: sec.section,
      planned: Math.round(sec.planned * 100) / 100,
      actual: Math.round(sec.actual * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      percent,
    };
  });

  return {
    planned: {
      income: Math.round(plannedIncome * 100) / 100,
      expense: Math.round(plannedExpense * 100) / 100,
      balance: Math.round((plannedIncome - plannedExpense) * 100) / 100,
    },
    actual: {
      income: Math.round(actualIncome * 100) / 100,
      expense: Math.round(actualExpense * 100) / 100,
      balance: Math.round((actualIncome - actualExpense) * 100) / 100,
    },
    sections,
    unbudgeted: {
      income: Math.round(unbudgetedIncome * 100) / 100,
      expense: Math.round(unbudgetedExpense * 100) / 100,
    },
    dues: duesSummary,
  };
}

// ==============================================================================
// CRUD TENANT PROGRAMS
// ==============================================================================

/**
 * Mengambil daftar acara milik tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} [options] - { status }
 */
export async function fetchPrograms(tenantId, { status } = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    let list = demoProgramsStore.filter((p) => p.tenant_id === tenantId);
    if (status) {
      list = list.filter((p) => p.status === status);
    }
    return list.map((row) => ({
      ...row,
      startsOn: row.starts_on ?? row.startsOn,
      endsOn: row.ends_on ?? row.endsOn,
      leadMemberId: row.lead_member_id ?? row.leadMemberId,
      access_until: row.access_until ?? row.accessUntil ?? null,
      accessUntil: row.access_until ?? row.accessUntil ?? null,
      is_free_trial: Boolean(row.is_free_trial ?? row.isFreeTrial),
      isFreeTrial: Boolean(row.is_free_trial ?? row.isFreeTrial),
    }));
  }

  let query = supabase
    .from('tenant_programs')
    .select('*, lead_member:tenant_members(id, full_name)')
    .eq('tenant_id', tenantId)
    .order('starts_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[programs] fetchPrograms error:', error);
    throw error;
  }

  return (data || []).map((row) => ({
    ...row,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    leadMemberId: row.lead_member_id,
    accessUntil: row.access_until,
    isFreeTrial: row.is_free_trial,
  }));
}

/**
 * Mengambil seluruh acara beserta ringkasan keuangannya dalam 5 query (PANITIA-2.2)
 * @param {string} tenantId - UUID tenant
 * @returns {Promise<Array<{ ...program, summary: object }>>}
 */
export async function fetchProgramsOverview(tenantId) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const [progs, allIncomes, allExpenses] = await Promise.all([
      fetchPrograms(tenantId),
      fetchTenantIncomes(tenantId),
      fetchTenantExpenses(tenantId),
    ]);

    const allBudgetItems = demoBudgetItemsStore
      .filter((b) => b.tenant_id === tenantId)
      .map((row) => ({
        ...row,
        unitLabel: row.unit_label,
        unitPrice: Number(row.unit_price || 0),
        sortOrder: Number(row.sort_order || 0),
        amount: Number(row.amount || (Number(row.quantity || 1) * Number(row.unit_price || 0))),
      }));

    const budgetByProg = new Map();
    for (const b of allBudgetItems) {
      const pid = String(b.program_id || b.programId);
      if (!budgetByProg.has(pid)) budgetByProg.set(pid, []);
      budgetByProg.get(pid).push(b);
    }

    const incomeByProg = new Map();
    for (const inc of allIncomes) {
      const pid = inc.program_id || inc.programId;
      if (pid) {
        const sPid = String(pid);
        if (!incomeByProg.has(sPid)) incomeByProg.set(sPid, []);
        incomeByProg.get(sPid).push(inc);
      }
    }

    const expenseByProg = new Map();
    for (const exp of allExpenses) {
      const pid = exp.program_id || exp.programId;
      if (pid) {
        const sPid = String(pid);
        if (!expenseByProg.has(sPid)) expenseByProg.set(sPid, []);
        expenseByProg.get(sPid).push(exp);
      }
    }

    const allDemoDues = getDemoProgramDues(tenantId);
    const duesByProg = new Map();
    for (const d of allDemoDues) {
      if (d.status !== 'cancelled') {
        const pid = String(d.program_id || d.programId);
        if (!duesByProg.has(pid)) duesByProg.set(pid, []);
        duesByProg.get(pid).push(d);
      }
    }

    return (progs || []).map((prog) => {
      const sId = String(prog.id);
      const pBudget = budgetByProg.get(sId) || [];
      const pIncomes = incomeByProg.get(sId) || [];
      const pExpenses = expenseByProg.get(sId) || [];
      const pDues = duesByProg.get(sId) || [];
      const summary = summarizeProgram(pBudget, pIncomes, pExpenses, pDues);
      return {
        ...prog,
        summary,
      };
    });
  }

  // 5 Query paralel ke Supabase (PANITIA-2.2)
  const [
    { data: programsData, error: progError },
    { data: budgetData, error: budgetError },
    { data: incomesData, error: incomeError },
    { data: expensesData, error: expenseError },
    { data: duesData, error: duesError },
  ] = await Promise.all([
    supabase
      .from('tenant_programs')
      .select('*, lead_member:tenant_members(id, full_name)')
      .eq('tenant_id', tenantId)
      .order('starts_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('program_budget_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('non_ipl_incomes')
      .select('*')
      .eq('tenant_id', tenantId)
      .not('program_id', 'is', null)
      .is('deleted_at', null)
      .order('income_date', { ascending: false }),
    supabase
      .from('expenses')
      .select('id, tenant_id, category, amount, description, receipt_url, recorded_by, metadata, expense_date, is_date_proxy, program_id, budget_item_id, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .not('program_id', 'is', null)
      .order('expense_date', { ascending: false }),
    supabase
      .from('billing_items')
      .select('id, tenant_id, program_id, amount, status')
      .eq('tenant_id', tenantId)
      .not('program_id', 'is', null)
      .neq('status', 'cancelled'),
  ]);

  if (progError) {
    console.error('[programs] fetchProgramsOverview programs error:', progError);
    throw progError;
  }
  if (budgetError) {
    console.error('[programs] fetchProgramsOverview budget error:', budgetError);
    throw budgetError;
  }
  if (incomeError) {
    console.error('[programs] fetchProgramsOverview incomes error:', incomeError);
    throw incomeError;
  }
  if (expenseError) {
    console.error('[programs] fetchProgramsOverview expenses error:', expenseError);
    throw expenseError;
  }
  if (duesError) {
    console.error('[programs] fetchProgramsOverview dues error:', duesError);
    throw duesError;
  }

  const budgetByProg = new Map();
  for (const row of budgetData || []) {
    const pid = String(row.program_id);
    if (!budgetByProg.has(pid)) budgetByProg.set(pid, []);
    budgetByProg.get(pid).push({
      ...row,
      unitLabel: row.unit_label,
      unitPrice: Number(row.unit_price || 0),
      sortOrder: Number(row.sort_order || 0),
      amount: Number(row.amount || (Number(row.quantity || 1) * Number(row.unit_price || 0))),
    });
  }

  const incomeByProg = new Map();
  for (const row of incomesData || []) {
    const pid = String(row.program_id);
    if (!incomeByProg.has(pid)) incomeByProg.set(pid, []);
    incomeByProg.get(pid).push({
      ...row,
      amount: Number(row.amount || 0),
      date: row.income_date,
      incomeDate: row.income_date,
      sourceName: row.source_name,
      paymentMethod: row.payment_method,
      referenceNumber: row.reference_number,
      programId: row.program_id,
      budgetItemId: row.budget_item_id,
    });
  }

  const expenseByProg = new Map();
  for (const row of expensesData || []) {
    const pid = String(row.program_id);
    if (!expenseByProg.has(pid)) expenseByProg.set(pid, []);
    expenseByProg.get(pid).push({
      ...row,
      amount: Number(row.amount || 0),
      date: row.expense_date,
      expenseDate: row.expense_date,
      programId: row.program_id,
      budgetItemId: row.budget_item_id,
    });
  }

  const duesByProg = new Map();
  for (const row of duesData || []) {
    const pid = String(row.program_id);
    if (!duesByProg.has(pid)) duesByProg.set(pid, []);
    duesByProg.get(pid).push(row);
  }

  return (programsData || []).map((row) => {
    const prog = {
      ...row,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      leadMemberId: row.lead_member_id,
      accessUntil: row.access_until,
      isFreeTrial: row.is_free_trial,
    };
    const sId = String(prog.id);
    const pBudget = budgetByProg.get(sId) || [];
    const pIncomes = incomeByProg.get(sId) || [];
    const pExpenses = expenseByProg.get(sId) || [];
    const pDues = duesByProg.get(sId) || [];
    const summary = summarizeProgram(pBudget, pIncomes, pExpenses, pDues);
    return {
      ...prog,
      summary,
    };
  });
}

/**
 * Mengambil satu acara berdasarkan ID
 * @param {string} tenantId - UUID tenant
 * @param {string} programId - UUID program
 */
export async function fetchProgram(tenantId, programId) {
  if (!tenantId || !programId) return null;

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const item = demoProgramsStore.find(
      (p) => p.id === programId && p.tenant_id === tenantId
    );
    if (!item) return null;
    return {
      ...item,
      startsOn: item.starts_on ?? item.startsOn,
      endsOn: item.ends_on ?? item.endsOn,
      leadMemberId: item.lead_member_id ?? item.leadMemberId,
      access_until: item.access_until ?? item.accessUntil ?? null,
      accessUntil: item.access_until ?? item.accessUntil ?? null,
      is_free_trial: Boolean(item.is_free_trial ?? item.isFreeTrial),
      isFreeTrial: Boolean(item.is_free_trial ?? item.isFreeTrial),
    };
  }

  const { data, error } = await supabase
    .from('tenant_programs')
    .select('*, lead_member:tenant_members(id, full_name)')
    .eq('tenant_id', tenantId)
    .eq('id', programId)
    .single();

  if (error) {
    console.error('[programs] fetchProgram error:', error);
    throw error;
  }

  if (!data) return null;

  return {
    ...data,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
    leadMemberId: data.lead_member_id,
    accessUntil: data.access_until,
    isFreeTrial: data.is_free_trial,
  };
}

/**
 * Membuat acara baru
 * @param {string} tenantId - UUID tenant
 * @param {object} param1 - data acara
 */
export async function createProgram(
  tenantId,
  { name, description = '', location = null, startsOn = null, endsOn = null, status = 'planning', leadMemberId = null } = {}
) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName || trimmedName.length > 150) {
    throw new Error('Nama acara wajib diisi (1-150 karakter).');
  }

  const validStatus = ['planning', 'running', 'done', 'archived'].includes(status)
    ? status
    : 'planning';

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const alreadyClaimed = demoFreeTrialClaimedTenants.has(tenantId);
    let isFreeTrial = false;
    let accessUntil = null;
    if (!alreadyClaimed) {
      demoFreeTrialClaimedTenants.add(tenantId);
      isFreeTrial = true;
      accessUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    const newProg = {
      id: `prog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tenant_id: tenantId,
      name: trimmedName,
      description: description ? String(description).trim() : '',
      location: location ? String(location).trim() : null,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      status: validStatus,
      lead_member_id: leadMemberId || null,
      lead_member: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      startsOn: startsOn || null,
      endsOn: endsOn || null,
      leadMemberId: leadMemberId || null,
      access_until: accessUntil,
      accessUntil: accessUntil,
      is_free_trial: isFreeTrial,
      isFreeTrial: isFreeTrial,
    };
    demoProgramsStore.push(newProg);
    return newProg;
  }

  const payload = {
    tenant_id: tenantId,
    name: trimmedName,
    description: description ? String(description).trim() : '',
    location: location ? String(location).trim() : null,
    starts_on: startsOn || null,
    ends_on: endsOn || null,
    status: validStatus,
    lead_member_id: leadMemberId || null,
  };

  const { data, error } = await supabase
    .from('tenant_programs')
    .insert(payload)
    .select('*, lead_member:tenant_members(id, full_name)')
    .single();

  if (error) {
    console.error('[programs] createProgram error:', error);
    throw error;
  }

  return {
    ...data,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
    leadMemberId: data.lead_member_id,
    accessUntil: data.access_until,
    isFreeTrial: data.is_free_trial,
  };
}

/**
 * Memperbarui acara. Hanya mengirim field yang diteruskan dan memfilter tenant_id.
 * @param {string} tenantId - UUID tenant
 * @param {string} programId - UUID program
 * @param {object} fields - Field yang diperbarui
 */
export async function updateProgram(tenantId, programId, fields = {}) {
  if (!tenantId || !programId) throw new Error('tenantId dan programId wajib disertakan.');

  const updatePayload = {};

  if (fields.name !== undefined) {
    const trimmed = typeof fields.name === 'string' ? fields.name.trim() : '';
    if (!trimmed || trimmed.length > 150) {
      throw new Error('Nama acara wajib diisi (1-150 karakter).');
    }
    updatePayload.name = trimmed;
  }

  if (fields.description !== undefined) {
    updatePayload.description = fields.description ? String(fields.description).trim() : '';
  }

  if (fields.location !== undefined) {
    updatePayload.location = fields.location ? String(fields.location).trim() : null;
  }

  if (fields.startsOn !== undefined || fields.starts_on !== undefined) {
    updatePayload.starts_on = fields.startsOn ?? fields.starts_on ?? null;
  }

  if (fields.endsOn !== undefined || fields.ends_on !== undefined) {
    updatePayload.ends_on = fields.endsOn ?? fields.ends_on ?? null;
  }

  if (fields.status !== undefined) {
    if (!['planning', 'running', 'done', 'archived'].includes(fields.status)) {
      throw new Error('Status acara tidak valid.');
    }
    updatePayload.status = fields.status;
  }

  if (fields.leadMemberId !== undefined || fields.lead_member_id !== undefined) {
    updatePayload.lead_member_id = fields.leadMemberId ?? fields.lead_member_id ?? null;
  }

  updatePayload.updated_at = new Date().toISOString();

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const idx = demoProgramsStore.findIndex(
      (p) => p.id === programId && p.tenant_id === tenantId
    );
    if (idx < 0) throw new Error('Acara tidak ditemukan.');
    const updated = {
      ...demoProgramsStore[idx],
      ...updatePayload,
      startsOn: updatePayload.starts_on ?? demoProgramsStore[idx].startsOn,
      endsOn: updatePayload.ends_on ?? demoProgramsStore[idx].endsOn,
      leadMemberId: updatePayload.lead_member_id ?? demoProgramsStore[idx].leadMemberId,
    };
    demoProgramsStore[idx] = updated;
    return updated;
  }

  const { data, error } = await supabase
    .from('tenant_programs')
    .update(updatePayload)
    .eq('tenant_id', tenantId)
    .eq('id', programId)
    .select('*, lead_member:tenant_members(id, full_name)')
    .single();

  if (error) {
    console.error('[programs] updateProgram error:', error);
    throw error;
  }

  return {
    ...data,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
    leadMemberId: data.lead_member_id,
  };
}

/**
 * Menghapus acara. Jika memiliki transaksi yang menautkan program, error diterjemahkan.
 * @param {string} tenantId - UUID tenant
 * @param {string} programId - UUID program
 */
export async function deleteProgram(tenantId, programId) {
  if (!tenantId || !programId) throw new Error('tenantId dan programId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    // Check if any demo transactions exist for this program
    const { incomes, expenses } = await fetchProgramTransactions(tenantId, programId);
    if ((incomes && incomes.length > 0) || (expenses && expenses.length > 0)) {
      throw new Error('Acara yang sudah punya transaksi tidak bisa dihapus. Ubah statusnya menjadi Arsip.');
    }
    const idx = demoProgramsStore.findIndex(
      (p) => p.id === programId && p.tenant_id === tenantId
    );
    if (idx >= 0) {
      demoProgramsStore.splice(idx, 1);
    }
    // Also remove budget items
    demoBudgetItemsStore = demoBudgetItemsStore.filter(
      (b) => !(b.program_id === programId && b.tenant_id === tenantId)
    );
    return true;
  }

  const { error } = await supabase
    .from('tenant_programs')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', programId);

  if (error) {
    if (
      error.code === '23503' ||
      String(error.message).includes('foreign key constraint') ||
      String(error.message).includes('fk_expenses_program') ||
      String(error.message).includes('fk_non_ipl_incomes_program')
    ) {
      throw new Error('Acara yang sudah punya transaksi tidak bisa dihapus. Ubah statusnya menjadi Arsip.');
    }
    console.error('[programs] deleteProgram error:', error);
    throw error;
  }

  return true;
}

// ==============================================================================
// CRUD PROGRAM BUDGET ITEMS (RAB)
// ==============================================================================

/**
 * Mengambil daftar pos anggaran (RAB) acara
 * @param {string} tenantId - UUID tenant
 * @param {string} programId - UUID program
 */
export async function fetchBudgetItems(tenantId, programId) {
  if (!tenantId || !programId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    return demoBudgetItemsStore
      .filter((b) => b.tenant_id === tenantId && b.program_id === programId)
      .map((b) => ({
        ...b,
        unitLabel: b.unit_label || b.unitLabel || '',
        unitPrice: Number(b.unit_price ?? b.unitPrice ?? 0),
        sortOrder: Number(b.sort_order ?? b.sortOrder ?? 0),
        amount: Number(b.amount || (Number(b.quantity || 1) * Number(b.unit_price || b.unitPrice || 0))),
      }));
  }

  const { data, error } = await supabase
    .from('program_budget_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('program_id', programId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[programs] fetchBudgetItems error:', error);
    throw error;
  }

  return (data || []).map((row) => ({
    ...row,
    unitLabel: row.unit_label,
    unitPrice: Number(row.unit_price || 0),
    sortOrder: Number(row.sort_order || 0),
    amount: Number(row.amount || (Number(row.quantity || 1) * Number(row.unit_price || 0))),
  }));
}

/**
 * Menambah pos anggaran (RAB) acara baru. Jangan mengirim kolom `amount` (kolom otomatis DB).
 * @param {string} tenantId - UUID tenant
 * @param {string} programId - UUID program
 * @param {object} param2 - data budget item
 */
export async function createBudgetItem(
  tenantId,
  programId,
  { kind = 'expense', section = '', item, quantity = 1, unitLabel = '', unitPrice = 0, notes = '', sortOrder = 0 } = {}
) {
  if (!tenantId || !programId) throw new Error('tenantId dan programId wajib disertakan.');

  const trimmedItem = typeof item === 'string' ? item.trim() : '';
  if (!trimmedItem || trimmedItem.length > 150) {
    throw new Error('Nama pos anggaran (item) wajib diisi (1-150 karakter).');
  }

  const validKind = kind === 'income' ? 'income' : 'expense';
  const numQty = Number(quantity);
  if (isNaN(numQty) || numQty <= 0) {
    throw new Error('Jumlah quantity harus berupa angka lebih besar dari 0.');
  }

  const numPrice = Number(unitPrice);
  if (isNaN(numPrice) || numPrice < 0) {
    throw new Error('Harga satuan (unitPrice) harus berupa angka positif atau nol.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const calculatedAmount = Math.round(numQty * numPrice * 100) / 100;
    const newItem = {
      id: `budget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tenant_id: tenantId,
      program_id: programId,
      kind: validKind,
      section: section ? String(section).trim() : '',
      item: trimmedItem,
      quantity: numQty,
      unit_label: unitLabel ? String(unitLabel).trim() : '',
      unit_price: numPrice,
      amount: calculatedAmount,
      notes: notes ? String(notes).trim() : '',
      sort_order: Number(sortOrder) || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      unitLabel: unitLabel ? String(unitLabel).trim() : '',
      unitPrice: numPrice,
      sortOrder: Number(sortOrder) || 0,
    };
    demoBudgetItemsStore.push(newItem);
    return newItem;
  }

  const payload = {
    tenant_id: tenantId,
    program_id: programId,
    kind: validKind,
    section: section ? String(section).trim() : '',
    item: trimmedItem,
    quantity: numQty,
    unit_label: unitLabel ? String(unitLabel).trim() : '',
    unit_price: numPrice,
    notes: notes ? String(notes).trim() : '',
    sort_order: Number(sortOrder) || 0,
  };

  const { data, error } = await supabase
    .from('program_budget_items')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[programs] createBudgetItem error:', error);
    throw error;
  }

  return {
    ...data,
    unitLabel: data.unit_label,
    unitPrice: Number(data.unit_price || 0),
    sortOrder: Number(data.sort_order || 0),
    amount: Number(data.amount || (Number(data.quantity || 1) * Number(data.unit_price || 0))),
  };
}

/**
 * Memperbarui pos anggaran acara. Jangan mengirim kolom `amount`.
 * @param {string} tenantId - UUID tenant
 * @param {string} budgetItemId - UUID item
 * @param {object} fields - Field yang diubah
 */
export async function updateBudgetItem(tenantId, budgetItemId, fields = {}) {
  if (!tenantId || !budgetItemId) throw new Error('tenantId dan budgetItemId wajib disertakan.');

  const updatePayload = {};

  if (fields.kind !== undefined) {
    updatePayload.kind = fields.kind === 'income' ? 'income' : 'expense';
  }

  if (fields.section !== undefined) {
    updatePayload.section = fields.section ? String(fields.section).trim() : '';
  }

  if (fields.item !== undefined) {
    const trimmed = typeof fields.item === 'string' ? fields.item.trim() : '';
    if (!trimmed || trimmed.length > 150) {
      throw new Error('Nama pos anggaran wajib diisi (1-150 karakter).');
    }
    updatePayload.item = trimmed;
  }

  if (fields.quantity !== undefined) {
    const q = Number(fields.quantity);
    if (isNaN(q) || q <= 0) throw new Error('Quantity harus lebih besar dari 0.');
    updatePayload.quantity = q;
  }

  if (fields.unitLabel !== undefined || fields.unit_label !== undefined) {
    const ul = fields.unitLabel ?? fields.unit_label;
    updatePayload.unit_label = ul ? String(ul).trim() : '';
  }

  if (fields.unitPrice !== undefined || fields.unit_price !== undefined) {
    const p = Number(fields.unitPrice ?? fields.unit_price);
    if (isNaN(p) || p < 0) throw new Error('Harga satuan tidak valid.');
    updatePayload.unit_price = p;
  }

  if (fields.notes !== undefined) {
    updatePayload.notes = fields.notes ? String(fields.notes).trim() : '';
  }

  if (fields.sortOrder !== undefined || fields.sort_order !== undefined) {
    updatePayload.sort_order = Number(fields.sortOrder ?? fields.sort_order) || 0;
  }

  updatePayload.updated_at = new Date().toISOString();

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const idx = demoBudgetItemsStore.findIndex(
      (b) => b.id === budgetItemId && b.tenant_id === tenantId
    );
    if (idx < 0) throw new Error('Pos anggaran tidak ditemukan.');
    const existing = demoBudgetItemsStore[idx];
    const newQty = updatePayload.quantity ?? existing.quantity;
    const newPrice = updatePayload.unit_price ?? existing.unit_price;
    const newAmount = Math.round(newQty * newPrice * 100) / 100;

    const updated = {
      ...existing,
      ...updatePayload,
      amount: newAmount,
      unitLabel: updatePayload.unit_label ?? existing.unitLabel,
      unitPrice: updatePayload.unit_price ?? existing.unitPrice,
      sortOrder: updatePayload.sort_order ?? existing.sortOrder,
    };
    demoBudgetItemsStore[idx] = updated;
    return updated;
  }

  const { data, error } = await supabase
    .from('program_budget_items')
    .update(updatePayload)
    .eq('tenant_id', tenantId)
    .eq('id', budgetItemId)
    .select()
    .single();

  if (error) {
    console.error('[programs] updateBudgetItem error:', error);
    throw error;
  }

  return {
    ...data,
    unitLabel: data.unit_label,
    unitPrice: Number(data.unit_price || 0),
    sortOrder: Number(data.sort_order || 0),
    amount: Number(data.amount || (Number(data.quantity || 1) * Number(data.unit_price || 0))),
  };
}

/**
 * Menghapus pos anggaran acara
 * @param {string} tenantId - UUID tenant
 * @param {string} budgetItemId - UUID item
 */
export async function deleteBudgetItem(tenantId, budgetItemId) {
  if (!tenantId || !budgetItemId) throw new Error('tenantId dan budgetItemId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const idx = demoBudgetItemsStore.findIndex(
      (b) => b.id === budgetItemId && b.tenant_id === tenantId
    );
    if (idx >= 0) {
      demoBudgetItemsStore.splice(idx, 1);
    }
    return true;
  }

  const { error } = await supabase
    .from('program_budget_items')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', budgetItemId);

  if (error) {
    console.error('[programs] deleteBudgetItem error:', error);
    throw error;
  }

  return true;
}

// ==============================================================================
// TRANSAKSI ACARA (PEMASUKAN & PENGELUARAN)
// ==============================================================================

/**
 * Mengambil seluruh transaksi acara (pemasukan, pengeluaran, dan iuran) (PANITIA-2.2)
 * Pemasukan hanya yang deleted_at IS NULL
 * @param {string} tenantId - UUID tenant
 * @param {string} programId - UUID program
 * @returns {Promise<{ incomes: Array, expenses: Array, dues: Array }>}
 */
export async function fetchProgramTransactions(tenantId, programId) {
  if (!tenantId || !programId) {
    return { incomes: [], expenses: [], dues: [], duesError: false };
  }

  let dues = [];
  let duesError = false;

  const [incomes, expenses] = await Promise.all([
    fetchTenantIncomes(tenantId, { programId }),
    fetchTenantExpenses(tenantId, { programId }),
  ]);

  try {
    dues = await fetchProgramDues(tenantId, programId);
  } catch (err) {
    console.error('[programs] fetchProgramDues error:', err);
    dues = [];
    duesError = true;
  }

  return {
    incomes: incomes || [],
    expenses: expenses || [],
    dues: dues || [],
    duesError,
  };
}
