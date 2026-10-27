// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import * as pushService from '../services/pushNotifications';
import { PushNotificationCard } from './PushNotificationCard';

describe('PushNotificationCard Component (KOS-5.3b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(pushService, 'isPushSupported').mockReturnValue(true);
    vi.spyOn(pushService, 'isIosNonStandalone').mockReturnValue(false);
    vi.spyOn(pushService, 'getPushPermissionState').mockReturnValue('default');
    vi.spyOn(pushService, 'getCurrentSubscription').mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Render kartu standar dengan status "Belum Aktif" dan tombol "Aktifkan"', async () => {
    render(<PushNotificationCard />);

    await waitFor(() => {
      expect(screen.getByText('Notifikasi di perangkat ini')).toBeTruthy();
      expect(screen.getByTestId('push-status-badge').textContent).toContain('Belum Aktif');
      expect(screen.getByTestId('push-toggle-btn').textContent).toContain('Aktifkan');
    });
  });

  it('2. Klik "Aktifkan" memanggil subscribeToPush dan mengubah status menjadi "Aktif"', async () => {
    const subscribeSpy = vi.spyOn(pushService, 'subscribeToPush').mockResolvedValue({
      success: true,
      subscription: { endpoint: 'https://test.endpoint' },
    });
    vi.spyOn(pushService, 'getPushPermissionState').mockReturnValue('granted');

    render(<PushNotificationCard />);

    await waitFor(() => {
      expect(screen.getByTestId('push-status-badge').textContent).toContain('Belum Aktif');
    });

    const toggleBtn = screen.getByTestId('push-toggle-btn');
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(subscribeSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('push-status-badge').textContent).toContain('Aktif');
      expect(screen.getByTestId('push-toggle-btn').textContent).toContain('Matikan');
      expect(screen.getByText(/Notifikasi pengingat berhasil diaktifkan/i)).toBeTruthy();
    });
  });

  it('3. Klik "Matikan" memanggil unsubscribeFromPush dan mengembalikan status ke "Belum Aktif"', async () => {
    vi.spyOn(pushService, 'getCurrentSubscription').mockResolvedValue({
      endpoint: 'https://test.endpoint',
    });
    const unsubscribeSpy = vi.spyOn(pushService, 'unsubscribeFromPush').mockResolvedValue({
      success: true,
    });

    render(<PushNotificationCard />);

    await waitFor(() => {
      expect(screen.getByTestId('push-status-badge').textContent).toContain('Aktif');
      expect(screen.getByTestId('push-toggle-btn').textContent).toContain('Matikan');
    });

    vi.spyOn(pushService, 'getPushPermissionState').mockReturnValue('default');
    const toggleBtn = screen.getByTestId('push-toggle-btn');
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('push-status-badge').textContent).toContain('Belum Aktif');
      expect(screen.getByTestId('push-toggle-btn').textContent).toContain('Aktifkan');
    });
  });

  it('4. Menampilkan status "Ditolak Browser" dan petunjuk pengaturan browser jika izin diblokir', async () => {
    vi.spyOn(pushService, 'getPushPermissionState').mockReturnValue('denied');

    render(<PushNotificationCard />);

    await waitFor(() => {
      expect(screen.getByTestId('push-status-badge').textContent).toContain('Ditolak Browser');
      expect(screen.getByText(/Izin notifikasi diblokir oleh browser Anda/i)).toBeTruthy();
      expect(screen.getByText(/Pengaturan Browser > Pengaturan Situs/i)).toBeTruthy();
      expect(screen.getByTestId('push-toggle-btn').textContent).toContain('Periksa Izin');
    });
  });

  it('5. Menampilkan "Tidak Didukung" dan petunjuk iPhone "Tambahkan ke Layar Utama" di iOS non-standalone', async () => {
    vi.spyOn(pushService, 'isPushSupported').mockReturnValue(false);
    vi.spyOn(pushService, 'isIosNonStandalone').mockReturnValue(true);
    vi.spyOn(pushService, 'getPushPermissionState').mockReturnValue('unsupported');

    render(<PushNotificationCard />);

    await waitFor(() => {
      expect(screen.getByTestId('push-status-badge').textContent).toContain('Tidak Didukung');
      expect(screen.getByText(/Tambahkan ke Layar Utama/i)).toBeTruthy();
      expect(screen.getByText(/Safari/i)).toBeTruthy();
    });
  });

  it('6. Mode compact: tampil sebagai kartu kecil saat belum aktif', async () => {
    render(<PushNotificationCard compact />);

    await waitFor(() => {
      expect(screen.getByTestId('push-notification-compact-card')).toBeTruthy();
      expect(screen.getByTestId('push-compact-toggle-btn').textContent).toContain('Aktifkan');
    });
  });

  it('7. Mode compact: otomatis tersembunyi (null) jika notifikasi sudah aktif', async () => {
    vi.spyOn(pushService, 'getCurrentSubscription').mockResolvedValue({
      endpoint: 'https://test.endpoint',
    });

    const { container } = render(<PushNotificationCard compact />);

    await waitFor(() => {
      expect(screen.queryByTestId('push-notification-compact-card')).toBeNull();
      expect(container.firstChild).toBeNull();
    });
  });
});
