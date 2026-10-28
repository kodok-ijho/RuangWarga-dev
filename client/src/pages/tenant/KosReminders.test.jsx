// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import KosReminders from './KosReminders';
import * as collectionsService from '../../services/tenant/collections';
import * as useTenantHook from '../../hooks/useTenant';
import * as useTenantAccessHook from '../../hooks/useTenantAccess';
import * as pushService from '../../services/pushNotifications';
import { ToastProvider } from '../../context/ToastContext';

describe('KosReminders Page (KOS-5.2b)', () => {
  let queryClient;

  const mockRemindersData = [
    {
      id: 'rem-1',
      tenant_id: 'tenant-kos-1',
      bill_id: 'bill-1',
      member_id: 'm1',
      residentName: 'Budi Santoso',
      phone: '081234567891',
      stage: 'h-3',
      remind_date: '2026-10-27',
      status: 'pending',
      amount: 1500000,
      lateFee: 0,
      totalDue: 1500000,
      unit: { id: 'u1', name: '101', label: 'Kamar 101' },
      bill: {
        id: 'bill-1',
        period: '2026-11',
        due_date: '2026-10-30',
        amount: 1500000,
        late_fee: 0,
      },
    },
    {
      id: 'rem-2',
      tenant_id: 'tenant-kos-1',
      bill_id: 'bill-2',
      member_id: 'm2',
      residentName: 'Siti Aminah',
      phone: '081298765432',
      stage: 'h0',
      remind_date: '2026-10-27',
      status: 'pending',
      amount: 1750000,
      lateFee: 0,
      totalDue: 1750000,
      unit: { id: 'u2', name: '102', label: 'Kamar 102' },
      bill: {
        id: 'bill-2',
        period: '2026-10',
        due_date: '2026-10-27',
        amount: 1750000,
        late_fee: 0,
      },
    },
    {
      id: 'rem-3',
      tenant_id: 'tenant-kos-1',
      bill_id: 'bill-3',
      member_id: 'm3',
      residentName: 'Rudi Hermawan',
      phone: null, // Tanpa nomor HP
      stage: 'h+3',
      remind_date: '2026-10-27',
      status: 'pending',
      amount: 1600000,
      lateFee: 30000,
      totalDue: 1630000,
      unit: { id: 'u3', name: '103', label: 'Kamar 103' },
      bill: {
        id: 'bill-3',
        period: '2026-10',
        due_date: '2026-10-24',
        amount: 1600000,
        late_fee: 30000,
      },
    },
    {
      id: 'rem-4',
      tenant_id: 'tenant-kos-1',
      bill_id: 'bill-4',
      member_id: 'm4',
      residentName: 'Dewi Lestari',
      phone: '082198765432',
      stage: 'h+7',
      remind_date: '2026-10-27',
      status: 'pending',
      amount: 2000000,
      lateFee: 70000,
      totalDue: 2070000,
      unit: { id: 'u4', name: '104', label: 'Kamar 104' },
      bill: {
        id: 'bill-4',
        period: '2026-10',
        due_date: '2026-10-20',
        amount: 2000000,
        late_fee: 70000,
      },
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

    vi.spyOn(collectionsService, 'fetchTodayReminders').mockResolvedValue(mockRemindersData);
    vi.spyOn(collectionsService, 'markRentReminder').mockResolvedValue({ success: true });
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
          <MemoryRouter initialEntries={[`/t/${tenantId}/reminders`]}>
            <Routes>
              <Route path="/t/:tenantId/reminders" element={<KosReminders />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
  };

  it('1. Merender daftar pengingat pending dengan label tahap (3 hari lagi, Jatuh tempo hari ini, Terlambat 3 hari, Terlambat 7 hari)', async () => {
    renderComponent();

    expect(await screen.findByText('3 hari lagi')).toBeTruthy();
    expect(screen.getByText('Jatuh tempo hari ini')).toBeTruthy();
    expect(screen.getByText('Terlambat 3 hari')).toBeTruthy();
    expect(screen.getByText('Terlambat 7 hari')).toBeTruthy();

    expect(screen.getByText('Budi Santoso')).toBeTruthy();
    expect(screen.getByText('Siti Aminah')).toBeTruthy();
    expect(screen.getByText('Rudi Hermawan')).toBeTruthy();
    expect(screen.getByText('Dewi Lestari')).toBeTruthy();
  });

  it('2. Menampilkan total (sewa + denda) dan rincian denda jika ada', async () => {
    renderComponent();

    await screen.findByText(/1\.500\.000/);
    expect(screen.getByText(/1\.500\.000/)).toBeTruthy();
    expect(screen.getByText(/1\.750\.000/)).toBeTruthy();
    expect(screen.getByText(/1\.630\.000/)).toBeTruthy();
    expect(screen.getByText(/2\.070\.000/)).toBeTruthy();

    expect(screen.getByText(/Termasuk denda.*30\.000/)).toBeTruthy();
    expect(screen.getByText(/Termasuk denda.*70\.000/)).toBeTruthy();
  });

  it('3. Penyewa tanpa nomor ditandai jelas "Nomor HP belum ada" dan tombol WA disabled', async () => {
    renderComponent();

    await screen.findByText('Rudi Hermawan');
    expect(screen.getByTestId('no-phone-badge').textContent).toContain('Nomor HP belum ada');

    const waBtnNoPhone = screen.getByTestId('wa-btn-rem-3');
    expect(waBtnNoPhone.disabled).toBe(true);
  });

  it('4. Tombol WA membuka wa.me dengan pesan pengingat lalu menandai status pengingat sebagai sent', async () => {
    renderComponent();

    await screen.findByText('Budi Santoso');
    const waBtn = screen.getByTestId('wa-btn-rem-1');
    expect(waBtn.disabled).toBe(false);

    fireEvent.click(waBtn);

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/6281234567891?text='),
      '_blank',
      expect.any(String)
    );

    await waitFor(() => {
      expect(collectionsService.markRentReminder).toHaveBeenCalledWith('rem-1', 'sent');
    });
  });

  it('5. Tombol "Lewati" menandai status pengingat sebagai skipped', async () => {
    renderComponent();

    await screen.findByText('Siti Aminah');
    const skipBtn = screen.getByTestId('skip-btn-rem-2');

    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(collectionsService.markRentReminder).toHaveBeenCalledWith('rem-2', 'skipped');
    });
  });

  it('6. Proteksi akses: jika user tidak memiliki hak owner atau izin generate_billing, tampilkan peringatan akses terbatas', async () => {
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

    expect(await screen.findByText('Akses Terbatas')).toBeTruthy();
    expect(screen.getByText(/hanya dapat diakses oleh Pemilik Kos atau pengurus/i)).toBeTruthy();
  });

  it('7. KOS-5F.2 (Requirement 3): Menampilkan kartu notifikasi push ringkas bila notifikasi belum aktif di perangkat ini', async () => {
    vi.spyOn(pushService, 'isPushSupported').mockReturnValue(true);
    vi.spyOn(pushService, 'getCurrentSubscription').mockResolvedValue(null);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('push-notification-compact-card')).toBeTruthy();
      expect(screen.getByTestId('push-compact-toggle-btn')).toBeTruthy();
      expect(
        screen.getByText(/Notifikasi pemilik: ringkasan pengingat sewa setiap pagi/i)
      ).toBeTruthy();
    });
  });

  it('8. KOS-5F.2 (Requirement 3): Menyembunyikan kartu notifikasi push ringkas bila notifikasi sudah aktif di perangkat ini', async () => {
    vi.spyOn(pushService, 'isPushSupported').mockReturnValue(true);
    vi.spyOn(pushService, 'getCurrentSubscription').mockResolvedValue({
      endpoint: 'https://test.endpoint',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.queryByTestId('push-notification-compact-card')).toBeNull();
    });
  });
});
