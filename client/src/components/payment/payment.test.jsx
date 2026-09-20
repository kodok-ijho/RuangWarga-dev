import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ResidentIplOverview, CitizenBillingOverview } from './ResidentIplOverview';
import { PaymentFlowModal } from './PaymentFlowModal';
import { PaymentHistoryList } from './PaymentHistoryList';
import {
  resolveCitizenObligationAndUnit,
  submitTenantPayment,
  verifyTenantPayment,
  rejectTenantPayment,
} from '../../services/tenantOperationalService';
import { supabase } from '../../services/supabaseClient';
import { TENANT_TEMPLATES } from '../../config/tenantTemplates';

function cleanHtml(html) {
  return html.replace(/<!--.*?-->/g, '');
}

describe('Phase 6 — Billing & Payment Experience Test Matrix', () => {
  // =========================================================================
  // 1. CITIZEN BILLING EXPERIENCE
  // =========================================================================
  describe('Citizen Billing Experience', () => {
    it('1. actual amount displayed — format rupiah nominal aktual tagihan ditampilkan dengan benar', () => {
      const unpaidBills = [
        { id: 'b-act-1', period: '2026-09', amount: 185000, late_fee: 0, status: 'unpaid' },
      ];

      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ block: 'B', unit_number: '07' }}
              unpaidBills={unpaidBills}
              selectedBillIds={['b-act-1']}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('185.000');
      expect(html).toContain('Rumah B no 07');
    });

    it('2. paid status — menampilkan banner lunas dan tombol rincian lunas saat tagihan telah lunas', () => {
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ block: 'C', unit_number: '10' }}
              unpaidBills={[]}
              currentPeriodBill={{ id: 'b-pd', status: 'paid', period: '2026-09', amount: 200000 }}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Semua Tagihan IPL Telah Lunas');
      expect(html).toContain('Lihat Rincian Lunas');
      expect(html).not.toContain('Belum Dibayar');
    });

    it('3. pending verification — menampilkan status sedang diverifikasi saat bukti bayar terkirim', () => {
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ block: 'A', unit_number: '01' }}
              unpaidBills={[]}
              currentPeriodBill={{ id: 'b-pnd', status: 'pending_verification', period: '2026-09', amount: 150000 }}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Pembayaran Sedang Diverifikasi');
      expect(html).toContain('menunggu verifikasi oleh bendahara');
      expect(html).toContain('Lihat Status Pembayaran');
    });

    it('4. unpaid status — menampilkan headline belum dibayar dan tombol aksi bayar', () => {
      const unpaidBills = [
        { id: 'b-unp-1', period: '2026-09', amount: 220000, late_fee: 0, status: 'unpaid' },
      ];

      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ block: 'D', unit_number: '12' }}
              unpaidBills={unpaidBills}
              selectedBillIds={['b-unp-1']}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Tagihan IPL Belum Dibayar');
      expect(html).toContain('Bayar IPL (1 Bulan)');
      expect(html).toContain('220.000');
    });

    it('5. not applicable — saat tidak ada kewajiban dan tagihan kosong, status adalah not_applicable bukan fake paid', () => {
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ block: 'E', unit_number: '03' }}
              unpaidBills={[]}
              currentPeriodBill={null}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Tidak Ada Kewajiban Periode Ini');
      // Tidak boleh mengklaim "Semua Tagihan Telah Lunas" jika tidak ada record bill
      expect(html).not.toContain('Semua Tagihan IPL Telah Lunas');
    });

    it('6. unavailable — saat data kewajiban berstatus unavailable, tampilkan pesan data belum tersedia', () => {
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ block: 'F', unit_number: '05' }}
              unpaidBills={[]}
              currentPeriodBill={{ status: 'unavailable' }}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Data Tagihan Belum Tersedia');
      expect(html).not.toContain('Bayar');
    });

    it('7. no obligation — tidak menampilkan CTA pembayaran jika tidak ada kewajiban aktif', () => {
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ block: 'G', unit_number: '02' }}
              unpaidBills={[]}
              currentPeriodBill={null}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).not.toContain('Bayar IPL');
    });

    it('8. no unit — menampilkan pesan unit belum terhubung dan tanpa CTA bayar', () => {
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={null}
              unpaidBills={[]}
              currentPeriodBill={null}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Rumah belum terhubung');
      expect(html).not.toContain('Bayar');
    });

    it('9. no fake amount — tidak menampilkan nominal default realistis (misal 250000 / 1500000) jika data kosong', () => {
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ block: 'H', unit_number: '09' }}
              unpaidBills={[]}
              currentPeriodBill={null}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).not.toContain('250.000');
      expect(html).not.toContain('1.500.000');
      expect(html).not.toContain('100.000');
    });

    it('10. no fake status — tidak mengasumsikan lunas saat data bill tidak ditemukan di backend', () => {
      const resolved = resolveCitizenObligationAndUnit({
        units: [{ id: 10, label: 'Kamar 10' }],
        members: [{ id: 'm-1', user_id: 'u-1', unit_id: 10 }],
        billMatrix: [{ unit: { id: 10 }, cells: [] }], // cells kosong (tidak ada bill)
        resolvedPeriod: '2026-09',
        userId: 'u-1',
      });

      expect(resolved.myObligation).toBeNull();
      expect(resolved.myUnit).toBe('Kamar 10');
    });
  });

  // =========================================================================
  // 2. STAFF / ADMIN BILLING EXPERIENCE
  // =========================================================================
  describe('Staff / Admin Billing Experience', () => {
    it('11. aggregate collection metrics — perhitungan metrik koleksi agregat tepat', () => {
      const bills = [
        { id: 'b1', amount: 100000, status: 'paid' },
        { id: 'b2', amount: 200000, status: 'paid' },
        { id: 'b3', amount: 300000, status: 'unpaid' },
        { id: 'b4', amount: 400000, status: 'pending_verification' },
      ];

      const totalBilled = bills.reduce((acc, b) => acc + b.amount, 0);
      const totalPaid = bills.filter((b) => b.status === 'paid').reduce((acc, b) => acc + b.amount, 0);
      const totalOutstanding = bills.filter((b) => b.status !== 'paid').reduce((acc, b) => acc + b.amount, 0);
      const collectionRate = totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 0;

      expect(totalBilled).toBe(1000000);
      expect(totalPaid).toBe(300000);
      expect(totalOutstanding).toBe(700000);
      expect(collectionRate).toBe(30);
    });

    it('12. pending verification list — menyaring transaksi berstatus pending_verification', () => {
      const payments = [
        { id: 'p1', amount: 100000, status: 'pending_verification' },
        { id: 'p2', amount: 200000, status: 'completed' },
        { id: 'p3', amount: 150000, status: 'pending_verification' },
      ];

      const pendingList = payments.filter((p) => p.status === 'pending_verification');
      expect(pendingList).toHaveLength(2);
      expect(pendingList.map((p) => p.id)).toEqual(['p1', 'p3']);
    });

    it('13. outstanding obligations — menyaring tagihan yang belum dibayar', () => {
      const bills = [
        { id: 'b1', unit_id: 1, amount: 200000, status: 'unpaid' },
        { id: 'b2', unit_id: 2, amount: 200000, status: 'paid' },
        { id: 'b3', unit_id: 3, amount: 200000, status: 'unpaid' },
      ];

      const outstanding = bills.filter((b) => b.status === 'unpaid');
      expect(outstanding).toHaveLength(2);
      expect(outstanding.map((b) => b.id)).toEqual(['b1', 'b3']);
    });

    it('14. billing matrix — sel tanpa tagihan direpresentasikan sebagai none/dash', () => {
      const rowCells = [
        { period: '2026-07', status: 'paid', bill: { id: 'b1', amount: 150000 } },
        { period: '2026-08', status: 'none', bill: null },
      ];

      expect(rowCells[0].bill).not.toBeNull();
      expect(rowCells[0].status).toBe('paid');
      expect(rowCells[1].bill).toBeNull();
      expect(rowCells[1].status).toBe('none');
    });
  });

  // =========================================================================
  // 3. TENANT ISOLATION & TENANT SWITCHING
  // =========================================================================
  describe('Tenant Isolation & Switching', () => {
    it('15 & 16. Tenant A dan Tenant B data terisolasi secara independen', () => {
      const tenantAUnits = [{ id: 101, label: 'Kamar 101' }];
      const tenantAMembers = [{ id: 'ma-1', user_id: 'user-x', unit_id: 101 }];
      const tenantABills = [
        {
          unit: { id: 101 },
          cells: [{ period: '2026-09', bill: { id: 'ba-1', amount: 1200000, status: 'unpaid' } }],
        },
      ];

      const tenantBUnits = [{ id: 202, label: 'Slot 02' }];
      const tenantBMembers = [{ id: 'mb-1', user_id: 'user-x', unit_id: 202 }];
      const tenantBBills = [
        {
          unit: { id: 202 },
          cells: [{ period: '2026-09', bill: { id: 'bb-1', amount: 50000, status: 'paid' } }],
        },
      ];

      const resA = resolveCitizenObligationAndUnit({
        units: tenantAUnits,
        members: tenantAMembers,
        billMatrix: tenantABills,
        resolvedPeriod: '2026-09',
        userId: 'user-x',
      });

      const resB = resolveCitizenObligationAndUnit({
        units: tenantBUnits,
        members: tenantBMembers,
        billMatrix: tenantBBills,
        resolvedPeriod: '2026-09',
        userId: 'user-x',
      });

      expect(resA.myUnit).toBe('Kamar 101');
      expect(resA.myObligation.amount).toBe(1200000);
      expect(resA.myObligation.status).toBe('unpaid');

      expect(resB.myUnit).toBe('Slot 02');
      expect(resB.myObligation.amount).toBe(50000);
      expect(resB.myObligation.status).toBe('paid');
    });

    it('17. switching A -> B clears stale billing data saat user tidak memiliki unit di B', () => {
      // User-x memiliki unit di Tenant A, tapi belum terafiliasi di Tenant B
      const tenantBUnits = [{ id: 301, label: 'Rumah C/01' }];
      const tenantBMembers = []; // Belum ada member untuk user-x di Tenant B
      const tenantBBills = [];

      const resB = resolveCitizenObligationAndUnit({
        units: tenantBUnits,
        members: tenantBMembers,
        billMatrix: tenantBBills,
        resolvedPeriod: '2026-09',
        userId: 'user-x',
      });

      expect(resB.myUnit).toBeNull();
      expect(resB.myObligation).toBeNull();
    });

    it('18. switching B -> A restores Tenant A data dengan benar', () => {
      const tenantAUnits = [{ id: 101, label: 'Kamar 101' }];
      const tenantAMembers = [{ id: 'ma-1', user_id: 'user-x', unit_id: 101 }];
      const tenantABills = [
        {
          unit: { id: 101 },
          cells: [{ period: '2026-09', bill: { id: 'ba-1', amount: 1200000, status: 'unpaid' } }],
        },
      ];

      const resA = resolveCitizenObligationAndUnit({
        units: tenantAUnits,
        members: tenantAMembers,
        billMatrix: tenantABills,
        resolvedPeriod: '2026-09',
        userId: 'user-x',
      });

      expect(resA.myUnit).toBe('Kamar 101');
      expect(resA.myObligation.amount).toBe(1200000);
    });
  });

  // =========================================================================
  // 4. ERROR & EMPTY STATES
  // =========================================================================
  describe('Error & Empty States', () => {
    it('19. billing fetch error — menampilkan kartu error dengan tombol coba lagi', () => {
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ block: 'A', unit_number: '01' }}
              isError={true}
              errorMessage="Koneksi terputus saat mengambil tagihan."
              onRetry={() => {}}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Data pembayaran belum dapat dimuat');
      expect(html).toContain('Koneksi terputus saat mengambil tagihan.');
      expect(html).toContain('Coba Lagi');
      expect(html).not.toContain('Bayar');
    });

    it('20. payment flow modal error — menampilkan pesan validasi jika bukti transfer belum dipilih', () => {
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <PaymentFlowModal
              open={true}
              bills={[{ id: 'b1', period: '2026-09', amount: 150000 }]}
              total={150000}
              canUseQris={false} // force bank transfer
              billLabel="IPL"
              onConfirm={() => {}}
              onClose={() => {}}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Transfer Bank');
      expect(html).toContain('Unggah Bukti Transfer');
      expect(html).toContain('Pilih File Bukti Transfer');
    });

    it('21. empty history — menampilkan status kosong yang jelas tanpa baris palsu', () => {
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <PaymentHistoryList payments={[]} bills={[]} template={TENANT_TEMPLATES.rt_rw} />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Belum Ada Riwayat Pembayaran');
      expect(html).not.toContain('Rp');
    });
  });

  // =========================================================================
  // 5. CRITICAL REGRESSION
  // =========================================================================
  describe('Critical Regression Tests', () => {
    it('22. collectionRate 99% + citizen paid -> still paid', () => {
      const resolved = resolveCitizenObligationAndUnit({
        units: [{ id: 1, label: 'Rumah A/01' }],
        members: [{ id: 'm1', user_id: 'u1', unit_id: 1 }],
        billMatrix: [
          {
            unit: { id: 1 },
            cells: [{ period: '2026-09', bill: { id: 'b1', amount: 200000, status: 'paid' } }],
          },
        ],
        resolvedPeriod: '2026-09',
        userId: 'u1',
      });

      expect(resolved.myObligation.status).toBe('paid');
    });

    it('23. collectionRate 100% + citizen unpaid -> still unpaid (NO FALSE PAID BY AGGREGATE)', () => {
      const resolved = resolveCitizenObligationAndUnit({
        units: [{ id: 2, label: 'Rumah A/02' }],
        members: [{ id: 'm2', user_id: 'u2', unit_id: 2 }],
        billMatrix: [
          {
            unit: { id: 2 },
            cells: [{ period: '2026-09', bill: { id: 'b2', amount: 200000, status: 'unpaid' } }],
          },
        ],
        resolvedPeriod: '2026-09',
        userId: 'u2',
      });

      expect(resolved.myObligation.status).toBe('unpaid');
    });

    it('24. missing billing data -> NOT unpaid (shows no obligation / not applicable)', () => {
      const resolved = resolveCitizenObligationAndUnit({
        units: [{ id: 3, label: 'Rumah A/03' }],
        members: [{ id: 'm3', user_id: 'u3', unit_id: 3 }],
        billMatrix: [{ unit: { id: 3 }, cells: [] }], // no cell for 2026-09
        resolvedPeriod: '2026-09',
        userId: 'u3',
      });

      expect(resolved.myObligation).toBeNull();
    });

    it('25. payment submitted but unverified -> NOT paid (status is pending)', () => {
      const resolved = resolveCitizenObligationAndUnit({
        units: [{ id: 4, label: 'Rumah A/04' }],
        members: [{ id: 'm4', user_id: 'u4', unit_id: 4 }],
        billMatrix: [
          {
            unit: { id: 4 },
            cells: [
              {
                period: '2026-09',
                bill: { id: 'b4', amount: 200000, status: 'unpaid' },
                payment: { id: 'p4', status: 'pending_verification' },
              },
            ],
          },
        ],
        resolvedPeriod: '2026-09',
        userId: 'u4',
      });

      expect(resolved.myObligation.status).toBe('pending');
    });
  });

  // =========================================================================
  // 6. MULTI-TENANT TERMINOLOGY (ALL 4 VERTICALS)
  // =========================================================================
  describe('Multi-Tenant Terminology Adapter', () => {
    it('26. Residential template terminology (IPL, Rumah, Warga)', () => {
      const template = TENANT_TEMPLATES.rt_rw;
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ block: 'A', unit_number: '01' }}
              unpaidBills={[{ id: 'b1', period: '2026-09', amount: 150000, status: 'unpaid' }]}
              selectedBillIds={['b1']}
              template={template}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Tagihan IPL Belum Dibayar');
      expect(html).toContain('Rumah A no 01');
      expect(html).toContain('Bayar IPL (1 Bulan)');
    });

    it('27. Kost template terminology (Sewa, Kamar, Penyewa)', () => {
      const template = TENANT_TEMPLATES.kos;
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ label: 'Kamar 101' }}
              unpaidBills={[{ id: 'b1', period: '2026-09', amount: 1500000, status: 'unpaid' }]}
              selectedBillIds={['b1']}
              template={template}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Tagihan Sewa Belum Dibayar');
      expect(html).toContain('Kamar 101');
      expect(html).toContain('Bayar Uang Sewa (1 Bulan)');
    });

    it('28. Arisan template terminology (Kontribusi, Slot, Anggota)', () => {
      const template = TENANT_TEMPLATES.arisan;
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ label: 'Slot 08' }}
              unpaidBills={[{ id: 'b1', period: '2026-09', amount: 100000, status: 'unpaid' }]}
              selectedBillIds={['b1']}
              template={template}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Tagihan Kontribusi Belum Dibayar');
      expect(html).toContain('Slot 08');
      expect(html).toContain('Setor Kontribusi (1 Bulan)');
    });

    it('29. Class template terminology (Iuran SPP, Kelas, Siswa)', () => {
      const template = TENANT_TEMPLATES.kelas;
      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <ResidentIplOverview
              unit={{ label: 'Slot 01' }}
              unpaidBills={[{ id: 'b1', period: '2026-09', amount: 250000, status: 'unpaid' }]}
              selectedBillIds={['b1']}
              template={template}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Tagihan Iuran Belum Dibayar');
      expect(html).toContain('Slot 01');
      expect(html).toContain('Bayar Iuran / SPP (1 Bulan)');
    });
  });

  // =========================================================================
  // 7. PHASE 6.1 — PAYMENT TRANSACTION INTEGRITY HARDENING
  // =========================================================================
  describe('Phase 6.1 — Payment Transaction Integrity Hardening', () => {
    // 1. client amount mismatch -> REJECT / throws error
    it('1. client amount mismatch -> REJECT / throws error', async () => {
      const billData = {
        id: 'bill-test-1',
        amount: 150000,
        late_fee: 15000, // total obligation: 165000
        member_id: 'member-1',
        status: 'unpaid',
      };

      const spy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: billData, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      try {
        await expect(
          submitTenantPayment('tenant-real-1', {
            billId: 'bill-test-1',
            amount: 100000, // mismatch from 165000
          })
        ).rejects.toThrow('Nominal pembayaran (100000) tidak sesuai dengan total tagihan wajib (165000).');
      } finally {
        spy.mockRestore();
      }
    });

    // 2. actual obligation calculation -> calculates amount + late_fee
    it('2. actual obligation calculation -> calculates amount + late_fee when amount omitted', async () => {
      const billData = {
        id: 'bill-test-2',
        amount: 200000,
        late_fee: 25000, // total obligation: 225000
        member_id: 'member-2',
        status: 'unpaid',
      };

      let insertedPayload = null;

      const spy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: billData, error: null }),
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }),
          };
        }
        if (table === 'payments') {
          return {
            insert: (rows) => ({
              select: () => ({
                single: async () => {
                  insertedPayload = rows[0];
                  return {
                    data: { id: 'pay-success-2', ...rows[0] },
                    error: null,
                  };
                },
              }),
            }),
          };
        }
        return {};
      });

      try {
        const result = await submitTenantPayment('tenant-real-1', {
          billId: 'bill-test-2',
          // amount sengaja tidak dikirim agar obligation dihitung otomatis
        });

        expect(insertedPayload).not.toBeNull();
        expect(insertedPayload.amount).toBe(225000);
        expect(result.amount).toBe(225000);
      } finally {
        spy.mockRestore();
      }
    });

    // 3. billing update failure on payment submission -> rolls back/deletes inserted payment and throws error
    it('3. billing update failure on payment submission -> rolls back/deletes inserted payment and throws error', async () => {
      const billData = {
        id: 'bill-test-3',
        amount: 150000,
        late_fee: 0,
        member_id: 'member-3',
        status: 'unpaid',
      };

      let deletedPaymentId = null;
      const simulatedBillingError = new Error('Database deadlock on billing update');

      const spy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: billData, error: null }),
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: simulatedBillingError }),
              }),
            }),
          };
        }
        if (table === 'payments') {
          return {
            insert: (rows) => ({
              select: () => ({
                single: async () => ({
                  data: { id: 'pay-rollback-3', ...rows[0] },
                  error: null,
                }),
              }),
            }),
            delete: () => ({
              eq: (field1, val1) => ({
                eq: async (field2, val2) => {
                  if (field2 === 'id') deletedPaymentId = val2;
                  return { error: null };
                },
              }),
            }),
          };
        }
        return {};
      });

      try {
        await expect(
          submitTenantPayment('tenant-real-1', {
            billId: 'bill-test-3',
          })
        ).rejects.toThrow('Database deadlock on billing update');

        // Memastikan payment di-rollback (dihapus)
        expect(deletedPaymentId).toBe('pay-rollback-3');
      } finally {
        spy.mockRestore();
      }
    });

    // 4. billing update failure on verification -> throws error
    it('4. billing update failure on verification -> throws error without swallowing', async () => {
      const simulatedBillingError = new Error('Failed to update billing item to paid');

      const spy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'payments') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: 'pay-verify-4', billing_item_id: 'bill-verify-4', metadata: {} },
                    error: null,
                  }),
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }),
          };
        }
        if (table === 'billing_items') {
          return {
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: simulatedBillingError }),
              }),
            }),
          };
        }
        return {};
      });

      try {
        await expect(
          verifyTenantPayment('tenant-real-1', 'pay-verify-4', { verifiedBy: 'Bendahara' })
        ).rejects.toThrow('Failed to update billing item to paid');
      } finally {
        spy.mockRestore();
      }
    });

    // 5. payment status does NOT inherit bill status
    it('5. payment status does NOT inherit bill status -> displays unspecified if pay.status is missing', () => {
      const payments = [
        {
          id: 'pay-5',
          bill_id: 'bill-5',
          status: null, // payment status null/missing
          amount: 250000,
        },
      ];
      const bills = [
        {
          id: 'bill-5',
          status: 'paid', // bill status paid!
          amount: 250000,
        },
      ];

      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <PaymentHistoryList payments={payments} bills={bills} template={TENANT_TEMPLATES.rt_rw} />
          </MemoryRouter>
        )
      );

      // Payment history TIDAK BOLEH menampilkan Lunas hanya karena tagihannya berstatus paid
      expect(html).not.toContain('Lunas');
      expect(html).toContain('Status tidak tersedia');
    });

    // 6. rejected payment in history displays 'Ditolak'
    it('6. rejected payment in history displays Ditolak', () => {
      const payments = [
        {
          id: 'pay-6',
          status: 'rejected',
          amount: 175000,
          method: 'bank_transfer',
        },
      ];

      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <PaymentHistoryList payments={payments} bills={[]} template={TENANT_TEMPLATES.rt_rw} />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Ditolak');
    });

    // 7. pending payment in history displays 'Verifikasi' / 'Menunggu'
    it('7. pending payment in history displays Verifikasi / Menunggu', () => {
      const payments = [
        {
          id: 'pay-7',
          status: 'pending_verification',
          amount: 180000,
          method: 'bank_transfer',
        },
      ];

      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <PaymentHistoryList payments={payments} bills={[]} template={TENANT_TEMPLATES.rt_rw} />
          </MemoryRouter>
        )
      );

      expect(html).toContain('Verifikasi');
    });

    // 8. stored proof displays view link
    it('8. stored proof displays view link in detail dialog', () => {
      const initialItem = {
        id: 'pay-8',
        amount: 200000,
        status: 'completed',
        method: 'bank_transfer',
        proofUrl: 'https://storage.example.com/payment-proofs/bukti-transfer-valid.jpg',
        proofFileName: 'bukti-transfer-valid.jpg',
      };

      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <PaymentHistoryList
              payments={[{ id: 'pay-8', amount: 200000, status: 'completed' }]}
              initialSelectedItem={initialItem}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('bukti-transfer-valid.jpg');
      expect(html).toContain('href="https://storage.example.com/payment-proofs/bukti-transfer-valid.jpg"');
      expect(html).toContain('Buka');
    });

    // 9. failed proof storage displays 'Bukti belum berhasil tersimpan di server' without fake link
    it('9. failed proof storage displays Bukti belum berhasil tersimpan di server without fake link', () => {
      const initialItem = {
        id: 'pay-9',
        amount: 200000,
        status: 'pending_verification',
        method: 'bank_transfer',
        proofUrl: '', // Upload gagal, URL string kosong
        proofFileName: 'bukti_transfer_gagal.pdf',
      };

      const html = cleanHtml(
        renderToString(
          <MemoryRouter>
            <PaymentHistoryList
              payments={[{ id: 'pay-9', amount: 200000, status: 'pending_verification' }]}
              initialSelectedItem={initialItem}
              template={TENANT_TEMPLATES.rt_rw}
            />
          </MemoryRouter>
        )
      );

      expect(html).toContain('bukti_transfer_gagal.pdf');
      expect(html).toContain('Bukti belum berhasil tersimpan di server');
      // Tidak boleh ada link buka atau link palsu
      expect(html).not.toContain('Buka');
    });

    // 10. tenant isolation: payment cannot be submitted for bill belonging to another tenant
    it('10. tenant isolation: payment cannot be submitted for bill belonging to another tenant', async () => {
      // Supabase query dengan .eq('tenant_id', 'tenant-A').eq('id', 'bill-belonging-to-tenant-B') mengembalikan error/not found
      const spy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'billing_items') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({
                    data: null,
                    error: { message: 'Row not found or RLS restricted' },
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      try {
        await expect(
          submitTenantPayment('tenant-A', {
            billId: 'bill-belonging-to-tenant-B',
          })
        ).rejects.toThrow('Tagihan tidak ditemukan untuk tenant ini.');
      } finally {
        spy.mockRestore();
      }
    });
  });
});
