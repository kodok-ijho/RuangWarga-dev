// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MyListings from './MyListings';
import * as listingService from '../../services/publicListingService';

let mockTenantState = {
  activeTenant: { id: 'tenant-kos-1', type: 'kos', name: 'Kos Harmoni' },
  activeTenantId: 'tenant-kos-1',
  tenantType: 'kos',
  isTenantAdmin: true,
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({
    isReadOnly: false,
    canTransact: true,
    tooltip: null,
    redirectToRenewal: vi.fn(),
  }),
}));

vi.mock('../../services/publicListingService', () => ({
  fetchTenantListings: vi.fn(),
  fetchListingPricing: vi.fn(),
  getPricingForListing: vi.fn(),
  createListingPayment: vi.fn(),
  verifyListingPayment: vi.fn(),
  renewListing: vi.fn(),
  deleteListing: vi.fn(),
  updateListingStatus: vi.fn(),
}));

describe('MyListings Component (LIST-UI-1.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listingService.fetchTenantListings.mockResolvedValue([]);
    listingService.fetchListingPricing.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('menampilkan judul "Iklan Saya" dan tombol "Pasang Iklan Kamar" untuk tenant Kos', async () => {
    mockTenantState = {
      activeTenant: { id: 'tenant-kos-1', type: 'kos', name: 'Kos Harmoni' },
      activeTenantId: 'tenant-kos-1',
      tenantType: 'kos',
      isTenantAdmin: true,
    };

    render(
      <MemoryRouter initialEntries={['/t/tenant-kos-1/listings']}>
        <Routes>
          <Route path="/t/:tenantId/listings" element={<MyListings />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Iklan Saya/i })).toBeTruthy();
    });

    const postButton = screen.getAllByRole('link', { name: /Pasang Iklan Kamar/i });
    expect(postButton.length).toBeGreaterThan(0);
    expect(postButton[0].getAttribute('href')).toBe('/t/tenant-kos-1/listings/post');
  });

  it('menampilkan judul "Kelola Iklan & Listing Publik" dan tombol "Pasang Iklan Baru" untuk tenant selain Kos', async () => {
    mockTenantState = {
      activeTenant: { id: 'tenant-rtrw-1', type: 'rt_rw', name: 'Palm Village RT 05' },
      activeTenantId: 'tenant-rtrw-1',
      tenantType: 'rt_rw',
      isTenantAdmin: true,
    };

    render(
      <MemoryRouter initialEntries={['/t/tenant-rtrw-1/listings']}>
        <Routes>
          <Route path="/t/:tenantId/listings" element={<MyListings />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Kelola Iklan & Listing Publik/i })).toBeTruthy();
    });

    const postButton = screen.getAllByRole('link', { name: /Pasang Iklan Baru/i });
    expect(postButton.length).toBeGreaterThan(0);
    expect(postButton[0].getAttribute('href')).toBe('/t/tenant-rtrw-1/listings/post');
  });
});
