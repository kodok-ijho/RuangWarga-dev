// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import CreateBillingModal from './CreateBillingModal';
import * as tenantOperationalService from '../services/tenantOperationalService';

const mockToast = {
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantUnits: vi.fn(),
    fetchTenantMembers: vi.fn(),
    fetchTenantDetails: vi.fn(),
    createKosContract: vi.fn(),
    fetchActiveContractByUnit: vi.fn(),
    createTenantBillingItem: vi.fn(),
  };
});

describe('KOS-2.4: CreateBillingModal (Form Kontrak Sewa Kos)', () => {
  const mockTenantId = 'kos-test-tenant-1';

  const mockUnits = [
    {
      id: 1,
      label: 'Kamar 101',
      status: 'occupied',
      metadata: {
        rent_price: 1500000,
        tenant_member_id: 'mem-dhani-1',
        tenant_name: 'Dhani Mahasiswa',
      },
    },
    {
      id: 2,
      label: 'Kamar 102',
      status: 'vacant',
      metadata: {
        default_rent_price: 1750000,
      },
    },
  ];

  const mockMembers = [
    {
      id: 'mem-dhani-1',
      full_name: 'Dhani Mahasiswa',
      status: 'approved',
      unit_id: 1,
    },
    {
      id: 'mem-calon-2',
      full_name: 'Budi Calon',
      status: 'approved',
      unit_id: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    tenantOperationalService.fetchTenantUnits.mockResolvedValue(mockUnits);
    tenantOperationalService.fetchTenantMembers.mockResolvedValue(mockMembers);
    tenantOperationalService.fetchTenantDetails.mockResolvedValue({
      settings: {
        default_rent_price: 1500000,
        rent_grace_days: 10,
      },
    });
    tenantOperationalService.fetchActiveContractByUnit.mockResolvedValue(null);
    tenantOperationalService.createKosContract.mockResolvedValue({ success: true, contract_id: 'c-1' });
  });

  afterEach(() => {
    cleanup();
  });

  it('pilih kamar terisi → penyewa otomatis terisi dan nama penyewa read-only', async () => {
    render(
      <CreateBillingModal
        open={true}
        onClose={vi.fn()}
        tenantId={mockTenantId}
        tenantType="kos"
        initialUnitId="1"
      />
    );

    // Judul modal harus "Buat Kontrak Sewa"
    expect(await screen.findByText('Buat Kontrak Sewa')).toBeTruthy();

    // Nama penyewa harus otomatis terisi dan read-only
    const nameInput = screen.getByLabelText(/Nama Penyewa Terdaftar/i);
    expect(nameInput.value).toBe('Dhani Mahasiswa');
    expect(nameInput.readOnly).toBe(true);

    // Badge kamar terisi muncul
    expect(screen.getByText('Kamar Terisi (Terkunci)')).toBeTruthy();

    // Harga sewa otomatis terisi dari kamar terisi (1.500.000)
    const priceInput = screen.getByLabelText(/Harga Sewa Per Bulan/i);
    expect(priceInput.value).toBe('1500000');
  });

  it('pratinjau Dhani benar: 19 Okt 2026, tenggat 10 hari menghasilkan 3 periode', async () => {
    render(
      <CreateBillingModal
        open={true}
        onClose={vi.fn()}
        tenantId={mockTenantId}
        tenantType="kos"
        initialUnitId="1"
      />
    );

    await screen.findByText('Buat Kontrak Sewa');

    // Ubah tanggal mulai ke 2026-10-19
    const startDateInput = screen.getByLabelText(/Tanggal Masuk/i);
    fireEvent.change(startDateInput, { target: { value: '2026-10-19' } });

    // Panel pratinjau harus menampilkan 3 periode yang dihitung dari 2026-10-19
    const previewPanel = screen.getByTestId('rent-preview-panel');
    expect(previewPanel).toBeTruthy();

    expect(previewPanel.textContent).toContain('2026-10');
    expect(previewPanel.textContent).toContain('2026-11');
    expect(previewPanel.textContent).toContain('2026-12');
    // Jatuh tempo Dhani: 29 Okt
    expect(previewPanel.textContent).toContain('29 Okt 2026');
  });

  it('kontrak bulanan terkirim tanpa end_date (months = null)', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <CreateBillingModal
        open={true}
        onClose={handleClose}
        tenantId={mockTenantId}
        tenantType="kos"
        initialUnitId="2" // Kamar 102 (vacant)
        onSuccess={handleSuccess}
      />
    );

    await screen.findByText('Buat Kontrak Sewa');

    // Karena Kamar 102 kosong, pilih anggota terdaftar
    const memberSelect = screen.getByTestId('kos-member-select');
    fireEvent.change(memberSelect, { target: { value: 'mem-calon-2' } });

    // Tanggal masuk
    const startDateInput = screen.getByLabelText(/Tanggal Masuk/i);
    fireEvent.change(startDateInput, { target: { value: '2026-11-01' } });

    // Pastikan durasi default adalah "monthly"
    const durationSelect = screen.getByLabelText(/Durasi Kontrak/i);
    expect(durationSelect.value).toBe('monthly');

    // Submit form dengan tombol "Simpan Kontrak"
    const submitBtn = screen.getByRole('button', { name: /Simpan Kontrak/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.createKosContract).toHaveBeenCalledWith(
        mockTenantId,
        expect.objectContaining({
          unitId: 2,
          memberId: 'mem-calon-2',
          startDate: '2026-11-01',
          months: null, // Bulanan berjalan terus tanpa end_date
          rentPrice: 1750000,
          graceDays: 10,
        })
      );
    });

    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringContaining('Kontrak sewa berhasil dibuat')
    );
    expect(handleSuccess).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });
});
