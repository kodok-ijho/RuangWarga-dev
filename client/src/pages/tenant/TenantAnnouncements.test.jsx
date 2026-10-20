// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TenantAnnouncements from './TenantAnnouncements';
import * as tenantOperationalService from '../../services/tenantOperationalService';

afterEach(cleanup);

if (typeof window !== 'undefined' && !window.URL.createObjectURL) {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-image-url');
}

let mockTenantContext = {
  activeTenant: { id: 'tenant-test-1', name: 'Kompleks RT 01', type: 'rt_rw' },
  activeTenantId: 'tenant-test-1',
  tenantType: 'rt_rw',
  isOwner: true,
};

let mockTenantAccess = {
  canManageAnnouncements: true,
  isMember: true,
  canWrite: true,
};

let mockSubscriptionGate = {
  canTransact: true,
  isReadOnly: false,
  tooltip: '',
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => mockTenantContext,
}));

vi.mock('../../hooks/useTenantAccess', () => ({
  useTenantAccess: () => mockTenantAccess,
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => mockSubscriptionGate,
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../services/tenantOperationalService', () => ({
  fetchTenantAnnouncements: vi.fn(),
  createTenantAnnouncement: vi.fn(),
  updateTenantAnnouncement: vi.fn(),
  deleteTenantAnnouncement: vi.fn(),
  uploadAnnouncementImage: vi.fn(),
  getAnnouncementImageUrl: vi.fn(),
}));

describe('TenantAnnouncements Component Tests (RTRW-3.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantContext = {
      activeTenant: { id: 'tenant-test-1', name: 'Kompleks RT 01', type: 'rt_rw' },
      activeTenantId: 'tenant-test-1',
      tenantType: 'rt_rw',
      isOwner: true,
    };
    mockTenantAccess = {
      canManageAnnouncements: true,
      isMember: true,
      canWrite: true,
    };
    mockSubscriptionGate = {
      canTransact: true,
      isReadOnly: false,
      tooltip: '',
    };
    tenantOperationalService.getAnnouncementImageUrl.mockResolvedValue('https://r2.test/image.png');
  });

  // (a) urutan disematkan dulu
  it('(a) menampilkan pengumuman yang disematkan di urutan teratas', async () => {
    const sampleAnnouncements = [
      {
        id: 'ann-1',
        title: 'Pengumuman Baru Tapi Tidak Disematkan',
        body: 'Isi pengumuman biasa',
        is_pinned: false,
        published_at: '2026-10-20T10:00:00Z',
      },
      {
        id: 'ann-2',
        title: 'Tata Tertib Warga (Disematkan)',
        body: 'Harap ditaati bersama',
        is_pinned: true,
        published_at: '2026-10-01T10:00:00Z',
      },
    ];

    tenantOperationalService.fetchTenantAnnouncements.mockResolvedValueOnce(sampleAnnouncements);

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/announcements']}>
        <TenantAnnouncements />
      </MemoryRouter>
    );

    expect(await screen.findByText('Tata Tertib Warga (Disematkan)')).toBeTruthy();
    expect(screen.getByText('Pengumuman Baru Tapi Tidak Disematkan')).toBeTruthy();

    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(2);
    // Kartu pertama harus yang disematkan
    expect(articles[0].textContent).toContain('Tata Tertib Warga (Disematkan)');
    expect(articles[0].textContent).toContain('Disematkan');
    // Kartu kedua adalah pengumuman biasa
    expect(articles[1].textContent).toContain('Pengumuman Baru Tapi Tidak Disematkan');
  });

  it('menampilkan keadaan kosong jika belum ada pengumuman', async () => {
    tenantOperationalService.fetchTenantAnnouncements.mockResolvedValueOnce([]);

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/announcements']}>
        <TenantAnnouncements />
      </MemoryRouter>
    );

    expect(await screen.findByText('Belum ada pengumuman.')).toBeTruthy();
  });

  // (b) tombol Buat/Ubah/Hapus hanya tampil bila canManageAnnouncements
  it('(b) tombol Buat, Ubah, dan Hapus hanya tampil jika canManageAnnouncements bernilai true', async () => {
    tenantOperationalService.fetchTenantAnnouncements.mockResolvedValue([
      {
        id: 'ann-1',
        title: 'Pengumuman RT',
        body: 'Isi pengumuman',
        is_pinned: false,
        published_at: '2026-10-20T10:00:00Z',
      },
    ]);

    // Kasus 1: canManageAnnouncements: true
    mockTenantAccess.canManageAnnouncements = true;

    const { unmount } = render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/announcements']}>
        <TenantAnnouncements />
      </MemoryRouter>
    );

    expect(await screen.findByText('Buat Pengumuman')).toBeTruthy();
    expect(screen.getByText('Ubah')).toBeTruthy();
    expect(screen.getByText('Hapus')).toBeTruthy();

    unmount();

    // Kasus 2: canManageAnnouncements: false (warga biasa)
    mockTenantAccess.canManageAnnouncements = false;

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/announcements']}>
        <TenantAnnouncements />
      </MemoryRouter>
    );

    expect(await screen.findByText('Pengumuman RT')).toBeTruthy();
    expect(screen.queryByText('Buat Pengumuman')).toBeNull();
    expect(screen.queryByText('Ubah')).toBeNull();
    expect(screen.queryByText('Hapus')).toBeNull();
  });

  // (c) href 'Bagikan ke WA' diawali 'https://wa.me/?text=' dan memuat judul ter-encode
  it('(c) href tombol "Bagikan ke WA" diawali https://wa.me/?text= dan memuat judul ter-encode', async () => {
    tenantOperationalService.fetchTenantAnnouncements.mockResolvedValueOnce([
      {
        id: 'ann-1',
        title: 'Kerja Bakti Warga RT 05',
        body: 'Pembersihan selokan utama komplek.',
        is_pinned: false,
        published_at: '2026-10-20T10:00:00Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/announcements']}>
        <TenantAnnouncements />
      </MemoryRouter>
    );

    expect(await screen.findByText('Kerja Bakti Warga RT 05')).toBeTruthy();

    const waLink = screen.getByText('Bagikan ke WA').closest('a');
    expect(waLink).toBeTruthy();
    expect(waLink.getAttribute('target')).toBe('_blank');
    expect(waLink.getAttribute('rel')).toBe('noopener noreferrer');

    const href = waLink.getAttribute('href');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(href).toContain(encodeURIComponent('Kerja Bakti Warga RT 05'));
    expect(href).toContain(encodeURIComponent('Pembersihan selokan utama komplek.'));
    expect(href).toContain(encodeURIComponent('/t/tenant-test-1/announcements'));
  });

  // (d) simpan dengan gambar memanggil uploadAnnouncementImage lalu createTenantAnnouncement dengan image_path
  it('(d) simpan dengan gambar memanggil uploadAnnouncementImage lalu createTenantAnnouncement dengan image_path', async () => {
    tenantOperationalService.fetchTenantAnnouncements.mockResolvedValue([]);
    tenantOperationalService.uploadAnnouncementImage.mockResolvedValue(
      'tenants/tenant-test-1/announcements/poster-123.png'
    );
    tenantOperationalService.createTenantAnnouncement.mockResolvedValue({
      id: 'new-ann-1',
      title: 'Pesta Rakyat Kemerdekaan',
      image_path: 'tenants/tenant-test-1/announcements/poster-123.png',
    });

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/announcements']}>
        <TenantAnnouncements />
      </MemoryRouter>
    );

    // Buka modal buat pengumuman
    const btnBuat = await screen.findByText('Buat Pengumuman');
    fireEvent.click(btnBuat);

    expect(screen.getByText('Buat Pengumuman Baru')).toBeTruthy();

    // Isi formulir
    const inputTitle = screen.getByLabelText(/Judul Pengumuman/);
    fireEvent.change(inputTitle, { target: { value: 'Pesta Rakyat Kemerdekaan' } });

    const inputBody = screen.getByLabelText(/Isi Pengumuman/);
    fireEvent.change(inputBody, { target: { value: 'Lomba dan panggung hiburan.' } });

    const checkboxPin = screen.getByLabelText(/Sematkan di atas/);
    fireEvent.click(checkboxPin);

    // Upload file gambar
    const testFile = new File(['dummy-content'], 'poster.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    // Submit formulir
    const submitBtn = screen.getByText('Terbitkan Pengumuman');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.uploadAnnouncementImage).toHaveBeenCalledWith(
        'tenant-test-1',
        testFile
      );
    });

    expect(tenantOperationalService.createTenantAnnouncement).toHaveBeenCalledWith(
      'tenant-test-1',
      expect.objectContaining({
        title: 'Pesta Rakyat Kemerdekaan',
        body: 'Lomba dan panggung hiburan.',
        is_pinned: true,
        image_path: 'tenants/tenant-test-1/announcements/poster-123.png',
      })
    );

    expect(mockToast.success).toHaveBeenCalledWith('Pengumuman berhasil dibuat.');
  });

  // (e) hapus memanggil deleteTenantAnnouncement setelah konfirmasi
  it('(e) hapus memanggil deleteTenantAnnouncement setelah konfirmasi di modal', async () => {
    tenantOperationalService.fetchTenantAnnouncements.mockResolvedValue([
      {
        id: 'ann-del-1',
        title: 'Pengumuman Yang Akan Dihapus',
        body: 'Isi teks pengumuman',
        is_pinned: false,
        published_at: '2026-10-20T10:00:00Z',
      },
    ]);
    tenantOperationalService.deleteTenantAnnouncement.mockResolvedValue({ success: true });

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/announcements']}>
        <TenantAnnouncements />
      </MemoryRouter>
    );

    expect(await screen.findByText('Pengumuman Yang Akan Dihapus')).toBeTruthy();

    // Klik tombol hapus
    const btnHapus = screen.getByText('Hapus');
    fireEvent.click(btnHapus);

    // Modal konfirmasi harus terbuka
    expect(screen.getByText(/Apakah Anda yakin ingin menghapus pengumuman/)).toBeTruthy();

    // Klik tombol konfirmasi hapus di dalam modal
    const confirmDeleteBtn = screen.getByRole('button', { name: 'Hapus Pengumuman' });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(tenantOperationalService.deleteTenantAnnouncement).toHaveBeenCalledWith('ann-del-1');
    });

    expect(mockToast.success).toHaveBeenCalledWith('Pengumuman berhasil dihapus.');
  });

  it('menonaktifkan tombol tulis dengan tooltip bila status langganan read_only', async () => {
    mockSubscriptionGate = {
      canTransact: false,
      isReadOnly: true,
      tooltip: 'Paket langganan dalam status hanya-baca.',
    };
    tenantOperationalService.fetchTenantAnnouncements.mockResolvedValue([
      {
        id: 'ann-ro-1',
        title: 'Pengumuman Read Only',
        body: 'Isi teks',
        is_pinned: false,
        published_at: '2026-10-20T10:00:00Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/announcements']}>
        <TenantAnnouncements />
      </MemoryRouter>
    );

    const btnBuat = await screen.findByText('Buat Pengumuman');
    expect(btnBuat.closest('button').disabled).toBe(true);
    expect(btnBuat.closest('button').getAttribute('title')).toBe(
      'Paket langganan dalam status hanya-baca.'
    );

    const btnUbah = screen.getByText('Ubah').closest('button');
    expect(btnUbah.disabled).toBe(true);

    const btnHapus = screen.getByText('Hapus').closest('button');
    expect(btnHapus.disabled).toBe(true);
  });
});
