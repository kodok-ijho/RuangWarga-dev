import { describe, it, expect } from 'vitest';
import {
  isMonetaryCashPayment,
  isOperationalZeroSettlement,
  isBillingItemCashInflow,
} from './financePolicy';

describe('Sub-Gate 8.1-B4: Financial Policy Option B Invariants', () => {
  describe('Rule 1: completed + amount > 0 => monetary cash candidate', () => {
    it('recognizes completed payments with positive amount as monetary cash', () => {
      const payment = {
        id: 'pay-1',
        status: 'completed',
        amount: 140000,
        paid_at: '2026-08-04T10:39:46.711Z',
      };
      expect(isMonetaryCashPayment(payment)).toBe(true);
      expect(isOperationalZeroSettlement(payment)).toBe(false);
    });

    it('recognizes decimal and string-encoded positive amounts', () => {
      expect(isMonetaryCashPayment({ status: 'completed', amount: '140000.00' })).toBe(true);
      expect(isMonetaryCashPayment({ status: 'completed', amount: 50000.5 })).toBe(true);
    });
  });

  describe('Rule 2: completed + amount = 0 => NOT monetary cash', () => {
    it('treats completed payments with amount = 0 as operational zero settlement, not monetary cash', () => {
      const zeroPayment = {
        id: 'zero-pay-1',
        status: 'completed',
        amount: 0,
        paid_at: '2026-07-04T00:00:00Z',
      };
      expect(isMonetaryCashPayment(zeroPayment)).toBe(false);
      expect(isOperationalZeroSettlement(zeroPayment)).toBe(true);
    });

    it('treats string "0.00" as operational zero settlement, not monetary cash', () => {
      const zeroPayment = {
        id: 'zero-pay-2',
        status: 'completed',
        amount: '0.00',
        paid_at: '2026-07-01T00:00:00Z',
      };
      expect(isMonetaryCashPayment(zeroPayment)).toBe(false);
      expect(isOperationalZeroSettlement(zeroPayment)).toBe(true);
    });
  });

  describe('Rule 3: pending / pending_verification + amount > 0 => NOT recognized cash', () => {
    it('rejects pending status even with positive amount', () => {
      const pendingPayment = {
        id: 'pay-pending',
        status: 'pending',
        amount: 140000,
        created_at: '2026-08-01T00:00:00Z',
      };
      expect(isMonetaryCashPayment(pendingPayment)).toBe(false);
      expect(isOperationalZeroSettlement(pendingPayment)).toBe(false);
    });

    it('rejects pending_verification status awaiting staff review', () => {
      const unverifiedPayment = {
        id: 'pay-unverified',
        status: 'pending_verification',
        amount: 140000,
        paid_at: '2026-08-01T00:00:00Z',
      };
      expect(isMonetaryCashPayment(unverifiedPayment)).toBe(false);
      expect(isOperationalZeroSettlement(unverifiedPayment)).toBe(false);
    });
  });

  describe('Rule 4: rejected + amount > 0 => NOT recognized cash', () => {
    it('rejects rejected status even with positive amount', () => {
      const rejectedPayment = {
        id: 'pay-rejected',
        status: 'rejected',
        amount: 140000,
      };
      expect(isMonetaryCashPayment(rejectedPayment)).toBe(false);
      expect(isOperationalZeroSettlement(rejectedPayment)).toBe(false);
    });
  });

  describe('Rule 5: billing period cannot independently recognize cash', () => {
    it('confirms billing items represent accrual invoicing only and never independently contribute cash', () => {
      const billingItem = {
        id: 'bill-1',
        period: '2026-07',
        amount: 140000,
        status: 'pending',
      };
      expect(isBillingItemCashInflow(billingItem)).toBe(false);
    });

    it('confirms a paid billing item without a monetary cash payment record is not cash inflow', () => {
      const paidBillWithoutCash = {
        id: 'bill-2',
        period: '2026-07',
        amount: 140000,
        status: 'paid',
      };
      expect(isBillingItemCashInflow(paidBillWithoutCash)).toBe(false);
    });
  });

  describe('Rule 6: zero-payment historical records remain unchanged and evaluated under Policy Option B', () => {
    const historicalZeroRecords = [
      {
        id: '7a22cd88-719a-43f8-9735-5ce7beb5bd6c',
        ipl_bill_id: 'c9e86bcd-e4d9-4fd6-a35a-3bc9a8c42e75',
        amount: '0.00',
        status: 'completed',
        method: 'bank_transfer',
        paid_at: '2026-07-04 00:00:00+00',
        metadata: { note: 'Sudah membayarkan ke rekening P. Thomas | Tanggal diterima: 2026-07-04' },
      },
      {
        id: '77dd9e8c-0466-4c48-baa5-e495cf361616',
        ipl_bill_id: 'd36f7b39-f605-4673-b699-8fb484e14cd3',
        amount: '0.00',
        status: 'completed',
        method: 'bank_transfer',
        paid_at: '2026-07-01 00:00:00+00',
        metadata: { note: 'Pembayaran IPL di transfer ke rek P. Thomas | Tanggal diterima: 2026-07-01' },
      },
      {
        id: '88b68815-9bf3-4911-baed-62e0a93f31f6',
        ipl_bill_id: 'f09fff40-9a63-4b7d-897b-84be7e064176',
        amount: '0.00',
        status: 'completed',
        method: 'bank_transfer',
        paid_at: '2026-03-31 00:00:00+00',
        metadata: { note: 'Di transfer ke rekening P. Thomas 31 Maret 2026 | Tanggal diterima: 2026-03-31' },
      },
      {
        id: '248ce5c3-b62c-45cc-9746-90ed4903858e',
        ipl_bill_id: '48b275e3-27d1-4e31-a89f-12590f4e702a',
        amount: '0.00',
        status: 'completed',
        method: 'cash',
        paid_at: '2026-09-11 00:00:00+00',
        metadata: { note: 'Tanggal diterima: 2026-09-11', type: 'cash' },
      },
    ];

    it('verifies all 4 historical records are classified as operational zero settlements', () => {
      historicalZeroRecords.forEach((record) => {
        expect(isMonetaryCashPayment(record)).toBe(false);
        expect(isOperationalZeroSettlement(record)).toBe(true);
        expect(Number(record.amount)).toBe(0);
        expect(record.status).toBe('completed');
      });
    });

    it('verifies historical zero records contribute exactly Rp 0 to cash inflow aggregation', () => {
      const totalCashInflow = historicalZeroRecords
        .filter(isMonetaryCashPayment)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      expect(totalCashInflow).toBe(0);

      const monetaryCount = historicalZeroRecords.filter(isMonetaryCashPayment).length;
      expect(monetaryCount).toBe(0);

      const settlementCount = historicalZeroRecords.filter(isOperationalZeroSettlement).length;
      expect(settlementCount).toBe(4);
    });
  });
});
