// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PaymentDetailModal } from './PaymentMatrix';
import * as dataService from '../services/dataService';
import * as tenantOperationalService from '../services/tenantOperationalService';

// Cleanup DOM setelah setiap test (vitest tidak memakai globals)
afterEach(cleanup);

// Polyfill ResizeObserver untuk jsdom jika diperlukan
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserver;
  global.ResizeObserver = ResizeObserver;
}

// Spy toast stabil di luar factory
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

// Mock useTenant
const mockTenantState = {
  activeTenant: { id: 'tenant-rtrw-1', name: 'Kompleks RT 01', type: 'rt_rw' },
  activeTenantId: 'tenant-rtrw-1',
};

vi.mock('../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

// Mock useTenantAccess
const mockTenantAccessState = {
  isStaff: true,
  canVerifyPayments: true,
  canWrite: true,
  canRecordCash: true,
  canRecordTransfer: true,
  canViewReports: true,
};

vi.mock('../hooks/useTenantAccess', () => ({
  useTenantAccess: () => mockTenantAccessState,
}));

// Mock useTenantTemplate: PaymentDetailModal memakai `const { template } = useTenantTemplate()`
const mockTemplate = {
  name: 'Kompleks RT/RW',
  unitLabel: 'Rumah',
  billLabel: 'IPL',
  memberLabel: 'Warga',
  icon: '🏡',
};

vi.mock('../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => ({
    template: mockTemplate,
    ...mockTemplate,
  }),
}));

// Mock useAuth
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'bendahara@example.com' },
    profile: { id: 'u-1', full_name: 'Bendahara Pak RT' },
    isAuthenticated: true,
    role: 'bendahara',
    session: { access_token: 'fake-token' },
  }),
}));

// Mock TourContext
vi.mock('../context/TourContext', () => ({
  useTour: () => ({
    triggerTour: vi.fn(),
  }),
}));

// Mock apiClient
vi.mock('../services/apiClient', () => ({
  portalApiPost: vi.fn(),
}));

// Mock dataService
vi.mock('../services/dataService', async () => {
  const actual = await vi.importActual('../services/dataService');
  return {
    ...actual,
    updatePayment: vi.fn(() => Promise.resolve({ success: true })),
    approveManualPayment: vi.fn(() => Promise.resolve({ success: true })),
    rejectManualPayment: vi.fn(() => Promise.resolve({ success: true })),
    fetchPaymentByBillId: vi.fn(() => Promise.resolve(null)),
    IS_DEMO: false,
  };
});

// Mock tenantOperationalService
vi.mock('../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantPayments: vi.fn(() =>
      Promise.resolve([
        {
          id: 'p-1',
          billing_item_id: 'bill-1',
          amount: 150000,
          status: 'pending_verification',
          method: 'bank_transfer',
          created_at: new Date().toISOString(),
        },
      ])
    ),
  };
});

describe('PaymentDetailModal Tenant Mode (RTRW-1F.2)', () => {
  const createDefaultProps = () => {
    const onRefresh = vi.fn();
    const onClose = vi.fn();
    return {
      bill: {
        id: 'bill-1',
        payment_id: 'p-1',
        amount: 150000,
        period: '2026-10',
        status: 'pending',
      },
      payment: {
        id: 'p-1',
        status: 'pending_verification',
        method: 'bank_transfer',
        amount: 150000,
      },
      session: { access_token: 'fake-token' },
      profile: { full_name: 'Bendahara Pak RT' },
      onRefresh,
      onClose,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantState.activeTenantId = 'tenant-rtrw-1';
    mockTenantState.activeTenant = { id: 'tenant-rtrw-1', name: 'Kompleks RT 01', type: 'rt_rw' };
  });

  it('1. checkbox markCompleted tercentang (default) -> approveManualPayment dipanggil dengan tenantId, payment_id, verifiedBy SETELAH updatePayment; toast.success LUNAS', async () => {
    const props = createDefaultProps();
    render(<PaymentDetailModal {...props} />);

    // Buka form edit
    const editBtn = screen.getByRole('button', { name: /Perbaiki \/ Edit Transaksi/i });
    fireEvent.click(editBtn);

    // Verifikasi checkbox default tercentang
    const checkbox = screen.getByRole('checkbox', { name: /Langsung verifikasi & selesaikan transaksi/i });
    expect(checkbox.checked).toBe(true);

    // Simpan perbaikan transaksi
    const submitBtn = screen.getByRole('button', { name: /Simpan Perbaikan Transaksi/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dataService.approveManualPayment).toHaveBeenCalled();
    });

    // Harus memanggil updatePayment terlebih dahulu
    expect(dataService.updatePayment).toHaveBeenCalledTimes(1);
    expect(dataService.updatePayment).toHaveBeenCalledWith(
      'fake-token',
      expect.objectContaining({
        payment_id: 'p-1',
        tenantId: 'tenant-rtrw-1',
        amount: 150000,
      })
    );

    // approveManualPayment dipanggil setelah updatePayment dengan argumen yang benar
    expect(dataService.approveManualPayment).toHaveBeenCalledTimes(1);
    expect(dataService.approveManualPayment).toHaveBeenCalledWith(
      'fake-token',
      expect.objectContaining({
        payment_id: 'p-1',
        tenantId: 'tenant-rtrw-1',
        verifiedBy: 'Bendahara Pak RT',
      })
    );

    // Toast sukses mengandung kata LUNAS
    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringContaining('LUNAS')
    );
    expect(props.onRefresh).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('2. checkbox di-uncheck -> approveManualPayment TIDAK dipanggil; toast.success tidak mengandung "LUNAS"', async () => {
    const props = createDefaultProps();
    render(<PaymentDetailModal {...props} />);

    // Buka form edit
    const editBtn = screen.getByRole('button', { name: /Perbaiki \/ Edit Transaksi/i });
    fireEvent.click(editBtn);

    // Uncheck markCompleted
    const checkbox = screen.getByRole('checkbox', { name: /Langsung verifikasi & selesaikan transaksi/i });
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);

    // Simpan perbaikan transaksi
    const submitBtn = screen.getByRole('button', { name: /Simpan Perbaikan Transaksi/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dataService.updatePayment).toHaveBeenCalled();
    });

    // approveManualPayment TIDAK boleh dipanggil
    expect(dataService.approveManualPayment).not.toHaveBeenCalled();

    // Toast sukses tidak boleh mengandung LUNAS
    expect(mockToast.success).toHaveBeenCalledWith('Detail transaksi berhasil diperbarui.');
    expect(mockToast.success).not.toHaveBeenCalledWith(expect.stringContaining('LUNAS'));
    expect(props.onRefresh).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('3. approveManualPayment reject -> toast.success TIDAK dipanggil sama sekali; toast.error dipanggil', async () => {
    vi.mocked(dataService.approveManualPayment).mockRejectedValueOnce(
      new Error('Koneksi timeout saat verifikasi')
    );

    const props = createDefaultProps();
    render(<PaymentDetailModal {...props} />);

    // Buka form edit
    const editBtn = screen.getByRole('button', { name: /Perbaiki \/ Edit Transaksi/i });
    fireEvent.click(editBtn);

    // Simpan perbaikan transaksi (checkbox default true)
    const submitBtn = screen.getByRole('button', { name: /Simpan Perbaikan Transaksi/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalled();
    });

    // updatePayment dan approveManualPayment terpanggil
    expect(dataService.updatePayment).toHaveBeenCalledTimes(1);
    expect(dataService.approveManualPayment).toHaveBeenCalledTimes(1);

    // toast.success TIDAK boleh dipanggil
    expect(mockToast.success).not.toHaveBeenCalled();

    // toast.error memberikan penjelasan lengkap
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('Perubahan transaksi tersimpan, tetapi verifikasi gagal')
    );
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('Koneksi timeout saat verifikasi')
    );
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('Pembayaran masih menunggu verifikasi')
    );

    // Tetap memanggil onRefresh dan onClose karena data transaksi sudah tersimpan
    expect(props.onRefresh).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('4. updatePayment reject -> approveManualPayment TIDAK dipanggil; toast.success tidak dipanggil', async () => {
    vi.mocked(dataService.updatePayment).mockRejectedValueOnce(
      new Error('Gagal update data pembayaran di server')
    );

    const props = createDefaultProps();
    render(<PaymentDetailModal {...props} />);

    // Buka form edit
    const editBtn = screen.getByRole('button', { name: /Perbaiki \/ Edit Transaksi/i });
    fireEvent.click(editBtn);

    // Simpan perbaikan transaksi
    const submitBtn = screen.getByRole('button', { name: /Simpan Perbaikan Transaksi/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalled();
    });

    expect(dataService.updatePayment).toHaveBeenCalledTimes(1);
    expect(dataService.approveManualPayment).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith('Gagal update data pembayaran di server');

    // onRefresh dan onClose TIDAK dipanggil jika update gagal
    expect(props.onRefresh).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('5. input type="file" untuk ganti bukti TIDAK ada di form edit saat mode tenant', () => {
    const props = createDefaultProps();
    const { container } = render(<PaymentDetailModal {...props} />);

    // Buka form edit
    const editBtn = screen.getByRole('button', { name: /Perbaiki \/ Edit Transaksi/i });
    fireEvent.click(editBtn);

    // Pastikan input file tidak ada di form edit dalam mode tenant
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeNull();
    expect(screen.queryByLabelText(/Ganti File Bukti/i)).toBeNull();
    expect(screen.queryByText(/Ganti File Bukti/i)).toBeNull();
  });

  it('6. mode legacy/non-tenant tetap menampilkan input file dan tidak memanggil approveManualPayment', async () => {
    mockTenantState.activeTenantId = null;
    mockTenantState.activeTenant = null;

    const props = createDefaultProps();
    props.role = 'bendahara';
    const { container } = render(<PaymentDetailModal {...props} />);

    // Buka form edit
    const editBtn = screen.getByRole('button', { name: /Perbaiki \/ Edit Transaksi/i });
    fireEvent.click(editBtn);

    // Input file tetap ada di mode legacy
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    // Simpan perbaikan
    const submitBtn = screen.getByRole('button', { name: /Simpan Perbaikan Transaksi/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dataService.updatePayment).toHaveBeenCalled();
    });

    // approveManualPayment TIDAK dipanggil di legacy mode
    expect(dataService.approveManualPayment).not.toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringContaining('LUNAS')
    );
  });

  it('7. menampilkan rincian line_items bila ada pada metadata tagihan kos (KOS-4.2)', () => {
    mockTenantState.activeTenant = { id: 'tenant-kos-1', name: 'Kos Melati', type: 'kos' };
    mockTenantState.activeTenantId = 'tenant-kos-1';

    const props = createDefaultProps();
    props.bill = {
      id: 'bill-kos-1',
      amount: 1600000,
      period: '2026-10',
      status: 'pending',
      metadata: {
        line_items: [
          { name: 'Sewa Kamar 101', amount: 1500000 },
          { name: 'Parkir Mobil', amount: 100000 },
        ],
      },
    };
    props.payment = null;

    render(<PaymentDetailModal {...props} />);

    const lineItemsContainer = screen.getByTestId('kos-bill-line-items');
    expect(lineItemsContainer).toBeTruthy();
    expect(screen.getByText('Sewa Kamar 101')).toBeTruthy();
    expect(screen.getByText('Parkir Mobil')).toBeTruthy();
    expect(screen.getByText('Rp 1.500.000')).toBeTruthy();
    expect(screen.getByText('Rp 100.000')).toBeTruthy();
    expect(screen.getByText('2 komponen')).toBeTruthy();
  });
});
