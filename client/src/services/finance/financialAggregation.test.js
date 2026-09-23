import { describe, it, expect } from 'vitest';
import {
  toMinorUnits,
  fromMinorUnits,
  safeAdd,
  safeSubtract,
  MalformedMonetaryError,
  IntegerOverflowError,
  extractRecordMinorUnits,
  isRecognizedPayment,
  isUnresolvedPayment,
  isRecognizedNonIplIncome,
  isRecognizedExpense,
  normalizeFinancialRecord,
  aggregatePeriodCashFlow,
  buildContiguousBalanceChain,
} from './financialAggregation.js';

describe('financialAggregation & money (Sub-Gate 8.1-C2)', () => {
  describe('Money Module: toMinorUnits (Deterministic String Parsing)', () => {
    it('parses whole integer strings correctly into minor units', () => {
      expect(toMinorUnits('100')).toBe(10000);
      expect(toMinorUnits('5')).toBe(500);
      expect(toMinorUnits('0')).toBe(0);
    });

    it('parses single decimal place strings (100.5 -> 10050)', () => {
      expect(toMinorUnits('100.5')).toBe(10050);
      expect(toMinorUnits('0.1')).toBe(10);
      expect(toMinorUnits('25.9')).toBe(2590);
    });

    it('parses two decimal places strings (100.00 -> 10000, 0.10 -> 10, 0.01 -> 1)', () => {
      expect(toMinorUnits('100.00')).toBe(10000);
      expect(toMinorUnits('0.10')).toBe(10);
      expect(toMinorUnits('0.01')).toBe(1);
      expect(toMinorUnits('0.00')).toBe(0);
    });

    it('performs exact addition without floating point drift: "0.10" + "0.20" = 30 minor units', () => {
      const a = toMinorUnits('0.10');
      const b = toMinorUnits('0.20');
      const sum = safeAdd(a, b);
      expect(sum).toBe(30);
      expect(fromMinorUnits(sum)).toBe('0.30');
    });

    it('parses negative monetary strings correctly', () => {
      expect(toMinorUnits('-50.25')).toBe(-5025);
      expect(toMinorUnits('-100')).toBe(-10000);
      expect(toMinorUnits('-0.5')).toBe(-50);
      expect(toMinorUnits('-0.00')).toBe(0);
    });

    it('handles numeric input safely without floating-point distortion', () => {
      expect(toMinorUnits(100)).toBe(10000);
      expect(toMinorUnits(0.5)).toBe(50);
      expect(toMinorUnits(0)).toBe(0);
    });

    it('parses large valid monetary strings within safe integer range', () => {
      // 10 billion Rupiah = 1,000,000,000,000 sen (well within safe integer 9x10^15)
      expect(toMinorUnits('10000000000.00')).toBe(1000000000000);
    });

    it('rejects precision greater than 2 decimal places with MalformedMonetaryError', () => {
      expect(() => toMinorUnits('100.555')).toThrow(MalformedMonetaryError);
      expect(() => toMinorUnits('0.001')).toThrow(MalformedMonetaryError);
      expect(() => toMinorUnits('12.3456')).toThrow(MalformedMonetaryError);
    });

    it('rejects malformed and non-numeric strings with MalformedMonetaryError', () => {
      expect(() => toMinorUnits('abc')).toThrow(MalformedMonetaryError);
      expect(() => toMinorUnits('10.0.0')).toThrow(MalformedMonetaryError);
      expect(() => toMinorUnits('100,00')).toThrow(MalformedMonetaryError);
      expect(() => toMinorUnits('$100')).toThrow(MalformedMonetaryError);
      expect(() => toMinorUnits('')).toThrow(MalformedMonetaryError);
      expect(() => toMinorUnits('   ')).toThrow(MalformedMonetaryError);
      expect(() => toMinorUnits(null)).toThrow(MalformedMonetaryError);
      expect(() => toMinorUnits(undefined)).toThrow(MalformedMonetaryError);
      expect(() => toMinorUnits(NaN)).toThrow(MalformedMonetaryError);
    });

    it('throws IntegerOverflowError if value exceeds safe integer range', () => {
      const hugeString = '99999999999999999999.00';
      expect(() => toMinorUnits(hugeString)).toThrow(IntegerOverflowError);
    });
  });

  describe('Money Module: fromMinorUnits (Boundary Formatter)', () => {
    it('formats integer minor units to 2-decimal string', () => {
      expect(fromMinorUnits(10000)).toBe('100.00');
      expect(fromMinorUnits(10050)).toBe('100.50');
      expect(fromMinorUnits(1)).toBe('0.01');
      expect(fromMinorUnits(30)).toBe('0.30');
      expect(fromMinorUnits(0)).toBe('0.00');
      expect(fromMinorUnits(-5025)).toBe('-50.25');
      expect(fromMinorUnits(-1)).toBe('-0.01');
    });

    it('rejects non-integers or invalid inputs with MalformedMonetaryError', () => {
      expect(() => fromMinorUnits(10.5)).toThrow(MalformedMonetaryError);
      expect(() => fromMinorUnits('10000')).toThrow(MalformedMonetaryError);
      expect(() => fromMinorUnits(null)).toThrow(MalformedMonetaryError);
    });

    it('guards against values exceeding Number.MAX_SAFE_INTEGER', () => {
      expect(() => fromMinorUnits(Number.MAX_SAFE_INTEGER + 1000)).toThrow(IntegerOverflowError);
    });
  });

  describe('Money Module: safeAdd & safeSubtract (Overflow Protection)', () => {
    it('adds and subtracts safe integers correctly', () => {
      expect(safeAdd(15000000, 7500000)).toBe(22500000);
      expect(safeSubtract(22500000, 12000000)).toBe(10500000);
    });

    it('throws IntegerOverflowError if safeAdd exceeds MAX_SAFE_INTEGER', () => {
      expect(() => safeAdd(Number.MAX_SAFE_INTEGER, 1)).toThrow(IntegerOverflowError);
    });

    it('throws IntegerOverflowError if safeSubtract exceeds safe integer range', () => {
      expect(() => safeSubtract(-Number.MAX_SAFE_INTEGER, 1)).toThrow(IntegerOverflowError);
    });
  });

  describe('Recognition Semantics: isRecognizedPayment & isUnresolvedPayment', () => {
    it('recognizes completed monetary payment with amount > 0 and valid canonicalDate', () => {
      const record = {
        type: 'payment',
        status: 'completed',
        amount: '150000.00',
        canonicalDate: '2026-08-15',
      };
      expect(isRecognizedPayment(record)).toBe(true);
      expect(isUnresolvedPayment(record)).toBe(false);
    });

    it('excludes completed payment with amount = 0 (Policy Option B operational marker)', () => {
      const record = {
        type: 'payment',
        status: 'completed',
        amount: '0.00',
        canonicalDate: '2026-08-15',
      };
      expect(isRecognizedPayment(record)).toBe(false);
      expect(isUnresolvedPayment(record)).toBe(false);
    });

    it('excludes pending and pending_verification payments', () => {
      const pending = {
        type: 'payment',
        status: 'pending',
        amount: '100000.00',
        canonicalDate: '2026-08-15',
      };
      const pendingVerif = {
        type: 'payment',
        status: 'pending_verification',
        amount: '100000.00',
        canonicalDate: '2026-08-15',
      };
      expect(isRecognizedPayment(pending)).toBe(false);
      expect(isRecognizedPayment(pendingVerif)).toBe(false);
    });

    it('excludes rejected payments', () => {
      const rejected = {
        type: 'payment',
        status: 'rejected',
        amount: '100000.00',
        canonicalDate: '2026-08-15',
      };
      expect(isRecognizedPayment(rejected)).toBe(false);
    });

    it('identifies completed monetary payment without canonicalDate as UNRESOLVED', () => {
      const unresolved = {
        type: 'payment',
        status: 'completed',
        amount: '200000.00',
        canonicalDate: null,
      };
      expect(isRecognizedPayment(unresolved)).toBe(false);
      expect(isUnresolvedPayment(unresolved)).toBe(true);
    });
  });

  describe('Recognition Semantics: isRecognizedNonIplIncome', () => {
    it('recognizes verified non-IPL income with amount > 0 and not deleted', () => {
      const record = {
        type: 'non_ipl_income',
        status: 'verified',
        amount: '75000.00',
        canonicalDate: '2026-08-10',
        deleted_at: null,
      };
      expect(isRecognizedNonIplIncome(record)).toBe(true);
    });

    it('recognizes non-IPL income with missing metadata status (legacy compatibility)', () => {
      const record = {
        type: 'non_ipl_income',
        amount: '50000.00',
        canonicalDate: '2026-08-10',
        deleted_at: null,
      };
      expect(isRecognizedNonIplIncome(record)).toBe(true);
    });

    it('excludes rejected non-IPL income (status = rejected)', () => {
      const record = {
        type: 'non_ipl_income',
        status: 'rejected',
        amount: '75000.00',
        canonicalDate: '2026-08-10',
        deleted_at: null,
      };
      expect(isRecognizedNonIplIncome(record)).toBe(false);
    });

    it('excludes soft-deleted non-IPL income (deleted_at IS NOT NULL)', () => {
      const record = {
        type: 'non_ipl_income',
        status: 'verified',
        amount: '75000.00',
        canonicalDate: '2026-08-10',
        deleted_at: '2026-08-12T00:00:00Z',
      };
      expect(isRecognizedNonIplIncome(record)).toBe(false);
    });

    it('excludes zero or negative non-IPL income', () => {
      const zero = {
        type: 'non_ipl_income',
        amount: '0.00',
        canonicalDate: '2026-08-10',
        deleted_at: null,
      };
      const neg = {
        type: 'non_ipl_income',
        amount: '-5000.00',
        canonicalDate: '2026-08-10',
        deleted_at: null,
      };
      expect(isRecognizedNonIplIncome(zero)).toBe(false);
      expect(isRecognizedNonIplIncome(neg)).toBe(false);
    });
  });

  describe('Recognition Semantics: isRecognizedExpense & billing_items', () => {
    it('recognizes valid expense with amount > 0 and valid canonicalDate', () => {
      const record = {
        type: 'expense',
        amount: '120000.00',
        canonicalDate: '2026-08-20',
      };
      expect(isRecognizedExpense(record)).toBe(true);
    });

    it('excludes zero or negative expenses', () => {
      const zero = {
        type: 'expense',
        amount: '0.00',
        canonicalDate: '2026-08-20',
      };
      const neg = {
        type: 'expense',
        amount: '-1000.00',
        canonicalDate: '2026-08-20',
      };
      expect(isRecognizedExpense(zero)).toBe(false);
      expect(isRecognizedExpense(neg)).toBe(false);
    });

    it('strictly excludes billing_items from cash flow', () => {
      const billingItem = {
        type: 'billing_item',
        amount: '150000.00',
        canonicalDate: '2026-08-01',
      };
      expect(isRecognizedPayment(billingItem)).toBe(false);
      expect(isRecognizedNonIplIncome(billingItem)).toBe(false);
      expect(isRecognizedExpense(billingItem)).toBe(false);
    });
  });

  describe('Period Aggregation: aggregatePeriodCashFlow', () => {
    const augustRange = {
      periodStartCalendar: '2026-08-01',
      periodEndCalendarExclusive: '2026-09-01',
    };

    it('includes records exactly on start boundary [start) and excludes records on end boundary [end)', () => {
      const records = [
        { id: '1', type: 'payment', status: 'completed', amount: '100.00', canonicalDate: '2026-08-01' }, // start: INCLUDED
        { id: '2', type: 'payment', status: 'completed', amount: '200.00', canonicalDate: '2026-08-31' }, // mid: INCLUDED
        { id: '3', type: 'payment', status: 'completed', amount: '300.00', canonicalDate: '2026-09-01' }, // end: EXCLUDED
        { id: '4', type: 'payment', status: 'completed', amount: '400.00', canonicalDate: '2026-07-31' }, // before: EXCLUDED
      ];

      const result = aggregatePeriodCashFlow({
        openingBalanceMinorUnits: 0,
        records,
        periodRange: augustRange,
      });

      expect(result.inflowMinorUnits).toBe(30000); // 10000 + 20000
      expect(result.inflowCount).toBe(2);
      expect(result.inflowFormatted).toBe('300.00');
    });

    it('aggregates combined payments, non-IPL incomes, and expenses correctly', () => {
      const records = [
        { type: 'payment', status: 'completed', amount: '150000.00', canonicalDate: '2026-08-05' },
        { type: 'payment', status: 'completed', amount: '0.00', canonicalDate: '2026-08-06' }, // 0 ignored
        { type: 'non_ipl_income', status: 'verified', amount: '75000.00', canonicalDate: '2026-08-15' },
        { type: 'expense', amount: '120000.00', canonicalDate: '2026-08-20' },
      ];

      const result = aggregatePeriodCashFlow({
        openingBalanceMinorUnits: 30000000, // Rp 300.000 (30.000.000 sen)
        records,
        periodRange: augustRange,
      });

      // Inflow: 150.000 + 75.000 = 225.000 (22.500.000 sen)
      expect(result.inflowMinorUnits).toBe(22500000);
      expect(result.inflowCount).toBe(2);

      // Outflow: 120.000 (12.000.000 sen)
      expect(result.outflowMinorUnits).toBe(12000000);
      expect(result.outflowCount).toBe(1);

      // Net: 22.500.000 - 12.000.000 = 10.500.000 sen (Rp 105.000)
      expect(result.netMinorUnits).toBe(10500000);

      // Closing: 30.000.000 + 10.500.000 = 40.500.000 sen (Rp 405.000)
      expect(result.closingBalanceMinorUnits).toBe(40500000);
      expect(result.closingBalanceFormatted).toBe('405000.00');
    });

    it('isolates unresolved payments and does not count them in inflow', () => {
      const records = [
        { type: 'payment', status: 'completed', amount: '150000.00', canonicalDate: '2026-08-05' },
        { type: 'payment', status: 'completed', amount: '200000.00', canonicalDate: null }, // UNRESOLVED
      ];

      const result = aggregatePeriodCashFlow({
        openingBalanceMinorUnits: 0,
        records,
        periodRange: augustRange,
      });

      expect(result.inflowMinorUnits).toBe(15000000); // Only the resolved 150.000
      expect(result.inflowCount).toBe(1);
      expect(result.unresolvedCount).toBe(1);
      expect(result.unresolvedRecords.length).toBe(1);
      expect(result.unresolvedRecords[0].amount).toBe('200000.00');
    });

    it('handles negative net period (outflow > inflow) correctly', () => {
      const records = [
        { type: 'payment', status: 'completed', amount: '50000.00', canonicalDate: '2026-08-05' },
        { type: 'expense', amount: '80000.00', canonicalDate: '2026-08-10' },
      ];

      const result = aggregatePeriodCashFlow({
        openingBalanceMinorUnits: 10000000, // Rp 100.000
        records,
        periodRange: augustRange,
      });

      expect(result.inflowMinorUnits).toBe(5000000);
      expect(result.outflowMinorUnits).toBe(8000000);
      expect(result.netMinorUnits).toBe(-3000000);
      expect(result.closingBalanceMinorUnits).toBe(7000000);
      expect(result.netFormatted).toBe('-30000.00');
      expect(result.closingBalanceFormatted).toBe('70000.00');
    });

    it('handles zero-activity periods without mutating balance', () => {
      const result = aggregatePeriodCashFlow({
        openingBalanceMinorUnits: 10000000,
        records: [],
        periodRange: augustRange,
      });

      expect(result.inflowMinorUnits).toBe(0);
      expect(result.outflowMinorUnits).toBe(0);
      expect(result.netMinorUnits).toBe(0);
      expect(result.closingBalanceMinorUnits).toBe(10000000);
      expect(result.closingBalanceFormatted).toBe('100000.00');
    });
  });

  describe('Balance Continuity: buildContiguousBalanceChain', () => {
    it('proves Opening(M) === Closing(M-1) across multiple sequential periods', () => {
      const periodRanges = [
        { periodStr: '2026-08', year: 2026, month: 8, periodStartCalendar: '2026-08-01', periodEndCalendarExclusive: '2026-09-01' },
        { periodStr: '2026-09', year: 2026, month: 9, periodStartCalendar: '2026-09-01', periodEndCalendarExclusive: '2026-10-01' },
        { periodStr: '2026-10', year: 2026, month: 10, periodStartCalendar: '2026-10-01', periodEndCalendarExclusive: '2026-11-01' },
      ];

      const records = [
        // Month 1 (August): Inflow 200.00, Outflow 50.00 -> Net +150.00
        { type: 'payment', status: 'completed', amount: '200.00', canonicalDate: '2026-08-10' },
        { type: 'expense', amount: '50.00', canonicalDate: '2026-08-20' },

        // Month 2 (September): Inflow 100.00, Outflow 120.00 -> Net -20.00
        { type: 'payment', status: 'completed', amount: '100.00', canonicalDate: '2026-09-05' },
        { type: 'expense', amount: '120.00', canonicalDate: '2026-09-25' },

        // Month 3 (October): Inflow 0, Outflow 0 -> Net 0.00
      ];

      const initialOpening = 10000; // 100.00

      const { chain, finalClosingBalanceMinorUnits } = buildContiguousBalanceChain({
        initialOpeningBalanceMinorUnits: initialOpening,
        periodRanges,
        records,
      });

      expect(chain.length).toBe(3);

      // Period 1 (August):
      // Opening: 100.00 (10000)
      // Net: +150.00 (15000)
      // Closing: 250.00 (25000)
      expect(chain[0].openingBalanceMinorUnits).toBe(10000);
      expect(chain[0].netMinorUnits).toBe(15000);
      expect(chain[0].closingBalanceMinorUnits).toBe(25000);

      // Period 2 (September):
      // Opening MUST EQUAL Period 1 Closing!
      expect(chain[1].openingBalanceMinorUnits).toBe(chain[0].closingBalanceMinorUnits);
      expect(chain[1].openingBalanceMinorUnits).toBe(25000);
      expect(chain[1].netMinorUnits).toBe(-2000);
      expect(chain[1].closingBalanceMinorUnits).toBe(23000);

      // Period 3 (October):
      // Opening MUST EQUAL Period 2 Closing!
      expect(chain[2].openingBalanceMinorUnits).toBe(chain[1].closingBalanceMinorUnits);
      expect(chain[2].openingBalanceMinorUnits).toBe(23000);
      expect(chain[2].netMinorUnits).toBe(0);
      expect(chain[2].closingBalanceMinorUnits).toBe(23000);

      expect(finalClosingBalanceMinorUnits).toBe(23000);
    });
  });

  describe('Input Immutability Guarantee', () => {
    it('never mutates input record objects, arrays, or accumulator inputs', () => {
      const record1 = Object.freeze({
        id: 'p-1',
        type: 'payment',
        status: 'completed',
        amount: '150000.00',
        canonicalDate: '2026-08-15',
      });
      const record2 = Object.freeze({
        id: 'e-1',
        type: 'expense',
        amount: '50000.00',
        canonicalDate: '2026-08-20',
      });
      const recordsArray = Object.freeze([record1, record2]);

      const periodRange = Object.freeze({
        periodStartCalendar: '2026-08-01',
        periodEndCalendarExclusive: '2026-09-01',
      });

      // Execute aggregation
      const result = aggregatePeriodCashFlow({
        openingBalanceMinorUnits: 0,
        records: recordsArray,
        periodRange,
      });

      expect(result.inflowMinorUnits).toBe(15000000);
      expect(result.outflowMinorUnits).toBe(5000000);

      // Verify records are completely unchanged
      expect(record1.amount).toBe('150000.00');
      expect(record2.amount).toBe('50000.00');
      expect(recordsArray.length).toBe(2);
    });
  });

  describe('normalizeFinancialRecord', () => {
    it('normalizes raw payment and identifies unresolved records without mutating input', () => {
      const rawResolved = {
        id: '1',
        type: 'payment',
        status: 'completed',
        amount: '100000.00',
        canonicalDate: '2026-08-01',
      };
      const normResolved = normalizeFinancialRecord(rawResolved);
      expect(normResolved.isRecognizedCash).toBe(true);
      expect(normResolved.isUnresolved).toBe(false);
      expect(normResolved.amountMinorUnits).toBe(10000000);

      const rawUnresolved = {
        id: '2',
        type: 'payment',
        status: 'completed',
        amount: '100000.00',
        canonicalDate: null,
      };
      const normUnresolved = normalizeFinancialRecord(rawUnresolved);
      expect(normUnresolved.isRecognizedCash).toBe(false);
      expect(normUnresolved.isUnresolved).toBe(true);
      expect(normUnresolved.unresolvedReason).toContain('paid_at');
    });
  });
});
