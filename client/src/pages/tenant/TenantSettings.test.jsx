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
  tenantType: 'rt_rw',
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
  type: 'rt_rw',
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
    fetchBillingAutoRuns: vi.fn(),
  };
});

describe('TenantSettings (RTRW-2.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockTenantContext = {
      activeTenant: { id: 'tenant-rtrw-1', name: 'Palm Village RT 05', type: 'rt_rw' },
      activeTenantId: 'tenant-rtrw-1',
      tenantType: 'rt_rw',
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
    tenantOperationalService.fetchBillingAutoRuns.mockResolvedValue([]);
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
            auto_billing_enabled: false,
            billing_issue_day: 1,
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

  describe('Penerbitan Tagihan Otomatis (BILL-AUTO-1.2)', () => {
    it('a. toggle dan tanggal terbit tersimpan ke settings', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByDisplayValue('Palm Village RT 05')).toBeTruthy();
      });

      const toggle = screen.getByLabelText(/terbitkan tagihan otomatis/i);
      expect(toggle.checked).toBe(false);

      // (a) Asersi teks manual tampil saat toggle mati
      expect(
        screen.getByText(
          'Tagihan saat ini hanya diterbitkan manual. Aktifkan untuk menerbitkan tagihan bulan berjalan otomatis pada tanggal terbit.'
        )
      ).toBeTruthy();
      expect(
        screen.queryByText(/tagihan bulan berjalan diterbitkan otomatis setiap tanggal/i)
      ).toBeNull();

      // Toggle switch ON
      fireEvent.click(toggle);
      expect(toggle.checked).toBe(true);

      // (a) Asersi teks otomatis tampil saat toggle menyala
      expect(
        screen.getByText(
          /tagihan bulan berjalan diterbitkan otomatis setiap tanggal 1 pukul 00:05 WIB, jatuh tempo tanggal 10\./i
        )
      ).toBeTruthy();
      expect(
        screen.queryByText(
          'Tagihan saat ini hanya diterbitkan manual. Aktifkan untuk menerbitkan tagihan bulan berjalan otomatis pada tanggal terbit.'
        )
      ).toBeNull();

      // Select tanggal terbit diubah ke 5
      const issueDaySelect = screen.getByLabelText(/tanggal terbit/i);
      expect(issueDaySelect.disabled).toBe(false);
      fireEvent.change(issueDaySelect, { target: { value: '5' } });

      // Teks otomatis terupdate tanggalnya
      expect(
        screen.getByText(
          /tagihan bulan berjalan diterbitkan otomatis setiap tanggal 5 pukul 00:05 WIB, jatuh tempo tanggal 10\./i
        )
      ).toBeTruthy();

      // Simpan tagihan
      const saveBillingBtn = screen.getByRole('button', { name: /simpan tagihan/i });
      fireEvent.click(saveBillingBtn);

      await waitFor(() => {
        expect(tenantOperationalService.updateTenantProfileAndSettings).toHaveBeenCalledWith(
          'tenant-rtrw-1',
          {
            settings: {
              due_day: 10,
              ipl_components: [
                { name: 'Keamanan', amount: 80000 },
                { name: 'Kebersihan', amount: 30000 },
              ],
              auto_billing_enabled: true,
              billing_issue_day: 5,
            },
          }
        );
      });

      expect(mockToast.success).toHaveBeenCalledWith('Pengaturan tagihan IPL berhasil disimpan.');
    });

    it('b. blok tidak tampil untuk tenant tipe arisan atau kelas', async () => {
      // 1. Tipe Arisan
      mockTenantContext = {
        ...mockTenantContext,
        activeTenant: { id: 'tenant-arisan-1', name: 'Arisan Ceria', type: 'arisan' },
        activeTenantId: 'tenant-arisan-1',
        tenantType: 'arisan',
      };
      tenantOperationalService.fetchTenantDetails.mockResolvedValueOnce({
        ...sampleDetails,
        id: 'tenant-arisan-1',
        name: 'Arisan Ceria',
        type: 'arisan',
      });

      const { unmount } = renderComponent('tenant-arisan-1');

      await waitFor(() => {
        expect(screen.getByDisplayValue('Arisan Ceria')).toBeTruthy();
      });

      expect(screen.queryByLabelText(/terbitkan tagihan otomatis/i)).toBeNull();
      expect(screen.queryByText(/riwayat penerbitan otomatis/i)).toBeNull();

      unmount();

      // 2. Tipe Kelas
      mockTenantContext = {
        ...mockTenantContext,
        activeTenant: { id: 'tenant-kelas-1', name: 'Bimbel Mandiri', type: 'kelas' },
        activeTenantId: 'tenant-kelas-1',
        tenantType: 'kelas',
      };
      tenantOperationalService.fetchTenantDetails.mockResolvedValueOnce({
        ...sampleDetails,
        id: 'tenant-kelas-1',
        name: 'Bimbel Mandiri',
        type: 'kelas',
      });

      renderComponent('tenant-kelas-1');

      await waitFor(() => {
        expect(screen.getByDisplayValue('Bimbel Mandiri')).toBeTruthy();
      });

      expect(screen.queryByLabelText(/terbitkan tagihan otomatis/i)).toBeNull();
      expect(screen.queryByText(/riwayat penerbitan otomatis/i)).toBeNull();
    });

    it('c. riwayat dirender dari fetchBillingAutoRuns yang dimock, termasuk pesan error dan keadaan kosong', async () => {
      const mockRuns = [
        {
          id: 'run-1',
          period: '2026-10',
          run_at: '2026-10-10T00:05:00+07:00',
          created_count: 24,
          skipped_count: 1,
          error: null,
        },
        {
          id: 'run-2',
          period: '2026-09',
          run_at: '2026-09-10T00:05:00+07:00',
          created_count: 0,
          skipped_count: 25,
          error: 'Koneksi DOKU timeout',
        },
      ];
      tenantOperationalService.fetchBillingAutoRuns.mockResolvedValueOnce(mockRuns);

      const { unmount } = renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Periode 2026-10')).toBeTruthy();
      });

      expect(screen.getByText(/24 tagihan dibuat, 1 dilewati/i)).toBeTruthy();
      expect(screen.getByText('Periode 2026-09')).toBeTruthy();
      expect(screen.getByText(/0 tagihan dibuat, 25 dilewati/i)).toBeTruthy();
      expect(screen.getByText('Koneksi DOKU timeout')).toBeTruthy();

      unmount();

      // Keadaan kosong
      tenantOperationalService.fetchBillingAutoRuns.mockResolvedValueOnce([]);
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Belum ada penerbitan otomatis.')).toBeTruthy();
      });
    });

    it('d. peringatan muncul bila tanggal terbit lebih besar dari jatuh tempo dan tidak tampil saat toggle mati', async () => {
      // 1. Initial state dengan billing_issue_day (15) > due_day (10), toggle awal mati (auto_billing_enabled false)
      tenantOperationalService.fetchTenantDetails.mockResolvedValueOnce({
        ...sampleDetails,
        settings: {
          ...sampleDetails.settings,
          due_day: 10,
          billing_issue_day: 15,
          auto_billing_enabled: false,
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByDisplayValue('Palm Village RT 05')).toBeTruthy();
      });

      const toggle = screen.getByLabelText(/terbitkan tagihan otomatis/i);
      expect(toggle.checked).toBe(false);

      // (b) Peringatan TIDAK tampil saat toggle mati walaupun tanggal terbit (15) > jatuh tempo (10)
      expect(screen.queryByText(/tagihan akan langsung lewat jatuh tempo saat terbit/i)).toBeNull();

      // Toggle ON -> peringatan muncul karena issueDay 15 > dueDay 10
      fireEvent.click(toggle);
      expect(toggle.checked).toBe(true);
      expect(screen.getByText(/tagihan akan langsung lewat jatuh tempo saat terbit/i)).toBeTruthy();

      // Toggle OFF kembali -> peringatan tidak tampil saat toggle mati walaupun tanggal terbit > jatuh tempo
      fireEvent.click(toggle);
      expect(toggle.checked).toBe(false);
      expect(screen.queryByText(/tagihan akan langsung lewat jatuh tempo saat terbit/i)).toBeNull();

      // Toggle ON kembali
      fireEvent.click(toggle);
      expect(toggle.checked).toBe(true);
      expect(screen.getByText(/tagihan akan langsung lewat jatuh tempo saat terbit/i)).toBeTruthy();

      // Ubah tanggal terbit kembali ke 5 (<= dueDay 10) -> peringatan hilang
      const issueDaySelect = screen.getByLabelText(/tanggal terbit/i);
      fireEvent.change(issueDaySelect, { target: { value: '5' } });
      expect(screen.queryByText(/tagihan akan langsung lewat jatuh tempo saat terbit/i)).toBeNull();
    });
  });

  describe('Jatuh Tempo Kos (NOTIF-1.2)', () => {
    it('a. tenant kos dengan billing_due_day 5 dan due_day 10 menampilkan 5', async () => {
      mockTenantContext = {
        ...mockTenantContext,
        activeTenant: { id: 'tenant-kos-1', name: 'Kos Melati', type: 'kos' },
        activeTenantId: 'tenant-kos-1',
        tenantType: 'kos',
      };
      tenantOperationalService.fetchTenantDetails.mockResolvedValueOnce({
        ...sampleDetails,
        id: 'tenant-kos-1',
        name: 'Kos Melati',
        type: 'kos',
        settings: {
          ...sampleDetails.settings,
          due_day: 10,
          billing_due_day: 5,
        },
      });

      renderComponent('tenant-kos-1');

      await waitFor(() => {
        expect(screen.getByDisplayValue('Kos Melati')).toBeTruthy();
      });

      const dueDayInput = document.getElementById('billingDueDayInput');
      expect(dueDayInput.value).toBe('5');
    });

    it('b. simpan pada tenant kos mengirim due_day dan billing_due_day yang sama', async () => {
      mockTenantContext = {
        ...mockTenantContext,
        activeTenant: { id: 'tenant-kos-1', name: 'Kos Melati', type: 'kos' },
        activeTenantId: 'tenant-kos-1',
        tenantType: 'kos',
      };
      tenantOperationalService.fetchTenantDetails.mockResolvedValueOnce({
        ...sampleDetails,
        id: 'tenant-kos-1',
        name: 'Kos Melati',
        type: 'kos',
        settings: {
          ...sampleDetails.settings,
          due_day: 10,
          billing_due_day: 5,
        },
      });

      renderComponent('tenant-kos-1');

      await waitFor(() => {
        expect(screen.getByDisplayValue('Kos Melati')).toBeTruthy();
      });

      const dueDayInput = document.getElementById('billingDueDayInput');
      expect(dueDayInput.value).toBe('5');

      fireEvent.change(dueDayInput, { target: { value: '15' } });

      const saveBillingBtn = screen.getByRole('button', { name: /simpan tagihan/i });
      fireEvent.click(saveBillingBtn);

      await waitFor(() => {
        expect(tenantOperationalService.updateTenantProfileAndSettings).toHaveBeenCalledWith(
          'tenant-kos-1',
          expect.objectContaining({
            settings: expect.objectContaining({
              due_day: 15,
              billing_due_day: 15,
            }),
          })
        );
      });

      const callArgs = tenantOperationalService.updateTenantProfileAndSettings.mock.calls[0];
      expect(callArgs[1].settings.due_day).toBe(15);
      expect(callArgs[1].settings.billing_due_day).toBe(15);
    });

    it('c. tenant rt_rw tetap hanya mengirim due_day', async () => {
      renderComponent('tenant-rtrw-1');

      await waitFor(() => {
        expect(screen.getByDisplayValue('Palm Village RT 05')).toBeTruthy();
      });

      const dueDayInput = document.getElementById('billingDueDayInput');
      fireEvent.change(dueDayInput, { target: { value: '20' } });

      const saveBillingBtn = screen.getByRole('button', { name: /simpan tagihan/i });
      fireEvent.click(saveBillingBtn);

      await waitFor(() => {
        expect(tenantOperationalService.updateTenantProfileAndSettings).toHaveBeenCalled();
      });

      const callArgs = tenantOperationalService.updateTenantProfileAndSettings.mock.calls[0];
      expect(callArgs[1].settings.due_day).toBe(20);
      expect(callArgs[1].settings.billing_due_day).toBeUndefined();
    });
  });

  describe('Pengaturan Iklan Otomatis Kamar Kos (LIST-AUTO-1.2)', () => {
    const sampleKosDetails = {
      id: 'tenant-kos-1',
      name: 'Kos Harmoni Melati',
      type: 'kos',
      address: 'Jl. Melati No. 10',
      contact_phone: '081234567891',
      settings: {
        due_day: 1,
        billing_due_day: 1,
        auto_listing_on_vacant: false,
        listing_contact_phone: '',
        listing_default_category: 'Campur',
      },
    };

    beforeEach(() => {
      mockTenantContext.tenantType = 'kos';
      mockTenantContext.activeTenant = { id: 'tenant-kos-1', name: 'Kos Harmoni Melati', type: 'kos' };
      mockTenantContext.activeTenantId = 'tenant-kos-1';
      mockTenantContext.isOwner = true;
      mockTenantContext.hasPermission.mockReturnValue(true);
      tenantOperationalService.fetchTenantDetails.mockResolvedValue(sampleKosDetails);
    });

    it('a. merender section iklan otomatis hanya untuk tenant tipe kos', async () => {
      renderComponent('tenant-kos-1');

      await waitFor(() => {
        expect(screen.getByTestId('kos-auto-listing-section')).toBeTruthy();
      });

      expect(screen.getByLabelText(/Nomor WhatsApp Iklan/i)).toBeTruthy();
      expect(screen.getByLabelText(/Tipe Kamar Default/i)).toBeTruthy();
      expect(screen.getByLabelText(/Iklankan otomatis saat kamar kosong/i)).toBeTruthy();
    });

    it('b. sakelar tidak bisa dinyalakan sampai nomor WhatsApp valid (normalizePhoneNumber)', async () => {
      renderComponent('tenant-kos-1');

      await waitFor(() => {
        expect(screen.getByTestId('kos-auto-listing-section')).toBeTruthy();
      });

      const phoneInput = document.getElementById('listingContactPhoneInput');
      const toggle = document.getElementById('autoListingOnVacantToggle');

      // Saat nomor kosong, toggle harus disabled
      expect(phoneInput.value).toBe('');
      expect(toggle.disabled).toBe(true);

      // Masukkan nomor tidak valid (kurang dari panjang minimal)
      fireEvent.change(phoneInput, { target: { value: '08' } });
      expect(toggle.disabled).toBe(true);

      // Masukkan nomor valid
      fireEvent.change(phoneInput, { target: { value: '081234567890' } });
      expect(toggle.disabled).toBe(false);

      // Sakelar kini bisa dinyalakan
      fireEvent.click(toggle);
      expect(toggle.checked).toBe(true);
    });

    it('c. menyimpan pengaturan iklan otomatis dan menggabungkan ke settings', async () => {
      renderComponent('tenant-kos-1');

      await waitFor(() => {
        expect(screen.getByTestId('kos-auto-listing-section')).toBeTruthy();
      });

      const phoneInput = document.getElementById('listingContactPhoneInput');
      const categorySelect = document.getElementById('listingDefaultCategorySelect');
      const toggle = document.getElementById('autoListingOnVacantToggle');

      fireEvent.change(phoneInput, { target: { value: '081234567890' } });
      fireEvent.change(categorySelect, { target: { value: 'Putri' } });
      fireEvent.click(toggle);

      const saveBtn = screen.getByRole('button', { name: /Simpan Pengaturan Iklan/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(tenantOperationalService.updateTenantProfileAndSettings).toHaveBeenCalledWith(
          'tenant-kos-1',
          {
            settings: {
              auto_listing_on_vacant: true,
              listing_contact_phone: '081234567890',
              listing_default_category: 'Putri',
            },
          }
        );
      });
    });

    it('d. hanya owner atau pengguna dengan manage_settings yang dapat mengubah pengaturan', async () => {
      mockTenantContext.isOwner = false;
      mockTenantContext.hasPermission.mockImplementation((p) => p !== 'manage_settings');

      renderComponent('tenant-kos-1');

      await waitFor(() => {
        expect(screen.getByTestId('kos-auto-listing-section')).toBeTruthy();
      });

      const phoneInput = document.getElementById('listingContactPhoneInput');
      const toggle = document.getElementById('autoListingOnVacantToggle');
      const saveBtn = screen.getByRole('button', { name: /Simpan Pengaturan Iklan/i });

      expect(phoneInput.disabled).toBe(true);
      expect(toggle.disabled).toBe(true);
      expect(saveBtn.disabled).toBe(true);
    });
  });
});

