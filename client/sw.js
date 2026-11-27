/**
 * FROSE Street Service Worker (PWA-UPD-02: Safe Waiting-State Atomic Updates)
 * - Dynamic cache namespace driven by server-injected BUILD_ID
 * - Precache uses cache: 'reload' so browser HTTP cache never poisons new SW cache
 * - Never calls skipWaiting() during install while an active controller exists;
 *   waits cleanly until user clicks Update Now -> postMessage({ type: 'SKIP_WAITING' })
 * - Network-only for /api/*, /health*, /ws, and /sw.js
 * - Network-first (3000ms AbortController timeout) for HTML navigations
 * - Cache-first scoped strictly to CACHE_NAME for static CSS/JS/icons/manifest
 * - Never modifies or deletes IndexedDB offline data
 */

const BUILD_ID = '__FROSE_BUILD_ID__';
const CACHE_NAME = 'frose-street-' + BUILD_ID;
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
  '/css/admin.css',
  '/js/theme.js',
  '/js/i18n.js',
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
  '/js/qr-local.js',
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
  const cache = await caches.open(CACHE_NAME);
  const direct = await cache.match(request, { ignoreSearch: true });
  if (direct) return direct;

  try {
    const url = new URL(request.url);
    const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
    if (cleanPath === '/') {
      const idx = await cache.match('/index.html');
      if (idx) return idx;
    }
    if (!cleanPath.endsWith('.html')) {
      const htmlMatch = await cache.match(`${cleanPath}.html`);
      if (htmlMatch) return htmlMatch;
    }
  } catch (_) {}

  return (await cache.match('/index.html')) || Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_ASSETS.map((url) =>
          fetch(new Request(url, { cache: 'reload' })).then((response) => {
            if (!response.ok) {
              throw new Error(`Precache failed for ${url}: ${response.status}`);
            }
            return cache.put(url, response);
          })
        )
      )
    )
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('frose-street-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
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

  // Always bypass cache for /sw.js, health, WebSocket, Admin, downloads, and non-GET requests
  if (
    url.pathname === '/sw.js' ||
    url.pathname.startsWith('/health') ||
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

  // Cache-first scoped strictly to CACHE_NAME for static CSS, JS, manifest, icons, and images
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request, { ignoreSearch: true });
      if (cachedResponse) return cachedResponse;

      try {
        const networkResponse = await fetchWithTimeout(event.request, NETWORK_TIMEOUT_MS);
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (_) {
        if (event.request.destination === 'style' && url.origin !== self.location.origin) {
          return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
        }
        if (url.pathname === '/favicon.ico' || url.origin !== self.location.origin) {
          return new Response(null, { status: 204 });
        }
        return Response.error();
      }
    })
  );
});
