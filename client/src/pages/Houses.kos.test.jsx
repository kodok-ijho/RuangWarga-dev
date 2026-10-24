// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
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

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    role: 'admin',
    session: { access_token: 'fake-token' },
    isReadOnly: false,
  }),
}));

vi.mock('../hooks/useTenant', () => ({
  useTenant: () => ({
    activeTenantId: 'tenant-kos-1',
    activeTenant: mockTenant,
  }),
}));

vi.mock('../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => ({
    unitLabel: 'Kamar',
    occupiedUnitLabel: 'Terisi',
    emptyUnitLabel: 'Kosong',
    memberLabel: 'Penyewa',
    billLabel: 'Sewa',
  }),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../context/TourContext', () => ({
  useTour: () => ({
    triggerTour: vi.fn(),
  }),
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
    });

    // Kamar 103 tanpa iklan -> tombol "Iklankan" muncul (bukan Diiklankan)
    const iklankanButtons = screen.getAllByRole('button', { name: /^Iklankan$/i });
    expect(iklankanButtons.length).toBeGreaterThan(0);
  });
});
