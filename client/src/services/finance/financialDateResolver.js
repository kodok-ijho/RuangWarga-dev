/**
 * Pure Financial Date Resolver for RuangWarga Multi-Tenant SaaS
 * Sub-Gate: 8.1-C1
 * 
 * Authoritative Timezone: Asia/Jakarta (WIB, UTC+7)
 * Strictly pure JavaScript - zero network, database, or DOM dependencies.
 */

export const DEFAULT_FINANCIAL_TIMEZONE = 'Asia/Jakarta';

const JAKARTA_CALENDAR_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: DEFAULT_FINANCIAL_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export class InvalidDateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidDateError';
  }
}

/**
 * Validates ISO-8601 calendar date components to prevent JavaScript Date rollover
 * (e.g. '2026-02-31' rolling over to '2026-03-03').
 */
function validateIsoDateComponents(str) {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/);
  if (!match) return false;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  if (m < 1 || m > 12) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d < 1 || d > daysInMonth) return false;
  return true;
}

/**
 * Resolves an ISO-8601 timestamp string or Date object into an authoritative
 * 'YYYY-MM-DD' calendar date in the Asia/Jakarta timezone.
 * 
 * Invariants:
 * 1. Output format is strictly 'YYYY-MM-DD'.
 * 2. Interprets timestamp in Asia/Jakarta (UTC+7).
 * 3. Never uses browser-local calendar extraction.
 * 4. Never uses .toISOString().substring(0, 10).
 * 5. Never mutates input Date objects.
 * 6. Rejects null, undefined, empty string, and invalid dates explicitly.
 * 
 * @param {string|Date} timestamp
 * @param {string} [timeZone=DEFAULT_FINANCIAL_TIMEZONE]
 * @returns {string} 'YYYY-MM-DD'
 */
export function toJakartaCalendarDate(timestamp, timeZone = DEFAULT_FINANCIAL_TIMEZONE) {
  if (timestamp === null || timestamp === undefined) {
    throw new InvalidDateError('Timestamp is required (received null or undefined).');
  }

  let dateObj;

  if (timestamp instanceof Date) {
    if (isNaN(timestamp.getTime())) {
      throw new InvalidDateError('Invalid Date object provided.');
    }
    // Clone Date to guarantee immutability of the caller's instance
    dateObj = new Date(timestamp.getTime());
  } else if (typeof timestamp === 'string') {
    const trimmed = timestamp.trim();
    if (!trimmed) {
      throw new InvalidDateError('Timestamp string cannot be empty or whitespace.');
    }

    if (!validateIsoDateComponents(trimmed)) {
      throw new InvalidDateError(`Invalid or non-calendar ISO date string: "${timestamp}"`);
    }

    dateObj = new Date(trimmed);
    if (isNaN(dateObj.getTime())) {
      throw new InvalidDateError(`Failed to parse timestamp string: "${timestamp}"`);
    }
  } else {
    throw new InvalidDateError(`Expected Date or string, received ${typeof timestamp}.`);
  }

  const formatter = timeZone === DEFAULT_FINANCIAL_TIMEZONE 
    ? JAKARTA_CALENDAR_FORMATTER 
    : new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

  return formatter.format(dateObj);
}

/**
 * Resolves the canonical cash date for a payment.
 * 
 * Invariant (Sub-Gate 8.1-C Patch 2):
 * A completed monetary payment with amount > 0 without paid_at is an UNRESOLVED
 * cash record. It is NOT recognized as monetary cash until a valid paid_at exists.
 * Returns null if paid_at is missing/null, signaling an unresolved record.
 * 
 * @param {object} payment
 * @returns {string|null} 'YYYY-MM-DD' or null if unresolved
 */
export function resolvePaymentCashDate(payment) {
  if (!payment || typeof payment !== 'object') {
    throw new InvalidDateError('Payment object is required.');
  }

  if (!payment.paid_at) {
    return null;
  }

  return toJakartaCalendarDate(payment.paid_at);
}

/**
 * Resolves the canonical expense date.
 * 
 * @param {object} expense
 * @returns {string|null} 'YYYY-MM-DD' or null if missing
 */
export function resolveExpenseDate(expense) {
  if (!expense || typeof expense !== 'object') {
    throw new InvalidDateError('Expense object is required.');
  }

  const rawDate = expense.expense_date || expense.date;
  if (!rawDate) {
    return null;
  }

  return toJakartaCalendarDate(rawDate);
}

/**
 * Resolves the canonical non-IPL income date.
 * 
 * @param {object} income
 * @returns {string|null} 'YYYY-MM-DD' or null if missing
 */
export function resolveNonIplIncomeDate(income) {
  if (!income || typeof income !== 'object') {
    throw new InvalidDateError('Non-IPL income object is required.');
  }

  const rawDate = income.income_date || income.date;
  if (!rawDate) {
    return null;
  }

  return toJakartaCalendarDate(rawDate);
}

/**
 * Generates half-open calendar reporting boundaries [start, end) for a given year and month.
 * 
 * @param {number|string} year - e.g. 2026
 * @param {number|string} month - e.g. 8 (August)
 * @returns {{
 *   periodStr: string,
 *   periodStartCalendar: string,
 *   periodEndCalendarExclusive: string
 * }}
 */
export function getReportingPeriodRange(year, month) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);

  if (isNaN(y) || y < 1900 || y > 2200) {
    throw new InvalidDateError(`Invalid year provided: ${year}`);
  }

  if (isNaN(m) || m < 1 || m > 12) {
    throw new InvalidDateError(`Invalid month provided: ${month} (must be 1-12)`);
  }

  const mStr = String(m).padStart(2, '0');
  const periodStr = `${y}-${mStr}`;
  const periodStartCalendar = `${periodStr}-01`;

  let nextYear = y;
  let nextMonth = m + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  const nextMStr = String(nextMonth).padStart(2, '0');
  const periodEndCalendarExclusive = `${nextYear}-${nextMStr}-01`;

  return {
    periodStr,
    periodStartCalendar,
    periodEndCalendarExclusive,
  };
}
