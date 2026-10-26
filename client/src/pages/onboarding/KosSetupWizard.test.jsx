// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import KosSetupWizard, { saveKosSetupUnitsAndInvite } from './KosSetupWizard';
import * as tenantOperationalService from '../../services/tenantOperationalService';

// Polyfill ResizeObserver jika diperlukan
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserver;
  global.ResizeObserver = ResizeObserver;
}

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => ({
    activeTenant: { id: 'kos-tenant-123', name: 'Kos Mawar', type: 'kos' },
    activeTenantId: 'kos-tenant-123',
    switchTenant: vi.fn(),
    refreshTenant: vi.fn().mockResolvedValue({}),
    isTenantAdmin: true,
  }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantDetails: vi.fn(),
    fetchTenantUnits: vi.fn(),
    fetchTenantInviteCode: vi.fn(),
    updateTenantProfileAndSettings: vi.fn(),
    bulkCreateTenantUnits: vi.fn(),
    saveInviteCodeWithRetry: vi.fn(),
  };
});

describe('KosSetupWizard - saveKosSetupUnitsAndInvite (VERT-1.4)', () => {
  const TENANT_ID = 'kos-tenant-123';
  const KOS_NAME = 'Kos Mawar Indah';

  let mockFetchUnits;
  let mockCreateUnits;
  let mockFetchCode;
  let mockSaveCode;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchUnits = vi.fn();
    mockCreateUnits = vi.fn().mockResolvedValue([]);
    mockFetchCode = vi.fn();
    mockSaveCode = vi.fn().mockResolvedValue('NEW-INVITE-CODE');
  });

  it('bila fetchTenantUnits mengembalikan Kamar 101 dan wizard berisi Kamar 101 + Kamar 102, bulkCreateTenantUnits hanya menerima Kamar 102', async () => {
    mockFetchUnits.mockResolvedValue([{ id: 1, label: 'Kamar 101' }]);
    mockFetchCode.mockResolvedValue('EXISTING-INVITE-CODE');

    const roomList = [
      { label: 'Kamar 101', price: 1500000, facilities: ['AC', 'WiFi'] },
      { label: 'Kamar 102', price: 1600000, facilities: ['AC', 'WiFi', 'Kamar Mandi Dalam'] },
    ];

    const result = await saveKosSetupUnitsAndInvite({
      tenantId: TENANT_ID,
      roomList,
      kosName: KOS_NAME,
      fetchUnits: mockFetchUnits,
      createUnits: mockCreateUnits,
      fetchCode: mockFetchCode,
      saveCode: mockSaveCode,
    });

    expect(mockFetchUnits).toHaveBeenCalledWith(TENANT_ID);
    expect(mockCreateUnits).toHaveBeenCalledTimes(1);

    const createdArg = mockCreateUnits.mock.calls[0][1];
    expect(createdArg).toHaveLength(1);
    expect(createdArg[0].label).toBe('Kamar 102');
    expect(createdArg[0].status).toBe('vacant');
    expect(createdArg[0].metadata.default_rent_price).toBe(1600000);
    expect(createdArg[0].metadata.facilities).toEqual(['AC', 'WiFi', 'Kamar Mandi Dalam']);

    expect(result.createdCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it('bila fetchTenantInviteCode mengembalikan kode, saveInviteCodeWithRetry tidak dipanggil', async () => {
    mockFetchUnits.mockResolvedValue([]);
    mockFetchCode.mockResolvedValue('EXISTING-INVITE-CODE');

    const roomList = [{ label: 'Kamar 101' }];

    const result = await saveKosSetupUnitsAndInvite({
      tenantId: TENANT_ID,
      roomList,
      kosName: KOS_NAME,
      fetchUnits: mockFetchUnits,
      createUnits: mockCreateUnits,
      fetchCode: mockFetchCode,
      saveCode: mockSaveCode,
    });

    expect(mockFetchCode).toHaveBeenCalledWith(TENANT_ID);
    expect(mockSaveCode).not.toHaveBeenCalled();
    expect(result.savedInviteCode).toBe('EXISTING-INVITE-CODE');
  });

  it('bila fetchTenantInviteCode mengembalikan null, saveInviteCodeWithRetry dipanggil untuk membuat kode baru', async () => {
    mockFetchUnits.mockResolvedValue([]);
    mockFetchCode.mockResolvedValue(null);

    const roomList = [{ label: 'Kamar 101' }];

    const result = await saveKosSetupUnitsAndInvite({
      tenantId: TENANT_ID,
      roomList,
      kosName: KOS_NAME,
      fetchUnits: mockFetchUnits,
      createUnits: mockCreateUnits,
      fetchCode: mockFetchCode,
      saveCode: mockSaveCode,
    });

    expect(mockFetchCode).toHaveBeenCalledWith(TENANT_ID);
    expect(mockSaveCode).toHaveBeenCalledWith(TENANT_ID, KOS_NAME);
    expect(result.savedInviteCode).toBe('NEW-INVITE-CODE');
  });

  it('bila semua kamar sudah ada di database, bulkCreateTenantUnits tidak dipanggil', async () => {
    mockFetchUnits.mockResolvedValue([
      { id: 1, label: 'Kamar 101' },
      { id: 2, label: 'Kamar 102' },
    ]);
    mockFetchCode.mockResolvedValue('CODE-123');

    const roomList = [{ label: 'kamar 101' }, { label: '  Kamar 102 ' }];

    const result = await saveKosSetupUnitsAndInvite({
      tenantId: TENANT_ID,
      roomList,
      kosName: KOS_NAME,
      fetchUnits: mockFetchUnits,
      createUnits: mockCreateUnits,
      fetchCode: mockFetchCode,
      saveCode: mockSaveCode,
    });

    expect(mockCreateUnits).not.toHaveBeenCalled();
    expect(result.createdCount).toBe(0);
    expect(result.skippedCount).toBe(2);
  });

  it('label yang diketik ganda di wizard hanya disisipkan sekali', async () => {
    mockFetchUnits.mockResolvedValue([]);
    mockFetchCode.mockResolvedValue('CODE-123');

    const roomList = [{ label: 'Kamar 103' }, { label: 'kamar 103 ' }, { label: 'Kamar 104' }];

    const result = await saveKosSetupUnitsAndInvite({
      tenantId: TENANT_ID,
      roomList,
      kosName: KOS_NAME,
      fetchUnits: mockFetchUnits,
      createUnits: mockCreateUnits,
      fetchCode: mockFetchCode,
      saveCode: mockSaveCode,
    });

    const createdArg = mockCreateUnits.mock.calls[0][1];
    expect(createdArg.map((r) => r.label)).toEqual(['Kamar 103', 'Kamar 104']);
    expect(result.createdCount).toBe(2);
    expect(result.skippedCount).toBe(1);
  });

  it('KOS-1.3: harga per baris kamar terbawa ke default_rent_price pada metadata kamar', async () => {
    mockFetchUnits.mockResolvedValue([]);
    mockFetchCode.mockResolvedValue('CODE-123');

    const roomList = [
      { label: 'Kamar A1', price: 1200000 },
      { label: 'Kamar A2', price: 1500000 },
      { label: 'Kamar VIP', price: 2000000 },
    ];

    const result = await saveKosSetupUnitsAndInvite({
      tenantId: TENANT_ID,
      roomList,
      kosName: KOS_NAME,
      defaultRentPrice: 1000000,
      fetchUnits: mockFetchUnits,
      createUnits: mockCreateUnits,
      fetchCode: mockFetchCode,
      saveCode: mockSaveCode,
    });

    const createdArg = mockCreateUnits.mock.calls[0][1];
    expect(createdArg).toHaveLength(3);
    expect(createdArg[0].metadata.default_rent_price).toBe(1200000);
    expect(createdArg[1].metadata.default_rent_price).toBe(1500000);
    expect(createdArg[2].metadata.default_rent_price).toBe(2000000);
    expect(result.createdCount).toBe(3);
  });
});

describe('KosSetupWizard Component (KOS-4.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantOperationalService.fetchTenantDetails.mockResolvedValue({
      id: 'kos-tenant-123',
      name: 'Kos Mawar Indah',
      address: 'Jl. Melati No. 5',
      contact_phone: '081234567890',
      type: 'kos',
      settings: {
        bank_account: {
          bank_name: 'BCA',
          account_number: '1234567890',
          account_holder: 'Pengelola Kos Mawar',
        },
      },
    });
    tenantOperationalService.fetchTenantUnits.mockResolvedValue([]);
    tenantOperationalService.fetchTenantInviteCode.mockResolvedValue('INV-KOS-123');
    tenantOperationalService.bulkCreateTenantUnits.mockResolvedValue([]);
    tenantOperationalService.updateTenantProfileAndSettings.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('Langkah 3 menampilkan isian "Tenggat bayar (hari setelah tanggal tagih)" dan menyimpannya ke rent_grace_days', async () => {
    render(
      <MemoryRouter initialEntries={['/onboarding/kos/kos-tenant-123']}>
        <Routes>
          <Route path="/onboarding/kos/:tenantId" element={<KosSetupWizard />} />
        </Routes>
      </MemoryRouter>
    );

    // Langkah 1
    expect(await screen.findByText(/Langkah 1: Identitas Properti Kos/i)).toBeTruthy();
    const lanjutBtn1 = screen.getByRole('button', { name: /Lanjut ke Daftar Kamar/i });
    fireEvent.click(lanjutBtn1);

    // Langkah 2
    expect(await screen.findByText(/Langkah 2: Konfigurasi Kamar Kos/i)).toBeTruthy();
    const lanjutBtn2 = screen.getByRole('button', { name: /Lanjut ke Ketentuan Sewa/i });
    fireEvent.click(lanjutBtn2);

    // Langkah 3
    expect(await screen.findByText(/Langkah 3: Tarif Sewa/i)).toBeTruthy();
    expect(screen.getByText('Tenggat bayar (hari setelah tanggal tagih)')).toBeTruthy();

    // Input tenggat bayar default 10, ubah ke 14
    const graceInput = screen.getByDisplayValue('10');
    fireEvent.change(graceInput, { target: { value: '14' } });
    expect(graceInput.value).toBe('14');

    const lanjutBtn3 = screen.getByRole('button', { name: /Lanjut ke Review/i });
    fireEvent.click(lanjutBtn3);

    // Langkah 4
    expect(await screen.findByText(/Langkah 4: Tinjau & Aktifkan Kos/i)).toBeTruthy();
    expect(screen.getByText(/Tenggat 14 hari/i)).toBeTruthy();

    // Simpan pengaturan
    const simpanBtn = screen.getByRole('button', { name: /Simpan & Aktifkan Kos/i });
    fireEvent.click(simpanBtn);

    await waitFor(() => {
      expect(tenantOperationalService.updateTenantProfileAndSettings).toHaveBeenCalledWith(
        'kos-tenant-123',
        expect.objectContaining({
          settings: expect.objectContaining({
            rent_grace_days: 14,
          }),
        })
      );
    });

    const callArgs = tenantOperationalService.updateTenantProfileAndSettings.mock.calls[0];
    expect(callArgs[1].settings.rent_grace_days).toBe(14);
    expect(callArgs[1].settings.due_day).toBeUndefined();
  });
});
