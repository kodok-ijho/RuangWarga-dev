// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TenantUnits, { getNextUnitStatus, getUnitStatusBadge } from './TenantUnits';
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

const sampleUnits = [
  {
    id: 1,
    tenant_id: 'tenant-rtrw-1',
    label: 'Blok A - 01',
    status: 'active',
    metadata: {
      occupant: {
        name: 'Budi Santoso',
        phone: '081234567890',
        occupancy_status: 'owner_occupied',
        note: 'Kepala Keluarga',
      },
    },
  },
  {
    id: 2,
    tenant_id: 'tenant-rtrw-1',
    label: 'Blok A - 02',
    status: 'inactive',
    metadata: {
      occupant: {
        name: 'Siti Aminah',
        phone: '081298765432',
        occupancy_status: 'tenant',
        note: 'Kontrak s.d. Des 2026',
      },
    },
  },
];

const sampleMembers = [
  {
    id: 'mem-1',
    tenant_id: 'tenant-rtrw-1',
    unit_id: 1,
    full_name: 'Budi Santoso Akun',
  },
];

let mockTenantContext = {
  activeTenant: { id: 'tenant-rtrw-1', name: 'Kompleks RT 01', type: 'rt_rw' },
  activeTenantId: 'tenant-rtrw-1',
  isOwner: true,
  hasPermission: (perm) => true,
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
  useSubscriptionGate: () => ({
    canTransact: true,
    isReadOnly: false,
  }),
}));

vi.mock('../../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantUnits: vi.fn(),
    createTenantUnit: vi.fn(),
    updateTenantUnit: vi.fn(),
    setTenantUnitStatus: vi.fn(),
    deleteTenantUnit: vi.fn(),
    importTenantUnitsCSV: vi.fn(),
    fetchTenantMembers: vi.fn(),
  };
});

function renderTenantUnits(tenantId = 'tenant-rtrw-1') {
  return render(
    <MemoryRouter initialEntries={[`/t/${tenantId}/units`]}>
      <Routes>
        <Route path="/t/:tenantId/units" element={<TenantUnits />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TenantUnits Page (RTRW-2.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantContext = {
      activeTenant: { id: 'tenant-rtrw-1', name: 'Kompleks RT 01', type: 'rt_rw' },
      activeTenantId: 'tenant-rtrw-1',
      isOwner: true,
      hasPermission: (perm) => true,
    };
    tenantOperationalService.fetchTenantUnits.mockResolvedValue([...sampleUnits]);
    tenantOperationalService.fetchTenantMembers.mockResolvedValue([...sampleMembers]);
  });

  afterEach(() => {
    cleanup();
  });

  it('a. daftar menampilkan label unit dan nama penghuni dari metadata.occupant, plus nama anggota tertaut', async () => {
    renderTenantUnits();

    await waitFor(() => {
      expect(screen.getByText('Kelola Rumah')).toBeTruthy();
    });

    // Menampilkan label unit
    expect(screen.getAllByText('Blok A - 01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Blok A - 02').length).toBeGreaterThan(0);

    // Menampilkan nama penghuni dari metadata.occupant
    expect(screen.getAllByText('Budi Santoso').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Siti Aminah').length).toBeGreaterThan(0);

    // Menampilkan nama anggota berakun yang tertaut
    expect(screen.getAllByText('Budi Santoso Akun').length).toBeGreaterThan(0);
  });

  it('b. tambah unit → createTenantUnit dipanggil (tenantId, { label, occupant })', async () => {
    tenantOperationalService.createTenantUnit.mockResolvedValueOnce({
      id: 3,
      tenant_id: 'tenant-rtrw-1',
      label: 'Blok B - 01',
      status: 'active',
      metadata: { occupant: { name: 'Joko Widodo' } },
    });

    renderTenantUnits();

    await waitFor(() => {
      expect(screen.getByText('Tambah Rumah')).toBeTruthy();
    });

    // Klik tombol tambah
    fireEvent.click(screen.getByText('Tambah Rumah'));

    // Modal terbuka
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Isi input label
    const labelInput = screen.getByLabelText(/Label \/ Nomor/i);
    fireEvent.change(labelInput, { target: { value: 'Blok B - 01' } });

    // Isi input nama penghuni
    const nameInput = screen.getByLabelText(/Nama Penghuni/i);
    fireEvent.change(nameInput, { target: { value: 'Joko Widodo' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: 'Simpan' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tenantOperationalService.createTenantUnit).toHaveBeenCalledTimes(1);
    });

    expect(tenantOperationalService.createTenantUnit).toHaveBeenCalledWith(
      'tenant-rtrw-1',
      expect.objectContaining({
        label: 'Blok B - 01',
        occupant: expect.objectContaining({
          name: 'Joko Widodo',
        }),
      })
    );
  });

  it('c. hapus unit yang ditolak service → pesan error service tampil', async () => {
    const errorMsg =
      'Unit ini sudah memiliki tagihan dan tidak dapat dihapus. Nonaktifkan saja.';
    tenantOperationalService.deleteTenantUnit.mockRejectedValueOnce(new Error(errorMsg));

    renderTenantUnits();

    await waitFor(() => {
      expect(screen.getAllByText('Blok A - 01').length).toBeGreaterThan(0);
    });

    // Klik tombol hapus (ikon/title Hapus unit di desktop)
    const deleteButtons = screen.getAllByTitle('Hapus unit');
    fireEvent.click(deleteButtons[0]);

    // Modal konfirmasi hapus terbuka
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Apakah Anda yakin ingin menghapus/i)).toBeTruthy();

    // Klik tombol konfirmasi hapus
    const confirmDeleteBtn = screen.getByRole('button', { name: 'Ya, Hapus' });
    fireEvent.click(confirmDeleteBtn);

    // Pesan error dari service harus tampil
    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeTruthy();
    });
    expect(mockToast.error).toHaveBeenCalledWith(errorMsg);
  });

  it('d. impor CSV: unggah file teks CSV → pratinjau tampil → klik impor → importTenantUnitsCSV dipanggil dengan baris hasil parse → ringkasan created/updated/skipped tampil', async () => {
    tenantOperationalService.importTenantUnitsCSV.mockResolvedValueOnce({
      created: 2,
      updated: 1,
      skipped: [{ row: { label: 'Blok C - 01' }, reason: 'Duplikat label di dalam file CSV.' }],
    });

    renderTenantUnits();

    await waitFor(() => {
      expect(screen.getByText('Impor CSV')).toBeTruthy();
    });

    // Buka modal impor CSV
    fireEvent.click(screen.getByText('Impor CSV'));
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Buat file CSV menggunakan new File([...], 'u.csv', { type: 'text/csv' })
    const csvContent =
      'label,nama_penghuni,hp,status_tinggal,catatan\n' +
      'Blok A - 01,Budi Santoso,081234567890,pemilik,\n' +
      'Blok A - 02,Siti Aminah,081298765432,penyewa,Kontrak s.d. Des 2026\n';
    const file = new File([csvContent], 'u.csv', { type: 'text/csv' });

    const fileInput = screen.getByTestId('csv-file-input');
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Pratinjau tampil
    await waitFor(() => {
      expect(screen.getByText(/Pratinjau Data/i)).toBeTruthy();
    });
    expect(screen.getByText(/Total 2 baris/i)).toBeTruthy();

    // Klik tombol impor baris
    const importSubmitBtn = screen.getByRole('button', { name: /Impor 2 baris/i });
    fireEvent.click(importSubmitBtn);

    // importTenantUnitsCSV dipanggil
    await waitFor(() => {
      expect(tenantOperationalService.importTenantUnitsCSV).toHaveBeenCalledTimes(1);
    });

    expect(tenantOperationalService.importTenantUnitsCSV).toHaveBeenCalledWith(
      'tenant-rtrw-1',
      expect.arrayContaining([
        expect.objectContaining({ label: 'Blok A - 01', occupant_name: 'Budi Santoso' }),
        expect.objectContaining({ label: 'Blok A - 02', occupant_name: 'Siti Aminah' }),
      ])
    );

    // Ringkasan created, updated, skipped tampil
    await waitFor(() => {
      expect(screen.getByText(/Ringkasan Hasil Impor/i)).toBeTruthy();
    });
    expect(screen.getByText('Dibuat')).toBeTruthy();
    expect(screen.getByText('Diperbarui')).toBeTruthy();
    expect(screen.getByText('Dilewati')).toBeTruthy();
    expect(screen.getByText(/Duplikat label di dalam file CSV/i)).toBeTruthy();
  });

  it('e. pengguna tanpa izin (isOwner false, hasPermission false) → tombol tambah/impor/hapus tidak tampil', async () => {
    mockTenantContext = {
      activeTenant: { id: 'tenant-rtrw-1', name: 'Kompleks RT 01', type: 'rt_rw' },
      activeTenantId: 'tenant-rtrw-1',
      isOwner: false,
      hasPermission: () => false,
    };

    renderTenantUnits();

    await waitFor(() => {
      expect(screen.getAllByText('Blok A - 01').length).toBeGreaterThan(0);
    });

    // Tombol tambah tidak tampil
    expect(screen.queryByText(/Tambah Rumah/i)).toBeNull();

    // Tombol impor CSV tidak tampil
    expect(screen.queryByText(/Impor CSV/i)).toBeNull();

    // Tombol hapus tidak tampil di desktop maupun mobile
    expect(screen.queryByTitle('Hapus unit')).toBeNull();
    expect(screen.queryByRole('button', { name: /Hapus/i })).toBeNull();
  });

  describe('getNextUnitStatus & getUnitStatusBadge (VERT-1.6)', () => {
    it('menguji getNextUnitStatus untuk kombinasi kos/rt_rw × active/inactive/vacant/occupied', () => {
      // RT/RW:
      expect(getNextUnitStatus({ status: 'active' }, 'rt_rw')).toBe('inactive');
      expect(getNextUnitStatus({ status: 'inactive' }, 'rt_rw')).toBe('active');
      expect(getNextUnitStatus({ status: 'vacant' }, 'rt_rw')).toBe('inactive');
      expect(getNextUnitStatus({ status: 'occupied' }, 'rt_rw')).toBeNull();

      // Kos:
      expect(getNextUnitStatus({ status: 'active' }, 'kos')).toBe('inactive');
      expect(getNextUnitStatus({ status: 'vacant' }, 'kos')).toBe('inactive');
      expect(getNextUnitStatus({ status: 'inactive' }, 'kos')).toBe('vacant');
      expect(getNextUnitStatus({ status: 'occupied' }, 'kos')).toBeNull();

      // Kelas:
      expect(getNextUnitStatus({ status: 'inactive' }, 'kelas')).toBe('vacant');
      expect(getNextUnitStatus({ status: 'occupied' }, 'kelas')).toBeNull();
    });

    it('getUnitStatusBadge memetakan label sesuai template vertikal', () => {
      const kosTemplate = { emptyUnitLabel: 'Kamar Kosong', occupiedUnitLabel: 'Tersewa' };
      expect(getUnitStatusBadge('vacant', kosTemplate).label).toBe('Kamar Kosong');
      expect(getUnitStatusBadge('occupied', kosTemplate).label).toBe('Tersewa');
      expect(getUnitStatusBadge('inactive', kosTemplate).label).toBe('Nonaktif');
      expect(getUnitStatusBadge('active', kosTemplate).label).toBe('Aktif');
    });
  });

  describe('KOS-1F.6b: Badge Belum Ada Kontrak pada Kamar Terisi', () => {
    it('menampilkan badge "Belum ada kontrak" untuk kamar occupied tanpa metadata.contract_start, dan tidak menampilkan bila contract_start ada', async () => {
      mockTenantContext = {
        activeTenant: { id: 'tenant-kos-1', name: 'Kos Melati', type: 'kos' },
        activeTenantId: 'tenant-kos-1',
        isOwner: true,
        hasPermission: () => true,
      };

      vi.spyOn(tenantOperationalService, 'fetchTenantUnits').mockResolvedValue([
        {
          id: 101,
          tenant_id: 'tenant-kos-1',
          label: 'Kamar 101',
          status: 'occupied',
          metadata: {
            occupant: { name: 'Penyewa A' },
          },
        },
        {
          id: 102,
          tenant_id: 'tenant-kos-1',
          label: 'Kamar 102',
          status: 'occupied',
          metadata: {
            occupant: { name: 'Penyewa B' },
            contract_start: '2026-10-01',
          },
        },
      ]);
      vi.spyOn(tenantOperationalService, 'fetchTenantMembers').mockResolvedValue([]);

      renderTenantUnits();

      await waitFor(() => {
        expect(screen.getAllByText('Kamar 101').length).toBeGreaterThan(0);
      });

      // Badge 'Belum ada kontrak' muncul untuk Kamar 101 (desktop + mobile = 2 elemen)
      const badgeList = screen.getAllByText('Belum ada kontrak');
      expect(badgeList.length).toBe(2);
    });
  });
});
