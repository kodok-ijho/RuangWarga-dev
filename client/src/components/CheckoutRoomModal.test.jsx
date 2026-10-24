// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import CheckoutRoomModal from './CheckoutRoomModal';
import * as tenantOps from '../services/tenantOperationalService';

const mockToast = {
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../services/tenantOperationalService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchTenantUnits: vi.fn(),
    fetchActiveContractByUnit: vi.fn(),
    fetchTenantBillingItems: vi.fn(),
    checkoutKosRoom: vi.fn(),
  };
});

describe('CheckoutRoomModal (KOS-2.6)', () => {
  const tenantId = 'demo-tenant-kos';
  const mockUnits = [
    {
      id: 101,
      label: 'Kamar 101',
      status: 'occupied',
      metadata: { rent_price: 1500000 },
    },
    {
      id: 102,
      label: 'Kamar 102',
      status: 'vacant',
    },
  ];

  const mockContract = {
    id: 'contract-101',
    tenant_id: tenantId,
    unit_id: 101,
    tenant_name: 'Dhani Mahasiswa',
    rent_price: 1500000,
    start_date: '2026-10-19',
    end_date: null,
    grace_days: 10,
    status: 'active',
    notes: 'Penyewa reguler',
  };

  const mockUnpaidBills = [
    {
      id: 'bill-1',
      tenant_id: tenantId,
      unit_id: 101,
      period: '2026-10',
      amount: 1500000,
      due_date: '2026-10-29',
      status: 'unpaid',
      metadata: {
        service_start: '2026-10-19',
        service_end: '2026-11-18',
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    tenantOps.fetchTenantUnits.mockResolvedValue(mockUnits);
    tenantOps.fetchActiveContractByUnit.mockResolvedValue(mockContract);
    tenantOps.fetchTenantBillingItems.mockResolvedValue(mockUnpaidBills);
    tenantOps.checkoutKosRoom.mockResolvedValue({
      success: true,
      unit_id: 101,
      unit_label: 'Kamar 101',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('merender info kontrak aktif dan peringatan tunggakan tagihan belum lunas', async () => {
    render(
      <CheckoutRoomModal
        isOpen={true}
        onClose={vi.fn()}
        tenantId={tenantId}
        initialUnitId={101}
      />
    );

    // Pastikan kamar dan kontrak aktif termuat
    await waitFor(() => {
      expect(screen.getAllByText('Dhani Mahasiswa').length).toBeGreaterThan(0);
      expect(screen.getByText(/Bulanan \(berjalan terus\)/i)).toBeTruthy();
    });

    // Verifikasi peringatan tunggakan tampil
    expect(await screen.findByTestId('unpaid-bills-warning')).toBeTruthy();
    expect(screen.getByText(/Peringatan: Terdapat 1 Tagihan Belum Lunas/i)).toBeTruthy();
    expect(screen.getAllByText(/1\.500\.000/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Periode 2026-10/i)).toBeTruthy();

    // Verifikasi tombol submit tidak terblokir
    const submitBtn = screen.getByRole('button', { name: /Konfirmasi Checkout/i });
    expect(submitBtn.disabled).toBe(false);
  });

  it('menampilkan indikator lunas jika tidak ada tunggakan tagihan', async () => {
    tenantOps.fetchTenantBillingItems.mockResolvedValue([
      {
        id: 'bill-paid',
        unit_id: 101,
        period: '2026-09',
        amount: 1500000,
        status: 'paid',
      },
    ]);

    render(
      <CheckoutRoomModal
        isOpen={true}
        onClose={vi.fn()}
        tenantId={tenantId}
        initialUnitId={101}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Tidak ada tunggakan tagihan sewa yang belum lunas/i)).toBeTruthy();
    });

    expect(screen.queryByTestId('unpaid-bills-warning')).toBeNull();
  });

  it('memproses checkout kamar tanpa window.confirm dan memanggil onSuccess', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <CheckoutRoomModal
        isOpen={true}
        onClose={handleClose}
        tenantId={tenantId}
        initialUnitId={101}
        onSuccess={handleSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Dhani Mahasiswa').length).toBeGreaterThan(0);
    });

    const submitBtn = screen.getByRole('button', { name: /Konfirmasi Checkout/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOps.checkoutKosRoom).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          unitId: 101,
          cancelFutureBills: true,
        })
      );
      expect(handleSuccess).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
