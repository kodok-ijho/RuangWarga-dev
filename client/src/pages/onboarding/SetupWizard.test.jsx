// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SetupWizard, { selectNewUnitLabels } from './SetupWizard';
import * as tenantOperationalService from '../../services/tenantOperationalService';

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

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

const mockRefreshTenant = vi.fn().mockResolvedValue({});
const mockSwitchTenant = vi.fn();

let mockTenantContext = {
  activeTenant: { id: 'tenant-test-123', name: 'Komplek Asri RT 01', type: 'rt_rw' },
  activeTenantId: 'tenant-test-123',
  switchTenant: mockSwitchTenant,
  refreshTenant: mockRefreshTenant,
  isTenantAdmin: true,
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => mockTenantContext,
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
    bulkCreateTenantUnits: vi.fn(),
    fetchTenantInviteCode: vi.fn(),
    saveInviteCodeWithRetry: vi.fn(),
    updateTenantProfileAndSettings: vi.fn(),
  };
});

describe('SetupWizard — Logika Idempoten & Aman Dijalankan Ulang (RTRW-2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Pure Function: selectNewUnitLabels(existingUnits, unitList)', () => {
    it('a.1: mengabaikan label yang sudah ada meskipun berbeda huruf besar/kecil dan spasi', () => {
      const existingUnits = [
        { id: 1, label: '  Blok A-01 ' },
        { id: 2, label: 'BLOK A-02' },
        { id: 3, label: 'blok a-03' },
      ];

      const unitList = [
        { label: 'blok a-01' },
        { label: '  Blok A-02  ' },
        { label: 'BLOK A-03' },
        { label: 'Blok A-04' },
      ];

      const result = selectNewUnitLabels(existingUnits, unitList);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(['Blok A-04']);
      expect(result.length).toBe(1);
    });

    it('a.2: membuang duplikat di dalam input unitList itu sendiri', () => {
      const existingUnits = [];
      const unitList = [
        { label: 'Blok B-01' },
        { label: '  blok b-01 ' },
        { label: 'BLOK B-01' },
        { label: 'Blok B-02' },
        { label: 'blok b-02' },
      ];

      const result = selectNewUnitLabels(existingUnits, unitList);

      expect(result).toEqual(['Blok B-01', 'Blok B-02']);
      expect(result.length).toBe(2);
    });

    it('a.3: menangani input array of strings maupun array of objects', () => {
      const existingUnits = ['Blok A-01', 'Blok A-02'];
      const unitList = ['blok a-01', 'Blok A-03', '  blok a-03  '];

      const result = selectNewUnitLabels(existingUnits, unitList);

      expect(result).toEqual(['Blok A-03']);
      expect(result.length).toBe(1);
    });

    it('a.4: menangani data kosong, string spasi, atau undefined secara aman', () => {
      expect(selectNewUnitLabels([], [])).toEqual([]);
      expect(selectNewUnitLabels(null, null)).toEqual([]);
      expect(selectNewUnitLabels(undefined, [{ label: '   ' }, {}, null])).toEqual([]);
    });

    it('a.5: jika semua unit sudah ada, mengembalikan array kosong', () => {
      const existingUnits = [
        { label: 'Blok A-01' },
        { label: 'Blok A-02' },
        { label: 'Blok A-03' },
      ];
      const unitList = [
        { label: 'blok a-01' },
        { label: 'blok a-02' },
        { label: 'blok a-03' },
      ];

      const result = selectNewUnitLabels(existingUnits, unitList);

      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });
  });

  describe('Component Flow: SetupWizard Execution', () => {
    const mockTenantDetailsData = {
      id: 'tenant-test-123',
      name: 'Komplek Permata Hijau',
      type: 'rt_rw',
      address: 'Jl. Melati No. 12',
      contact_phone: '08123456789',
      settings: {
        due_day: 15,
        ipl_components: [{ id: 'comp-1', name: 'IPL Bulanan', amount: 150000 }],
        bank_account: {
          bank_name: 'BCA',
          account_number: '1234567890',
          account_holder: 'Pengurus RT',
        },
      },
    };

    function renderWizard(tenantId = 'tenant-test-123') {
      return render(
        <MemoryRouter initialEntries={[`/t/${tenantId}/setup`]}>
          <Routes>
            <Route path="/t/:tenantId/setup" element={<SetupWizard />} />
          </Routes>
        </MemoryRouter>
      );
    }

    it('b: jika semua unit sudah ada → bulkCreateTenantUnits tidak dipanggil', async () => {
      tenantOperationalService.fetchTenantDetails.mockResolvedValue(mockTenantDetailsData);
      // Default wizard membuat 10 unit: Blok A-01 s/d Blok A-10
      const allExistingUnits = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        label: `Blok A-${String(i + 1).padStart(2, '0')}`,
      }));
      tenantOperationalService.fetchTenantUnits.mockResolvedValue(allExistingUnits);
      tenantOperationalService.fetchTenantInviteCode.mockResolvedValue('EXISTING-INVITE-CODE');
      tenantOperationalService.updateTenantProfileAndSettings.mockResolvedValue({});

      renderWizard();

      // Tunggu selesai loading awal
      await waitFor(() => {
        expect(screen.getByText('Panduan Pengaturan Awal Komplek')).toBeTruthy();
      });

      // Pindah ke Langkah 4: Konfirmasi
      const step4Button = screen.getByRole('button', { name: /Konfirmasi/i });
      fireEvent.click(step4Button);

      // Klik tombol Simpan & Terapkan Pengaturan
      const submitButton = screen.getByRole('button', { name: /Selesaikan Setup & Aktifkan Layanan/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Setup Wizard Selesai/i)).toBeTruthy();
      });

      // Assert: bulkCreateTenantUnits TIDAK dipanggil karena semua unit sudah ada
      expect(tenantOperationalService.bulkCreateTenantUnits).not.toHaveBeenCalled();

      // Assert: toast dan layar selesai menampilkan informasi unit baru (0) vs dilewati (10)
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringContaining('0 rumah baru ditambahkan, 10 sudah ada.')
      );
      expect(screen.getByText('(0 rumah baru ditambahkan, 10 sudah ada.)')).toBeTruthy();
    });

    it('c.1: jika kode undangan sudah ada → saveInviteCodeWithRetry tidak dipanggil dan kode lama dipakai', async () => {
      tenantOperationalService.fetchTenantDetails.mockResolvedValue(mockTenantDetailsData);
      tenantOperationalService.fetchTenantUnits.mockResolvedValue([]);
      tenantOperationalService.bulkCreateTenantUnits.mockResolvedValue([]);
      // Kode undangan sudah ada di DB
      tenantOperationalService.fetchTenantInviteCode.mockResolvedValue('RW-PALM-LAMA-1234');
      tenantOperationalService.updateTenantProfileAndSettings.mockResolvedValue({});

      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Panduan Pengaturan Awal Komplek')).toBeTruthy();
      });

      // Pindah ke Step 4 & Simpan
      const step4Button = screen.getByRole('button', { name: /Konfirmasi/i });
      fireEvent.click(step4Button);

      const submitButton = screen.getByRole('button', { name: /Selesaikan Setup & Aktifkan Layanan/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Setup Wizard Selesai/i)).toBeTruthy();
      });

      // Assert: saveInviteCodeWithRetry TIDAK dipanggil
      expect(tenantOperationalService.saveInviteCodeWithRetry).not.toHaveBeenCalled();

      // Assert: kode lama dipakai pada layar selesai
      const inviteInput = screen.getByDisplayValue(/RW-PALM-LAMA-1234/);
      expect(inviteInput).toBeTruthy();
    });

    it('c.2: jika kode undangan belum ada → saveInviteCodeWithRetry dipanggil untuk membuat baru', async () => {
      tenantOperationalService.fetchTenantDetails.mockResolvedValue(mockTenantDetailsData);
      tenantOperationalService.fetchTenantUnits.mockResolvedValue([]);
      tenantOperationalService.bulkCreateTenantUnits.mockResolvedValue([]);
      // Belum ada kode undangan
      tenantOperationalService.fetchTenantInviteCode.mockResolvedValue(null);
      tenantOperationalService.saveInviteCodeWithRetry.mockResolvedValue('RW-BARU-5678');
      tenantOperationalService.updateTenantProfileAndSettings.mockResolvedValue({});

      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Panduan Pengaturan Awal Komplek')).toBeTruthy();
      });

      // Pindah ke Step 4 & Simpan
      const step4Button = screen.getByRole('button', { name: /Konfirmasi/i });
      fireEvent.click(step4Button);

      const submitButton = screen.getByRole('button', { name: /Selesaikan Setup & Aktifkan Layanan/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Setup Wizard Selesai/i)).toBeTruthy();
      });

      // Assert: saveInviteCodeWithRetry DIPANGGIL
      expect(tenantOperationalService.saveInviteCodeWithRetry).toHaveBeenCalledWith(
        'tenant-test-123',
        'Komplek Permata Hijau'
      );

      // Assert: kode baru dipakai pada layar selesai
      const inviteInput = screen.getByDisplayValue(/RW-BARU-5678/);
      expect(inviteInput).toBeTruthy();
    });

    it('kombinasi: 3 unit baru dan 7 unit sudah ada → hanya kirim 3 unit baru ke bulkCreateTenantUnits', async () => {
      tenantOperationalService.fetchTenantDetails.mockResolvedValue(mockTenantDetailsData);
      // 7 unit pertama (Blok A-01 s/d Blok A-07) sudah ada di database
      const existingUnits = Array.from({ length: 7 }, (_, i) => ({
        id: i + 1,
        label: `Blok A-${String(i + 1).padStart(2, '0')}`,
      }));
      tenantOperationalService.fetchTenantUnits.mockResolvedValue(existingUnits);
      tenantOperationalService.bulkCreateTenantUnits.mockResolvedValue([]);
      tenantOperationalService.fetchTenantInviteCode.mockResolvedValue('EXISTING-CODE');
      tenantOperationalService.updateTenantProfileAndSettings.mockResolvedValue({});

      renderWizard();

      await waitFor(() => {
        expect(screen.getByText('Panduan Pengaturan Awal Komplek')).toBeTruthy();
      });

      // Pindah ke Step 4 & Simpan
      const step4Button = screen.getByRole('button', { name: /Konfirmasi/i });
      fireEvent.click(step4Button);

      const submitButton = screen.getByRole('button', { name: /Selesaikan Setup & Aktifkan Layanan/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Setup Wizard Selesai/i)).toBeTruthy();
      });

      // Assert: bulkCreateTenantUnits dipanggil HANYA dengan 3 unit baru (A-08, A-09, A-10)
      expect(tenantOperationalService.bulkCreateTenantUnits).toHaveBeenCalledTimes(1);
      const passedUnits = tenantOperationalService.bulkCreateTenantUnits.mock.calls[0][1];
      expect(passedUnits).toHaveLength(3);
      expect(passedUnits.map((u) => u.label)).toEqual(['Blok A-08', 'Blok A-09', 'Blok A-10']);

      // Assert: toast & pesan selesai memuat "3 rumah baru ditambahkan, 7 sudah ada."
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringContaining('3 rumah baru ditambahkan, 7 sudah ada.')
      );
      expect(screen.getByText('(3 rumah baru ditambahkan, 7 sudah ada.)')).toBeTruthy();
    });
  });
});
