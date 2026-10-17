const CACHE_NAME = 'maralex-allied-shell-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/api.js',
  '/js/app.js',
  '/manifest.json',
  '/assets/maralex-logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ message: 'You appear to be offline.' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503
          })
      )
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
  );
});

// Push notifications (works when app is closed if user subscribed)
self.addEventListener('push', (event) => {
  let data = { title: 'MARALEX Allied', body: 'You have a new update.', url: '/', tag: 'maralex' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    try {
      data.body = event.data.text();
    } catch (_) {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'MARALEX Allied', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'maralex',
      data: { url: data.url || '/' },
      requireInteraction: false
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (client.navigate) client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
