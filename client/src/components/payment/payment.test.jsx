import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ResidentIplOverview } from './ResidentIplOverview';
import { PaymentFlowModal } from './PaymentFlowModal';
import { PaymentHistoryList } from './PaymentHistoryList';

function cleanHtml(html) {
  return html.replace(/<!--.*?-->/g, '');
}

describe('Payment Components (Phase 3)', () => {
  describe('ResidentIplOverview (TASK-011)', () => {
    it('renders unpaid bills with multi-period selection and amount', () => {
      const unpaidBills = [
        { id: 'b1', period: '2026-08', amount: 150000, late_fee: 0, status: 'unpaid' },
        { id: 'b2', period: '2026-09', amount: 150000, late_fee: 10000, status: 'unpaid' },
      ];

      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentIplOverview
            unit={{ block: 'A', unit_number: '12' }}
            unpaidBills={unpaidBills}
            selectedBillIds={['b1', 'b2']}
            template={{ billLabel: 'IPL', unitLabel: 'Rumah', paymentActionLabel: 'Bayar' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Terdapat 2 Tagihan Belum Lunas');
      expect(html).toContain('Rumah A no 12');
      expect(html).toContain('Agt 2026');
      expect(html).toContain('Sep 2026');
      expect(html).toContain('Termasuk denda:');
      expect(html).toContain('Bayar (2 Bulan)');
      expect(html).toContain('310.000'); // 150k + 160k
    });

    it('renders all-paid state when there are no unpaid bills', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentIplOverview
            unit={{ block: 'B', unit_number: '05' }}
            unpaidBills={[]}
            currentPeriodBill={{ status: 'paid', period: '2026-09' }}
            template={{ billLabel: 'IPL', unitLabel: 'Rumah' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Semua Tagihan IPL Telah Lunas');
      expect(html).toContain('Lihat Rincian Lunas');
    });

    it('renders pending verification state when current bill is being verified', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentIplOverview
            unit={{ block: 'B', unit_number: '05' }}
            unpaidBills={[]}
            currentPeriodBill={{ status: 'pending_verification', period: '2026-09' }}
            template={{ billLabel: 'IPL' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Pembayaran Sedang Diverifikasi');
      expect(html).toContain('menunggu verifikasi oleh bendahara');
    });
  });

  describe('PaymentFlowModal (TASK-012)', () => {
    it('renders payment modal with fee calculation and method choices', () => {
      const bills = [
        { id: 'b1', period: '2026-09', amount: 200000, late_fee: 0 },
      ];

      const rawHtml = renderToString(
        <MemoryRouter>
          <PaymentFlowModal
            open={true}
            bills={bills}
            total={200000}
            canUseQris={true}
            billLabel="IPL"
            onConfirm={() => {}}
            onClose={() => {}}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Konfirmasi Pembayaran IPL');
      expect(html).toContain('QRIS Otomatis');
      expect(html).toContain('Transfer Bank');
      expect(html).toContain('Biaya Layanan QRIS (0,7%)');
      expect(html).toContain('1.400'); // 200000 * 0.007 = 1400
      expect(html).toContain('201.400');
    });
  });

  describe('PaymentHistoryList (TASK-013)', () => {
    it('renders empty state when no history exists', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <PaymentHistoryList payments={[]} bills={[]} template={{ billLabel: 'IPL' }} />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Belum Ada Riwayat Pembayaran');
      expect(html).toContain('Riwayat Pembayaran IPL');
    });

    it('renders history items with period, method and status', () => {
      const payments = [
        {
          id: 'pay-1',
          period: '2026-08',
          amount: 150000,
          method: 'qris',
          status: 'paid',
          paid_at: '2026-08-05T10:00:00Z',
        },
        {
          id: 'pay-2',
          period: '2026-07',
          amount: 150000,
          method: 'bank_transfer',
          status: 'paid',
          paid_at: '2026-07-04T11:00:00Z',
        },
      ];

      const rawHtml = renderToString(
        <MemoryRouter>
          <PaymentHistoryList
            payments={payments}
            bills={[]}
            template={{ billLabel: 'IPL' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Agt 2026');
      expect(html).toContain('Jul 2026');
      expect(html).toContain('QRIS');
      expect(html).toContain('Transfer Bank');
      expect(html).toContain('150.000');
    });
  });
});
