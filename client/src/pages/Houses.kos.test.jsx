// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Houses from './Houses';
import * as tenantOps from '../services/tenantOperationalService';
import * as listingService from '../services/publicListingService';
import * as dataService from '../services/dataService';

const mockTenant = {
  id: 'tenant-kos-1',
  name: 'Kos Harmoni',
  type: 'kos',
  settings: {},
};

const mockAuth = {
  role: 'admin',
  session: { access_token: 'fake-token' },
  isReadOnly: false,
};

const mockTenantState = {
  activeTenantId: 'tenant-kos-1',
  activeTenant: mockTenant,
  isOwner: true,
  hasPermission: (perm) => true,
};

const mockTemplate = {
  unitLabel: 'Kamar',
  occupiedUnitLabel: 'Terisi',
  emptyUnitLabel: 'Kosong',
  memberLabel: 'Penyewa',
  billLabel: 'Sewa',
};

const mockToast = {
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

const mockTour = {
  triggerTour: vi.fn(),
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => mockTemplate,
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../context/TourContext', () => ({
  useTour: () => mockTour,
}));

vi.mock('../services/dataService', () => ({
  fetchUnits: vi.fn(),
  upsertUnit: vi.fn(),
  fetchResidents: vi.fn(),
  fetchPayments: vi.fn(),
  fetchIPLSchemas: vi.fn(),
}));

vi.mock('../services/tenantOperationalService', () => ({
  fetchTenantUnits: vi.fn(),
  fetchTenantMembers: vi.fn(),
  updateTenantUnit: vi.fn(),
}));

vi.mock('../services/publicListingService', () => ({
  fetchTenantListings: vi.fn(),
}));

describe('Houses Kos Vacancy Listing (KOS-2.6b)', () => {
  const sampleKosUnits = [
    {
      id: 1,
      tenant_id: 'tenant-kos-1',
      label: 'Kamar 101',
      block: 'Kamar 101',
      unit_number: '101',
      status: 'occupied',
      is_occupied: true,
      metadata: { rent_price: 1500000 },
    },
    {
      id: 2,
      tenant_id: 'tenant-kos-1',
      label: 'Kamar 102',
      block: 'Kamar 102',
      unit_number: '102',
      status: 'vacant',
      is_occupied: false,
      metadata: { rent_price: 1500000 },
    },
    {
      id: 3,
      tenant_id: 'tenant-kos-1',
      label: 'Kamar 103',
      block: 'Kamar 103',
      unit_number: '103',
      status: 'vacant',
      is_occupied: false,
      metadata: { rent_price: 1500000 },
    },
  ];

  const sampleListings = [
    {
      id: 'lst-102',
      tenant_id: 'tenant-kos-1',
      unit_id: 2,
      status: 'active',
      title: 'Kamar 102 - Nyaman & Bersih',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenant.type = 'kos';
    mockAuth.role = 'admin';
    mockTenantState.isOwner = true;
    mockTenantState.hasPermission = () => true;
    mockTenantState.activeTenant = mockTenant;
    dataService.fetchUnits.mockResolvedValue(sampleKosUnits);
    dataService.fetchIPLSchemas.mockResolvedValue([]);
    dataService.fetchResidents.mockResolvedValue([]);
    dataService.fetchPayments.mockResolvedValue([]);
    tenantOps.fetchTenantUnits.mockResolvedValue(sampleKosUnits);
    tenantOps.fetchTenantMembers.mockResolvedValue([]);
    listingService.fetchTenantListings.mockResolvedValue(sampleListings);
  });

  afterEach(() => {
    cleanup();
  });

  it('menampilkan badge "Diiklankan" untuk kamar kosong yang memiliki iklan aktif, dan tombol "Iklankan" untuk kamar tanpa iklan', async () => {
    render(
      <MemoryRouter>
        <Houses />
      </MemoryRouter>
    );

    // Tunggu data kamar dan badge/aksi iklan termuat
    await waitFor(() => {
      const diiklankanBadges = screen.getAllByRole('button', { name: /^Diiklankan$/i });
      expect(diiklankanBadges.length).toBeGreaterThan(0);
      const iklankanButtons = screen.getAllByRole('button', { name: /^Iklankan$/i });
      expect(iklankanButtons.length).toBeGreaterThan(0);
    });
  });

  it('tombol "Iklankan" hanya muncul di kamar kosong (status !== occupied), kamar occupied tidak memiliki tombol iklan', async () => {
    render(
      <MemoryRouter>
        <Houses />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Kamar 101/101').length).toBeGreaterThan(0);
    });

    // Kamar 101 adalah kamar occupied -> tidak boleh punya tombol Iklankan atau Diiklankan
    // Kamar 103 adalah kamar vacant tanpa listing -> punya tombol Iklankan
    const iklankanButtons = screen.getAllByRole('button', { name: /^Iklankan$/i });
    expect(iklankanButtons.length).toBeGreaterThan(0);

    // Hanya ada 1 kamar kosong tanpa listing (Kamar 103), sehingga tombol Iklankan desktop + mobile = 2
    expect(iklankanButtons.length).toBe(2);
  });

  it('tombol "Iklankan" TIDAK tampil untuk penyewa biasa (tanpa izin post_listing dan bukan owner)', async () => {
    mockTenantState.isOwner = false;
    mockTenantState.hasPermission = () => false;
    mockAuth.role = 'warga';

    render(
      <MemoryRouter>
        <Houses />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Kamar 101/101').length).toBeGreaterThan(0);
    });

    const iklankanButtons = screen.queryAllByRole('button', { name: /^Iklankan$/i });
    expect(iklankanButtons.length).toBe(0);
  });

  it('tombol "Iklankan" TIDAK tampil untuk tenant tipe RT/RW', async () => {
    mockTenant.type = 'rt_rw';
    mockTenantState.isOwner = true;
    mockTenantState.hasPermission = () => true;

    render(
      <MemoryRouter>
        <Houses />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Kamar 101/101').length).toBeGreaterThan(0);
    });

    const iklankanButtons = screen.queryAllByRole('button', { name: /^Iklankan$/i });
    expect(iklankanButtons.length).toBe(0);
  });

  it('tombol "Iklankan" tampil untuk staf kos dengan izin post_listing', async () => {
    mockTenantState.isOwner = false;
    mockTenantState.hasPermission = (p) => p === 'post_listing';
    mockAuth.role = 'anggota';

    render(
      <MemoryRouter>
        <Houses />
      </MemoryRouter>
    );

    await waitFor(() => {
      const iklankanButtons = screen.getAllByRole('button', { name: /^Iklankan$/i });
      expect(iklankanButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Pengecualian Iklan Otomatis Kamar Kos (LIST-AUTO-1.2)', () => {
    it('menampilkan sakelar "Kecualikan dari iklan otomatis" di modal detail kamar dan memanggil updateTenantUnit saat diubah', async () => {
      tenantOps.updateTenantUnit.mockResolvedValueOnce({
        id: 2,
        metadata: { rent_price: 1500000, auto_listing_disabled: true },
      });

      render(
        <MemoryRouter>
          <Houses />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('Kamar 102/102').length).toBeGreaterThan(0);
      });

      // Klik tombol lihat detail Kamar 102 untuk membuka modal detail
      const detailBtn = screen.getByRole('button', { name: /Lihat detail.*102/i });
      fireEvent.click(detailBtn);

      await waitFor(() => {
        expect(screen.getByTestId('auto-listing-disabled-box')).toBeTruthy();
      });

      const toggle = document.getElementById('autoListingDisabledToggle');
      expect(toggle).toBeTruthy();
      expect(toggle.checked).toBe(false);

      // Ubah status sakelar
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(tenantOps.updateTenantUnit).toHaveBeenCalledWith(
          'tenant-kos-1',
          2,
          expect.objectContaining({
            autoListingDisabled: true,
            metadata: expect.objectContaining({
              rent_price: 1500000,
              auto_listing_disabled: true,
            }),
          })
        );
      });
    });

    it('sakelar disabled jika user tidak memiliki izin manage_settings dan bukan owner', async () => {
      mockTenantState.isOwner = false;
      mockTenantState.hasPermission = (p) => p !== 'manage_settings';
      mockAuth.role = 'anggota';

      render(
        <MemoryRouter>
          <Houses />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('Kamar 102/102').length).toBeGreaterThan(0);
      });

      const detailBtn = screen.getByRole('button', { name: /Lihat detail.*102/i });
      fireEvent.click(detailBtn);

      await waitFor(() => {
        expect(screen.getByTestId('auto-listing-disabled-box')).toBeTruthy();
      });

      const toggle = document.getElementById('autoListingDisabledToggle');
      expect(toggle.disabled).toBe(true);
    });
  });
});
