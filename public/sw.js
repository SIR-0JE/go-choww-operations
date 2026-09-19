// GoChoww Operations Service Worker for Web Push & PWA Notifications

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming push event from server
self.addEventListener('push', (event) => {
  let data = {
    title: '🛵 GoChoww Update',
    body: 'You have a new update on GoChoww operations.',
    url: '/dashboard',
    tag: `gochow-${Date.now()}`,
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const title = data.title || '🛵 GoChoww Notification';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'gochow-alert',
    renotify: true,
    requireInteraction: true,
    vibrate: data.vibrate || [200, 100, 200, 100, 200],
    data: {
      url: data.url || '/dashboard',
      timestamp: Date.now(),
      extra: data.data || {},
    },
    actions: [
      {
        action: 'open',
        title: 'Open View ➔',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification tap / click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            if ('navigate' in client && targetUrl) {
              client.navigate(targetUrl);
            }
            return;
          }
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
