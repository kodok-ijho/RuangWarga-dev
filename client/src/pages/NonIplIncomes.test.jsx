import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import NonIplIncomes from './NonIplIncomes';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useTenant', () => ({
  useTenant: vi.fn(),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: vi.fn().mockReturnValue({
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../services/dataService', () => ({
  fetchNonIplIncomes: vi.fn().mockResolvedValue([]),
  fetchEvents: vi.fn().mockResolvedValue([]),
  fetchMyEventAccess: vi.fn().mockResolvedValue({ events: [] }),
  createNonIplIncome: vi.fn(),
  updateNonIplIncome: vi.fn(),
  deleteNonIplIncome: vi.fn(),
  approveNonIplIncome: vi.fn(),
  rejectNonIplIncome: vi.fn(),
  createNonIplQrisPayment: vi.fn(),
}));

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    })),
  },
}));

const cleanHtml = (str) => str.replace(/<!--.*?-->/g, '');

describe('PAY-2F.3 — NonIplIncomes UI & Bank Account Consistency (F13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menyembunyikan input upload bukti dan men-disable submit saat rekening bank null pada metode transfer', () => {
    useAuth.mockReturnValue({
      role: 'warga',
      profile: { full_name: 'Budi Warga' },
      session: { access_token: 'fake-token' },
      isReadOnly: false,
    });

    useTenant.mockReturnValue({
      activeTenant: {
        id: 'tenant-no-bank',
        name: 'Warga Harmoni',
        settings: {
          // bank_account kosong
        },
      },
    });

    const html = cleanHtml(
      renderToString(
        <MemoryRouter>
          <NonIplIncomes />
        </MemoryRouter>
      )
    );

    // Instruksi bank transfer menampilkan pesan rekening belum dikonfigurasi
    expect(html).toContain('Rekening pengelola belum dikonfigurasi');
    // Input upload bukti TIDAK dirender
    expect(html).not.toContain('Upload Foto / Screenshot Bukti Transfer');
    expect(html).not.toContain('type="file"');
    // Tombol submit ter-disable dengan teks 'Rekening Belum Tersedia'
    expect(html).toContain('Rekening Belum Tersedia');
    expect(html).toContain('disabled=""');
  });

  it('merender input upload bukti dan mengaktifkan submit saat rekening bank terkonfigurasi', () => {
    useAuth.mockReturnValue({
      role: 'warga',
      profile: { full_name: 'Budi Warga' },
      session: { access_token: 'fake-token' },
      isReadOnly: false,
    });

    useTenant.mockReturnValue({
      activeTenant: {
        id: 'tenant-with-bank',
        name: 'Palm Village RT 05',
        settings: {
          bank_account: {
            bank_name: 'BCA',
            account_number: '8830123456',
            account_holder: 'Kas RT 05',
          },
        },
      },
    });

    const html = cleanHtml(
      renderToString(
        <MemoryRouter>
          <NonIplIncomes />
        </MemoryRouter>
      )
    );

    // Nomor dan rincian rekening muncul
    expect(html).toContain('Bank BCA: 8830123456');
    expect(html).toContain('Kas RT 05');
    // Input upload bukti DIRENDER
    expect(html).toContain('Upload Foto / Screenshot Bukti Transfer');
    expect(html).toContain('type="file"');
    // Tombol submit siap untuk warga
    expect(html).toContain('Kirim Bukti Transfer');
    expect(html).not.toContain('Rekening Belum Tersedia');
  });

  it('mengizinkan staf mencatat transaksi cash meskipun rekening bank tenant null', () => {
    useAuth.mockReturnValue({
      role: 'bendahara',
      profile: { full_name: 'Siti Bendahara' },
      session: { access_token: 'fake-token' },
      isReadOnly: false,
    });

    useTenant.mockReturnValue({
      activeTenant: {
        id: 'tenant-no-bank',
        name: 'Warga Mandiri',
        settings: {},
      },
    });

    const html = cleanHtml(
      renderToString(
        <MemoryRouter>
          <NonIplIncomes />
        </MemoryRouter>
      )
    );

    // Staf secara default menggunakan cash (tunai)
    expect(html).toContain('Simpan Pemasukan');
    expect(html).not.toContain('Rekening Belum Tersedia');
  });

  it('menyembunyikan opsi QRIS bila tenant tidak memiliki flag legacy_qris_enabled', () => {
    useAuth.mockReturnValue({
      role: 'warga',
      profile: { full_name: 'Budi Warga' },
      session: { access_token: 'fake-token' },
      isReadOnly: false,
    });

    useTenant.mockReturnValue({
      activeTenant: {
        id: 'tenant-no-qris',
        name: 'RT 01 Tanpa QRIS',
        settings: {
          legacy_qris_enabled: false,
        },
      },
    });

    const html = cleanHtml(
      renderToString(
        <MemoryRouter>
          <NonIplIncomes />
        </MemoryRouter>
      )
    );

    expect(html).not.toContain('value="qris"');
    expect(html).not.toContain('📱 QRIS');
  });

  it('menampilkan opsi QRIS bila tenant memiliki flag legacy_qris_enabled: true', () => {
    useAuth.mockReturnValue({
      role: 'warga',
      profile: { full_name: 'Budi Warga' },
      session: { access_token: 'fake-token' },
      isReadOnly: false,
    });

    useTenant.mockReturnValue({
      activeTenant: {
        id: 'demo-tenant-rtrw',
        name: 'Palm Village RT 05',
        settings: {
          legacy_qris_enabled: true,
        },
      },
    });

    const html = cleanHtml(
      renderToString(
        <MemoryRouter>
          <NonIplIncomes />
        </MemoryRouter>
      )
    );

    expect(html).toContain('value="qris"');
    expect(html).toContain('📱 QRIS');
  });
});
