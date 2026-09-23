import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FINANCIAL_TIMEZONE,
  InvalidDateError,
  toJakartaCalendarDate,
  resolvePaymentCashDate,
  resolveExpenseDate,
  resolveNonIplIncomeDate,
  getReportingPeriodRange,
} from './financialDateResolver';

describe('financialDateResolver (Sub-Gate 8.1-C1)', () => {
  describe('Constants and Policy', () => {
    it('sets authoritative financial timezone to Asia/Jakarta', () => {
      expect(DEFAULT_FINANCIAL_TIMEZONE).toBe('Asia/Jakarta');
    });
  });

  describe('toJakartaCalendarDate - Mandatory Timezone Boundaries', () => {
    it('resolves 2026-08-31T16:59:59Z to 2026-08-31 (WIB month-end boundary before midnight)', () => {
      // 16:59:59 UTC + 7h = 23:59:59 WIB (still August 31)
      const result = toJakartaCalendarDate('2026-08-31T16:59:59Z');
      expect(result).toBe('2026-08-31');
    });

    it('resolves 2026-08-31T17:00:00Z to 2026-09-01 (WIB month-start boundary exactly midnight)', () => {
      // 17:00:00 UTC + 7h = 00:00:00 WIB (September 1st)
      const result = toJakartaCalendarDate('2026-08-31T17:00:00Z');
      expect(result).toBe('2026-09-01');
    });

    it('resolves 2026-07-31T23:56:47Z to 2026-08-01 (UTC midnight edge case crossing into next month WIB)', () => {
      // 23:56:47 UTC + 7h = 06:56:47 WIB (August 1st)
      const result = toJakartaCalendarDate('2026-07-31T23:56:47Z');
      expect(result).toBe('2026-08-01');
    });

    it('resolves leap-day boundary 2024-02-28T17:00:00Z to 2024-02-29', () => {
      // 17:00:00 UTC + 7h = 00:00:00 WIB on February 29th (2024 is a leap year)
      const result = toJakartaCalendarDate('2024-02-28T17:00:00Z');
      expect(result).toBe('2024-02-29');
    });
  });

  describe('toJakartaCalendarDate - Input Types & Immutability', () => {
    it('accepts a valid Date object input and resolves correctly', () => {
      const date = new Date('2026-06-15T08:30:00Z');
      const result = toJakartaCalendarDate(date);
      expect(result).toBe('2026-06-15');
    });

    it('accepts a valid ISO-8601 string input', () => {
      const result = toJakartaCalendarDate('2026-11-20T14:20:00+07:00');
      expect(result).toBe('2026-11-20');
    });

    it('guarantees that input Date object is not mutated', () => {
      const originalTime = new Date('2026-08-31T17:00:00Z').getTime();
      const inputDate = new Date(originalTime);

      toJakartaCalendarDate(inputDate);

      expect(inputDate.getTime()).toBe(originalTime);
    });

    it('always formats strictly as YYYY-MM-DD format', () => {
      const dates = [
        '2026-01-05T01:00:00Z',
        '2026-09-09T09:09:09Z',
        '2026-12-31T23:59:59Z',
      ];
      const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

      for (const d of dates) {
        const formatted = toJakartaCalendarDate(d);
        expect(formatted).toMatch(ymdRegex);
      }
    });
  });

  describe('toJakartaCalendarDate - Rejection of Invalid Inputs', () => {
    it('rejects null input with InvalidDateError', () => {
      expect(() => toJakartaCalendarDate(null)).toThrow(InvalidDateError);
      expect(() => toJakartaCalendarDate(null)).toThrow(/required/);
    });

    it('rejects undefined input with InvalidDateError', () => {
      expect(() => toJakartaCalendarDate(undefined)).toThrow(InvalidDateError);
      expect(() => toJakartaCalendarDate(undefined)).toThrow(/required/);
    });

    it('rejects empty string with InvalidDateError', () => {
      expect(() => toJakartaCalendarDate('')).toThrow(InvalidDateError);
      expect(() => toJakartaCalendarDate('   ')).toThrow(InvalidDateError);
    });

    it('rejects completely invalid date strings', () => {
      expect(() => toJakartaCalendarDate('not-a-valid-date')).toThrow(InvalidDateError);
      expect(() => toJakartaCalendarDate('2026-99-99')).toThrow(InvalidDateError);
    });

    it('rejects non-existent calendar dates (e.g. Feb 31) without rolling over', () => {
      expect(() => toJakartaCalendarDate('2026-02-31T00:00:00Z')).toThrow(InvalidDateError);
      expect(() => toJakartaCalendarDate('2023-02-29T12:00:00Z')).toThrow(InvalidDateError);
    });

    it('rejects invalid Date instance (isNaN time)', () => {
      const invalidDate = new Date('invalid');
      expect(() => toJakartaCalendarDate(invalidDate)).toThrow(InvalidDateError);
    });

    it('rejects unsupported input types (numbers, booleans, arrays)', () => {
      expect(() => toJakartaCalendarDate(123456789)).toThrow(InvalidDateError);
      expect(() => toJakartaCalendarDate(true)).toThrow(InvalidDateError);
      expect(() => toJakartaCalendarDate([])).toThrow(InvalidDateError);
    });
  });

  describe('resolvePaymentCashDate (Unresolved Cash Semantics)', () => {
    it('resolves cash date when payment.paid_at is valid', () => {
      const payment = {
        id: 'p-1',
        amount: '150000.00',
        status: 'completed',
        paid_at: '2026-08-15T10:00:00Z',
      };
      expect(resolvePaymentCashDate(payment)).toBe('2026-08-15');
    });

    it('returns null when paid_at is missing or null (unresolved record)', () => {
      const paymentWithNull = {
        id: 'p-2',
        amount: '200000.00',
        status: 'completed',
        paid_at: null,
      };
      expect(resolvePaymentCashDate(paymentWithNull)).toBeNull();

      const paymentWithoutField = {
        id: 'p-3',
        amount: '200000.00',
        status: 'completed',
      };
      expect(resolvePaymentCashDate(paymentWithoutField)).toBeNull();
    });

    it('rejects null or non-object payment', () => {
      expect(() => resolvePaymentCashDate(null)).toThrow(InvalidDateError);
      expect(() => resolvePaymentCashDate('string')).toThrow(InvalidDateError);
    });
  });

  describe('resolveExpenseDate & resolveNonIplIncomeDate', () => {
    it('resolves expense date from expense_date or date field', () => {
      expect(resolveExpenseDate({ expense_date: '2026-08-10' })).toBe('2026-08-10');
      expect(resolveExpenseDate({ date: '2026-08-12T03:00:00Z' })).toBe('2026-08-12');
      expect(resolveExpenseDate({})).toBeNull();
    });

    it('resolves non-IPL income date from income_date or date field', () => {
      expect(resolveNonIplIncomeDate({ income_date: '2026-08-05' })).toBe('2026-08-05');
      expect(resolveNonIplIncomeDate({ date: '2026-08-08T05:00:00Z' })).toBe('2026-08-08');
      expect(resolveNonIplIncomeDate({})).toBeNull();
    });
  });

  describe('getReportingPeriodRange', () => {
    it('generates standard half-open [start, end) reporting period boundaries', () => {
      const result = getReportingPeriodRange(2026, 8);
      expect(result).toEqual({
        periodStr: '2026-08',
        periodStartCalendar: '2026-08-01',
        periodEndCalendarExclusive: '2026-09-01',
      });
    });

    it('handles year rollover for December properly', () => {
      const result = getReportingPeriodRange(2026, 12);
      expect(result).toEqual({
        periodStr: '2026-12',
        periodStartCalendar: '2026-12-01',
        periodEndCalendarExclusive: '2027-01-01',
      });
    });

    it('handles string inputs for year and month with single-digit padding', () => {
      const result = getReportingPeriodRange('2026', '5');
      expect(result).toEqual({
        periodStr: '2026-05',
        periodStartCalendar: '2026-05-01',
        periodEndCalendarExclusive: '2026-06-01',
      });
    });

    it('rejects invalid month numbers', () => {
      expect(() => getReportingPeriodRange(2026, 0)).toThrow(InvalidDateError);
      expect(() => getReportingPeriodRange(2026, 13)).toThrow(InvalidDateError);
      expect(() => getReportingPeriodRange(2026, 'invalid')).toThrow(InvalidDateError);
    });

    it('rejects invalid year values', () => {
      expect(() => getReportingPeriodRange(1800, 5)).toThrow(InvalidDateError);
      expect(() => getReportingPeriodRange(2300, 5)).toThrow(InvalidDateError);
      expect(() => getReportingPeriodRange('abcd', 5)).toThrow(InvalidDateError);
    });
  });
});
