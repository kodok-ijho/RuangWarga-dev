// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ChooseTenantType, { TENANT_TYPE_OPTIONS } from './ChooseTenantType';
import PanitiaSetupWizard from './PanitiaSetupWizard';
import * as tenantOperationalService from '../../services/tenantOperationalService';

// Polyfill ResizeObserver untuk jsdom
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
  activeTenant: { id: 'tenant-panitia-123', name: 'Panitia Dies Natalis 2026', type: 'panitia' },
  activeTenantId: 'tenant-panitia-123',
  switchTenant: mockSwitchTenant,
  refreshTenant: mockRefreshTenant,
  isTenantAdmin: true,
  createTenant: vi.fn().mockResolvedValue({ id: 'tenant-new-456', name: 'Panitia Baru', type: 'panitia' }),
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

describe('PANITIA-1.3 Kepanitiaan Setup & Onboarding', () => {
  const mockTenantId = 'tenant-panitia-123';

  beforeEach(() => {
    vi.clearAllMocks();

    tenantOperationalService.fetchTenantDetails.mockResolvedValue({
      id: mockTenantId,
      name: 'Panitia Dies Natalis 2026',
      type: 'panitia',
      contact_phone: '081234567890',
      settings: {
        organization_type: 'Kampus/BEM',
      },
    });

    tenantOperationalService.fetchTenantInviteCode.mockResolvedValue('PANITIA-INVITE-2026');
    tenantOperationalService.updateTenantProfileAndSettings.mockResolvedValue({ success: true });
    tenantOperationalService.bulkCreateTenantUnits.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  describe('ChooseTenantType — Kepanitiaan & Acara', () => {
    it('menampilkan opsi Kepanitiaan & Acara dan TIDAK menampilkan Kelas & Kursus', () => {
      render(
        <MemoryRouter initialEntries={['/onboarding/choose-type']}>
          <Routes>
            <Route path="/onboarding/choose-type" element={<ChooseTenantType />} />
          </Routes>
        </MemoryRouter>
      );

      // Verifikasi Kepanitiaan & Acara muncul di layar
      expect(screen.getByText('Kepanitiaan & Acara')).toBeDefined();
      expect(screen.getByText(/Keuangan acara organisasi: anggaran, pemasukan, pengeluaran, laporan/i)).toBeDefined();

      // Verifikasi Kelas & Kursus TIDAK muncul
      expect(screen.queryByText('Kelas & Kursus')).toBeNull();
      expect(screen.queryByText('SPP / Iuran')).toBeNull();
    });

    it('memastikan TENANT_TYPE_OPTIONS berisi panitia dan tidak berisi kelas', () => {
      const types = TENANT_TYPE_OPTIONS.map((o) => o.type);
      expect(types).toContain('panitia');
      expect(types).not.toContain('kelas');
    });
  });

  describe('PanitiaSetupWizard — Flow Inisiasi & Tanpa Pembuatan Unit', () => {
    it('menyimpan settings kepanitiaan tanpa memanggil pembuatan unit', async () => {
      render(
        <MemoryRouter initialEntries={[`/t/${mockTenantId}/setup`]}>
          <Routes>
            <Route
              path="/t/:tenantId/setup"
              element={<PanitiaSetupWizard tenantId={mockTenantId} />}
            />
          </Routes>
        </MemoryRouter>
      );

      // Tunggu hingga form ter-render dengan initial data
      await waitFor(() => {
        expect(screen.getByDisplayValue('Panitia Dies Natalis 2026')).toBeDefined();
      });

      // Langkah 1: Klik tombol Lanjut ke Langkah 2 (Rekening)
      const nextBtn = screen.getByRole('button', { name: /Lanjut/i });
      fireEvent.click(nextBtn);

      // Langkah 2: Layar Rekening Penerima
      await waitFor(() => {
        expect(screen.getByText(/Rekening untuk penerimaan transfer iuran, sponsor, atau donasi acara/i)).toBeDefined();
      });

      // Selesaikan setup
      const finishBtn = screen.getByRole('button', { name: /Selesaikan Setup/i });
      fireEvent.click(finishBtn);

      // Verifikasi bahwa updateTenantProfileAndSettings dipanggil
      await waitFor(() => {
        expect(tenantOperationalService.updateTenantProfileAndSettings).toHaveBeenCalledWith(
          mockTenantId,
          expect.objectContaining({
            name: 'Panitia Dies Natalis 2026',
            settings: expect.objectContaining({
              organization_type: 'Kampus/BEM',
              onboarding_completed: true,
              is_setup_completed: true,
            }),
          })
        );
      });

      // PENTING: Verifikasi bahwa bulkCreateTenantUnits TIDAK PERNAH dipanggil (hasUnits = false)
      expect(tenantOperationalService.bulkCreateTenantUnits).not.toHaveBeenCalled();

      // Verifikasi layar sukses tampil
      await waitFor(() => {
        expect(screen.getByText(/Panitia Dies Natalis 2026 Siap Digunakan!/i)).toBeDefined();
        expect(screen.getByText(/Buat Acara Pertama/i)).toBeDefined();
      });

      // Verifikasi tautan ke /t/:tenantId/programs
      const createProgramLink = screen.getByRole('link', { name: /Buat Acara Pertama/i });
      expect(createProgramLink.getAttribute('href')).toBe(`/t/${mockTenantId}/programs`);
    });
  });
});
