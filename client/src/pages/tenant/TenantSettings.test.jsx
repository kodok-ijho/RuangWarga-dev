// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TenantSettings from './TenantSettings';
import * as tenantOperationalService from '../../services/tenantOperationalService';
import * as dataService from '../../services/dataService';

// Polyfill ResizeObserver jika dibutuhkan di jsdom
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserver;
  global.ResizeObserver = ResizeObserver;
}

let mockTenantContext = {
  activeTenant: { id: 'tenant-rtrw-1', name: 'Palm Village RT 05', type: 'rt_rw' },
  activeTenantId: 'tenant-rtrw-1',
  isOwner: true,
  hasPermission: vi.fn(() => true),
  refreshTenant: vi.fn(),
};

const mockTemplate = {
  name: 'Kompleks RT/RW',
  unitLabel: 'Rumah',
  billLabel: 'IPL',
  memberLabel: 'Warga',
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

let mockSubscriptionGate = {
  canTransact: true,
  isReadOnly: false,
  tooltip: '',
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => mockTenantContext,
}));

vi.mock('../../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => mockTemplate,
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => mockSubscriptionGate,
}));

vi.mock('../../services/dataService', () => ({
  fetchSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

const sampleDetails = {
  id: 'tenant-rtrw-1',
  name: 'Palm Village RT 05',
  address: 'Jl. Boulevard Palm No. 1',
  contact_phone: '081234567890',
  settings: {
    due_day: 10,
    ipl_components: [
      { name: 'Keamanan', amount: 80000 },
      { name: 'Kebersihan', amount: 30000 },
    ],
    bank_account: {
      bank_name: 'BCA',
      account_number: '8830123456',
      account_holder: 'Kas RT 05 Palm Village',
    },
  },
};

const sampleAuditLogs = [
  {
    id: 'audit-1',
    tenant_id: 'tenant-rtrw-1',
    changed_by: 'admin-1',
    changed_by_name: 'Ketua RT',
    field: 'bank_account',
    old_value: { bank_name: 'BRI', account_number: '1234567890', account_holder: 'Kas Lama' },
    new_value: { bank_name: 'BCA', account_number: '8830123456', account_holder: 'Kas RT 05 Palm Village' },
    changed_at: '2026-10-15T10:00:00Z',
  },
];

vi.mock('../../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantDetails: vi.fn(),
    updateTenantProfileAndSettings: vi.fn(),
    fetchTenantInviteCode: vi.fn(),
    saveInviteCodeWithRetry: vi.fn(),
    saveTenantBankAccount: vi.fn(),
    fetchTenantSettingsAudit: vi.fn(),
  };
});

describe('TenantSettings (RTRW-2.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockTenantContext = {
      activeTenant: { id: 'tenant-rtrw-1', name: 'Palm Village RT 05', type: 'rt_rw' },
      activeTenantId: 'tenant-rtrw-1',
      isOwner: true,
      hasPermission: vi.fn(() => true),
      refreshTenant: vi.fn(),
    };

    mockSubscriptionGate = {
      canTransact: true,
      isReadOnly: false,
      tooltip: '',
    };

    tenantOperationalService.fetchTenantDetails.mockResolvedValue(
      JSON.parse(JSON.stringify(sampleDetails))
    );
    tenantOperationalService.fetchTenantInviteCode.mockResolvedValue('RW-PALM-7K8M-2N9P');
    tenantOperationalService.fetchTenantSettingsAudit.mockResolvedValue(sampleAuditLogs);
    tenantOperationalService.updateTenantProfileAndSettings.mockResolvedValue({ success: true });
    tenantOperationalService.saveInviteCodeWithRetry.mockResolvedValue('RW-PALM-9999-XXXX');
    tenantOperationalService.saveTenantBankAccount.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  const renderComponent = (tenantId = 'tenant-rtrw-1') => {
    return render(
      <MemoryRouter initialEntries={[`/t/${tenantId}/settings`]}>
        <Routes>
          <Route path="/t/:tenantId/settings" element={<TenantSettings />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('a. memuat dan menampilkan nama tenant, due_day, komponen IPL, kode undangan', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Palm Village RT 05')).toBeTruthy();
    });

    // Nama tenant, alamat, kontak
    expect(screen.getByDisplayValue('Palm Village RT 05')).toBeTruthy();
    expect(screen.getByDisplayValue('Jl. Boulevard Palm No. 1')).toBeTruthy();
    expect(screen.getByDisplayValue('081234567890')).toBeTruthy();

    // due_day
    expect(screen.getByDisplayValue('10')).toBeTruthy();

    // Komponen IPL
    expect(screen.getByDisplayValue('Keamanan')).toBeTruthy();
    expect(screen.getByDisplayValue('80000')).toBeTruthy();
    expect(screen.getByDisplayValue('Kebersihan')).toBeTruthy();
    expect(screen.getByDisplayValue('30000')).toBeTruthy();

    // Kode undangan
    expect(screen.getByText('RW-PALM-7K8M-2N9P')).toBeTruthy();
  });

  it('b. simpan profil → updateTenantProfileAndSettings(tenantId, { name, address, contact_phone })', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Palm Village RT 05')).toBeTruthy();
    });

    const nameInput = screen.getByDisplayValue('Palm Village RT 05');
    const addressInput = screen.getByDisplayValue('Jl. Boulevard Palm No. 1');
    const phoneInput = screen.getByDisplayValue('081234567890');

    fireEvent.change(nameInput, { target: { value: 'Palm Village Barat' } });
    fireEvent.change(addressInput, { target: { value: 'Jl. Merak No. 99' } });
    fireEvent.change(phoneInput, { target: { value: '081299998888' } });

    const saveProfileBtn = screen.getByRole('button', { name: /simpan profil/i });
    fireEvent.click(saveProfileBtn);

    await waitFor(() => {
      expect(tenantOperationalService.updateTenantProfileAndSettings).toHaveBeenCalledWith(
        'tenant-rtrw-1',
        {
          name: 'Palm Village Barat',
          address: 'Jl. Merak No. 99',
          contact_phone: '081299998888',
        }
      );
    });

    expect(mockToast.success).toHaveBeenCalledWith('Profil komunitas berhasil disimpan.');
    expect(mockTenantContext.refreshTenant).toHaveBeenCalled();
  });

  it('c. simpan tagihan → updateTenantProfileAndSettings(tenantId, { settings: { due_day, ipl_components } }); due_day 31 → ditolak dengan pesan, service tidak dipanggil', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByDisplayValue('10')).toBeTruthy();
    });

    const dueDayInput = screen.getByDisplayValue('10');
    const saveBillingBtn = screen.getByRole('button', { name: /simpan tagihan/i });

    // 1. Coba due_day 31 -> ditolak
    fireEvent.change(dueDayInput, { target: { value: '31' } });
    fireEvent.click(saveBillingBtn);

    expect(mockToast.error).toHaveBeenCalledWith(
      'Tanggal jatuh tempo harus berupa angka antara 1 hingga 28.'
    );
    expect(tenantOperationalService.updateTenantProfileAndSettings).not.toHaveBeenCalled();

    // 2. Ubah ke tanggal valid (15), lalu simpan
    fireEvent.change(dueDayInput, { target: { value: '15' } });
    fireEvent.click(saveBillingBtn);

    await waitFor(() => {
      expect(tenantOperationalService.updateTenantProfileAndSettings).toHaveBeenCalledWith(
        'tenant-rtrw-1',
        {
          settings: {
            due_day: 15,
            ipl_components: [
              { name: 'Keamanan', amount: 80000 },
              { name: 'Kebersihan', amount: 30000 },
            ],
          },
        }
      );
    });

    expect(mockToast.success).toHaveBeenCalledWith('Pengaturan tagihan IPL berhasil disimpan.');
  });

  it('d. buat kode baru (confirm true) → saveInviteCodeWithRetry dipanggil, kode baru tampil', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('RW-PALM-7K8M-2N9P')).toBeTruthy();
    });

    const newCodeBtn = screen.getByRole('button', { name: /buat kode baru/i });
    fireEvent.click(newCodeBtn);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Tautan lama tidak akan berlaku lagi.')
    );

    await waitFor(() => {
      expect(tenantOperationalService.saveInviteCodeWithRetry).toHaveBeenCalledWith(
        'tenant-rtrw-1',
        'Palm Village RT 05'
      );
    });

    await waitFor(() => {
      expect(screen.getByText('RW-PALM-9999-XXXX')).toBeTruthy();
    });

    expect(mockToast.success).toHaveBeenCalledWith('Kode undangan baru berhasil dibuat!');
    confirmSpy.mockRestore();
  });

  it('e. read_only (canTransact false) → tombol simpan disabled', async () => {
    mockSubscriptionGate = {
      canTransact: false,
      isReadOnly: true,
      tooltip: 'Layanan Read-Only',
    };

    renderComponent();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Palm Village RT 05')).toBeTruthy();
    });

    const saveProfileBtn = screen.getByRole('button', { name: /simpan profil/i });
    const saveBillingBtn = screen.getByRole('button', { name: /simpan tagihan/i });
    const saveBankBtn = screen.getByRole('button', { name: /simpan rekening/i });
    const newCodeBtn = screen.getByRole('button', { name: /buat kode baru/i });

    expect(saveProfileBtn.disabled).toBe(true);
    expect(saveBillingBtn.disabled).toBe(true);
    expect(saveBankBtn.disabled).toBe(true);
    expect(newCodeBtn.disabled).toBe(true);
  });

  it('f. dataService.fetchSettings/updateSettings tidak pernah dipanggil', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Palm Village RT 05')).toBeTruthy();
    });

    const saveProfileBtn = screen.getByRole('button', { name: /simpan profil/i });
    fireEvent.click(saveProfileBtn);

    await waitFor(() => {
      expect(tenantOperationalService.updateTenantProfileAndSettings).toHaveBeenCalled();
    });

    expect(dataService.fetchSettings).not.toHaveBeenCalled();
    expect(dataService.updateSettings).not.toHaveBeenCalled();
  });

  it('g. simpan rekening penerima → saveTenantBankAccount dipanggil', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByDisplayValue('8830123456')).toBeTruthy();
    });

    const bankNameInput = screen.getByDisplayValue('BCA');
    const accNumInput = screen.getByDisplayValue('8830123456');
    const accHolderInput = screen.getByDisplayValue('Kas RT 05 Palm Village');

    fireEvent.change(bankNameInput, { target: { value: 'Mandiri' } });
    fireEvent.change(accNumInput, { target: { value: '1370001234567' } });
    fireEvent.change(accHolderInput, { target: { value: 'Kas RT Mandiri' } });

    const saveBankBtn = screen.getByRole('button', { name: /simpan rekening/i });
    fireEvent.click(saveBankBtn);

    await waitFor(() => {
      expect(tenantOperationalService.saveTenantBankAccount).toHaveBeenCalledWith(
        'tenant-rtrw-1',
        {
          bank_name: 'Mandiri',
          account_number: '1370001234567',
          account_holder: 'Kas RT Mandiri',
        }
      );
    });

    expect(mockToast.success).toHaveBeenCalledWith('Rekening penerima pembayaran berhasil disimpan.');
    expect(mockTenantContext.refreshTenant).toHaveBeenCalled();
  });
});
