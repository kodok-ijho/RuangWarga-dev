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

  it('KOS-3.2: pilihan siklus tagihan default "Ikut tanggal masuk", beralih ke prorata menampilkan pratinjau nominal', async () => {
    render(
      <CreateBillingModal
        open={true}
        onClose={vi.fn()}
        tenantId={mockTenantId}
        tenantType="kos"
        initialUnitId="1" // Kamar 101: 1.500.000
      />
    );

    await screen.findByText('Buat Kontrak Sewa');

    // Default siklus terpilih adalah "Ikut tanggal masuk"
    const radioDefault = screen.getByDisplayValue('start_date');
    expect(radioDefault.checked).toBe(true);
    expect(screen.queryByTestId('prorata-preview-badge')).toBeNull();

    // Set tanggal masuk ke 19 Okt 2026
    const startDateInput = screen.getByLabelText(/Tanggal Masuk/i);
    fireEvent.change(startDateInput, { target: { value: '2026-10-19' } });

    // Pilih opsi "Awal bulan (bulan pertama prorata)"
    const radioProrata = screen.getByDisplayValue('month_start_prorata');
    fireEvent.click(radioProrata);
    expect(radioProrata.checked).toBe(true);

    // Pratinjau tagihan pertama prorata muncul: 19–31 Okt, nominal Rp629.000
    const prorataBadge = await screen.findByTestId('prorata-preview-badge');
    expect(prorataBadge).toBeTruthy();
    expect(prorataBadge.textContent).toContain('Okt 19–31');
    expect(prorataBadge.textContent).toMatch(/629\.000/);

    // Jika tanggal diubah ke tanggal 1, pratinjau prorata tidak muncul
    fireEvent.change(startDateInput, { target: { value: '2026-10-01' } });
    expect(screen.queryByTestId('prorata-preview-badge')).toBeNull();
  });

  it('KOS-3.2: submit form dengan siklus prorata meneruskan billingCycle = "month_start_prorata"', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <CreateBillingModal
        open={true}
        onClose={handleClose}
        tenantId={mockTenantId}
        tenantType="kos"
        initialUnitId="2"
        onSuccess={handleSuccess}
      />
    );

    await screen.findByText('Buat Kontrak Sewa');

    const memberSelect = screen.getByTestId('kos-member-select');
    fireEvent.change(memberSelect, { target: { value: 'mem-calon-2' } });

    const startDateInput = screen.getByLabelText(/Tanggal Masuk/i);
    fireEvent.change(startDateInput, { target: { value: '2026-10-19' } });

    // Pilih prorata
    const radioProrata = screen.getByDisplayValue('month_start_prorata');
    fireEvent.click(radioProrata);

    const submitBtn = screen.getByRole('button', { name: /Simpan Kontrak/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.createKosContract).toHaveBeenCalledWith(
        mockTenantId,
        expect.objectContaining({
          unitId: 2,
          memberId: 'mem-calon-2',
          startDate: '2026-10-19',
          billingCycle: 'month_start_prorata',
        })
      );
    });
  });

  it('KOS-4.2: prefill dari master settings (tenggat, siklus, durasi, harga) dan biaya tambahan tampil sebagai centang', async () => {
    tenantOperationalService.fetchTenantDetails.mockResolvedValueOnce({
      settings: {
        default_rent_price: 1800000,
        rent_grace_days: 14,
        contract_default_cycle: 'month_start_prorata',
        contract_default_months: 6,
        additional_fees: [
          { name: 'Parkir Mobil', amount: 100000 },
          { name: 'Laundry Kiloan', amount: 50000 },
        ],
      },
    });

    render(
      <CreateBillingModal
        open={true}
        onClose={vi.fn()}
        tenantId={mockTenantId}
        tenantType="kos"
        initialUnitId="2" // Kamar 102 punya metadata.default_rent_price 1750000
      />
    );

    await screen.findByText('Buat Kontrak Sewa');

    // Tenggat bayar ter-prefill dari master (14)
    const graceInput = document.getElementById('kos-grace-days-input');
    expect(graceInput.value).toBe('14');

    // Siklus ter-prefill dari master (month_start_prorata)
    const radioProrata = screen.getByDisplayValue('month_start_prorata');
    expect(radioProrata.checked).toBe(true);

    // Durasi ter-prefill dari master (fixed, 6 bulan)
    const durationSelect = screen.getByLabelText(/Durasi Kontrak/i);
    expect(durationSelect.value).toBe('fixed');
    const durationMonthsInput = document.getElementById('kos-duration-months-input');
    expect(durationMonthsInput.value).toBe('6');

    // Panel biaya tambahan muncul dengan 2 opsi, default tidak tercentang
    const feePanel = screen.getByTestId('kos-contract-fees-panel');
    expect(feePanel).toBeTruthy();
    expect(screen.getByText('Parkir Mobil')).toBeTruthy();
    expect(screen.getByText('Laundry Kiloan')).toBeTruthy();

    const checkboxes = feePanel.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(false);
  });

  it('KOS-4.2: mencentang biaya tambahan mengupdate total pratinjau prorata dan mengirim additionalFees ke createKosContract', async () => {
    tenantOperationalService.fetchTenantDetails.mockResolvedValueOnce({
      settings: {
        default_rent_price: 1500000,
        rent_grace_days: 10,
        contract_default_cycle: 'month_start_prorata',
        additional_fees: [
          { name: 'Parkir Mobil', amount: 100000 },
        ],
      },
    });

    render(
      <CreateBillingModal
        open={true}
        onClose={vi.fn()}
        tenantId={mockTenantId}
        tenantType="kos"
        initialUnitId="1" // Kamar 101: 1500000
      />
    );

    await screen.findByText('Buat Kontrak Sewa');
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/Nama Penyewa Terdaftar/i);
      expect(nameInput.value).toBe('Dhani Mahasiswa');
    });

    const startDateInput = screen.getByLabelText(/Tanggal Masuk/i);
    fireEvent.change(startDateInput, { target: { value: '2026-10-19' } });

    // Sebelum dicentang: sewa prorata 19-31 Okt = floor(1500000 * 13 / 31 / 1000) * 1000 = 629000
    let prorataBadge = await screen.findByTestId('prorata-preview-badge');
    expect(prorataBadge.textContent).toContain('629.000');

    // Centang Parkir Mobil
    const parkirCheckbox = screen.getByRole('checkbox', { name: /Parkir Mobil/i });
    fireEvent.click(parkirCheckbox);
    expect(parkirCheckbox.checked).toBe(true);

    // Setelah dicentang: total prorata (1500000 + 100000) * 13 / 31 = 670000
    prorataBadge = screen.getByTestId('prorata-preview-badge');
    expect(prorataBadge.textContent).toContain('670.000');

    // Submit form dan pastikan additionalFees terkirim ke createKosContract
    const submitBtn = screen.getByRole('button', { name: /Simpan Kontrak/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.createKosContract).toHaveBeenCalledWith(
        mockTenantId,
        expect.objectContaining({
          unitId: 1,
          rentPrice: 1500000,
          additionalFees: [
            { name: 'Parkir Mobil', amount: 100000 },
          ],
        })
      );
    });
  });

  it('KOS-5.2a: prefill aturan denda dari settings.late_fee_rule dan tampil di panel', async () => {
    tenantOperationalService.fetchTenantDetails.mockResolvedValueOnce({
      settings: {
        late_fee_rule: {
          type: 'daily',
          amount: 15000,
          max: 200000,
          grace_days: 5,
        },
      },
    });

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

    const typeSelect = document.getElementById('modal-late-fee-type-select');
    expect(typeSelect.value).toBe('daily');

    const graceInput = document.getElementById('modal-late-fee-grace-days-input');
    expect(graceInput.value).toBe('5');

    const amountInput = document.getElementById('modal-late-fee-daily-amount-input');
    expect(amountInput.value).toBe('15000');

    const maxInput = document.getElementById('modal-late-fee-daily-max-input');
    expect(maxInput.value).toBe('200000');
  });

  it('KOS-5.2a: mengubah aturan denda per kontrak dan mengirim lateFeeRule ke createKosContract', async () => {
    tenantOperationalService.fetchTenantDetails.mockResolvedValueOnce({
      settings: {
        default_rent_price: 1500000,
        rent_grace_days: 10,
        late_fee_rule: { type: 'none', grace_days: 0 },
      },
    });

    render(
      <CreateBillingModal
        open={true}
        onClose={vi.fn()}
        tenantId={mockTenantId}
        tenantType="kos"
        initialUnitId="2"
      />
    );

    await screen.findByText('Buat Kontrak Sewa');

    const memberSelect = screen.getByTestId('kos-member-select');
    fireEvent.change(memberSelect, { target: { value: 'mem-calon-2' } });

    const startDateInput = screen.getByLabelText(/Tanggal Masuk/i);
    fireEvent.change(startDateInput, { target: { value: '2026-10-20' } });

    // Ubah aturan denda jadi once (sekali)
    const typeSelect = document.getElementById('modal-late-fee-type-select');
    fireEvent.change(typeSelect, { target: { value: 'once' } });

    const graceInput = document.getElementById('modal-late-fee-grace-days-input');
    fireEvent.change(graceInput, { target: { value: '2' } });

    const onceAmountInput = await screen.findByLabelText(/Nominal Denda Sekali/i);
    fireEvent.change(onceAmountInput, { target: { value: '50000' } });

    const submitBtn = screen.getByRole('button', { name: /Simpan Kontrak/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.createKosContract).toHaveBeenCalledWith(
        mockTenantId,
        expect.objectContaining({
          unitId: 2,
          lateFeeRule: {
            type: 'once',
            amount: 50000,
            grace_days: 2,
          },
        })
      );
    });
  });
});
