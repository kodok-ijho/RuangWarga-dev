/**
 * Decoupled Financial Repository for RuangWarga Multi-Tenant SaaS
 * Sub-Gate: 8.1-C4
 * 
 * Strict Invariants & Architectural Boundaries:
 * 1. TENANT ISOLATION: Every database query is strictly scoped by explicit tenantId.
 *    Never infers tenantId from names, slugs, emails, or hardcoded constants.
 * 2. BOUNDED QUERIES: All period queries are bounded by [startDate, endDate) in Asia/Jakarta.
 *    Never fetches lifetime records for single-period reports.
 * 3. NO BUSINESS ARITHMETIC: Performs zero general financial accumulation, running balances,
 *    or monthly net calculations. Those belong exclusively to financialAggregation.js.
 * 4. DETERMINISTIC MONEY: All monetary conversions use toMinorUnits from money.js.
 *    Zero floating-point arithmetic (Number * 100).
 * 5. CANCELLATION & ABORT: Propagates AbortSignal to all Supabase requests.
 *    Never swallows AbortError or query failures into empty datasets ([] or 0).
 * 6. OBSERVABLE UNRESOLVED RECORDS: Completed monetary payments with null paid_at
 *    are classified as unresolved domain records, surfacing unresolvedCount.
 */

import { supabase } from '../supabaseClient.js';
import { toMinorUnits } from './money.js';
import {
  resolvePaymentCashDate,
  resolveExpenseDate,
  resolveNonIplIncomeDate,
} from './financialDateResolver.js';

/**
 * Validates that tenantId is a non-empty string.
 * @param {string} tenantId
 */
export function assertValidTenantId(tenantId) {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Tenant ID is required and must be a non-empty string.');
  }
}

/**
 * Validates that dateStr is an authoritative calendar date formatted as 'YYYY-MM-DD'.
 * Rejects non-calendar dates (e.g. '2026-02-31').
 * 
 * @param {string} dateStr
 * @param {string} [paramName='Date']
 */
export function assertValidCalendarDate(dateStr, paramName = 'Date') {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error(`${paramName} is required and must be a valid 'YYYY-MM-DD' calendar string.`);
  }

  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`${paramName} must be formatted as 'YYYY-MM-DD', received: "${dateStr}"`);
  }

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);

  if (m < 1 || m > 12) {
    throw new Error(`${paramName} month must be between 1 and 12, received: ${m}`);
  }

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d < 1 || d > daysInMonth) {
    throw new Error(
      `${paramName} day must be between 1 and ${daysInMonth} for month ${m}, received: ${d}`
    );
  }
}

/**
 * Converts a calendar date string 'YYYY-MM-DD' to an exact UTC ISO-8601 string
 * representing 00:00:00 at the start of that day in the Asia/Jakarta (WIB, UTC+7) timezone.
 * 
 * Example:
 * '2026-08-01' (00:00 WIB) -> '2026-07-31T17:00:00.000Z'
 * 
 * @param {string} calendarDate - 'YYYY-MM-DD'
 * @returns {string} ISO-8601 UTC string
 */
export function calendarDateToJakartaBoundaryUtcIso(calendarDate) {
  assertValidCalendarDate(calendarDate);
  const trimmed = calendarDate.trim();
  const date = new Date(`${trimmed}T00:00:00+07:00`);
  return date.toISOString();
}

/**
 * Normalizes a raw payment record from the database into a Normalized Financial Domain Record.
 * 
 * Recognition Semantics (Revision 2 Semantic Parity Matrix §7):
 * - Completed monetary payment (status='completed', amount > 0, valid paid_at) -> isRecognizedCash=true.
 * - Completed payment with amount=0 -> isRecognizedCash=false, isUnresolved=false.
 * - Completed payment with missing paid_at -> isRecognizedCash=false, isUnresolved=true.
 * - Pending / rejected / other status -> isRecognizedCash=false, isUnresolved=false.
 * - Never uses created_at, billing period, or CURRENT_DATE as fallback cash date.
 * 
 * @param {object} rawPayment
 * @returns {object} NormalizedFinancialRecord
 */
export function normalizePaymentRecord(rawPayment) {
  if (!rawPayment || typeof rawPayment !== 'object') {
    throw new Error('rawPayment must be an object.');
  }

  const amountMinorUnits = toMinorUnits(rawPayment.amount);
  const canonicalDate = resolvePaymentCashDate(rawPayment);

  let isRecognizedCash = false;
  let isUnresolved = false;
  let unresolvedReason = null;

  if (rawPayment.status === 'completed' && amountMinorUnits > 0) {
    if (canonicalDate) {
      isRecognizedCash = true;
    } else {
      isUnresolved = true;
      unresolvedReason = 'Completed monetary payment missing canonical paid_at cash date';
    }
  }

  return {
    id: rawPayment.id || null,
    tenantId: rawPayment.tenant_id,
    entityType: 'payment',
    amountMinorUnits,
    canonicalDate,
    isRecognizedCash,
    isUnresolved,
    unresolvedReason,
    status: rawPayment.status,
    category: rawPayment.category || rawPayment.metadata?.category || 'IPL',
    description:
      rawPayment.description ||
      rawPayment.metadata?.description ||
      rawPayment.metadata?.note ||
      null,
    raw: rawPayment,
  };
}

/**
 * Normalizes a raw non-IPL income record from the database into a Normalized Financial Domain Record.
 * 
 * Recognition Semantics (Revision 2 Semantic Parity Matrix §7):
 * - Deleted (deleted_at IS NOT NULL) -> excluded from cash.
 * - Rejected (metadata.status === 'rejected') -> excluded from cash.
 * - amount <= 0 -> excluded from cash.
 * - Valid active income -> isRecognizedCash=true.
 * 
 * @param {object} rawIncome
 * @returns {object} NormalizedFinancialRecord
 */
export function normalizeNonIplIncomeRecord(rawIncome) {
  if (!rawIncome || typeof rawIncome !== 'object') {
    throw new Error('rawIncome must be an object.');
  }

  const amountMinorUnits = toMinorUnits(rawIncome.amount);
  const canonicalDate = resolveNonIplIncomeDate(rawIncome);

  const isDeleted = Boolean(rawIncome.deleted_at || rawIncome.isDeleted);
  const status =
    rawIncome.metadata?.status ||
    rawIncome.metadataStatus ||
    rawIncome.status ||
    'verified';

  let isRecognizedCash = false;
  if (!isDeleted && status !== 'rejected' && amountMinorUnits > 0 && canonicalDate) {
    isRecognizedCash = true;
  }

  return {
    id: rawIncome.id || null,
    tenantId: rawIncome.tenant_id,
    entityType: 'non_ipl_income',
    amountMinorUnits,
    canonicalDate,
    isRecognizedCash,
    isUnresolved: false,
    unresolvedReason: null,
    status,
    category: rawIncome.category || 'other',
    description: rawIncome.description || rawIncome.source_name || null,
    raw: rawIncome,
  };
}

/**
 * Normalizes a raw expense record from the database into a Normalized Financial Domain Record.
 * 
 * Recognition Semantics (Revision 2 Semantic Parity Matrix §7):
 * - amount > 0 and valid expense_date -> isRecognizedCash=true.
 * - Does not invent status, approval state, or deleted_at.
 * 
 * @param {object} rawExpense
 * @returns {object} NormalizedFinancialRecord
 */
export function normalizeExpenseRecord(rawExpense) {
  if (!rawExpense || typeof rawExpense !== 'object') {
    throw new Error('rawExpense must be an object.');
  }

  const amountMinorUnits = toMinorUnits(rawExpense.amount);
  const canonicalDate = resolveExpenseDate(rawExpense);

  let isRecognizedCash = false;
  if (amountMinorUnits > 0 && canonicalDate) {
    isRecognizedCash = true;
  }

  return {
    id: rawExpense.id || null,
    tenantId: rawExpense.tenant_id,
    entityType: 'expense',
    amountMinorUnits,
    canonicalDate,
    isRecognizedCash,
    isUnresolved: false,
    unresolvedReason: null,
    category: rawExpense.category || 'general',
    description: rawExpense.description || null,
    raw: rawExpense,
  };
}

/**
 * Dispatches normalization based on record entityType.
 * 
 * @param {object} rawRecord
 * @param {string} [entityTypeHint]
 * @returns {object} NormalizedFinancialRecord
 */
export function normalizeFinancialRecord(rawRecord, entityTypeHint) {
  if (!rawRecord || typeof rawRecord !== 'object') {
    throw new Error('rawRecord must be an object.');
  }

  const entityType = rawRecord.entityType || rawRecord.type || entityTypeHint;

  if (entityType === 'payment') {
    return normalizePaymentRecord(rawRecord);
  }
  if (entityType === 'non_ipl_income') {
    return normalizeNonIplIncomeRecord(rawRecord);
  }
  if (entityType === 'expense') {
    return normalizeExpenseRecord(rawRecord);
  }

  throw new Error(`Unsupported financial entity type: "${entityType}"`);
}

/**
 * Executes a paged PostgREST query deterministically using .range(from, to).
 * Respects AbortSignal and ensures errors/cancellations are never converted to empty arrays.
 * 
 * @param {object} params
 * @param {() => object} params.queryFactory - Factory function returning a fresh PostgREST query builder
 * @param {number} [params.pageSize=1000] - Number of items per page
 * @param {AbortSignal} [params.signal] - Optional cancellation signal
 * @returns {Promise<Array<object>>} Accumulated rows
 */
async function fetchPagedQuery({ queryFactory, pageSize = 1000, signal }) {
  const allRows = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    if (signal?.aborted) {
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      throw err;
    }

    const to = from + pageSize - 1;
    let query = queryFactory().range(from, to);

    if (signal && typeof query.abortSignal === 'function') {
      query = query.abortSignal(signal);
    }

    const { data, error } = await query;

    if (signal?.aborted) {
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      throw err;
    }

    if (error) {
      if (error.name === 'AbortError' || error.message?.includes('AbortError')) {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        throw err;
      }
      const dbErr = new Error(error.message || 'Database query error');
      dbErr.code = error.code;
      dbErr.details = error.details;
      dbErr.hint = error.hint;
      throw dbErr;
    }

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  return allRows;
}

/**
 * Fetches the authoritative opening balance for a tenant strictly before beforeDate.
 * Invokes the database scalar RPC public.get_tenant_opening_balance.
 * 
 * Invariants:
 * - Tenant isolation enforced explicitly in query and RPC.
 * - Retains exact monetary precision; converted to integer minor units via toMinorUnits.
 * - Does NOT fetch historical rows to calculate opening balance in JavaScript.
 * 
 * @param {object} params
 * @param {string} params.tenantId - UUID of the tenant
 * @param {string} params.beforeDate - 'YYYY-MM-DD' boundary date
 * @param {AbortSignal} [params.signal] - Optional cancellation signal
 * @param {object} [params.client=supabase] - Supabase client instance
 * @returns {Promise<number>} Opening balance in integer minor units (sen)
 */
export async function getTenantOpeningBalance({
  tenantId,
  beforeDate,
  signal,
  client = supabase,
}) {
  assertValidTenantId(tenantId);
  assertValidCalendarDate(beforeDate, 'beforeDate');

  if (signal?.aborted) {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    throw error;
  }

  let query = client.rpc('get_tenant_opening_balance', {
    p_tenant_id: tenantId,
    p_before_date: beforeDate,
  });

  if (signal && typeof query.abortSignal === 'function') {
    query = query.abortSignal(signal);
  }

  const { data, error } = await query;

  if (signal?.aborted) {
    const abortErr = new Error('The operation was aborted.');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (error) {
    if (error.name === 'AbortError' || error.message?.includes('AbortError')) {
      const abortErr = new Error('The operation was aborted.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const dbErr = new Error(error.message || 'Failed to fetch tenant opening balance');
    dbErr.code = error.code;
    dbErr.details = error.details;
    dbErr.hint = error.hint;
    throw dbErr;
  }

  // Exact conversion of database scalar numeric return to integer minor units
  return toMinorUnits(data ?? 0);
}

/**
 * Fetches payments completed within the bounded reporting period [startDate, endDate).
 * Scoped strictly to the specified tenantId.
 * 
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.startDate - 'YYYY-MM-DD'
 * @param {string} params.endDate - 'YYYY-MM-DD'
 * @param {AbortSignal} [params.signal]
 * @param {object} [params.client=supabase]
 * @param {number} [params.pageSize=1000]
 * @returns {Promise<{ rawRows: Array<object>, records: Array<object> }>}
 */
export async function fetchTenantPayments({
  tenantId,
  startDate,
  endDate,
  signal,
  client = supabase,
  pageSize = 1000,
}) {
  assertValidTenantId(tenantId);
  assertValidCalendarDate(startDate, 'startDate');
  assertValidCalendarDate(endDate, 'endDate');

  const startWibIso = calendarDateToJakartaBoundaryUtcIso(startDate);
  const endWibIso = calendarDateToJakartaBoundaryUtcIso(endDate);

  const queryFactory = () =>
    client
      .from('payments')
      .select('id, tenant_id, billing_item_id, amount, method, transaction_id, status, paid_at, metadata, created_at')
      .eq('tenant_id', tenantId)
      .gte('paid_at', startWibIso)
      .lt('paid_at', endWibIso)
      .order('paid_at', { ascending: true })
      .order('id', { ascending: true });

  const rawRows = await fetchPagedQuery({ queryFactory, pageSize, signal });
  const records = rawRows.map(normalizePaymentRecord);

  return { rawRows, records };
}

/**
 * Fetches unresolved completed payments (status='completed', amount > 0, paid_at IS NULL).
 * Scoped strictly to the specified tenantId.
 * 
 * @param {object} params
 * @param {string} params.tenantId
 * @param {AbortSignal} [params.signal]
 * @param {object} [params.client=supabase]
 * @param {number} [params.pageSize=1000]
 * @returns {Promise<{ rawRows: Array<object>, records: Array<object> }>}
 */
export async function fetchTenantUnresolvedPayments({
  tenantId,
  signal,
  client = supabase,
  pageSize = 1000,
}) {
  assertValidTenantId(tenantId);

  const queryFactory = () =>
    client
      .from('payments')
      .select('id, tenant_id, billing_item_id, amount, method, transaction_id, status, paid_at, metadata, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gt('amount', 0)
      .is('paid_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

  const rawRows = await fetchPagedQuery({ queryFactory, pageSize, signal });
  const records = rawRows.map(normalizePaymentRecord);

  return { rawRows, records };
}

/**
 * Fetches verified non-IPL incomes within the bounded period [startDate, endDate).
 * Scoped strictly to the specified tenantId. Excludes soft-deleted records.
 * 
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.startDate - 'YYYY-MM-DD'
 * @param {string} params.endDate - 'YYYY-MM-DD'
 * @param {AbortSignal} [params.signal]
 * @param {object} [params.client=supabase]
 * @param {number} [params.pageSize=1000]
 * @returns {Promise<{ rawRows: Array<object>, records: Array<object> }>}
 */
export async function fetchTenantNonIplIncomes({
  tenantId,
  startDate,
  endDate,
  signal,
  client = supabase,
  pageSize = 1000,
}) {
  assertValidTenantId(tenantId);
  assertValidCalendarDate(startDate, 'startDate');
  assertValidCalendarDate(endDate, 'endDate');

  const queryFactory = () =>
    client
      .from('non_ipl_incomes')
      .select(
        'id, tenant_id, income_date, amount, category, source_name, description, payment_method, reference_number, receipt_url, metadata, created_at, deleted_at'
      )
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('income_date', startDate)
      .lt('income_date', endDate)
      .order('income_date', { ascending: true })
      .order('id', { ascending: true });

  const rawRows = await fetchPagedQuery({ queryFactory, pageSize, signal });
  const records = rawRows.map(normalizeNonIplIncomeRecord);

  return { rawRows, records };
}

/**
 * Fetches expenses within the bounded period [startDate, endDate).
 * Scoped strictly to the specified tenantId.
 * 
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.startDate - 'YYYY-MM-DD'
 * @param {string} params.endDate - 'YYYY-MM-DD'
 * @param {AbortSignal} [params.signal]
 * @param {object} [params.client=supabase]
 * @param {number} [params.pageSize=1000]
 * @returns {Promise<{ rawRows: Array<object>, records: Array<object> }>}
 */
export async function fetchTenantExpenses({
  tenantId,
  startDate,
  endDate,
  signal,
  client = supabase,
  pageSize = 1000,
}) {
  assertValidTenantId(tenantId);
  assertValidCalendarDate(startDate, 'startDate');
  assertValidCalendarDate(endDate, 'endDate');

  const queryFactory = () =>
    client
      .from('expenses')
      .select('id, tenant_id, category, amount, description, receipt_url, metadata, expense_date, is_date_proxy, created_at')
      .eq('tenant_id', tenantId)
      .gte('expense_date', startDate)
      .lt('expense_date', endDate)
      .order('expense_date', { ascending: true })
      .order('id', { ascending: true });

  const rawRows = await fetchPagedQuery({ queryFactory, pageSize, signal });
  const records = rawRows.map(normalizeExpenseRecord);

  return { rawRows, records };
}

/**
 * Fetches all financial domain records for a tenant within a bounded period [startDate, endDate).
 * Retrieves payments, unresolved completed payments, non-IPL incomes, and expenses concurrently.
 * 
 * Returns normalized domain records ready for financialAggregation.aggregatePeriodCashFlow.
 * Does NOT perform general financial arithmetic, closing balance, or net flow calculations.
 * 
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.startDate - 'YYYY-MM-DD'
 * @param {string} params.endDate - 'YYYY-MM-DD'
 * @param {AbortSignal} [params.signal]
 * @param {object} [params.client=supabase]
 * @param {number} [params.pageSize=1000]
 * @returns {Promise<{
 *   tenantId: string,
 *   period: { startDate: string, endDate: string },
 *   records: Array<object>,
 *   payments: Array<object>,
 *   unresolvedPayments: Array<object>,
 *   nonIplIncomes: Array<object>,
 *   expenses: Array<object>,
 *   unresolvedRecords: Array<object>,
 *   unresolvedCount: number,
 *   rawCounts: {
 *     payments: number,
 *     unresolvedPayments: number,
 *     nonIplIncomes: number,
 *     expenses: number,
 *   }
 * }>}
 */
export async function fetchTenantFinancialRecords({
  tenantId,
  startDate,
  endDate,
  signal,
  client = supabase,
  pageSize = 1000,
}) {
  assertValidTenantId(tenantId);
  assertValidCalendarDate(startDate, 'startDate');
  assertValidCalendarDate(endDate, 'endDate');

  const [paymentsRes, unresolvedRes, nonIplRes, expensesRes] = await Promise.all([
    fetchTenantPayments({ tenantId, startDate, endDate, signal, client, pageSize }),
    fetchTenantUnresolvedPayments({ tenantId, signal, client, pageSize }),
    fetchTenantNonIplIncomes({ tenantId, startDate, endDate, signal, client, pageSize }),
    fetchTenantExpenses({ tenantId, startDate, endDate, signal, client, pageSize }),
  ]);

  const payments = paymentsRes.records;
  const unresolvedPayments = unresolvedRes.records;
  const nonIplIncomes = nonIplRes.records;
  const expenses = expensesRes.records;

  const records = [
    ...payments,
    ...unresolvedPayments,
    ...nonIplIncomes,
    ...expenses,
  ];

  return {
    tenantId,
    period: {
      startDate,
      endDate,
    },
    records,
    payments,
    unresolvedPayments,
    nonIplIncomes,
    expenses,
    unresolvedRecords: unresolvedPayments,
    unresolvedCount: unresolvedPayments.length,
    rawCounts: {
      payments: paymentsRes.rawRows.length,
      unresolvedPayments: unresolvedRes.rawRows.length,
      nonIplIncomes: nonIplRes.rawRows.length,
      expenses: expensesRes.rawRows.length,
    },
  };
}

/**
 * Backward compatibility alias for fetchTenantFinancialRecords.
 */
export const fetchTenantPeriodTransactions = fetchTenantFinancialRecords;
