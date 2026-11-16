/**
 * FROSE Street Service Worker (Phase 13 Production)
 * Network-first strategy for navigation / HTML (ensures live updates always load)
 * Cache-first for immutable static icons, stale-while-revalidate for CSS/JS
 */

const CACHE_NAME = 'frose-street-v5-billing-portal';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/register.html',
  '/billing.html',
  '/css/style.css',
  '/js/app.js',
  '/js/register.js',
  '/js/billing.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('⚡ Pre-caching offline PWA assets (v5)');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('🧹 Purging obsolete service worker cache:', key);
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Pass dynamic API and WebSocket requests directly to network
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('/health') ||
    event.request.url.includes('/ws')
  ) {
    return;
  }

  // Network-first strategy for HTML pages & navigation requests
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Stale-while-revalidate / cache-first for other assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
