/* eslint-disable no-restricted-globals */
/**
 * push-sw.js — Service Worker Web Push Handler (KOS-5.3b)
 *
 * Menangani event 'push' dan 'notificationclick' untuk notifikasi pengingat sewa / tagihan PWA.
 * Diimpor oleh Service Worker Workbox via workbox.importScripts: ['push-sw.js'].
 */

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: 'Notifikasi RuangWarga',
        body: event.data.text(),
      };
    }
  }

  const title = data.title || 'RuangWarga';
  const options = {
    body: data.body || 'Anda memiliki pemberitahuan baru.',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/favicon-32x32.png',
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
      ...(data.data || {}),
    },
    tag: data.tag || 'ruangwarga-rent-reminder',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';
  const urlToOpen = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // 1. Fokus tab yang sudah terbuka dengan URL yang sama
        for (const client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // 2. Jika ada tab RuangWarga lain yang terbuka, navigasikan dan fokus
        for (const client of windowClients) {
          if ('focus' in client && 'navigate' in client) {
            return client.focus().then(() => client.navigate(urlToOpen));
          }
        }
        // 3. Jika belum ada tab yang terbuka, buka window baru
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
        return null;
      })
  );
});
