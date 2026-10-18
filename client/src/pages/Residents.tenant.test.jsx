// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Residents from './Residents';
import * as dataService from '../services/dataService';
import * as tenantOperationalService from '../services/tenantOperationalService';

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

// Mock dataService untuk memastikan method legacy n8n TIDAK dipanggil di mode tenant
vi.mock('../services/dataService', () => ({
  fetchResidents: vi.fn(() => Promise.resolve([])),
  createResident: vi.fn(),
  updateResident: vi.fn(),
  deleteResident: vi.fn(),
  importResidentsCSV: vi.fn(),
  fetchUnits: vi.fn(() => Promise.resolve([])),
}));

// Mock apiClient agar tidak ada pemanggilan n8n proxy yang lolos
vi.mock('../services/apiClient', () => ({
  portalApiPost: vi.fn(() => {
    throw new Error('portalApiPost dipanggil padahal dalam mode tenant!');
  }),
}));

const sampleMembers = [
  {
    id: 'mem-owner-1',
    full_name: 'Bambang Owner',
    email: 'bambang@rt01.id',
    phone: '08111111111',
    unit_id: 1,
    role: 'admin',
    is_owner: true,
    is_active: true,
    occupancy_status: 'owner_occupied',
  },
  {
    id: 'mem-warga-2',
    full_name: 'Siti Warga',
    email: 'siti@rt01.id',
    phone: '08222222222',
    unit_id: 2,
    role: 'anggota',
    is_owner: false,
    is_active: true,
    occupancy_status: 'tenant',
  },
];

const sampleUnits = [
  { id: 1, label: 'Rumah A/01', status: 'active', metadata: { block: 'A', unit_number: '01' } },
  { id: 2, label: 'Rumah A/02', status: 'active', metadata: { block: 'A', unit_number: '02' } },
];

vi.mock('../services/tenantOperationalService', async () => {
  const actual = await vi.importActual('../services/tenantOperationalService');
  return {
    ...actual,
    fetchTenantMembers: vi.fn(),
    fetchTenantUnits: vi.fn(),
    updateTenantMember: vi.fn(),
    removeTenantMember: vi.fn(),
    fetchTenantInviteCode: vi.fn(),
    getCachedTenantInviteCode: vi.fn(),
  };
});

// Mock state hooks yang stabil
let mockTenantAccessState = {
  canManageMembers: true,
  canWrite: true,
  isMember: true,
  isStaff: true,
  loading: false,
};

const mockTenant = {
  id: 'tenant-rtrw-1',
  name: 'Kompleks RT 01',
  type: 'rt_rw',
};

const mockTenantState = {
  activeTenant: mockTenant,
  activeTenantId: 'tenant-rtrw-1',
  userTenants: [mockTenant],
  switchTenant: vi.fn(),
  isOwner: false,
  hasPermission: vi.fn(() => false),
};

const mockAuth = {
  role: null,
  token: 'mock-token',
};

const mockTemplate = {
  name: 'Kompleks RT/RW',
  unitLabel: 'Rumah',
  billLabel: 'IPL',
  memberLabel: 'Warga',
  contractLabel: 'Status Tinggal',
  paymentActionLabel: 'Bayar',
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

const mockTour = {
  triggerTour: vi.fn(),
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../hooks/useTenant', () => ({
  useTenant: () => mockTenantState,
}));

vi.mock('../hooks/useTenantAccess', () => ({
  useTenantAccess: () => mockTenantAccessState,
}));

vi.mock('../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => mockTemplate,
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../context/TourContext', () => ({
  useTour: () => mockTour,
}));

function renderResidents(tenantId = 'tenant-rtrw-1') {
  return render(
    <MemoryRouter initialEntries={[`/t/${tenantId}/residents`]}>
      <Routes>
        <Route path="/t/:tenantId/residents" element={<Residents />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Residents Tenant Mode (RTRW-2.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantAccessState = {
      canManageMembers: true,
      canWrite: true,
      isMember: true,
      isStaff: true,
      loading: false,
    };

    tenantOperationalService.fetchTenantMembers.mockResolvedValue([...sampleMembers]);
    tenantOperationalService.fetchTenantUnits.mockResolvedValue([...sampleUnits]);
    tenantOperationalService.fetchTenantInviteCode.mockResolvedValue('INVITE-RT01');
    tenantOperationalService.getCachedTenantInviteCode.mockReturnValue('INVITE-RT01');
    mockTenantState.isOwner = false;
    mockTenantState.hasPermission = vi.fn(() => false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('a. pengurus (canManageMembers true) -> tombol "Undang" tampil, tombol "Tambah" & impor warga tidak tampil; klik Undang -> kode & tautan /join/<kode> tampil', async () => {
    renderResidents();

    // Data termuat (bisa ada di mobile list & desktop table)
    await waitFor(() => {
      expect(screen.getAllByText('Bambang Owner').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Siti Warga').length).toBeGreaterThan(0);
    });

    // Tombol Undang Warga tampil
    const undangBtn = screen.getByRole('button', { name: /Undang Warga/i });
    expect(undangBtn).toBeTruthy();

    // Tombol Tambah Warga & Upload CSV tidak tampil
    expect(screen.queryByRole('button', { name: /Tambah Warga/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Upload CSV/i })).toBeNull();

    // Teks info impor unit tampil
    expect(screen.getByText(/Impor data rumah & penghuni tersedia di halaman Unit/i)).toBeTruthy();

    // Klik tombol Undang Warga
    fireEvent.click(undangBtn);

    // Modal undangan terbuka dan menampilkan kode serta link /join/<kode>
    await waitFor(() => {
      expect(screen.getByText('INVITE-RT01')).toBeTruthy();
      expect(screen.getByText(/\/join\/INVITE-RT01/)).toBeTruthy();
    });

    // Menampilkan tombol salin kode, salin tautan, dan bagikan WA
    expect(screen.getByRole('button', { name: /Salin Kode/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Salin Tautan/i })).toBeTruthy();
    const waLink = screen.getByRole('link', { name: /Bagikan via WhatsApp/i });
    expect(waLink).toBeTruthy();
    expect(waLink.getAttribute('href')).toContain('https://wa.me/?text=');
  });

  it('b. edit warga -> updateTenantMember dipanggil dengan (tenantId, memberId, objek field) dan updateResident TIDAK dipanggil', async () => {
    tenantOperationalService.updateTenantMember.mockResolvedValue({
      id: 'mem-warga-2',
      full_name: 'Siti Warga Baru',
      phone: '08999999999',
      unit_id: 2,
      occupancy_status: 'tenant',
    });

    renderResidents();

    await waitFor(() => {
      expect(screen.getAllByText('Siti Warga').length).toBeGreaterThan(0);
    });

    // Klik baris/kartu Siti Warga untuk membuka drawer
    fireEvent.click(screen.getAllByText('Siti Warga')[0]);

    // Klik tombol Edit di drawer
    const editBtn = await screen.findByRole('button', { name: /^Edit$/i });
    fireEvent.click(editBtn);

    // Form edit tenant terbuka
    // Field relevan ada
    const nameInput = screen.getByDisplayValue('Siti Warga');
    const phoneInput = screen.getByDisplayValue('08222222222');

    // Field legacy tidak boleh ada
    expect(screen.queryByText(/Email Google \(Login\)/i)).toBeNull();
    expect(screen.queryByText(/Role Akses/i)).toBeNull();
    expect(screen.queryByText(/Status Aktif/i)).toBeNull();

    // Ubah data
    fireEvent.change(nameInput, { target: { value: 'Siti Warga Baru' } });
    fireEvent.change(phoneInput, { target: { value: '08999999999' } });

    // Klik Simpan
    const simpanBtn = screen.getByRole('button', { name: /Simpan/i });
    fireEvent.click(simpanBtn);

    // Verifikasi service tenant dipanggil dengan parameter yang benar
    await waitFor(() => {
      expect(tenantOperationalService.updateTenantMember).toHaveBeenCalledWith(
        'tenant-rtrw-1',
        'mem-warga-2',
        expect.objectContaining({
          full_name: 'Siti Warga Baru',
          phone: '08999999999',
          unit_id: 2,
          occupancy_status: 'tenant',
        })
      );
    });

    // Pastikan service legacy n8n TIDAK PERNAH dipanggil
    expect(dataService.updateResident).not.toHaveBeenCalled();
    expect(dataService.createResident).not.toHaveBeenCalled();
  });

  it('c. keluarkan warga (window.confirm true) -> removeTenantMember dipanggil; deleteResident TIDAK dipanggil; owner tidak punya tombol Keluarkan', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    tenantOperationalService.removeTenantMember.mockResolvedValue({
      success: true,
      id: 'mem-warga-2',
    });

    renderResidents();

    await waitFor(() => {
      expect(screen.getAllByText('Siti Warga').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Bambang Owner').length).toBeGreaterThan(0);
    });

    // 1. Keluarkan warga biasa (Siti Warga)
    fireEvent.click(screen.getAllByText('Siti Warga')[0]);

    const keluarkanBtn = await screen.findByRole('button', { name: /Keluarkan/i });
    expect(keluarkanBtn).toBeTruthy();

    fireEvent.click(keluarkanBtn);

    // Pastikan konfirmasi sesuai teks spesifikasi
    expect(confirmSpy).toHaveBeenCalledWith(
      'Keluarkan "Siti Warga" dari komunitas? Riwayat pembayarannya tetap tersimpan.'
    );

    // Pastikan removeTenantMember dipanggil
    await waitFor(() => {
      expect(tenantOperationalService.removeTenantMember).toHaveBeenCalledWith(
        'tenant-rtrw-1',
        'mem-warga-2'
      );
    });

    // Pastikan deleteResident n8n TIDAK dipanggil
    expect(dataService.deleteResident).not.toHaveBeenCalled();

    // 2. Periksa Owner (Bambang Owner) tidak memiliki tombol Keluarkan
    fireEvent.click(screen.getAllByText('Bambang Owner')[0]);

    await waitFor(() => {
      expect(screen.getByText('Detail Warga')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /Keluarkan/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Hapus/i })).toBeNull();
  });

  it('d. warga biasa (canManageMembers false) -> tidak ada tombol Undang/Edit/Keluarkan', async () => {
    mockTenantAccessState = {
      canManageMembers: false,
      canWrite: true,
      isMember: true,
      isStaff: false,
      loading: false,
    };

    renderResidents();

    await waitFor(() => {
      expect(screen.getAllByText('Siti Warga').length).toBeGreaterThan(0);
    });

    // Tidak ada tombol Undang maupun Tambah
    expect(screen.queryByRole('button', { name: /Undang Warga/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tambah Warga/i })).toBeNull();

    // Buka detail warga
    fireEvent.click(screen.getAllByText('Siti Warga')[0]);

    await waitFor(() => {
      expect(screen.getByText('Detail Warga')).toBeTruthy();
    });

    // Tidak ada tombol Edit, Keluarkan, maupun Hapus
    expect(screen.queryByRole('button', { name: /^Edit$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Keluarkan/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Hapus/i })).toBeNull();
  });

  it('e. RTRW-2.6: owner/manage_tenant_users melihat label jabatan & "Atur Jabatan" (/t/<id>/members/<id>/role); pengurus tanpa manage_tenant_users tidak melihatnya; owner tidak punya link Atur Jabatan', async () => {
    // 1. Kasus Owner
    mockTenantState.isOwner = true;
    mockTenantState.hasPermission = vi.fn(() => false);

    const membersWithRoles = [
      {
        ...sampleMembers[0], // Bambang Owner (is_owner: true)
      },
      {
        ...sampleMembers[1], // Siti Warga (is_owner: false)
        tenant_roles: { id: 'role-sekre', name: 'Sekretaris' },
      },
    ];
    tenantOperationalService.fetchTenantMembers.mockResolvedValue([...membersWithRoles]);

    const { unmount } = renderResidents();

    await waitFor(() => {
      expect(screen.getAllByText('Bambang Owner').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Siti Warga').length).toBeGreaterThan(0);
    });

    // Label jabatan tampil
    // Owner tampil sebagai "Admin"
    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
    // Siti Warga tampil sebagai "Sekretaris"
    expect(screen.getAllByText('Sekretaris').length).toBeGreaterThan(0);

    // Link "Atur Jabatan" untuk Siti Warga muncul dengan href yang benar
    const aturJabatanLinks = screen.getAllByRole('link', { name: /Atur Jabatan/i });
    expect(aturJabatanLinks.length).toBeGreaterThan(0);
    expect(aturJabatanLinks[0].getAttribute('href')).toBe('/t/tenant-rtrw-1/members/mem-warga-2/role');

    // Owner TIDAK punya link Atur Jabatan (hanya Siti Warga yang punya)
    for (const link of aturJabatanLinks) {
      expect(link.getAttribute('href')).not.toBe('/t/tenant-rtrw-1/members/mem-owner-1/role');
    }

    unmount();

    // 2. Kasus Pengurus DENGAN izin manage_tenant_users
    mockTenantState.isOwner = false;
    mockTenantState.hasPermission = vi.fn((perm) => perm === 'manage_tenant_users');

    const { unmount: unmountManager } = renderResidents();

    await waitFor(() => {
      expect(screen.getAllByText('Siti Warga').length).toBeGreaterThan(0);
    });

    const aturJabatanLinksManager = screen.getAllByRole('link', { name: /Atur Jabatan/i });
    expect(aturJabatanLinksManager.length).toBeGreaterThan(0);
    expect(aturJabatanLinksManager[0].getAttribute('href')).toBe('/t/tenant-rtrw-1/members/mem-warga-2/role');

    unmountManager();

    // 3. Kasus Pengurus TANPA izin manage_tenant_users (misal hanya canManageMembers)
    mockTenantState.isOwner = false;
    mockTenantState.hasPermission = vi.fn(() => false);

    renderResidents();

    await waitFor(() => {
      expect(screen.getAllByText('Siti Warga').length).toBeGreaterThan(0);
    });

    // Tidak boleh ada link Atur Jabatan sama sekali
    expect(screen.queryByRole('link', { name: /Atur Jabatan/i })).toBeNull();
  });
});
