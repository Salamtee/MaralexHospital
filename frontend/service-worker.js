const CACHE_NAME = 'maralex-allied-shell-v2';
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

  // Never cache API calls — the app always needs live data from MongoDB.
  if (request.url.includes('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ message: 'You appear to be offline.' }), { headers: { 'Content-Type': 'application/json' }, status: 503 })));
    return;
  }

  // App shell: network-first, falling back to cache only when offline.
  // (Previously cache-first, which kept serving a stale js/api.js to the
  // installed PWA even after new versions were deployed to Vercel.)
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