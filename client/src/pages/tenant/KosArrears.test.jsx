// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import KosArrears from './KosArrears';
import * as collectionsService from '../../services/tenant/collections';
import * as useTenantHook from '../../hooks/useTenant';
import * as useTenantAccessHook from '../../hooks/useTenantAccess';
import { ToastProvider } from '../../context/ToastContext';

describe('KosArrears Page (KOS-5.2b)', () => {
  let queryClient;

  const mockArrearsData = [
    {
      member_id: 'm1',
      nama: 'Rudi Hermawan',
      unit: 'Kamar 103',
      total_due: 1630000,
      bills_count: 1,
      oldest_due_date: '2026-10-24',
      days_late: 3,
      bucket: '0-7',
      phone: null,
    },
    {
      member_id: 'm2',
      nama: 'Dewi Lestari',
      unit: 'Kamar 104',
      total_due: 2070000,
      bills_count: 1,
      oldest_due_date: '2026-10-20',
      days_late: 7,
      bucket: '0-7',
      phone: '082198765432',
    },
    {
      member_id: 'm3',
      nama: 'Ahmad Fauzi',
      unit: 'Kamar 105',
      total_due: 3200000,
      bills_count: 2,
      oldest_due_date: '2026-10-10',
      days_late: 17,
      bucket: '8-30',
      phone: '081345678901',
    },
    {
      member_id: 'm4',
      nama: 'Hendra Wijaya',
      unit: 'Kamar 106',
      total_due: 5100000,
      bills_count: 3,
      oldest_due_date: '2026-09-10',
      days_late: 47,
      bucket: '>30',
      phone: '081987654321',
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.spyOn(useTenantHook, 'useTenant').mockReturnValue({
      activeTenant: {
        id: 'tenant-kos-1',
        name: 'Kos Bunga Melati',
        type: 'kos',
        settings: {
          bank_account: {
            bank_name: 'BCA',
            account_number: '1234567890',
            account_holder: 'Pemilik Kos',
          },
        },
      },
      isOwner: true,
      hasPermission: vi.fn(() => true),
    });

    vi.spyOn(useTenantAccessHook, 'useTenantAccess').mockReturnValue({
      canGenerateBilling: true,
      isOwner: true,
      loading: false,
    });

    vi.spyOn(collectionsService, 'fetchKosArrears').mockResolvedValue(mockArrearsData);
    vi.spyOn(window, 'open').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderComponent = (tenantId = 'tenant-kos-1') => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/t/${tenantId}/arrears`]}>
            <Routes>
              <Route path="/t/:tenantId/arrears" element={<KosArrears />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
  };

  it('1. Merender ringkasan total per bucket (0-7, 8-30, >30) dan total keseluruhan', async () => {
    renderComponent();

    const grandTotal = await screen.findByText(/12\.000\.000/);
    expect(grandTotal).toBeTruthy();

    const summaryCards = screen.getByTestId('arrears-summary-cards');
    expect(summaryCards.textContent).toContain('Total Tunggakan');
    expect(summaryCards.textContent).toContain('0–7 Hari');
    expect(summaryCards.textContent).toContain('8–30 Hari');
    expect(summaryCards.textContent).toContain('> 30 Hari');
  });

  it('2. Merender tabel per penyewa (nama, kamar, total, jumlah tagihan, terlambat N hari, bucket)', async () => {
    renderComponent();

    await screen.findByText('Rudi Hermawan');

    expect(screen.getByText('Dewi Lestari')).toBeTruthy();
    expect(screen.getByText('Ahmad Fauzi')).toBeTruthy();
    expect(screen.getByText('Hendra Wijaya')).toBeTruthy();

    expect(screen.getByText('Kamar 103')).toBeTruthy();
    expect(screen.getByText('Kamar 104')).toBeTruthy();
    expect(screen.getByText('Kamar 105')).toBeTruthy();
    expect(screen.getByText('Kamar 106')).toBeTruthy();

    expect(screen.getByText('Terlambat 3 hari')).toBeTruthy();
    expect(screen.getByText('Terlambat 7 hari')).toBeTruthy();
    expect(screen.getByText('Terlambat 17 hari')).toBeTruthy();
    expect(screen.getByText('Terlambat 47 hari')).toBeTruthy();
  });

  it('3. Tombol WA membuka wa.me untuk penyewa dengan nomor HP', async () => {
    renderComponent();

    await screen.findByText('Dewi Lestari');
    const waBtn = screen.getByTestId('wa-btn-arrear-1'); // index 1 = Dewi Lestari

    expect(waBtn.disabled).toBe(false);
    fireEvent.click(waBtn);

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/6282198765432?text='),
      '_blank',
      expect.any(String)
    );
  });

  it('4. Tombol WA disabled untuk penyewa tanpa nomor HP', async () => {
    renderComponent();

    await screen.findByText('Rudi Hermawan');
    const waBtn = screen.getByTestId('wa-btn-arrear-0'); // index 0 = Rudi Hermawan (phone: null)

    expect(waBtn.disabled).toBe(true);
  });

  it('5. Proteksi akses: jika user bukan owner dan tidak berizin generate_billing, tampilkan akses terbatas', async () => {
    vi.spyOn(useTenantHook, 'useTenant').mockReturnValue({
      activeTenant: { id: 'tenant-kos-1', type: 'kos' },
      isOwner: false,
      hasPermission: vi.fn(() => false),
    });

    vi.spyOn(useTenantAccessHook, 'useTenantAccess').mockReturnValue({
      canGenerateBilling: false,
      isOwner: false,
      loading: false,
    });

    renderComponent();

    const limitedAccess = await screen.findByText('Akses Terbatas');
    expect(limitedAccess).toBeTruthy();
    expect(screen.getByText(/hanya dapat diakses oleh Pemilik Kos atau pengurus/i)).toBeTruthy();
  });
});
