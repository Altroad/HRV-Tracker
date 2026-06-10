const CACHE = 'vitals-static-v1';
const STATIC = [
  '/HRV-Tracker/manifest.json',
  '/HRV-Tracker/icon-180.png',
  '/HRV-Tracker/icon-192.png',
  '/HRV-Tracker/icon-512.png',
  '/HRV-Tracker/fonts/bebas-neue-400.woff2',
  '/HRV-Tracker/fonts/dm-mono-300.woff2',
  '/HRV-Tracker/fonts/dm-mono-400.woff2',
  '/HRV-Tracker/fonts/dm-mono-500.woff2',
  '/HRV-Tracker/fonts/dm-sans-var.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // GitHub API — network only, no caching
  if (url.hostname === 'api.github.com') {
    e.respondWith(fetch(e.request));
    return;
  }

  // HTML — network first, fall back to cache when offline
  if (e.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/HRV-Tracker/') {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
