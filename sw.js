/* ============================================
   SERVICE WORKER – FreshTrack
   Handles offline caching and background sync
   ============================================ */

const CACHE_NAME = 'freshtrack-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './storage.js',
  './api.js',
  './sw-register.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
];

/* Install – cache static assets */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS.filter(u => !u.startsWith('http'))))
      .then(() => self.skipWaiting())
  );
});

/* Activate – clean old caches */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Fetch – serve from cache, fall back to network */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Don't intercept Open Food Facts API calls (need live data)
  if (url.includes('openfoodfacts.org')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Cache successful local responses
        if (response.ok && !url.startsWith('http://') && url.includes(self.location.origin)) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback for navigation requests
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});

/* Periodic sync for notifications (Chrome only) */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'freshtrack-check') {
    event.waitUntil(checkExpiryNotifications());
  }
});

async function checkExpiryNotifications() {
  // Get data from all clients (for SW context)
  const clients = await self.clients.matchAll();
  if (clients.length === 0) return; // No clients open, skip
  // Delegate check to the client
  clients[0].postMessage({ type: 'CHECK_EXPIRY' });
}
