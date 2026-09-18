import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ResidentBillingHero } from './ResidentBillingHero';
import { StaffCollectionHero } from './StaffCollectionHero';
import { QuickActionsGrid } from './QuickActionsGrid';

// Helper to remove HTML comments inserted by React SSR
function cleanHtml(html) {
  return html.replace(/<!--.*?-->/g, '');
}

describe('Dashboard Components (Phase 2)', () => {
  describe('ResidentBillingHero', () => {
    it('renders unpaid bill correctly with CTA button', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentBillingHero
            myBill={{ amount: 150000, status: 'unpaid' }}
            myUnit="A-12"
            periodLabel="September 2026"
            template={{ billLabel: 'IPL', unitLabel: 'Rumah', paymentActionLabel: 'Bayar' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('IPL September 2026');
      expect(html).toContain('Rumah A-12');
      expect(html).toContain('Belum Bayar');
      expect(html).toContain('Bayar IPL Sekarang');
      expect(html).toContain('150.000');
    });

    it('renders paid bill with success state and badge', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentBillingHero
            myBill={{ amount: 150000, status: 'paid' }}
            myUnit="A-12"
            periodLabel="September 2026"
            template={{ billLabel: 'IPL', unitLabel: 'Rumah' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Lunas');
      expect(html).toContain('telah lunas');
      expect(html).toContain('Lihat Rincian &amp; Riwayat');
    });

    it('renders pending status when payment is awaiting verification', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentBillingHero
            myBill={{ amount: 150000, status: 'pending' }}
            myUnit="A-12"
            periodLabel="September 2026"
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Menunggu');
      expect(html).toContain('sedang diverifikasi');
    });
  });

  describe('StaffCollectionHero', () => {
    it('renders collection rate, total collected, and outstanding amounts', () => {
      const billing = {
        totalBilled: 10000000,
        totalCollected: 7500000,
        totalOutstanding: 2500000,
        billCount: 50,
        collectionRate: 75,
      };

      const rawHtml = renderToString(
        <MemoryRouter>
          <StaffCollectionHero
            billing={billing}
            pendingPayCount={3}
            pendingRegCount={2}
            periodLabel="September 2026"
            template={{ billLabel: 'IPL', unitLabel: 'Rumah', memberLabel: 'Warga' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Penerimaan Tagihan IPL');
      expect(html).toContain('75%');
      expect(html).toContain('50 rumah terdaftar');
      expect(html).toContain('3 Bukti Bayar Perlu Diverifikasi');
      expect(html).toContain('2 Permohonan Warga Baru');
    });

    it('renders nihil tunggakan when outstanding is zero', () => {
      const billing = {
        totalBilled: 5000000,
        totalCollected: 5000000,
        totalOutstanding: 0,
        billCount: 20,
        collectionRate: 100,
      };

      const rawHtml = renderToString(
        <MemoryRouter>
          <StaffCollectionHero
            billing={billing}
            pendingPayCount={0}
            pendingRegCount={0}
            periodLabel="September 2026"
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Nihil tunggakan');
      expect(html).not.toContain('Perlu Diverifikasi');
    });
  });

  describe('QuickActionsGrid', () => {
    it('renders all quick navigation links for operational tasks', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <QuickActionsGrid
            tenantId="test-tenant-123"
            template={{ billLabel: 'IPL', memberLabel: 'Warga' }}
            isStaff={true}
            isTenantAdmin={true}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Matriks IPL');
      expect(html).toContain('/t/test-tenant-123/payment-matrix');
      expect(html).toContain('Daftar Warga');
      expect(html).toContain('Pengeluaran Kas');
      expect(html).toContain('Laporan Keuangan');
      expect(html).toContain('Pengaturan');
    });
  });
});
