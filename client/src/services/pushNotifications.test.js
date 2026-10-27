// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from './supabaseClient';
import {
  urlBase64ToUint8Array,
  isIosNonStandalone,
  isPushSupported,
  getPushPermissionState,
  getCurrentSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from './pushNotifications';

describe('pushNotifications Service (KOS-5.3b)', () => {
  const origNotification = window.Notification;
  const origPushManager = window.PushManager;
  const origServiceWorker = navigator.serviceWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZElSKOOhZnmZCp0nfmDxGeVNWhnbDVPM-T5bVU');

    // Default mock objects in jsdom
    window.Notification = {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };
    window.PushManager = {};

    const mockSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK18PeW5pXoG1GNKIrO3S9GdBZ',
          auth: 'tBHItDaCWFLBp-77BBdYXw',
        },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };

    const mockPushManager = {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue(mockSubscription),
    };

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          pushManager: mockPushManager,
        }),
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    window.Notification = origNotification;
    window.PushManager = origPushManager;
    if (origServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: origServiceWorker,
        configurable: true,
        writable: true,
      });
    }
    vi.unstubAllEnvs();
  });

  describe('urlBase64ToUint8Array', () => {
    it('mengubah string base64url menjadi Uint8Array dengan benar', () => {
      const base64 = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZElSKOOhZnmZCp0nfmDxGeVNWhnbDVPM-T5bVU';
      const arr = urlBase64ToUint8Array(base64);
      expect(arr).toBeInstanceOf(Uint8Array);
      expect(arr.length).toBeGreaterThan(0);
    });

    it('menangani string kosong atau null tanpa crash', () => {
      expect(urlBase64ToUint8Array('')).toBeInstanceOf(Uint8Array);
      expect(urlBase64ToUint8Array(null)).toBeInstanceOf(Uint8Array);
      expect(urlBase64ToUint8Array('').length).toBe(0);
    });
  });

  describe('isIosNonStandalone', () => {
    it('mendeteksi perangkat iOS yang bukan standalone PWA', () => {
      const origUserAgent = navigator.userAgent;
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        configurable: true,
      });

      expect(isIosNonStandalone()).toBe(true);

      // Bila standalone = true
      window.navigator.standalone = true;
      expect(isIosNonStandalone()).toBe(false);
      delete window.navigator.standalone;

      Object.defineProperty(navigator, 'userAgent', {
        value: origUserAgent,
        configurable: true,
      });
    });
  });

  describe('isPushSupported & getPushPermissionState', () => {
    it('mengembalikan true jika serviceWorker, PushManager, dan Notification ada', () => {
      expect(isPushSupported()).toBe(true);
      expect(getPushPermissionState()).toBe('default');
    });

    it('mengembalikan false dan unsupported jika PushManager tidak ada', () => {
      delete window.PushManager;
      expect(isPushSupported()).toBe(false);
      expect(getPushPermissionState()).toBe('unsupported');
    });
  });

  describe('subscribeToPush', () => {
    it('mengembalikan error NOT_SUPPORTED jika browser tidak mendukung', async () => {
      delete window.PushManager;
      const res = await subscribeToPush();
      expect(res.success).toBe(false);
      expect(res.error).toBe('NOT_SUPPORTED');
    });

    it('mengembalikan error MISSING_VAPID_KEY jika VITE_VAPID_PUBLIC_KEY kosong', async () => {
      vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
      const res = await subscribeToPush();
      expect(res.success).toBe(false);
      expect(res.error).toBe('MISSING_VAPID_KEY');
    });

    it('mengembalikan error PERMISSION_DENIED jika user menolak izin notifikasi', async () => {
      window.Notification.requestPermission = vi.fn().mockResolvedValue('denied');
      const res = await subscribeToPush();
      expect(res.success).toBe(false);
      expect(res.error).toBe('PERMISSION_DENIED');
    });

    it('berhasil meminta izin, subscribe push, dan memanggil RPC save_push_subscription', async () => {
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: { success: true },
        error: null,
      });

      const res = await subscribeToPush();
      expect(res.success).toBe(true);
      expect(window.Notification.requestPermission).toHaveBeenCalled();
      expect(rpcSpy).toHaveBeenCalledWith('save_push_subscription', {
        p_endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
        p_p256dh: 'BNcRdreALRFXTkOOUHK18PeW5pXoG1GNKIrO3S9GdBZ',
        p_auth: 'tBHItDaCWFLBp-77BBdYXw',
        p_user_agent: navigator.userAgent,
      });
    });

    it('mengembalikan error jika RPC save_push_subscription gagal', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: null,
        error: { message: 'Akses ditolak: pengguna belum login' },
      });

      const res = await subscribeToPush();
      expect(res.success).toBe(false);
      expect(res.message).toContain('Akses ditolak');
    });

    it('simulasi sukses tanpa jaringan jika VITE_DEMO_MODE=true', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'true');
      const rpcSpy = vi.spyOn(supabase, 'rpc');

      const res = await subscribeToPush();
      expect(res.success).toBe(true);
      expect(res.simulated).toBe(true);
      expect(rpcSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem('rw_demo_push_subscribed')).toBe('true');
    });
  });

  describe('unsubscribeFromPush', () => {
    it('memanggil subscription.unsubscribe() dan RPC delete_push_subscription', async () => {
      const mockSub = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
        unsubscribe: vi.fn().mockResolvedValue(true),
      };

      const reg = await navigator.serviceWorker.ready;
      reg.pushManager.getSubscription.mockResolvedValue(mockSub);

      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: { success: true },
        error: null,
      });

      const res = await unsubscribeFromPush();
      expect(res.success).toBe(true);
      expect(mockSub.unsubscribe).toHaveBeenCalled();
      expect(rpcSpy).toHaveBeenCalledWith('delete_push_subscription', {
        p_endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
      });
    });

    it('simulasi unsubscribe di mode demo', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'true');
      localStorage.setItem('rw_demo_push_subscribed', 'true');

      const res = await unsubscribeFromPush();
      expect(res.success).toBe(true);
      expect(res.simulated).toBe(true);
      expect(localStorage.getItem('rw_demo_push_subscribed')).toBeNull();
    });
  });

  describe('getCurrentSubscription', () => {
    it('mengembalikan subscription yang sedang aktif', async () => {
      const mockSub = { endpoint: 'https://active.endpoint' };
      const reg = await navigator.serviceWorker.ready;
      reg.pushManager.getSubscription.mockResolvedValue(mockSub);

      const sub = await getCurrentSubscription();
      expect(sub).toEqual(mockSub);
    });

    it('mengembalikan null jika belum ada langganan', async () => {
      const reg = await navigator.serviceWorker.ready;
      reg.pushManager.getSubscription.mockResolvedValue(null);

      const sub = await getCurrentSubscription();
      expect(sub).toBeNull();
    });
  });
});
