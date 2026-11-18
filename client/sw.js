/**
 * FROSE Street Service Worker (Phase 16 Production)
 * Network-first strategy for navigation / HTML (ensures live updates always load)
 * Cache-first for immutable static icons, stale-while-revalidate for CSS/JS
 */

const CACHE_NAME = 'frose-street-v9-production-authwall';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/billing.html',
  '/kitchen.html',
  '/packaging.html',
  '/css/style.css',
  '/js/storage-adapter.js',
  '/js/escpos-generator.js',
  '/js/bluetooth-printer.js',
  '/js/whatsapp-service.js',
  '/js/app.js',
  '/js/register.js',
  '/js/billing.js',
  '/js/kitchen.js',
  '/js/packaging.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('⚡ Pre-caching offline PWA assets (v9)');
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
  // Pass dynamic API, WebSocket, and Admin requests directly to network (no cache)
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('/health') ||
    event.request.url.includes('/ws') ||
    event.request.url.includes('/admin')
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
        .catch(async () => {
          // Serve exact requested page if cached, otherwise fall back to portal home
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return (await caches.match('/index.html')) || Response.error();
        })
    );
    return;
  }

  // Network-first for CSS and JS assets (ensures immediate design updates, offline safe)
  if (
    event.request.destination === 'style' ||
    event.request.destination === 'script' ||
    event.request.url.includes('/css/') ||
    event.request.url.includes('/js/')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for images, fonts, and other immutable assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});
