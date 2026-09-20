import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ResidentBillingHero } from './ResidentBillingHero';
import { StaffCollectionHero } from './StaffCollectionHero';
import { QuickActionsGrid } from './QuickActionsGrid';
import { CitizenDashboard } from './CitizenDashboard';
import { StaffDashboard } from './StaffDashboard';
import { DashboardSkeleton } from './DashboardSkeleton';
import { TENANT_TEMPLATES } from '../../config/tenantTemplates';

// Helper to remove HTML comments inserted by React SSR
function cleanHtml(html) {
  return html.replace(/<!--.*?-->/g, '');
}

describe('Dashboard Architecture & Components (Phase 5)', () => {
  describe('ResidentBillingHero (Current Obligation)', () => {
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

  describe('StaffCollectionHero (Operational Collection Summary)', () => {
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

  describe('CitizenDashboard (Persona: Anggota / Warga)', () => {
    it('adapts obligation terminology to Residential (rt_rw) template', () => {
      const template = TENANT_TEMPLATES.rt_rw;
      const rawHtml = renderToString(
        <MemoryRouter>
          <CitizenDashboard
            tenantId="t-rt-1"
            template={template}
            periodLabel="September 2026"
            dashData={{
              myObligation: { amount: 150000, status: 'unpaid' },
              myUnit: 'A/12',
              billing: { collectionRate: 0 },
              recentPayments: [],
            }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      // Primary obligation
      expect(html).toContain('IPL September 2026');
      expect(html).toContain('Rumah A/12');
      expect(html).toContain('Bayar IPL Sekarang');

      // Max 4 quick actions
      expect(html).toContain('Bayar IPL');
      expect(html).toContain('Riwayat Bayar');
      expect(html).toContain('Pengumuman');
      expect(html).toContain('Daftar Warga');

      // Community Info & Activity
      expect(html).toContain('Aktivitas Terbaru');
      expect(html).toContain('Informasi Komunitas');
    });

    it('adapts obligation terminology to Kost (kos) template', () => {
      const template = TENANT_TEMPLATES.kos;
      const rawHtml = renderToString(
        <MemoryRouter>
          <CitizenDashboard
            tenantId="t-kos-1"
            template={template}
            periodLabel="September 2026"
            dashData={{
              myObligation: { amount: 1500000, status: 'unpaid' },
              myUnit: '101',
              billing: { collectionRate: 0 },
              recentPayments: [],
            }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Sewa September 2026');
      expect(html).toContain('Kamar 101');
      expect(html).toContain('Bayar Uang Sewa Sekarang');
      expect(html).toContain('Daftar Penyewa');
    });

    it('adapts obligation terminology to Arisan template', () => {
      const template = TENANT_TEMPLATES.arisan;
      const rawHtml = renderToString(
        <MemoryRouter>
          <CitizenDashboard
            tenantId="t-arisan-1"
            template={template}
            periodLabel="September 2026"
            dashData={{
              myObligation: { amount: 100000, status: 'unpaid' },
              myUnit: '08',
              billing: { collectionRate: 0 },
              recentPayments: [],
            }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Kontribusi September 2026');
      expect(html).toContain('Slot 08');
      expect(html).toContain('Setor Kontribusi Sekarang');
      expect(html).toContain('Daftar Peserta');
    });

    it('adapts obligation terminology to Class (kelas) template', () => {
      const template = TENANT_TEMPLATES.kelas;
      const rawHtml = renderToString(
        <MemoryRouter>
          <CitizenDashboard
            tenantId="t-kelas-1"
            template={template}
            periodLabel="September 2026"
            dashData={{
              myObligation: { amount: 150000, status: 'unpaid' },
              myUnit: 'Kelas A',
              billing: { collectionRate: 0 },
              recentPayments: [],
            }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Iuran September 2026');
      expect(html).toContain('Slot Kelas A');
      expect(html).toContain('Bayar Iuran / SPP Sekarang');
      expect(html).toContain('Daftar Siswa');
    });
  });

  describe('StaffDashboard (Persona: Admin / Bendahara / Pengurus)', () => {
    it('renders critical actions when payments and registrations are pending', () => {
      const template = TENANT_TEMPLATES.rt_rw;
      const dashData = {
        pendingPaymentCount: 5,
        pendingRegistrationCount: 2,
        billing: { totalBilled: 10000000, totalCollected: 6000000, totalOutstanding: 4000000, collectionRate: 60, billCount: 40 },
        finance: { totalIncome: 6000000, totalExpense: 2000000, netCashflow: 4000000 },
        units: { total: 40, occupied: 35, vacant: 5 },
        members: { total: 80 },
        recentPayments: [
          { id: 'p1', amount: 250000, status: 'pending', period: '2026-09', userName: 'Budi' },
        ],
      };

      const rawHtml = renderToString(
        <MemoryRouter>
          <StaffDashboard
            tenantId="t-rt-1"
            template={template}
            dashData={dashData}
            periodLabel="September 2026"
            activeTenant={{ id: 't-rt-1', settings: { invite_code: 'PV-05' } }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      // Critical actions highlighted
      expect(html).toContain('5 pembayaran perlu diverifikasi');
      expect(html).toContain('Review Pembayaran');
      expect(html).toContain('2 pendaftaran warga baru');
      expect(html).toContain('Tinjau Anggota');

      // Operational summary
      expect(html).toContain('Penerimaan Tagihan IPL');
      expect(html).toContain('Arus Kas Bersih');
      expect(html).toContain('4.000.000');

      // Unit & member health
      expect(html).toContain('35');
      expect(html).toContain('80');
      expect(html).toContain('PV-05');
    });

    it('renders calm operational status when 0 pending items', () => {
      const template = TENANT_TEMPLATES.kos;
      const dashData = {
        pendingPaymentCount: 0,
        pendingRegistrationCount: 0,
        billing: { totalBilled: 15000000, totalCollected: 15000000, totalOutstanding: 0, collectionRate: 100, billCount: 10 },
        finance: { totalIncome: 15000000, totalExpense: 5000000, netCashflow: 10000000 },
        units: { total: 10, occupied: 10, vacant: 0 },
        members: { total: 10 },
        recentPayments: [],
      };

      const rawHtml = renderToString(
        <MemoryRouter>
          <StaffDashboard
            tenantId="t-kos-1"
            template={template}
            dashData={dashData}
            periodLabel="September 2026"
            activeTenant={{ id: 't-kos-1' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Semua pembayaran dan pendaftaran operasional telah terverifikasi bersih');
      expect(html).not.toContain('perlu diverifikasi');
    });
  });

  describe('DashboardSkeleton (Loading State)', () => {
    it('renders structural skeleton without layout shifts', () => {
      const citizenSkeleton = cleanHtml(renderToString(<DashboardSkeleton isStaff={false} />));
      expect(citizenSkeleton).toContain('aria-busy="true"');
      expect(citizenSkeleton).toContain('animate-pulse');

      const staffSkeleton = cleanHtml(renderToString(<DashboardSkeleton isStaff={true} />));
      expect(staffSkeleton).toContain('aria-busy="true"');
      expect(staffSkeleton).toContain('grid-cols-4');
    });
  });

  describe('QuickActionsGrid (Neutral Tokens & Tenant Adaptability)', () => {
    it('renders neutral tokens without legacy forest color leakage', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <QuickActionsGrid
            tenantId="t-1"
            template={TENANT_TEMPLATES.rt_rw}
            isStaff={true}
            isTenantAdmin={true}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).not.toContain('bg-forest-');
      expect(html).not.toContain('text-forest-');
      expect(html).toContain('Matriks IPL');
      expect(html).toContain('Daftar Warga');
      expect(html).toContain('Pengaturan Kompleks Lingkungan');
    });
  });

  describe('Phase 5.1 — Dashboard Data Integrity & Correctness', () => {
    // 1. Citizen dengan tagihan aktual menampilkan nominal aktual
    it('1. citizen with actual bill displays actual amount', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentBillingHero
            myBill={{ amount: 375000, status: 'unpaid' }}
            myUnit="B-05"
            periodLabel="September 2026"
            template={{ billLabel: 'IPL', unitLabel: 'Rumah' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('375.000');
    });

    // 2. Citizen paid menampilkan "paid"
    it('2. citizen paid displays "paid" status badge and message', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentBillingHero
            myBill={{ amount: 200000, status: 'paid' }}
            myUnit="B-05"
            periodLabel="September 2026"
            template={{ billLabel: 'IPL', unitLabel: 'Rumah' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Lunas');
      expect(html).toContain('telah lunas');
    });

    // 3. Citizen pending verification menampilkan "pending"
    it('3. citizen pending verification displays "pending" status and message', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentBillingHero
            myBill={{ amount: 200000, status: 'pending_verification' }}
            myUnit="B-05"
            periodLabel="September 2026"
            template={{ billLabel: 'IPL', unitLabel: 'Rumah' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Verifikasi');
      expect(html).toContain('sedang diverifikasi');
    });

    // 4. Citizen unpaid menampilkan "unpaid"
    it('4. citizen unpaid displays "unpaid" status and pay button', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentBillingHero
            myBill={{ amount: 200000, status: 'unpaid' }}
            myUnit="B-05"
            periodLabel="September 2026"
            template={{ billLabel: 'IPL', unitLabel: 'Rumah' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Belum Bayar');
      expect(html).toContain('belum terbayar');
      expect(html).toContain('Bayar IPL Sekarang');
    });

    // 5. Tenant collection rate 99% tidak membuat citizen otomatis menjadi unpaid jika citizen tersebut sudah paid
    it('5. tenant collection rate 99% does not make citizen unpaid when citizen is paid', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <CitizenDashboard
            tenantId="t-1"
            template={TENANT_TEMPLATES.rt_rw}
            periodLabel="September 2026"
            dashData={{
              billing: { collectionRate: 99 },
              myObligation: { amount: 150000, status: 'paid' },
              myUnit: 'A-01',
              recentPayments: [],
            }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Lunas');
      expect(html).not.toContain('belum terbayar');
    });

    // 6. Tidak ada current obligation -> empty state
    it('6. missing current obligation displays meaningful empty state', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <CitizenDashboard
            tenantId="t-1"
            template={TENANT_TEMPLATES.rt_rw}
            periodLabel="September 2026"
            dashData={{
              billing: { collectionRate: 0 },
              myObligation: null,
              myUnit: 'A-01',
              recentPayments: [],
            }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Belum ada tagihan ipl untuk periode ini');
      expect(html).toContain('Data kewajiban pembayaran belum diterbitkan');
      expect(html).not.toContain('150.000');
      expect(html).not.toContain('250.000');
    });

    // 7. Tidak ada unit identity -> empty state
    it('7. missing unit identity displays unit belum terhubung', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <CitizenDashboard
            tenantId="t-1"
            template={TENANT_TEMPLATES.rt_rw}
            periodLabel="September 2026"
            dashData={{
              billing: { collectionRate: 0 },
              myObligation: null,
              myUnit: null,
              recentPayments: [],
            }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Rumah belum terhubung');
      expect(html).not.toContain('Blok A/12');
    });

    // 8. Tidak ada announcement -> empty state
    it('8. missing announcements displays empty state without mock Palm Village injection', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <CitizenDashboard
            tenantId="t-empty-ann"
            template={TENANT_TEMPLATES.rt_rw}
            periodLabel="September 2026"
            dashData={{
              billing: { collectionRate: 0 },
              myObligation: null,
              myUnit: 'A-01',
              recentPayments: [],
            }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).toContain('Belum ada pengumuman terbaru untuk komunitas ini');
      expect(html).not.toContain('Fogging Nyamuk DBD');
    });

    // 9. Tidak ada realistic hardcoded fallback
    it('9. ensures no realistic hardcoded numbers when data is absent', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentBillingHero
            myBill={null}
            myUnit={null}
            periodLabel="September 2026"
            template={{ billLabel: 'IPL', unitLabel: 'Rumah' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);
      expect(html).not.toContain('150.000');
      expect(html).not.toContain('250.000');
      expect(html).not.toContain('1.500.000');
      expect(html).not.toContain('100.000');
      expect(html).toContain('Belum ada tagihan ipl untuk periode ini');
    });

    // 10. Tenant switching tidak mempertahankan data citizen dari tenant sebelumnya
    it('10. tenant switching renders distinct scoped data per tenant', () => {
      const tenantAData = {
        myObligation: { amount: 300000, status: 'paid' },
        myUnit: 'Kamar 10',
        billing: { collectionRate: 100 },
        recentPayments: [],
      };
      const tenantBData = {
        myObligation: null,
        myUnit: null,
        billing: { collectionRate: 0 },
        recentPayments: [],
      };

      const htmlA = cleanHtml(
        renderToString(
          <MemoryRouter>
            <CitizenDashboard
              tenantId="t-A"
              template={TENANT_TEMPLATES.kos}
              periodLabel="September 2026"
              dashData={tenantAData}
            />
          </MemoryRouter>
        )
      );

      const htmlB = cleanHtml(
        renderToString(
          <MemoryRouter>
            <CitizenDashboard
              tenantId="t-B"
              template={TENANT_TEMPLATES.rt_rw}
              periodLabel="September 2026"
              dashData={tenantBData}
            />
          </MemoryRouter>
        )
      );

      expect(htmlA).toContain('300.000');
      expect(htmlA).toContain('Kamar 10');
      expect(htmlB).not.toContain('300.000');
      expect(htmlB).not.toContain('Kamar 10');
      expect(htmlB).toContain('Rumah belum terhubung');
    });
  });

  describe('Phase 5.1.1 — Tenant-Scoped Citizen Identity Correction', () => {
    it('Test A — stale user profile unit tidak boleh muncul saat dashData.myUnit is null', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <CitizenDashboard
            tenantId="t-new-tenant"
            template={TENANT_TEMPLATES.rt_rw}
            periodLabel="September 2026"
            dashData={{
              myUnit: null,
              myObligation: null,
              billing: { collectionRate: 0 },
              recentPayments: [],
            }}
            userProfile={{
              unit_number: 'UNIT-FROM-OLD-TENANT',
            }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Rumah belum terhubung');
      expect(html).not.toContain('UNIT-FROM-OLD-TENANT');
    });

    it('Test B — tenant switching: Tenant A (Unit A) ke Tenant B (myUnit null) tidak mempertahankan Unit A', () => {
      const tenantAData = {
        myUnit: 'Unit A',
        myObligation: null,
        billing: { collectionRate: 0 },
        recentPayments: [],
      };
      const tenantBData = {
        myUnit: null,
        myObligation: null,
        billing: { collectionRate: 0 },
        recentPayments: [],
      };

      const htmlA = cleanHtml(
        renderToString(
          <MemoryRouter>
            <CitizenDashboard
              tenantId="t-A"
              template={TENANT_TEMPLATES.rt_rw}
              periodLabel="September 2026"
              dashData={tenantAData}
            />
          </MemoryRouter>
        )
      );

      const htmlB = cleanHtml(
        renderToString(
          <MemoryRouter>
            <CitizenDashboard
              tenantId="t-B"
              template={TENANT_TEMPLATES.rt_rw}
              periodLabel="September 2026"
              dashData={tenantBData}
            />
          </MemoryRouter>
        )
      );

      expect(htmlA).toContain('Unit A');
      expect(htmlB).toContain('Rumah belum terhubung');
      expect(htmlB).not.toContain('Unit A');
    });

    it('Test C — tenant B memiliki unit: Unit B ditampilkan', () => {
      const tenantBData = {
        myUnit: 'Unit B',
        myObligation: { amount: 250000, status: 'unpaid' },
        billing: { collectionRate: 0 },
        recentPayments: [],
      };

      const htmlB = cleanHtml(
        renderToString(
          <MemoryRouter>
            <CitizenDashboard
              tenantId="t-B"
              template={TENANT_TEMPLATES.rt_rw}
              periodLabel="September 2026"
              dashData={tenantBData}
            />
          </MemoryRouter>
        )
      );

      expect(htmlB).toContain('Rumah Unit B');
      expect(htmlB).not.toContain('belum terhubung');
    });
  });
});
