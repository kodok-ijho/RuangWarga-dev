/**
 * Pure Cash-Basis Financial Aggregation Engine for RuangWarga Multi-Tenant SaaS
 * Sub-Gate: 8.1-C2
 * 
 * Strict Invariants:
 * 1. PURE DOMAIN ENGINE: Zero network, database, Supabase, DOM, or tenantId dependencies.
 * 2. DETERMINISTIC MONEY: All internal arithmetic uses integer minor units (sen/cents).
 *    Zero floating-point accumulation.
 * 3. BALANCE CONTINUITY: Opening(M) + Inflow(M) - Outflow(M) = Closing(M).
 *    Opening(M) === Closing(M-1) in sequential balance chains.
 * 4. CASH RECOGNITION: Follows the Revision 2 Semantic Parity Matrix:
 *    - Payment: status='completed', amount > 0, valid canonicalDate.
 *    - Unresolved Payment: status='completed', amount > 0, missing canonicalDate -> counted in unresolvedCount, excluded from cash.
 *    - Zero Payment (amount=0): contributes Rp 0, count=0.
 *    - Non-IPL Income: not deleted, amount > 0, status != 'rejected', valid canonicalDate.
 *    - Expense: amount > 0, valid canonicalDate.
 *    - Billing items: strictly ignored for cash.
 * 5. IMMUTABILITY: Never mutates input arrays, records, or accumulator objects.
 */

import {
  toMinorUnits,
  fromMinorUnits,
  safeAdd,
  safeSubtract,
  MalformedMonetaryError,
  IntegerOverflowError,
} from './money.js';

// Re-export money utilities for consumer convenience
export {
  toMinorUnits,
  fromMinorUnits,
  safeAdd,
  safeSubtract,
  MalformedMonetaryError,
  IntegerOverflowError,
};

/**
 * Extracts and validates integer minor units from a record.
 * Supports both pre-parsed `amountMinorUnits` and raw numeric/string `amount`.
 * 
 * @param {object} record
 * @returns {number} Integer minor units
 */
export function extractRecordMinorUnits(record) {
  if (!record || typeof record !== 'object') {
    throw new MalformedMonetaryError('Record must be a valid object.');
  }

  if (record.amountMinorUnits !== undefined && record.amountMinorUnits !== null) {
    if (typeof record.amountMinorUnits !== 'number' || !Number.isInteger(record.amountMinorUnits)) {
      throw new MalformedMonetaryError(
        `amountMinorUnits must be an integer, received: ${record.amountMinorUnits}`
      );
    }
    if (!Number.isSafeInteger(record.amountMinorUnits)) {
      throw new IntegerOverflowError(
        `amountMinorUnits exceeds safe integer range: ${record.amountMinorUnits}`
      );
    }
    return record.amountMinorUnits;
  }

  if (record.amount !== undefined && record.amount !== null) {
    return toMinorUnits(record.amount);
  }

  return 0;
}

/**
 * Predicate: Determines whether a record is a recognized monetary cash payment inflow.
 * 
 * Rules:
 * - entityType/type === 'payment'
 * - status === 'completed'
 * - amountMinorUnits > 0
 * - valid canonicalDate exists
 */
export function isRecognizedPayment(record) {
  if (!record || typeof record !== 'object') return false;
  const type = record.entityType || record.type;
  if (type !== 'payment') return false;
  if (record.status !== 'completed') return false;

  const minorUnits = extractRecordMinorUnits(record);
  if (minorUnits <= 0) return false;

  return Boolean(record.canonicalDate);
}

/**
 * Predicate: Identifies an unresolved completed payment record.
 * 
 * Invariant (Sub-Gate 8.1-C Patch 2):
 * A completed monetary payment with amount > 0 but without canonicalDate is an
 * UNRESOLVED CASH RECORD. It is NOT recognized as cash until a valid date exists.
 */
export function isUnresolvedPayment(record) {
  if (!record || typeof record !== 'object') return false;
  const type = record.entityType || record.type;
  if (type !== 'payment') return false;
  if (record.status !== 'completed') return false;

  const minorUnits = extractRecordMinorUnits(record);
  if (minorUnits <= 0) return false;

  return !record.canonicalDate || Boolean(record.isUnresolved);
}

/**
 * Predicate: Determines whether a record is a recognized non-IPL cash income inflow.
 * 
 * Rules:
 * - entityType/type === 'non_ipl_income'
 * - not soft-deleted (deleted_at IS NULL and !isDeleted)
 * - amountMinorUnits > 0
 * - status != 'rejected' (legacy compatibility check)
 * - valid canonicalDate exists
 */
export function isRecognizedNonIplIncome(record) {
  if (!record || typeof record !== 'object') return false;
  const type = record.entityType || record.type;
  if (type !== 'non_ipl_income') return false;

  const isDeleted = Boolean(record.isDeleted || record.deleted_at || record.deletedAt);
  if (isDeleted) return false;

  const minorUnits = extractRecordMinorUnits(record);
  if (minorUnits <= 0) return false;

  const status = record.metadataStatus || record.metadata?.status || record.status || 'verified';
  if (status === 'rejected') return false;

  return Boolean(record.canonicalDate);
}

/**
 * Predicate: Determines whether a record is a recognized cash expense outflow.
 * 
 * Rules:
 * - entityType/type === 'expense'
 * - amountMinorUnits > 0
 * - valid canonicalDate exists
 */
export function isRecognizedExpense(record) {
  if (!record || typeof record !== 'object') return false;
  const type = record.entityType || record.type;
  if (type !== 'expense') return false;

  const minorUnits = extractRecordMinorUnits(record);
  if (minorUnits <= 0) return false;

  return Boolean(record.canonicalDate);
}

/**
 * Normalizes a raw financial transaction into a Normalized Financial Domain Record.
 * Pure function: never mutates rawRecord.
 * 
 * @param {object} rawRecord
 * @returns {object} NormalizedFinancialRecord
 */
export function normalizeFinancialRecord(rawRecord) {
  if (!rawRecord || typeof rawRecord !== 'object') {
    throw new Error('rawRecord must be an object.');
  }

  const entityType = rawRecord.entityType || rawRecord.type;
  const amountMinorUnits = extractRecordMinorUnits(rawRecord);
  const canonicalDate = rawRecord.canonicalDate || null;

  let isRecognizedCash = false;
  let isUnresolved = false;
  let unresolvedReason = null;

  if (entityType === 'payment') {
    if (rawRecord.status === 'completed' && amountMinorUnits > 0) {
      if (canonicalDate) {
        isRecognizedCash = true;
      } else {
        isUnresolved = true;
        unresolvedReason = 'Completed monetary payment missing canonical paid_at cash date';
      }
    }
  } else if (entityType === 'non_ipl_income') {
    const isDeleted = Boolean(rawRecord.isDeleted || rawRecord.deleted_at || rawRecord.deletedAt);
    const status = rawRecord.metadataStatus || rawRecord.metadata?.status || rawRecord.status || 'verified';
    if (!isDeleted && amountMinorUnits > 0 && status !== 'rejected' && canonicalDate) {
      isRecognizedCash = true;
    }
  } else if (entityType === 'expense') {
    if (amountMinorUnits > 0 && canonicalDate) {
      isRecognizedCash = true;
    }
  }

  return {
    id: rawRecord.id || null,
    entityType,
    amountMinorUnits,
    canonicalDate,
    isRecognizedCash,
    isUnresolved,
    unresolvedReason,
    status: rawRecord.status,
    category: rawRecord.category,
    description: rawRecord.description,
  };
}

/**
 * Pure aggregation function for a single reporting period.
 * 
 * Invariants:
 * - Half-open interval: [periodStartCalendar, periodEndCalendarExclusive)
 * - Integer minor units only
 * - Net = Inflow - Outflow
 * - Closing = Opening + Net
 * 
 * @param {object} params
 * @param {number|string} [params.openingBalanceMinorUnits=0] - In minor units (integer or decimal string)
 * @param {Array<object>} [params.records=[]] - Array of normalized financial domain records
 * @param {object|null} [params.periodRange=null] - { periodStartCalendar, periodEndCalendarExclusive }
 * @returns {object} Period financial aggregation summary
 */
export function aggregatePeriodCashFlow({
  openingBalanceMinorUnits = 0,
  records = [],
  periodRange = null,
} = {}) {
  if (!Array.isArray(records)) {
    throw new Error('records must be an array.');
  }

  const openingUnits = typeof openingBalanceMinorUnits === 'number'
    ? openingBalanceMinorUnits
    : toMinorUnits(openingBalanceMinorUnits);

  if (!Number.isInteger(openingUnits) || !Number.isSafeInteger(openingUnits)) {
    throw new IntegerOverflowError(
      `openingBalanceMinorUnits must be a safe integer, received: ${openingBalanceMinorUnits}`
    );
  }

  let inflowMinorUnits = 0;
  let outflowMinorUnits = 0;
  let inflowCount = 0;
  let outflowCount = 0;
  let unresolvedCount = 0;

  const recognizedInflowRecords = [];
  const recognizedOutflowRecords = [];
  const unresolvedRecords = [];

  const isInPeriod = (canonicalDate) => {
    if (!periodRange) return true;
    if (!canonicalDate) return false;
    const { periodStartCalendar, periodEndCalendarExclusive } = periodRange;
    return canonicalDate >= periodStartCalendar && canonicalDate < periodEndCalendarExclusive;
  };

  for (const record of records) {
    // 1. Check Unresolved Payments first
    if (isUnresolvedPayment(record)) {
      unresolvedCount += 1;
      unresolvedRecords.push(record);
      // Unresolved payments NEVER contribute to cash inflow
      continue;
    }

    // 2. Filter by half-open period interval [start, end)
    if (!isInPeriod(record.canonicalDate)) {
      continue;
    }

    // 3. Process Recognized Inflows (Completed payments & verified non-IPL)
    if (isRecognizedPayment(record) || isRecognizedNonIplIncome(record)) {
      const amountUnits = extractRecordMinorUnits(record);
      inflowMinorUnits = safeAdd(inflowMinorUnits, amountUnits);
      inflowCount += 1;
      recognizedInflowRecords.push(record);
    }
    // 4. Process Recognized Outflows (Expenses)
    else if (isRecognizedExpense(record)) {
      const amountUnits = extractRecordMinorUnits(record);
      outflowMinorUnits = safeAdd(outflowMinorUnits, amountUnits);
      outflowCount += 1;
      recognizedOutflowRecords.push(record);
    }
    // All other entities (pending, rejected, zero-amount, billing items) contribute 0
  }

  const netMinorUnits = safeSubtract(inflowMinorUnits, outflowMinorUnits);
  const closingBalanceMinorUnits = safeAdd(openingUnits, netMinorUnits);

  return {
    openingBalanceMinorUnits: openingUnits,
    inflowMinorUnits,
    outflowMinorUnits,
    netMinorUnits,
    closingBalanceMinorUnits,
    inflowCount,
    outflowCount,
    unresolvedCount,
    recognizedInflowRecords,
    recognizedOutflowRecords,
    unresolvedRecords,
    // Formatted 2-decimal display boundary strings
    openingBalanceFormatted: fromMinorUnits(openingUnits),
    inflowFormatted: fromMinorUnits(inflowMinorUnits),
    outflowFormatted: fromMinorUnits(outflowMinorUnits),
    netFormatted: fromMinorUnits(netMinorUnits),
    closingBalanceFormatted: fromMinorUnits(closingBalanceMinorUnits),
  };
}

/**
 * Builds a contiguous monthly/periodic balance chain.
 * 
 * Guarantee (Balance Continuity Invariant):
 * For every period M in sequence:
 * Opening(M) = Closing(M - 1)
 * 
 * @param {object} params
 * @param {number|string} [params.initialOpeningBalanceMinorUnits=0] - Opening balance of the first period
 * @param {Array<object>} params.periodRanges - Array of period range objects { periodStr, periodStartCalendar, periodEndCalendarExclusive, year, month }
 * @param {Array<object>} params.records - Full list of normalized records
 * @returns {{
 *   chain: Array<object>,
 *   finalClosingBalanceMinorUnits: number,
 *   totalInflowMinorUnits: number,
 *   totalOutflowMinorUnits: number,
 *   totalUnresolvedCount: number
 * }}
 */
export function buildContiguousBalanceChain({
  initialOpeningBalanceMinorUnits = 0,
  periodRanges = [],
  records = [],
} = {}) {
  if (!Array.isArray(periodRanges)) {
    throw new Error('periodRanges must be an array.');
  }
  if (!Array.isArray(records)) {
    throw new Error('records must be an array.');
  }

  let cursorOpening = typeof initialOpeningBalanceMinorUnits === 'number'
    ? initialOpeningBalanceMinorUnits
    : toMinorUnits(initialOpeningBalanceMinorUnits);

  if (!Number.isInteger(cursorOpening) || !Number.isSafeInteger(cursorOpening)) {
    throw new IntegerOverflowError(
      `initialOpeningBalanceMinorUnits must be a safe integer, received: ${initialOpeningBalanceMinorUnits}`
    );
  }

  const chain = [];
  let totalInflowMinorUnits = 0;
  let totalOutflowMinorUnits = 0;
  let totalUnresolvedCount = 0;

  for (const periodRange of periodRanges) {
    const periodSummary = aggregatePeriodCashFlow({
      openingBalanceMinorUnits: cursorOpening,
      records,
      periodRange,
    });

    totalInflowMinorUnits = safeAdd(totalInflowMinorUnits, periodSummary.inflowMinorUnits);
    totalOutflowMinorUnits = safeAdd(totalOutflowMinorUnits, periodSummary.outflowMinorUnits);
    totalUnresolvedCount += periodSummary.unresolvedCount;

    chain.push({
      period: periodRange.periodStr,
      year: periodRange.year,
      month: periodRange.month,
      openingBalanceMinorUnits: periodSummary.openingBalanceMinorUnits,
      inflowMinorUnits: periodSummary.inflowMinorUnits,
      outflowMinorUnits: periodSummary.outflowMinorUnits,
      netMinorUnits: periodSummary.netMinorUnits,
      closingBalanceMinorUnits: periodSummary.closingBalanceMinorUnits,
      inflowCount: periodSummary.inflowCount,
      outflowCount: periodSummary.outflowCount,
      unresolvedCount: periodSummary.unresolvedCount,
      // Formatted display strings
      openingBalanceFormatted: periodSummary.openingBalanceFormatted,
      inflowFormatted: periodSummary.inflowFormatted,
      outflowFormatted: periodSummary.outflowFormatted,
      netFormatted: periodSummary.netFormatted,
      closingBalanceFormatted: periodSummary.closingBalanceFormatted,
    });

    // Enforce continuity: Next opening is exactly this period's closing
    cursorOpening = periodSummary.closingBalanceMinorUnits;
  }

  return {
    chain,
    finalClosingBalanceMinorUnits: cursorOpening,
    totalInflowMinorUnits,
    totalOutflowMinorUnits,
    totalUnresolvedCount,
  };
}
