const CACHE = 'vitals-v2';
const ASSETS = [
  '/HRV-Tracker/',
  '/HRV-Tracker/index.html',
  '/HRV-Tracker/manifest.json',
  '/HRV-Tracker/icon-192.png',
  '/HRV-Tracker/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first for GitHub API calls, cache-first for app shell
  if (e.request.url.includes('api.github.com')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
