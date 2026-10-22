// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import MemberBillPayModal from './MemberBillPayModal';
import * as tenantOperationalService from '../../services/tenantOperationalService';

let mockActiveTenant = {
  id: 'tenant-panitia-1',
  name: 'Panitia Dies Natalis 2026',
  type: 'panitia',
  settings: {
    bank_account: {
      bank_name: 'BCA',
      account_number: '8881234567',
      account_holder: 'Panitia Pentas Seni',
    },
  },
};

let mockActiveMember = {
  id: 'member-user-1',
  full_name: 'Budi Handoko',
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../../context/TenantContext', () => ({
  useTenant: () => ({
    activeTenant: mockActiveTenant,
    activeMember: mockActiveMember,
  }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../../services/tenantOperationalService');
  return {
    ...actual,
    submitMemberTransfer: vi.fn(),
    getTenantBankAccount: vi.fn((t) => t?.settings?.bank_account || null),
  };
});

describe('PANITIA-2.4: MemberBillPayModal Component', () => {
  const sampleBill = {
    id: 'bill-101',
    amount: 50000,
    due_date: '2026-11-20',
    program: { id: 'prog-1', name: 'Pentas Seni Tahunan' },
    status: 'unpaid',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTenant = {
      id: 'tenant-panitia-1',
      name: 'Panitia Dies Natalis 2026',
      type: 'panitia',
      settings: {
        bank_account: {
          bank_name: 'BCA',
          account_number: '8881234567',
          account_holder: 'Panitia Pentas Seni',
        },
      },
    };
    tenantOperationalService.submitMemberTransfer.mockResolvedValue({ success: true });
    tenantOperationalService.getTenantBankAccount.mockImplementation(
      (t) => t?.settings?.bank_account || null
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('menampilkan rincian tagihan dan nomor rekening penerima', () => {
    render(
      <MemberBillPayModal
        tenantId="tenant-panitia-1"
        bill={sampleBill}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Total Tagihan/i)).toBeTruthy();
    expect(screen.getByText(/50\.000/)).toBeTruthy();
    expect(screen.getByText(/BCA - 8881234567/i)).toBeTruthy();
    expect(screen.getByText(/Panitia Pentas Seni/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Salin/i })).toBeTruthy();
  });

  it('menampilkan peringatan jika pengelola belum mengisi rekening penerima', () => {
    mockActiveTenant.settings = {};
    tenantOperationalService.getTenantBankAccount.mockReturnValue(null);

    render(
      <MemberBillPayModal
        tenantId="tenant-panitia-1"
        bill={sampleBill}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Pengelola belum mengisi rekening penerima\. Hubungi bendahara\./i)
    ).toBeTruthy();
  });

  it('modal menolak kirim tanpa bukti', async () => {
    render(
      <MemberBillPayModal
        tenantId="tenant-panitia-1"
        bill={sampleBill}
        onClose={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Kirim Bukti Pembayaran/i });
    fireEvent.click(submitBtn);

    expect(mockToast.error).toHaveBeenCalledWith('Bukti transfer wajib diunggah.');
    expect(screen.getByTestId('pay-error-alert')).toBeTruthy();
    expect(tenantOperationalService.submitMemberTransfer).not.toHaveBeenCalled();
  });

  it('kirim memanggil submitMemberTransfer dengan memberId', async () => {
    const handleClose = vi.fn();
    const handlePaid = vi.fn();

    render(
      <MemberBillPayModal
        tenantId="tenant-panitia-1"
        bill={sampleBill}
        onClose={handleClose}
        onPaid={handlePaid}
      />
    );

    // Upload dummy file
    const file = new File(['dummy-bytes'], 'bukti_transfer.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByTestId('proof-file-input');
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Tambah catatan
    const noteInput = screen.getByLabelText(/Catatan/i);
    fireEvent.change(noteInput, { target: { value: 'Transfer dari Bank Mandiri' } });

    const submitBtn = screen.getByRole('button', { name: /Kirim Bukti Pembayaran/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.submitMemberTransfer).toHaveBeenCalledWith(
        'tenant-panitia-1',
        {
          billId: 'bill-101',
          proofFile: file,
          note: 'Transfer dari Bank Mandiri',
          memberId: 'member-user-1',
        }
      );
    });

    expect(mockToast.success).toHaveBeenCalledWith(
      'Bukti transfer berhasil dikirim. Menunggu verifikasi bendahara.'
    );
    expect(handlePaid).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });
});
