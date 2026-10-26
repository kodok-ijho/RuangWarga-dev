// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  resumeListingRemaining: vi.fn(),
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

  const renderComponent = (initialEntries = ['/t/tenant-kos-1/listings'], tenantId = 'tenant-kos-1') => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/t/:tenantId/listings" element={<MyListings />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('menampilkan judul "Iklan Saya" dan tombol "Pasang Iklan Kamar" untuk tenant Kos', async () => {
    mockTenantState = {
      activeTenant: { id: 'tenant-kos-1', type: 'kos', name: 'Kos Harmoni' },
      activeTenantId: 'tenant-kos-1',
      tenantType: 'kos',
      isTenantAdmin: true,
    };

    renderComponent(['/t/tenant-kos-1/listings']);

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

    renderComponent(['/t/tenant-rtrw-1/listings'], 'tenant-rtrw-1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Kelola Iklan & Listing Publik/i })).toBeTruthy();
    });

    const postButton = screen.getAllByRole('link', { name: /Pasang Iklan Baru/i });
    expect(postButton.length).toBeGreaterThan(0);
    expect(postButton[0].getAttribute('href')).toBe('/t/tenant-rtrw-1/listings/post');
  });

  describe('Iklan Otomatis & Tayangkan Lagi (LIST-AUTO-1.2)', () => {
    it('menampilkan label "Draf otomatis" untuk listing auto_created', async () => {
      listingService.fetchTenantListings.mockResolvedValue([
        {
          id: 'lst-auto-1',
          tenant_id: 'tenant-kos-1',
          unit_id: 101,
          type: 'room_vacancy',
          title: 'Kamar 101 – Kos Harmoni',
          price: 1200000,
          status: 'pending_payment',
          auto_created: true,
          contact_phone: '081234567890',
        },
      ]);

      renderComponent(['/t/tenant-kos-1/listings']);

      await waitFor(() => {
        expect(screen.getByText('Kamar 101 – Kos Harmoni')).toBeTruthy();
      });

      expect(screen.getByTestId('badge-auto-created')).toBeTruthy();
      expect(screen.getByText('Draf otomatis')).toBeTruthy();
    });

    it('menampilkan "Sisa N hari" dan tombol "Tayangkan lagi" untuk iklan rented_or_sold dengan paused_remaining_seconds > 0', async () => {
      // 200.000 detik = 2.31 hari -> Math.ceil(200000 / 86400) = 3 hari
      const pausedItem = {
        id: 'lst-paused-1',
        tenant_id: 'tenant-kos-1',
        unit_id: 102,
        type: 'room_vacancy',
        title: 'Kamar 102 – Kos Harmoni',
        price: 1500000,
        status: 'rented_or_sold',
        paused_remaining_seconds: 200000,
        contact_phone: '081234567890',
      };
      listingService.fetchTenantListings.mockResolvedValue([pausedItem]);
      listingService.resumeListingRemaining.mockResolvedValue({
        success: true,
        listing_id: 'lst-paused-1',
        status: 'active',
      });

      renderComponent(['/t/tenant-kos-1/listings']);

      await waitFor(() => {
        expect(screen.getByText('Kamar 102 – Kos Harmoni')).toBeTruthy();
      });

      // Tampilkan "Sisa 3 hari"
      expect(screen.getByTestId('badge-paused-remaining')).toBeTruthy();
      expect(screen.getByText(/Sisa 3 hari/i)).toBeTruthy();

      // Tombol "Tayangkan lagi"
      const resumeButtons = screen.getAllByRole('button', { name: /Tayangkan lagi/i });
      expect(resumeButtons.length).toBeGreaterThan(0);

      // Klik tombol Tayangkan lagi
      fireEvent.click(resumeButtons[0]);

      await waitFor(() => {
        expect(listingService.resumeListingRemaining).toHaveBeenCalledWith('lst-paused-1');
      });
    });
  });
});
