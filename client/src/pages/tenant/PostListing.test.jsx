// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PostListing from './PostListing';
import * as tenantOps from '../../services/tenantOperationalService';
import * as listingService from '../../services/publicListingService';

let mockTenantState = {
  activeTenant: {
    id: 'tenant-kos-1',
    name: 'Kos Harmoni Melati',
    type: 'kos',
    contact_phone: '081234567890',
    address: 'Jl. Kaliurang KM 5 Gang Megatruh',
  },
  activeTenantId: 'tenant-kos-1',
  tenantType: 'kos',
  isTenantAdmin: true,
};

const mockToast = {
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({
    isReadOnly: false,
    canTransact: true,
    tooltip: null,
    redirectToRenewal: vi.fn(),
    isTenantAdmin: true,
  }),
}));

vi.mock('../../services/tenantOperationalService', () => ({
  fetchTenantUnits: vi.fn(),
  fetchTenantDetails: vi.fn(),
}));

vi.mock('../../services/publicListingService', () => ({
  fetchListingPricing: vi.fn(),
  getPricingForListing: vi.fn(),
  createPublicListing: vi.fn(),
  createListingPayment: vi.fn(),
  verifyListingPayment: vi.fn(),
}));

describe('PostListing Component (LIST-UI-1.5: Prefill & Occupied Protection)', () => {
  const sampleKosUnits = [
    {
      id: 101,
      tenant_id: 'tenant-kos-1',
      label: 'Kamar 101 (Lantai 1)',
      unit_number: '101',
      status: 'occupied',
      is_occupied: true,
      metadata: {
        default_rent_price: 1500000,
        facilities: ['AC', 'WiFi', 'Kamar Mandi Dalam'],
      },
    },
    {
      id: 102,
      tenant_id: 'tenant-kos-1',
      label: 'Kamar 102 (Lantai 1)',
      unit_number: '102',
      status: 'vacant',
      is_occupied: false,
      metadata: {
        default_rent_price: 1250000,
        facilities: ['AC', 'WiFi', 'Kasur Springbed', 'Meja Belajar'],
        category: 'Putri',
      },
    },
    {
      id: 103,
      tenant_id: 'tenant-kos-1',
      label: 'Kamar 103 (Lantai 2)',
      unit_number: '103',
      status: 'vacant',
      is_occupied: false,
      metadata: {
        rent_price: 950000,
        facilities: 'Kipas Angin, Lemari, WiFi',
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantState = {
      activeTenant: {
        id: 'tenant-kos-1',
        name: 'Kos Harmoni Melati',
        type: 'kos',
        contact_phone: '081234567890',
        address: 'Jl. Kaliurang KM 5 Gang Megatruh',
      },
      activeTenantId: 'tenant-kos-1',
      tenantType: 'kos',
      isTenantAdmin: true,
    };

    tenantOps.fetchTenantUnits.mockResolvedValue(sampleKosUnits);
    tenantOps.fetchTenantDetails.mockResolvedValue(mockTenantState.activeTenant);
    listingService.fetchListingPricing.mockResolvedValue([
      { type: 'room_vacancy', is_featured: false, price: 15000, duration_days: 30 },
      { type: 'room_vacancy', is_featured: true, price: 35000, duration_days: 30 },
    ]);
    listingService.getPricingForListing.mockImplementation((_, opts) => {
      return { price: opts?.isFeatured ? 35000 : 15000, duration_days: 30 };
    });
    listingService.createPublicListing.mockResolvedValue({ id: 'listing-new-123' });
    listingService.createListingPayment.mockResolvedValue({
      paymentId: 'pay-123',
      gatewayRef: 'ref-123',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('melakukan prefill judul, harga default_rent_price, fasilitas, dan category bila URL memiliki ?unitId=', async () => {
    render(
      <MemoryRouter initialEntries={['/t/tenant-kos-1/listings/post?unitId=102']}>
        <Routes>
          <Route path="/t/:tenantId/listings/post" element={<PostListing />} />
        </Routes>
      </MemoryRouter>
    );

    // Tunggu data unit selesai dimuat dan prefill terisi
    await waitFor(() => {
      expect(screen.getByLabelText(/Judul Iklan/i).value).toBe('Kamar 102 (Lantai 1) – Kos Harmoni Melati');
    });

    const titleInput = screen.getByLabelText(/Judul Iklan/i);
    const priceInput = screen.getByPlaceholderText('0');
    const descInput = screen.getByPlaceholderText(/Jelaskan fasilitas kamar/i);
    const categorySelect = screen.getByTestId('select-category');
    const unitSelect = screen.getByTestId('select-unit');

    // 1. Judul: "<label kamar> – <nama kos>"
    expect(titleInput.value).toBe('Kamar 102 (Lantai 1) – Kos Harmoni Melati');

    // 2. Harga: dari metadata.default_rent_price
    expect(priceInput.value).toBe('1250000');

    // 3. Category: Putri (dari metadata.category kamar)
    expect(categorySelect.value).toBe('Putri');

    // 4. Unit ID terpilih
    expect(unitSelect.value).toBe('102');

    // 5. Fasilitas kamar ditampilkan di kotak visual
    expect(screen.getByTestId('unit-facilities-box')).toBeTruthy();
    expect(screen.getByText('AC')).toBeTruthy();
    expect(screen.getByText('Kasur Springbed')).toBeTruthy();
    expect(screen.getByText('Meja Belajar')).toBeTruthy();

    // 6. Fasilitas otomatis disertakan ke dalam teks deskripsi
    expect(descInput.value).toContain('AC, WiFi, Kasur Springbed, Meja Belajar');
  });

  it('melakukan prefill harga alternatif dari metadata.rent_price bila default_rent_price tidak ada', async () => {
    render(
      <MemoryRouter initialEntries={['/t/tenant-kos-1/listings/post?unitId=103']}>
        <Routes>
          <Route path="/t/:tenantId/listings/post" element={<PostListing />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Judul Iklan/i).value).toBe('Kamar 103 (Lantai 2) – Kos Harmoni Melati');
    });

    const titleInput = screen.getByLabelText(/Judul Iklan/i);
    const priceInput = screen.getByPlaceholderText('0');
    const descInput = screen.getByPlaceholderText(/Jelaskan fasilitas kamar/i);

    expect(titleInput.value).toBe('Kamar 103 (Lantai 2) – Kos Harmoni Melati');
    expect(priceInput.value).toBe('950000');
    expect(descInput.value).toContain('Kipas Angin, Lemari, WiFi');
  });

  it('memungkinkan pengguna mengubah nilai prefill tanpa tertimpa saat component re-render', async () => {
    render(
      <MemoryRouter initialEntries={['/t/tenant-kos-1/listings/post?unitId=102']}>
        <Routes>
          <Route path="/t/:tenantId/listings/post" element={<PostListing />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Judul Iklan/i).value).toBe('Kamar 102 (Lantai 1) – Kos Harmoni Melati');
    });

    const titleInput = screen.getByLabelText(/Judul Iklan/i);
    const priceInput = screen.getByPlaceholderText('0');
    const categorySelect = screen.getByTestId('select-category');

    // Pengguna mengedit judul dan harga
    fireEvent.change(titleInput, { target: { value: 'Kamar 102 Spesial Mahasiswi Kedokteran' } });
    fireEvent.change(priceInput, { target: { value: '1350000' } });
    fireEvent.change(categorySelect, { target: { value: 'Campur' } });

    // Verifikasi perubahan pengguna tetap tersimpan
    expect(titleInput.value).toBe('Kamar 102 Spesial Mahasiswi Kedokteran');
    expect(priceInput.value).toBe('1350000');
    expect(categorySelect.value).toBe('Campur');
  });

  it('menolak kamar yang berstatus occupied: menampilkan peringatan dan menonaktifkan submit iklan', async () => {
    render(
      <MemoryRouter initialEntries={['/t/tenant-kos-1/listings/post?unitId=101']}>
        <Routes>
          <Route path="/t/:tenantId/listings/post" element={<PostListing />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('occupied-unit-alert')).toBeTruthy();
    });

    // Peringatan occupied tampil di layar
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Kamar Sedang Terisi \(Occupied\)/i)).toBeTruthy();

    // Tombol submit harus dalam status disabled
    const submitBtn = screen.getByRole('button', { name: /Lanjut ke Pembayaran/i });
    expect(submitBtn.hasAttribute('disabled')).toBe(true);

    // Memastikan createPublicListing tidak pernah dipanggil
    fireEvent.click(submitBtn);
    expect(listingService.createPublicListing).not.toHaveBeenCalled();
  });

  it('menyimpan category terpilih (Putra / Putri / Campur) dan unit_id saat konfirmasi iklan', async () => {
    render(
      <MemoryRouter initialEntries={['/t/tenant-kos-1/listings/post?unitId=102']}>
        <Routes>
          <Route path="/t/:tenantId/listings/post" element={<PostListing />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Judul Iklan/i).value).toBeTruthy();
    });

    // Pilih kategori Putra
    const categorySelect = screen.getByTestId('select-category');
    fireEvent.change(categorySelect, { target: { value: 'Putra' } });

    // Buka modal checkout
    const submitBtn = screen.getByRole('button', { name: /Lanjut ke Pembayaran/i });
    fireEvent.click(submitBtn);

    // Verifikasi modal checkout terbuka
    await waitFor(() => {
      expect(screen.getByText(/Konfirmasi & Pembayaran Iklan/i)).toBeTruthy();
    });

    // Klik tombol bayar & terbitkan
    const confirmBtn = screen.getByRole('button', { name: /Bayar .* & Terbitkan/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(listingService.createPublicListing).toHaveBeenCalledWith(
        'tenant-kos-1',
        expect.objectContaining({
          unit_id: 102,
          category: 'Putra',
          title: 'Kamar 102 (Lantai 1) – Kos Harmoni Melati',
          price: 1250000,
          type: 'room_vacancy',
          facilities: ['AC', 'WiFi', 'Kasur Springbed', 'Meja Belajar'],
        })
      );
    });
  });

  it('isolasi tenant: menolak dan mereset prefill jika unitId bukan milik tenant aktif', async () => {
    render(
      <MemoryRouter initialEntries={['/t/tenant-kos-1/listings/post?unitId=999']}>
        <Routes>
          <Route path="/t/:tenantId/listings/post" element={<PostListing />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringMatching(/bukan milik kos ini|tidak ditemukan/i)
      );
    });

    const unitSelect = screen.getByTestId('select-unit');
    expect(unitSelect.value).toBe('');
    expect(screen.getByLabelText(/Judul Iklan/i).value).toBe('');
  });
});
