import { supabase } from './supabaseClient';

/**
 * pushNotifications.js — Web Push Notification Service (KOS-5.3b)
 *
 * Mengelola deteksi browser, registrasi PushManager, dan sinkronisasi
 * langganan Web Push ke Supabase RPC save_push_subscription / delete_push_subscription.
 */

function isDemoMode() {
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';
}

/**
 * Konversi URL-safe Base64 string ke Uint8Array untuk applicationServerKey
 */
export function urlBase64ToUint8Array(base64String) {
  if (!base64String || typeof base64String !== 'string') {
    return new Uint8Array(0);
  }
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Deteksi apakah perangkat adalah iPhone/iPad dalam mode browser reguler (bukan Standalone PWA).
 * Di iOS, Web Push memerlukan PWA "Add to Home Screen" (iOS 16.4+).
 */
export function isIosNonStandalone() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = Boolean(
    window.navigator?.standalone ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  );
  return isIos && !isStandalone;
}

/**
 * Cek apakah push notification didukung oleh browser saat ini.
 */
export function isPushSupported() {
  if (isDemoMode()) return true;

  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Mendapatkan status izin notifikasi saat ini ('default', 'granted', 'denied', atau 'unsupported').
 */
export function getPushPermissionState() {
  if (isDemoMode()) {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('rw_demo_push_subscribed') === 'true') {
      return 'granted';
    }
    return 'default';
  }

  if (!isPushSupported()) {
    return 'unsupported';
  }
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Mengambil langganan PushSubscription aktif di browser ini (jika ada).
 */
export async function getCurrentSubscription() {
  if (isDemoMode()) {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('rw_demo_push_subscribed') === 'true') {
      return {
        endpoint: 'https://demo.ruangwarga.com/push/demo-subscription',
        toJSON: () => ({
          endpoint: 'https://demo.ruangwarga.com/push/demo-subscription',
          keys: {
            p256dh: 'demo-p256dh-key',
            auth: 'demo-auth-secret',
          },
        }),
      };
    }
    return null;
  }

  if (!isPushSupported()) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg || !reg.pushManager) return null;
    const subscription = await reg.pushManager.getSubscription();
    return subscription || null;
  } catch {
    return null;
  }
}

/**
 * Mendaftarkan browser ke Web Push dan menyimpan endpoint ke database via RPC save_push_subscription.
 */
export async function subscribeToPush() {
  if (isDemoMode()) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rw_demo_push_subscribed', 'true');
    }
    return {
      success: true,
      simulated: true,
      subscription: {
        endpoint: 'https://demo.ruangwarga.com/push/demo-subscription',
      },
    };
  }

  if (!isPushSupported()) {
    return {
      success: false,
      error: 'NOT_SUPPORTED',
      message: isIosNonStandalone()
        ? 'Di iPhone/iPad, tambahkan web ke Layar Utama (Add to Home Screen) melalui menu Bagikan di Safari terlebih dahulu.'
        : 'Browser atau perangkat ini tidak mendukung fitur Web Push Notifications.',
    };
  }

  const vapidKey = import.meta.env?.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey || typeof vapidKey !== 'string' || !vapidKey.trim()) {
    return {
      success: false,
      error: 'MISSING_VAPID_KEY',
      message: 'VAPID Public Key belum dikonfigurasi di server/klien.',
    };
  }

  try {
    // 1. Minta izin Notification
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Izin notifikasi ditolak oleh browser atau pengguna.',
      };
    }

    // 2. Ambil service worker registration yang aktif
    const reg = await navigator.serviceWorker.ready;
    if (!reg || !reg.pushManager) {
      return {
        success: false,
        error: 'SERVICE_WORKER_UNAVAILABLE',
        message: 'Service Worker tidak tersedia untuk mendaftarkan push manager.',
      };
    }

    // 3. Daftarkan PushManager
    const applicationServerKey = urlBase64ToUint8Array(vapidKey.trim());
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    // 4. Ekstrak kunci enkripsi
    const subJson = typeof subscription.toJSON === 'function' ? subscription.toJSON() : {};
    const endpoint = subscription.endpoint || subJson.endpoint;
    let p256dh = subJson.keys?.p256dh;
    let auth = subJson.keys?.auth;

    if (!p256dh && typeof subscription.getKey === 'function') {
      const pKey = subscription.getKey('p256dh');
      if (pKey) {
        p256dh = btoa(String.fromCharCode(...new Uint8Array(pKey)));
      }
    }

    if (!auth && typeof subscription.getKey === 'function') {
      const aKey = subscription.getKey('auth');
      if (aKey) {
        auth = btoa(String.fromCharCode(...new Uint8Array(aKey)));
      }
    }

    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;

    // 5. Simpan via RPC save_push_subscription
    const { data, error } = await supabase.rpc('save_push_subscription', {
      p_endpoint: endpoint,
      p_p256dh: p256dh || '',
      p_auth: auth || '',
      p_user_agent: userAgent,
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'RPC_ERROR',
        message: error.message || 'Gagal menyimpan langganan notifikasi ke database.',
      };
    }

    return {
      success: true,
      subscription,
      data,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || 'SUBSCRIBE_ERROR',
      message: err?.message || 'Terjadi kesalahan saat mengaktifkan notifikasi.',
    };
  }
}

/**
 * Membatalkan langganan Web Push di browser dan menghapus dari database via RPC delete_push_subscription.
 */
export async function unsubscribeFromPush() {
  if (isDemoMode()) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('rw_demo_push_subscribed');
    }
    return { success: true, simulated: true };
  }

  if (!isPushSupported()) {
    return {
      success: false,
      error: 'NOT_SUPPORTED',
      message: 'Notifikasi push tidak didukung.',
    };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg || !reg.pushManager) {
      return { success: true };
    }

    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      if (endpoint) {
        const { error } = await supabase.rpc('delete_push_subscription', {
          p_endpoint: endpoint,
        });
        if (error) {
          // eslint-disable-next-line no-console
          console.warn('Gagal menghapus langganan push dari database:', error.message);
        }
      }
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err?.message || 'UNSUBSCRIBE_ERROR',
      message: err?.message || 'Gagal mematikan langganan notifikasi.',
    };
  }
}
