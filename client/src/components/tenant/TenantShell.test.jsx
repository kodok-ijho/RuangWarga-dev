import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TenantShell from './TenantShell';

let testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
  },
});

const renderShell = (entries = ['/t/t-pv-1/dashboard']) => {
  return renderToString(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter initialEntries={entries}>
        <TenantShell />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

let mockTenantState = {
  activeTenant: null,
  activeTenantId: 'tenant-test-1',
  userTenants: [],
  switchTenant: vi.fn(),
  subscriptionStatus: 'active',
  isPlatformAdmin: false,
  isOwner: true,
  userRole: 'admin',
  hasPermission: () => true,
};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'user@example.com' },
    profile: { id: 'u1', full_name: 'Budi Test' },
    isAuthenticated: true,
    role: 'admin',
    signOut: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => {
    if (mockTenantState.activeTenant?.type === 'panitia') {
      return {
        name: 'Kepanitiaan & Acara',
        unitLabel: 'Unit',
        billLabel: 'Tagihan',
        memberLabel: 'Anggota Panitia',
        eventsLabel: 'Agenda',
        icon: '🎪',
        features: {
          hasUnits: false,
          hasPrograms: true,
        },
      };
    }
    if (mockTenantState.activeTenant?.type === 'kos') {
      return {
        name: 'Kos-kosan',
        unitLabel: 'Kamar',
        billLabel: 'Sewa',
        memberLabel: 'Penyewa',
        eventsLabel: 'Acara',
        icon: '🏢',
        features: {
          hasUnits: true,
          hasPrograms: false,
        },
      };
    }
    return {
      name: 'Kompleks RT/RW',
      unitLabel: 'Rumah',
      billLabel: 'IPL',
      memberLabel: 'Warga',
      eventsLabel: 'Acara',
      icon: '🏡',
      features: {
        hasUnits: true,
        hasPrograms: false,
      },
    };
  },
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({
    isReadOnly: false,
    subscriptionStatus: 'active',
  }),
}));

vi.mock('../TenantSwitcher', () => ({
  default: () => <div data-testid="tenant-switcher">TenantSwitcher</div>,
}));

vi.mock('../TrialCountdownBanner', () => ({
  default: () => null,
}));

vi.mock('../ui/Dropdown', () => ({
  default: ({ children }) => (
    <div data-testid="mock-dropdown">
      {typeof children === 'function' ? children({ close: () => {} }) : children}
    </div>
  ),
  DropdownItem: ({ children }) => <div data-testid="mock-dropdown-item">{children}</div>,
}));

let mockTenantAccess = {
  canViewReports: true,
  isMember: true,
  isStaff: true,
  canWrite: true,
};

vi.mock('../../hooks/useTenantAccess', () => ({
  useTenantAccess: () => mockTenantAccess,
}));

describe('TenantShell Logo & Identity (BRAND-1F.1)', () => {
  beforeEach(() => {
    mockTenantState = {
      activeTenant: {
        id: 't-pv-1',
        name: 'Palm Village RT 05',
        type: 'rt_rw',
        settings: {},
      },
      activeTenantId: 't-pv-1',
      userTenants: [],
      switchTenant: vi.fn(),
      subscriptionStatus: 'active',
      isPlatformAdmin: false,
      isOwner: true,
      userRole: 'admin',
      hasPermission: () => true,
    };
  });

  it('menampilkan elemen img logo tenant jika settings.logo_url aman (/tenants/...)', () => {
    mockTenantState.activeTenant.settings = {
      logo_url: '/tenants/palm-village/logo.png',
    };

    const html = renderShell(['/t/t-pv-1/dashboard']);

    expect(html).toContain('src="/tenants/palm-village/logo.png"');
    expect(html).toContain('alt="Palm Village RT 05"');
    expect(html).not.toContain('🏡');
  });

  it('menolak URI javascript: dan menampilkan fallback emoji template', () => {
    mockTenantState.activeTenant.settings = {
      logo_url: 'javascript:alert(1)',
    };

    const html = renderShell(['/t/t-pv-1/dashboard']);

    expect(html).not.toContain('javascript:alert(1)');
    expect(html).toContain('🏡');
  });

  it('menolak URL HTTP tidak aman dan menampilkan fallback emoji template', () => {
    mockTenantState.activeTenant.settings = {
      logo_url: 'http://evil.test/x.png',
    };

    const html = renderShell(['/t/t-pv-1/dashboard']);

    expect(html).not.toContain('http://evil.test/x.png');
    expect(html).toContain('🏡');
  });
});

describe('TenantShell Navigation (RTRW-1.2)', () => {
  beforeEach(() => {
    mockTenantState = {
      activeTenant: {
        id: 't-pv-1',
        name: 'Palm Village RT 05',
        type: 'rt_rw',
        settings: {},
      },
      activeTenantId: 't-pv-1',
      userTenants: [],
      switchTenant: vi.fn(),
      subscriptionStatus: 'active',
      isPlatformAdmin: false,
      isOwner: true,
      userRole: 'admin',
      hasPermission: () => true,
    };
    mockTenantAccess = {
      canViewReports: true,
      isMember: true,
      isStaff: true,
      canWrite: true,
    };
  });

  it('tidak memuat link /residents tanpa prefix /t/, melainkan ke /t/:tenantId/residents', () => {
    const html = renderShell(['/t/t-pv-1/dashboard']);
    expect(html).toContain('href="/t/t-pv-1/residents"');
    expect(html).not.toMatch(/href="\/residents"/);
  });

  it('menyembunyikan menu Pengeluaran dan Laporan jika canViewReports false', () => {
    mockTenantAccess = { canViewReports: false, isMember: true, isStaff: false, canWrite: false };
    const html = renderShell(['/t/t-pv-1/dashboard']);
    expect(html).not.toContain('href="/t/t-pv-1/expenses"');
    expect(html).not.toContain('href="/t/t-pv-1/reports"');
  });

  it('menampilkan menu Pengeluaran dan Laporan jika canViewReports true', () => {
    mockTenantAccess = { canViewReports: true, isMember: true, isStaff: true, canWrite: true };
    const html = renderShell(['/t/t-pv-1/dashboard']);
    expect(html).toContain('href="/t/t-pv-1/expenses"');
    expect(html).toContain('href="/t/t-pv-1/reports"');
  });

  it('menampilkan menu Pengumuman untuk semua anggota (/t/:tenantId/announcements)', () => {
    const html = renderShell(['/t/t-pv-1/dashboard']);
    expect(html).toContain('href="/t/t-pv-1/announcements"');
    expect(html).toContain('Pengumuman');
  });

  it('menampilkan menu Acara untuk semua anggota (/t/:tenantId/events)', () => {
    const html = renderShell(['/t/t-pv-1/dashboard']);
    expect(html).toContain('href="/t/t-pv-1/events"');
    expect(html).toContain('Acara');
  });

  it('menampilkan item "Jabatan & Hak Akses" bila user adalah owner atau memiliki izin manage_tenant_users', () => {
    mockTenantState.isOwner = true;
    mockTenantState.hasPermission = () => false;

    const htmlOwner = renderShell(['/t/t-pv-1/dashboard']);
    expect(htmlOwner).toContain('Jabatan &amp; Hak Akses');

    mockTenantState.isOwner = false;
    mockTenantState.hasPermission = (p) => p === 'manage_tenant_users';

    const htmlManager = renderShell(['/t/t-pv-1/dashboard']);
    expect(htmlManager).toContain('Jabatan &amp; Hak Akses');
  });

  it('menyembunyikan item "Jabatan & Hak Akses" bila user bukan owner dan tidak punya manage_tenant_users', () => {
    mockTenantState.isOwner = false;
    mockTenantState.hasPermission = (p) => p === 'manage_settings';

    const html = renderShell(['/t/t-pv-1/dashboard']);
    expect(html).not.toContain('Jabatan &amp; Hak Akses');
  });

  describe('PANITIA-1.8: Navigasi Acara dan Pemasukan', () => {
    it('TenantShell panitia menampilkan Acara dan Pemasukan, tanpa Unit dan tanpa tagihan', () => {
      mockTenantState.activeTenant = {
        id: 't-panitia-1',
        name: 'Panitia PenSi 2026',
        type: 'panitia',
        settings: {},
      };
      mockTenantState.activeTenantId = 't-panitia-1';
      mockTenantAccess.canViewReports = true;

      const html = renderShell(['/t/t-panitia-1/dashboard']);

      // Link kedua menjadi Acara (/programs)
      expect(html).toContain('href="/t/t-panitia-1/programs"');
      expect(html).toContain('Acara');

      // Pemasukan tampil di sebelah Pengeluaran
      expect(html).toContain('href="/t/t-panitia-1/incomes"');
      expect(html).toContain('Pemasukan');
      expect(html).toContain('href="/t/t-panitia-1/expenses"');

      // Unit dan tagihan disembunyikan
      expect(html).not.toContain('href="/t/t-panitia-1/units"');
      expect(html).not.toContain('href="/t/t-panitia-1/payment-matrix"');
    });

    it('TenantShell RT/RW tetap seperti sekarang ditambah Pemasukan', () => {
      mockTenantState.activeTenant = {
        id: 't-rtrw-1',
        name: 'Palm Village RT 05',
        type: 'rt_rw',
        settings: {},
      };
      mockTenantState.activeTenantId = 't-rtrw-1';
      mockTenantAccess.canViewReports = true;

      const html = renderShell(['/t/t-rtrw-1/dashboard']);

      // Menampilkan tagihan/payment-matrix dan unit
      expect(html).toContain('href="/t/t-rtrw-1/payment-matrix"');
      expect(html).toContain('href="/t/t-rtrw-1/units"');

      // Ditambah Pemasukan
      expect(html).toContain('href="/t/t-rtrw-1/incomes"');
      expect(html).toContain('Pemasukan');
    });

    it('PANITIA-1F.2: menyembunyikan header, banner langganan, dan bottom nav ponsel saat dicetak (print:hidden)', () => {
      mockTenantState.activeTenant = {
        id: 't-panitia-1',
        name: 'Panitia Lomba',
        type: 'panitia',
      };
      mockTenantState.activeTenantId = 't-panitia-1';

      const html = renderShell(['/t/t-panitia-1/dashboard']);

      // Header sticky memiliki print:hidden
      expect(html).toMatch(/<header[^>]*print:hidden/);
      // Banner wrapper memiliki print:hidden
      expect(html).toContain('class="print:hidden"');
      // Nav ponsel memiliki print:hidden
      expect(html).toMatch(/<nav[^>]*print:hidden[^>]*aria-label="Navigasi Komunitas Ponsel"/);
    });

    it('PANITIA-2.5: link Verifikasi tampil untuk bendahara panitia', () => {
      mockTenantState.activeTenant = {
        id: 't-panitia-1',
        name: 'Panitia Pentas Seni',
        type: 'panitia',
      };
      mockTenantState.activeTenantId = 't-panitia-1';
      mockTenantAccess.canVerifyPayments = true;

      const html = renderShell(['/t/t-panitia-1/dashboard']);

      // Link verifikasi muncul di navigasi desktop & drawer
      expect(html).toContain('href="/t/t-panitia-1/payment-verification"');
      expect(html).toContain('Verifikasi');

      // Bila canVerifyPayments = false, link verifikasi tidak tampil
      mockTenantAccess.canVerifyPayments = false;
      const htmlNoVerify = renderShell(['/t/t-panitia-1/dashboard']);
      expect(htmlNoVerify).not.toContain('href="/t/t-panitia-1/payment-verification"');
    });

    it('ARISAN-1.5: link "Setoran Saya" tampil untuk tenant arisan dan tidak untuk RT/RW', () => {
      // 1. Tenant Arisan
      mockTenantState.activeTenant = {
        id: 't-arisan-1',
        name: 'Arisan Dahlia',
        type: 'arisan',
        settings: {},
      };
      mockTenantState.activeTenantId = 't-arisan-1';

      const arisanHtml = renderShell(['/t/t-arisan-1/dashboard']);

      expect(arisanHtml).toContain('href="/t/t-arisan-1/arisan/my"');
      expect(arisanHtml).toContain('Setoran Saya');

      // 2. Tenant RT/RW
      mockTenantState.activeTenant = {
        id: 't-rtrw-1',
        name: 'Palm Village RT 05',
        type: 'rt_rw',
        settings: {},
      };
      mockTenantState.activeTenantId = 't-rtrw-1';

      const rtrwHtml = renderShell(['/t/t-rtrw-1/dashboard']);

      expect(rtrwHtml).not.toContain('href="/t/t-rtrw-1/arisan/my"');
      expect(rtrwHtml).not.toContain('Setoran Saya');
    });

    describe('LIST-UI-1.1: Menu Iklan Tenant Kos', () => {
      it('menu "Iklan" tampil untuk owner kos', () => {
        mockTenantState.activeTenant = {
          id: 't-kos-1',
          name: 'Kos Harmoni',
          type: 'kos',
          settings: {},
        };
        mockTenantState.activeTenantId = 't-kos-1';
        mockTenantState.isOwner = true;
        mockTenantState.hasPermission = () => true;

        const html = renderShell(['/t/t-kos-1/dashboard']);

        expect(html).toContain('href="/t/t-kos-1/listings"');
        expect(html).toContain('Iklan');
      });

      it('menu "Iklan" tampil untuk staf kos dengan izin post_listing', () => {
        mockTenantState.activeTenant = {
          id: 't-kos-1',
          name: 'Kos Harmoni',
          type: 'kos',
          settings: {},
        };
        mockTenantState.activeTenantId = 't-kos-1';
        mockTenantState.isOwner = false;
        mockTenantState.hasPermission = (key) => key === 'post_listing';

        const html = renderShell(['/t/t-kos-1/dashboard']);

        expect(html).toContain('href="/t/t-kos-1/listings"');
        expect(html).toContain('Iklan');
      });

      it('menu "Iklan" TIDAK tampil untuk penyewa biasa (tanpa izin post_listing dan bukan owner)', () => {
        mockTenantState.activeTenant = {
          id: 't-kos-1',
          name: 'Kos Harmoni',
          type: 'kos',
          settings: {},
        };
        mockTenantState.activeTenantId = 't-kos-1';
        mockTenantState.isOwner = false;
        mockTenantState.hasPermission = () => false;

        const html = renderShell(['/t/t-kos-1/dashboard']);

        expect(html).not.toContain('href="/t/t-kos-1/listings"');
      });

      it('menu "Iklan" TIDAK tampil untuk tenant RT/RW meskipun owner', () => {
        mockTenantState.activeTenant = {
          id: 't-rtrw-1',
          name: 'Palm Village RT 05',
          type: 'rt_rw',
          settings: {},
        };
        mockTenantState.activeTenantId = 't-rtrw-1';
        mockTenantState.isOwner = true;
        mockTenantState.hasPermission = () => true;

        const html = renderShell(['/t/t-rtrw-1/dashboard']);

        expect(html).not.toContain('href="/t/t-rtrw-1/listings"');
      });
    });

    describe('KOS-5.2b: Menu Pengingat dan Tunggakan untuk Tenant Kos', () => {
      it('menu "Pengingat" dan "Tunggakan" tampil untuk owner kos', () => {
        mockTenantState.activeTenant = {
          id: 't-kos-1',
          name: 'Kos Sejahtera',
          type: 'kos',
          settings: {},
        };
        mockTenantState.activeTenantId = 't-kos-1';
        mockTenantState.isOwner = true;
        mockTenantState.hasPermission = () => true;

        const html = renderShell(['/t/t-kos-1/dashboard']);

        expect(html).toContain('href="/t/t-kos-1/reminders"');
        expect(html).toContain('Pengingat');
        expect(html).toContain('href="/t/t-kos-1/arrears"');
        expect(html).toContain('Tunggakan');
      });

      it('menu "Pengingat" dan "Tunggakan" tampil untuk staf kos dengan izin generate_billing', () => {
        mockTenantState.activeTenant = {
          id: 't-kos-1',
          name: 'Kos Sejahtera',
          type: 'kos',
          settings: {},
        };
        mockTenantState.activeTenantId = 't-kos-1';
        mockTenantState.isOwner = false;
        mockTenantState.hasPermission = (key) => key === 'generate_billing';

        const html = renderShell(['/t/t-kos-1/dashboard']);

        expect(html).toContain('href="/t/t-kos-1/reminders"');
        expect(html).toContain('Pengingat');
        expect(html).toContain('href="/t/t-kos-1/arrears"');
        expect(html).toContain('Tunggakan');
      });

      it('menu "Pengingat" dan "Tunggakan" TIDAK tampil untuk penyewa biasa (tanpa izin generate_billing)', () => {
        mockTenantState.activeTenant = {
          id: 't-kos-1',
          name: 'Kos Sejahtera',
          type: 'kos',
          settings: {},
        };
        mockTenantState.activeTenantId = 't-kos-1';
        mockTenantState.isOwner = false;
        mockTenantState.hasPermission = () => false;

        const html = renderShell(['/t/t-kos-1/dashboard']);

        expect(html).not.toContain('href="/t/t-kos-1/reminders"');
        expect(html).not.toContain('href="/t/t-kos-1/arrears"');
      });

      it('menu "Pengingat" dan "Tunggakan" TIDAK tampil untuk tenant RT/RW meskipun owner', () => {
        mockTenantState.activeTenant = {
          id: 't-rtrw-1',
          name: 'Palm Village RT 05',
          type: 'rt_rw',
          settings: {},
        };
        mockTenantState.activeTenantId = 't-rtrw-1';
        mockTenantState.isOwner = true;
        mockTenantState.hasPermission = () => true;

        const html = renderShell(['/t/t-rtrw-1/dashboard']);

        expect(html).not.toContain('href="/t/t-rtrw-1/reminders"');
        expect(html).not.toContain('href="/t/t-rtrw-1/arrears"');
      });
    });
  });
});
