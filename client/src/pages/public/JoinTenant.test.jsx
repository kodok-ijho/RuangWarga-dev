// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import JoinTenant from './JoinTenant';
import * as tenantOperationalService from '../../services/tenantOperationalService';

afterEach(cleanup);

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

let mockAuthState = {
  user: { id: 'user-1', email: 'user@example.com' },
  profile: { full_name: 'Nama Dari Profil Akun', phone: '0899999999' },
  isAuthenticated: true,
  signInWithGoogle: vi.fn(),
};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

describe('JoinTenant flow (JOIN-1F)', () => {
  let mockRequestJoinTenant;

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();

    mockAuthState = {
      user: { id: 'user-1', email: 'user@example.com' },
      profile: { full_name: 'Nama Dari Profil Akun', phone: '0899999999' },
      isAuthenticated: true,
      signInWithGoogle: vi.fn(),
    };

    vi.spyOn(tenantOperationalService, 'getInviteDetails').mockResolvedValue({
      found: true,
      tenant_id: 'tenant-123',
      tenant_name: 'Kompleks RT 01 Palm',
      units: [
        { id: 1, label: 'Blok A/1' },
        { id: 2, label: 'Blok A/2' },
      ],
    });

    mockRequestJoinTenant = vi.spyOn(tenantOperationalService, 'requestJoinTenant').mockResolvedValue({
      success: true,
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('memulihkan draft jika isAuthenticated true dan inviteCode sama: isi state, hapus key, toast info, tidak auto-submit', async () => {
    const draftData = {
      inviteCode: 'RW-PALM-9F',
      tenantId: 'tenant-123',
      unitId: '2',
      fullName: 'Budi Warga Pulih',
      phone: '081234567890',
      occupancyStatus: 'tenant',
    };
    sessionStorage.setItem('rw_pending_join', JSON.stringify(draftData));

    render(
      <MemoryRouter initialEntries={['/join/RW-PALM-9F']}>
        <Routes>
          <Route path="/join/:inviteCode" element={<JoinTenant />} />
        </Routes>
      </MemoryRouter>
    );

    // Form pendaftaran tampil dan terisi dari draft
    await waitFor(() => {
      expect(screen.getByDisplayValue('Budi Warga Pulih')).toBeTruthy();
    });

    expect(screen.getByDisplayValue('081234567890')).toBeTruthy();
    expect(screen.getByDisplayValue('Penyewa / Kontrak')).toBeTruthy();

    // Pastikan select unit memilih unit 2 sesuai draft
    const unitSelect = screen.getByDisplayValue('Blok A/2');
    expect(unitSelect).toBeTruthy();

    // sessionStorage key rw_pending_join harus terhapus
    expect(sessionStorage.getItem('rw_pending_join')).toBeNull();

    // Toast info harus dipanggil
    expect(mockToast.info).toHaveBeenCalledWith(
      'Data pendaftaran dipulihkan. Periksa lalu tekan "Ajukan Pendaftaran Anggota".'
    );

    // requestJoinTenant TIDAK dipanggil otomatis
    expect(mockRequestJoinTenant).not.toHaveBeenCalled();
  });

  it('tidak memulihkan draft dan tidak menghapus sessionStorage jika inviteCode berbeda', async () => {
    const draftData = {
      inviteCode: 'OTHER-CODE-123',
      tenantId: 'tenant-999',
      unitId: '1',
      fullName: 'Nama Orang Lain',
      phone: '0811111111',
      occupancyStatus: 'owner_occupied',
    };
    sessionStorage.setItem('rw_pending_join', JSON.stringify(draftData));

    render(
      <MemoryRouter initialEntries={['/join/RW-PALM-9F']}>
        <Routes>
          <Route path="/join/:inviteCode" element={<JoinTenant />} />
        </Routes>
      </MemoryRouter>
    );

    // Menunggu komunitas dimuat
    await waitFor(() => {
      expect(screen.getByText('Kompleks RT 01 Palm')).toBeTruthy();
    });

    // Form tidak boleh terisi nama dari draft kode berbeda
    expect(screen.queryByDisplayValue('Nama Orang Lain')).toBeNull();
    // Sebaliknya terisi dari profile
    expect(screen.getByDisplayValue('Nama Dari Profil Akun')).toBeTruthy();

    // Key di sessionStorage tidak boleh dihapus
    expect(sessionStorage.getItem('rw_pending_join')).toBe(JSON.stringify(draftData));

    // Toast pemulihan tidak boleh dipanggil
    expect(mockToast.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Data pendaftaran dipulihkan')
    );
  });

  it('mengabaikan dan menghapus draft jika JSON rusak di sessionStorage', async () => {
    sessionStorage.setItem('rw_pending_join', '{invalid-json-draft');

    render(
      <MemoryRouter initialEntries={['/join/RW-PALM-9F']}>
        <Routes>
          <Route path="/join/:inviteCode" element={<JoinTenant />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Kompleks RT 01 Palm')).toBeTruthy();
    });

    // Key rusak dihapus dari sessionStorage
    expect(sessionStorage.getItem('rw_pending_join')).toBeNull();
    // Default menggunakan profile
    expect(screen.getByDisplayValue('Nama Dari Profil Akun')).toBeTruthy();
  });

  it('tidak memilih unitId dari draft jika unit tersebut tidak ada di daftar unit tenant', async () => {
    const draftData = {
      inviteCode: 'RW-PALM-9F',
      tenantId: 'tenant-123',
      unitId: '999', // Unit tidak ada di daftar unit [1, 2]
      fullName: 'Budi Unit Hilang',
      phone: '081234567890',
      occupancyStatus: 'owner_occupied',
    };
    sessionStorage.setItem('rw_pending_join', JSON.stringify(draftData));

    render(
      <MemoryRouter initialEntries={['/join/RW-PALM-9F']}>
        <Routes>
          <Route path="/join/:inviteCode" element={<JoinTenant />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Budi Unit Hilang')).toBeTruthy();
    });

    // Unit select harus memilih unit pertama yang valid (unit 1 / Blok A/1), bukan 999
    expect(screen.getByDisplayValue('Blok A/1')).toBeTruthy();
    expect(sessionStorage.getItem('rw_pending_join')).toBeNull();
  });

  it('efek sinkron profile tidak menimpa nama dan telepon hasil draft', async () => {
    const draftData = {
      inviteCode: 'rw-palm-9f', // Uji case-insensitivity
      tenantId: 'tenant-123',
      unitId: '1',
      fullName: 'Nama Khusus Dari Draft',
      phone: '0877777777',
      occupancyStatus: 'owner_vacant',
    };
    sessionStorage.setItem('rw_pending_join', JSON.stringify(draftData));

    const { rerender } = render(
      <MemoryRouter initialEntries={['/join/RW-PALM-9F']}>
        <Routes>
          <Route path="/join/:inviteCode" element={<JoinTenant />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Nama Khusus Dari Draft')).toBeTruthy();
    });

    // Simulasi update profile dari auth context
    mockAuthState = {
      ...mockAuthState,
      profile: { full_name: 'Profil Baru Setelah Sync', phone: '0888888888' },
    };

    rerender(
      <MemoryRouter initialEntries={['/join/RW-PALM-9F']}>
        <Routes>
          <Route path="/join/:inviteCode" element={<JoinTenant />} />
        </Routes>
      </MemoryRouter>
    );

    // Nilai dari draft tetap bertahan dan tidak ditimpa
    expect(screen.getByDisplayValue('Nama Khusus Dari Draft')).toBeTruthy();
    expect(screen.getByDisplayValue('0877777777')).toBeTruthy();
    expect(screen.queryByDisplayValue('Profil Baru Setelah Sync')).toBeNull();
  });
});
