import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  FinancialOverviewHero,
  ExpenseCard,
  ExpenseDetailDrawer,
  IncomeCard,
  IncomeDetailDrawer,
} from './index';

function cleanHtml(html) {
  return html.replace(/<!--.*?-->/g, '');
}

describe('Finance Components (Phase 5 - TASK-016 & TASK-017)', () => {
  describe('FinancialOverviewHero (TASK-016)', () => {
    it('renders financial metrics: opening balance, income, expense, and closing balance', () => {
      const rawHtml = renderToString(
        <FinancialOverviewHero
          openingBalance={5000000}
          totalIncome={3500000}
          totalExpense={1200000}
          closingBalance={7300000}
          periodLabel="Maret 2026"
          onPrint={() => {}}
          onExportCsv={() => {}}
        />
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Saldo Akhir Kas Komunitas');
      expect(html).toContain('Maret 2026');
      expect(html).toContain('Saldo Awal');
      expect(html).toContain('Total Pemasukan');
      expect(html).toContain('Total Pengeluaran');
      expect(html).toContain('PDF');
      expect(html).toContain('Export CSV');
    });
  });

  describe('ExpenseCard (TASK-017)', () => {
    const mockExpense = {
      id: 1,
      category: 'Kebersihan',
      amount: 450000,
      date: '2026-03-10',
      description: 'Honor petugas angkut sampah bulan Maret',
      recorded_by: 'Budi (Bendahara)',
      scope: 'general',
      receipt_file: 'nota-kebersihan-maret.jpg',
    };

    it('renders category, formatted amount, scope, and receipt button', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ExpenseCard
            expense={mockExpense}
            canEdit={true}
            onViewReceipt={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Kebersihan');
      expect(html).toContain('Honor petugas angkut sampah bulan Maret');
      expect(html).toContain('Kas Umum');
      expect(html).toContain('Bukti Kwitansi');
      expect(html).toContain('title="Edit Pengeluaran"');
      expect(html).toContain('title="Hapus Pengeluaran"');
    });

    it('renders event badge when scope is event', () => {
      const eventExpense = { ...mockExpense, scope: 'event' };
      const rawHtml = renderToString(
        <MemoryRouter>
          <ExpenseCard expense={eventExpense} />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Event');
    });
  });

  describe('ExpenseDetailDrawer (TASK-017)', () => {
    const mockExpense = {
      id: 1,
      category: 'Perawatan Fasilitas',
      amount: 150000,
      date: '2026-03-12',
      description: 'Pembelian lampu penerangan jalan pos satpam',
      recorded_by: 'Agus',
      scope: 'general',
      receipt_file: 'kwitansi-lampu.jpg',
    };

    it('renders full expense details and action buttons', () => {
      const rawHtml = renderToString(
        <ExpenseDetailDrawer
          isOpen={true}
          onClose={() => {}}
          expense={mockExpense}
          canEdit={true}
          onEdit={() => {}}
          onDelete={() => {}}
          onViewReceipt={() => {}}
        />
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Rincian Pengeluaran Kas');
      expect(html).toContain('Perawatan Fasilitas');
      expect(html).toContain('Pembelian lampu penerangan jalan pos satpam');
      expect(html).toContain('Edit Pengeluaran');
      expect(html).toContain('Hapus');
      expect(html).toContain('Lihat Nota');
    });
  });

  describe('IncomeCard (TASK-017)', () => {
    const mockIncome = {
      id: 201,
      category: 'Donasi Fasum',
      amount: 250000,
      income_date: '2026-03-14',
      source_name: 'Pak Rudi Blok B/5',
      payment_method: 'bank_transfer',
      status: 'pending_verification',
      description: 'Sumbangan cat gapura',
      receipt_file_url: 'https://example.com/receipt.jpg',
    };

    it('renders non-ipl income card with pending status and verification actions', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <IncomeCard
            income={mockIncome}
            canVerify={true}
            onViewReceipt={() => {}}
            onApprove={() => {}}
            onReject={() => {}}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Donasi Fasum');
      expect(html).toContain('Pak Rudi Blok B/5');
      expect(html).toContain('Transfer');
      expect(html).toContain('Verifikasi');
      expect(html).toContain('Lihat Bukti');
      expect(html).toContain('Terima');
      expect(html).toContain('Tolak');
    });

    it('renders rejection notice when transaction is rejected', () => {
      const rejectedIncome = {
        ...mockIncome,
        status: 'rejected',
        rejection_reason: 'Bukti transfer buram tidak terbaca',
      };
      const rawHtml = renderToString(
        <MemoryRouter>
          <IncomeCard income={rejectedIncome} />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Alasan ditolak: Bukti transfer buram tidak terbaca');
    });
  });

  describe('IncomeDetailDrawer (TASK-017)', () => {
    const mockIncome = {
      id: 202,
      category: 'Sewa Lapangan',
      amount: 100000,
      income_date: '2026-03-15',
      source_name: 'Komunitas Bulutangkis',
      payment_method: 'qris',
      status: 'verified',
      description: 'Sewa lapangan 2 jam',
      receipt_file_url: 'https://example.com/qris-paid.jpg',
    };

    it('renders complete income details and verification badge', () => {
      const rawHtml = renderToString(
        <IncomeDetailDrawer
          isOpen={true}
          onClose={() => {}}
          income={mockIncome}
          onViewReceipt={() => {}}
        />
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Rincian Transaksi Pemasukan');
      expect(html).toContain('Sewa Lapangan');
      expect(html).toContain('Komunitas Bulutangkis');
      expect(html).toContain('QRIS Palm Village');
      expect(html).toContain('Terverifikasi');
    });
  });
});
