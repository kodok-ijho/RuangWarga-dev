// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TenantDashboard from './TenantDashboard';
import TenantDashboardPlaceholder from './TenantDashboardPlaceholder';

afterEach(cleanup);

vi.mock('../../components/TrialCountdownBanner', () => ({
  default: () => <div data-testid="trial-countdown-banner">Trial Banner</div>,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'admin@example.com' },
    profile: { full_name: 'Admin Test' },
  }),
}));

vi.mock('../../hooks/useTenant', () => ({
  useTenant: () => ({
    activeTenant: { id: 't-test-1', name: 'Kompleks RT 01', type: 'rt_rw', settings: { onboarding_completed: true } },
    activeTenantId: 't-test-1',
    switchTenant: vi.fn(),
    subscriptionStatus: 'trial',
    userRole: 'admin',
    isTenantAdmin: true,
    isOwner: true,
    activeRoleName: 'Ketua RT',
    hasPermission: () => true,
  }),
}));

vi.mock('../../hooks/useTenantTemplate', () => ({
  useTenantTemplate: () => ({
    icon: '🏘️',
    name: 'RT / RW',
    unitLabel: 'Rumah',
    memberLabel: 'Warga',
    billingLabel: 'IPL',
    paymentActionLabel: 'Bayar IPL',
  }),
}));

vi.mock('../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({
    isReadOnly: false,
    subscriptionStatus: 'trial',
  }),
}));

vi.mock('../../services/tenantOperationalService', () => ({
  fetchTenantDashboardData: vi.fn().mockResolvedValue({
    summary: { totalResidents: 10, totalUnits: 10 },
  }),
  fetchTenantInviteCode: vi.fn().mockResolvedValue('INVITE123'),
  getCachedTenantInviteCode: vi.fn().mockReturnValue('INVITE123'),
  fetchTenantAnnouncements: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../components/dashboard/CitizenDashboard', () => ({
  CitizenDashboard: () => <div data-testid="citizen-dashboard">CitizenDashboard</div>,
}));

vi.mock('../../components/dashboard/StaffDashboard', () => ({
  StaffDashboard: () => <div data-testid="staff-dashboard">StaffDashboard</div>,
}));

vi.mock('../../components/dashboard/DashboardSkeleton', () => ({
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton">DashboardSkeleton</div>,
}));

describe('UI-1F: Trial Countdown Banner Single Placement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TenantDashboard tidak merender TrialCountdownBanner (dihandle oleh TenantShell)', async () => {
    render(
      <MemoryRouter initialEntries={['/t/t-test-1']}>
        <TenantDashboard />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('trial-countdown-banner')).toBeNull();
  });

  it('TenantDashboardPlaceholder tidak merender TrialCountdownBanner (dihandle oleh TenantShell)', () => {
    render(
      <MemoryRouter initialEntries={['/t/t-test-1']}>
        <TenantDashboardPlaceholder />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('trial-countdown-banner')).toBeNull();
  });
});

describe('RTRW-3.1: Kartu Pengumuman Terbaru di TenantDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menyembunyikan kartu pengumuman bila daftar pengumuman kosong', async () => {
    const { fetchTenantAnnouncements } = await import('../../services/tenantOperationalService');
    fetchTenantAnnouncements.mockResolvedValueOnce([]);

    render(
      <MemoryRouter initialEntries={['/t/t-test-1']}>
        <TenantDashboard />
      </MemoryRouter>
    );

    await screen.findByTestId('staff-dashboard');
    expect(screen.queryByText('Pengumuman Terbaru')).toBeNull();
  });

  it('menampilkan kartu pengumuman terbaru dengan judul, tanggal, potongan isi, dan link lihat semua', async () => {
    const { fetchTenantAnnouncements } = await import('../../services/tenantOperationalService');
    fetchTenantAnnouncements.mockResolvedValueOnce([
      {
        id: 'ann-1',
        title: 'Kerja Bakti Kebersihan Lingkungan',
        body: 'Diharapkan seluruh warga membawa cangkul dan sapu lidi untuk membersihkan selokan utama.',
        is_pinned: true,
        published_at: '2026-10-20T08:00:00Z',
      },
      {
        id: 'ann-2',
        title: 'Pemadaman Listrik Sementara',
        body: 'Akan dilakukan perawatan gardu listrik pada hari Sabtu.',
        is_pinned: false,
        published_at: '2026-10-18T10:00:00Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/t/t-test-1']}>
        <TenantDashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText('Pengumuman Terbaru')).toBeTruthy();
    expect(screen.getByText('Kerja Bakti Kebersihan Lingkungan')).toBeTruthy();
    expect(screen.getByText('Disematkan')).toBeTruthy();
    expect(screen.getByText(/membawa cangkul dan sapu lidi/)).toBeTruthy();
    expect(screen.getByText('Pemadaman Listrik Sementara')).toBeTruthy();

    const linkLihatSemua = screen.getByText('Lihat semua').closest('a');
    expect(linkLihatSemua).toBeTruthy();
    expect(linkLihatSemua.getAttribute('href')).toBe('/t/t-test-1/announcements');
  });
});
