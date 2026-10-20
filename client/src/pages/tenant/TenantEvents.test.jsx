// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TenantEvents, {
  datetimeLocalToWibIso,
  isoToWibDatetimeLocal,
  getEventDateParts,
} from './TenantEvents';
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
  fetchTenantEvents: vi.fn(),
  createTenantEvent: vi.fn(),
  updateTenantEvent: vi.fn(),
  deleteTenantEvent: vi.fn(),
  uploadAnnouncementImage: vi.fn(),
  getAnnouncementImageUrl: vi.fn(),
}));

describe('TenantEvents Helper Functions (WIB & Date Parsing)', () => {
  it('datetimeLocalToWibIso mengonversi waktu lokal WIB ke ISO 8601 UTC yang benar', () => {
    // 19:30 WIB (+07:00) sama persis dengan 12:30:00.000Z
    expect(datetimeLocalToWibIso('2026-11-01T19:30')).toBe('2026-11-01T12:30:00.000Z');
    expect(datetimeLocalToWibIso('2026-11-01T19:30:00')).toBe('2026-11-01T12:30:00.000Z');
    expect(datetimeLocalToWibIso('2026-11-01T07:00')).toBe('2026-11-01T00:00:00.000Z');
    expect(datetimeLocalToWibIso('')).toBeNull();
    expect(datetimeLocalToWibIso(null)).toBeNull();
  });

  it('isoToWibDatetimeLocal mengonversi ISO UTC ke string input datetime-local dalam zona WIB', () => {
    expect(isoToWibDatetimeLocal('2026-11-01T12:30:00.000Z')).toBe('2026-11-01T19:30');
    expect(isoToWibDatetimeLocal('2026-11-01T00:00:00.000Z')).toBe('2026-11-01T07:00');
    expect(isoToWibDatetimeLocal('')).toBe('');
    expect(isoToWibDatetimeLocal(null)).toBe('');
  });

  it('getEventDateParts mengembalikan tanggal besar dan nama bulan dalam zona WIB', () => {
    const parts = getEventDateParts('2026-11-01T12:30:00.000Z');
    expect(parts.day).toBe('1');
    expect(parts.month.toLowerCase()).toContain('nov');
  });
});

describe('TenantEvents Component Tests (RTRW-3.2c)', () => {
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
    tenantOperationalService.getAnnouncementImageUrl.mockResolvedValue('https://r2.test/poster.png');
  });

  // (a) tab Mendatang memanggil scope upcoming, tab Selesai memanggil scope past
  it('(a) tab Mendatang memanggil scope upcoming dan tab Selesai memanggil scope past', async () => {
    tenantOperationalService.fetchTenantEvents.mockResolvedValue([
      {
        id: 'evt-1',
        title: 'Kerja Bakti Lingkungan',
        description: 'Pembersihan saluran air komplek',
        location: 'Balai RT 05',
        starts_at: '2026-11-01T01:00:00.000Z',
        ends_at: '2026-11-01T04:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/events']}>
        <TenantEvents />
      </MemoryRouter>
    );

    // Pertama kali dimuat dengan tab default 'upcoming'
    await waitFor(() => {
      expect(tenantOperationalService.fetchTenantEvents).toHaveBeenCalledWith('tenant-test-1', {
        scope: 'upcoming',
      });
    });
    expect(await screen.findByText('Kerja Bakti Lingkungan')).toBeTruthy();

    // Pindah ke tab Selesai
    const tabSelesai = screen.getByRole('button', { name: 'Selesai' });
    fireEvent.click(tabSelesai);

    await waitFor(() => {
      expect(tenantOperationalService.fetchTenantEvents).toHaveBeenCalledWith('tenant-test-1', {
        scope: 'past',
      });
    });

    // Pindah kembali ke tab Mendatang
    const tabMendatang = screen.getByRole('button', { name: 'Mendatang' });
    fireEvent.click(tabMendatang);

    await waitFor(() => {
      expect(tenantOperationalService.fetchTenantEvents).toHaveBeenCalledWith('tenant-test-1', {
        scope: 'upcoming',
      });
    });
  });

  it('menampilkan keadaan kosong spesifik per tab: "Belum ada acara mendatang." dan "Belum ada acara yang selesai."', async () => {
    tenantOperationalService.fetchTenantEvents.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/events']}>
        <TenantEvents />
      </MemoryRouter>
    );

    // Tab Mendatang kosong
    expect(await screen.findByText('Belum ada acara mendatang.')).toBeTruthy();

    // Pindah ke tab Selesai
    const tabSelesai = screen.getByRole('button', { name: 'Selesai' });
    fireEvent.click(tabSelesai);

    // Tab Selesai kosong
    expect(await screen.findByText('Belum ada acara yang selesai.')).toBeTruthy();
  });

  // (b) tombol tulis hanya untuk canManageAnnouncements
  it('(b) tombol Buat Acara, Ubah, dan Hapus hanya tampil jika canManageAnnouncements bernilai true', async () => {
    tenantOperationalService.fetchTenantEvents.mockResolvedValue([
      {
        id: 'evt-1',
        title: 'Rapat Warga RT 05',
        description: 'Musyawarah pemilihan pengurus.',
        location: 'Rumah Ketua RT',
        starts_at: '2026-11-05T12:30:00.000Z',
      },
    ]);

    // Kasus 1: canManageAnnouncements = true
    mockTenantAccess.canManageAnnouncements = true;

    const { unmount } = render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/events']}>
        <TenantEvents />
      </MemoryRouter>
    );

    expect(await screen.findByText('Buat Acara')).toBeTruthy();
    expect(screen.getByText('Ubah')).toBeTruthy();
    expect(screen.getByText('Hapus')).toBeTruthy();

    unmount();

    // Kasus 2: canManageAnnouncements = false (warga biasa)
    mockTenantAccess.canManageAnnouncements = false;

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/events']}>
        <TenantEvents />
      </MemoryRouter>
    );

    expect(await screen.findByText('Rapat Warga RT 05')).toBeTruthy();
    expect(screen.queryByText('Buat Acara')).toBeNull();
    expect(screen.queryByText('Ubah')).toBeNull();
    expect(screen.queryByText('Hapus')).toBeNull();
  });

  // (c) href kalender diawali 'https://calendar.google.com/calendar/render?action=TEMPLATE' dan hanya di tab Mendatang
  it('(c) href tombol Tambah ke Kalender diawali https://calendar.google.com/calendar/render?action=TEMPLATE dan hanya muncul di tab Mendatang', async () => {
    tenantOperationalService.fetchTenantEvents.mockResolvedValue([
      {
        id: 'evt-1',
        title: 'Senam Pagi Bersama',
        description: 'Senam sehat di lapangan.',
        location: 'Lapangan Komplek',
        starts_at: '2026-11-10T00:00:00.000Z',
        ends_at: '2026-11-10T02:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/events']}>
        <TenantEvents />
      </MemoryRouter>
    );

    expect(await screen.findByText('Senam Pagi Bersama')).toBeTruthy();

    // Tombol kalender harus ada di tab Mendatang
    const btnKalender = screen.getByText('Tambah ke Kalender').closest('a');
    expect(btnKalender).toBeTruthy();
    expect(btnKalender.getAttribute('target')).toBe('_blank');
    expect(btnKalender.getAttribute('rel')).toBe('noopener noreferrer');

    const calHref = btnKalender.getAttribute('href');
    expect(calHref.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE')).toBe(true);
    expect(calHref).toContain(encodeURIComponent('Senam Pagi Bersama'));

    // Pindah ke tab Selesai -> tombol Tambah ke Kalender TIDAK boleh muncul
    const tabSelesai = screen.getByRole('button', { name: 'Selesai' });
    fireEvent.click(tabSelesai);

    await waitFor(() => {
      expect(screen.queryByText('Tambah ke Kalender')).toBeNull();
    });
  });

  // (d) simpan mengirim starts_at ISO yang benar untuk input '2026-11-01T19:30' WIB, yaitu sama dengan '2026-11-01T12:30:00.000Z'
  it('(d) simpan mengirim starts_at ISO yang benar untuk input "2026-11-01T19:30" WIB (sama dengan 2026-11-01T12:30:00.000Z)', async () => {
    tenantOperationalService.fetchTenantEvents.mockResolvedValue([]);
    tenantOperationalService.uploadAnnouncementImage.mockResolvedValue(
      'tenants/tenant-test-1/announcements/event-poster.png'
    );
    tenantOperationalService.createTenantEvent.mockResolvedValue({
      id: 'new-evt-1',
      title: 'Musyawarah Pemilihan Ketua RT',
      starts_at: '2026-11-01T12:30:00.000Z',
      ends_at: '2026-11-01T14:30:00.000Z',
    });

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/events']}>
        <TenantEvents />
      </MemoryRouter>
    );

    // Buka modal Buat Acara
    const btnBuat = await screen.findByText('Buat Acara');
    fireEvent.click(btnBuat);

    expect(screen.getByText('Buat Acara Baru')).toBeTruthy();

    // Isi formulir
    const inputTitle = screen.getByLabelText(/Nama Acara/);
    fireEvent.change(inputTitle, { target: { value: 'Musyawarah Pemilihan Ketua RT' } });

    const inputStartsAt = screen.getByLabelText(/Waktu Mulai \(WIB\)/);
    fireEvent.change(inputStartsAt, { target: { value: '2026-11-01T19:30' } });

    const inputEndsAt = screen.getByLabelText(/Waktu Selesai \(WIB, Opsional\)/);
    fireEvent.change(inputEndsAt, { target: { value: '2026-11-01T21:30' } });

    const inputLocation = screen.getByLabelText(/Lokasi Acara/);
    fireEvent.change(inputLocation, { target: { value: 'Balai RW 02' } });

    const inputDesc = screen.getByLabelText(/Deskripsi Acara/);
    fireEvent.change(inputDesc, { target: { value: 'Seluruh warga diharapkan hadir tepat waktu.' } });

    // Upload file poster
    const testFile = new File(['mock-poster-bytes'], 'poster.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    // Submit formulir
    const submitBtn = screen.getByRole('button', { name: 'Simpan Acara' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.uploadAnnouncementImage).toHaveBeenCalledWith(
        'tenant-test-1',
        testFile
      );
    });

    // Validasi starts_at dikirim sebagai '2026-11-01T12:30:00.000Z'
    expect(tenantOperationalService.createTenantEvent).toHaveBeenCalledWith(
      'tenant-test-1',
      expect.objectContaining({
        title: 'Musyawarah Pemilihan Ketua RT',
        starts_at: '2026-11-01T12:30:00.000Z',
        ends_at: '2026-11-01T14:30:00.000Z',
        location: 'Balai RW 02',
        description: 'Seluruh warga diharapkan hadir tepat waktu.',
        image_path: 'tenants/tenant-test-1/announcements/event-poster.png',
      })
    );

    expect(mockToast.success).toHaveBeenCalledWith('Acara berhasil dibuat.');
  });

  // (e) hapus setelah konfirmasi
  it('(e) hapus memanggil deleteTenantEvent setelah konfirmasi di dalam modal', async () => {
    tenantOperationalService.fetchTenantEvents.mockResolvedValue([
      {
        id: 'evt-del-1',
        title: 'Acara Yang Akan Dibatalkan',
        starts_at: '2026-11-15T12:00:00.000Z',
      },
    ]);
    tenantOperationalService.deleteTenantEvent.mockResolvedValue({ success: true });

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/events']}>
        <TenantEvents />
      </MemoryRouter>
    );

    expect(await screen.findByText('Acara Yang Akan Dibatalkan')).toBeTruthy();

    // Klik tombol Hapus pada kartu
    const btnHapus = screen.getByText('Hapus');
    fireEvent.click(btnHapus);

    // Modal konfirmasi terbuka
    expect(screen.getByText(/Apakah Anda yakin ingin menghapus acara/)).toBeTruthy();

    // Klik tombol konfirmasi Hapus Acara di dalam modal
    const confirmDeleteBtn = screen.getByRole('button', { name: 'Hapus Acara' });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(tenantOperationalService.deleteTenantEvent).toHaveBeenCalledWith('evt-del-1');
    });

    expect(mockToast.success).toHaveBeenCalledWith('Acara berhasil dihapus.');
  });

  it('href tombol Bagikan ke WA diawali https://wa.me/?text= dan memuat judul ter-encode', async () => {
    tenantOperationalService.fetchTenantEvents.mockResolvedValueOnce([
      {
        id: 'evt-1',
        title: 'Gotong Royong RT 05',
        description: 'Pembersihan saluran utama komplek.',
        location: 'Pos RW 05',
        starts_at: '2026-11-20T01:00:00.000Z',
        ends_at: '2026-11-20T04:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/events']}>
        <TenantEvents />
      </MemoryRouter>
    );

    expect(await screen.findByText('Gotong Royong RT 05')).toBeTruthy();

    const waLink = screen.getByText('Bagikan ke WA').closest('a');
    expect(waLink).toBeTruthy();
    expect(waLink.getAttribute('target')).toBe('_blank');
    expect(waLink.getAttribute('rel')).toBe('noopener noreferrer');

    const href = waLink.getAttribute('href');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(href).toContain(encodeURIComponent('Gotong Royong RT 05'));
  });

  it('membuka modal ubah dan memanggil updateTenantEvent saat formulir disimpan', async () => {
    tenantOperationalService.fetchTenantEvents.mockResolvedValue([
      {
        id: 'evt-edit-1',
        title: 'Acara Judul Lama',
        description: 'Deskripsi lama',
        location: 'Lokasi lama',
        starts_at: '2026-11-01T12:30:00.000Z', // 19:30 WIB
        ends_at: '2026-11-01T14:30:00.000Z',
      },
    ]);
    tenantOperationalService.updateTenantEvent.mockResolvedValue({
      id: 'evt-edit-1',
      title: 'Acara Judul Baru',
    });

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/events']}>
        <TenantEvents />
      </MemoryRouter>
    );

    expect(await screen.findByText('Acara Judul Lama')).toBeTruthy();

    // Klik tombol Ubah
    const btnUbah = screen.getByText('Ubah');
    fireEvent.click(btnUbah);

    expect(screen.getByText('Ubah Acara')).toBeTruthy();

    const inputTitle = screen.getByLabelText(/Nama Acara/);
    expect(inputTitle.value).toBe('Acara Judul Lama');

    // Ubah nama acara
    fireEvent.change(inputTitle, { target: { value: 'Acara Judul Baru' } });

    // Submit formulir ubah
    const submitBtn = screen.getByRole('button', { name: 'Simpan Perubahan' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.updateTenantEvent).toHaveBeenCalledWith(
        'evt-edit-1',
        expect.objectContaining({
          title: 'Acara Judul Baru',
        })
      );
    });

    expect(mockToast.success).toHaveBeenCalledWith('Acara berhasil diperbarui.');
  });

  it('menonaktifkan tombol aksi tulis bila subscription dalam status read_only', async () => {
    mockSubscriptionGate = {
      canTransact: false,
      isReadOnly: true,
      tooltip: 'Paket langganan dalam status hanya-baca.',
    };
    tenantOperationalService.fetchTenantEvents.mockResolvedValue([
      {
        id: 'evt-ro-1',
        title: 'Acara Read Only',
        starts_at: '2026-11-01T10:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/t/tenant-test-1/events']}>
        <TenantEvents />
      </MemoryRouter>
    );

    const btnBuat = await screen.findByText('Buat Acara');
    expect(btnBuat.closest('button').disabled).toBe(true);

    const btnUbah = screen.getByText('Ubah').closest('button');
    expect(btnUbah.disabled).toBe(true);

    const btnHapus = screen.getByText('Hapus').closest('button');
    expect(btnHapus.disabled).toBe(true);
  });
});
