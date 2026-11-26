/**
 * FROSE Street Service Worker (Phase 2 Offline Safety)
 * frose-street-v9-production compatibility
 * - Complete static shell pre-cache (HTML, CSS, all Step 1D & Phase 2 JS, manifest, icons)
 * - Network-only for /api/* (NEVER cached in CacheStorage; clean 503 OFFLINE JSON fallback)
 * - Network-first with strict 3000ms AbortController timeout for navigations & scripts/styles
 * - Automatic obsolete cache purge on activate
 */

const CACHE_NAME = 'frose-street-v9-production-v54-phase4-ux';
const NETWORK_TIMEOUT_MS = 3000;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/billing.html',
  '/kitchen.html',
  '/packaging.html',
  '/menu-setup.html',
  '/css/style.css',
  '/css/tokens.css',
  '/css/ui-kit.css',
  '/css/workspace.css',
  '/css/portals-saas.css',
  '/js/theme.js',
  '/js/ui-components.js',
  '/js/orders-panel.js',
  '/js/payments-panel.js',
  '/js/menu-panel.js',
  '/js/api-client.js',
  '/js/safe-dom.js',
  '/js/session-guard.js',
  '/js/dom-events.js',
  '/js/idb-store.js',
  '/js/billing-page.js',
  '/js/login-page.js',
  '/js/menu-setup.js',
  '/js/admin-page.js',
  '/js/index-page.js',
  '/js/storage-adapter.js',
  '/js/escpos-generator.js',
  '/js/bluetooth-printer.js',
  '/js/whatsapp-service.js',
  '/js/settings-component.js',
  '/js/receipt-view.js',
  '/js/ios-fast-nav.js',
  '/js/app.js',
  '/js/register.js',
  '/js/billing.js',
  '/js/kitchen.js',
  '/js/packaging.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/images/dishes/chicken-biryani-full.webp'
];

function fetchWithTimeout(request, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timerId));
}

async function matchCachedShell(request) {
  const direct = await caches.match(request, { ignoreSearch: true });
  if (direct) return direct;

  try {
    const url = new URL(request.url);
    const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
    if (cleanPath === '/') {
      const idx = await caches.match('/index.html');
      if (idx) return idx;
    }
    if (!cleanPath.endsWith('.html')) {
      const htmlMatch = await caches.match(`${cleanPath}.html`);
      if (htmlMatch) return htmlMatch;
    }
  } catch (_) {}

  return (await caches.match('/index.html')) || Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache /api/* responses in CacheStorage (network-only with clean offline JSON fallback)
  if (url.pathname.startsWith('/api/') || event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({
            status: 'error',
            code: 'OFFLINE',
            message: 'Network unavailable (offline)',
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
    );
    return;
  }

  // Pass health, WebSocket, Admin, downloads, and non-GET requests directly to network
  if (
    url.pathname === '/health' ||
    url.pathname.startsWith('/ws') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/downloads/') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network-first with 3000ms AbortController timeout for HTML navigations
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetchWithTimeout(event.request, NETWORK_TIMEOUT_MS)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => matchCachedShell(event.request))
    );
    return;
  }

  // Network-first with 3000ms AbortController timeout for CSS and JS assets
  if (
    event.request.destination === 'style' ||
    event.request.destination === 'script' ||
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/')
  ) {
    event.respondWith(
      fetchWithTimeout(event.request, NETWORK_TIMEOUT_MS)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { ignoreSearch: true });
          if (cached) return cached;
          if (event.request.destination === 'style' && url.origin !== self.location.origin) {
            return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
          }
          return Response.error();
        })
    );
    return;
  }

  // Cache-first for images, fonts, manifest, and immutable static assets
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          if (url.pathname === '/favicon.ico' || url.origin !== self.location.origin) {
            return new Response(null, { status: 204 });
          }
          return Response.error();
        });
    })
  );
});
