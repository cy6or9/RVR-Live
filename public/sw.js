/* RVR Offline Service Worker v1 */
const VERSION = 'v1';
const TILE_CACHE = `rvr-tiles-${VERSION}`;
const DATA_CACHE = `rvr-data-${VERSION}`;
const STATIC_CACHE = `rvr-static-${VERSION}`;
const MAX_TILE_ENTRIES = 300;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => ![STATIC_CACHE, TILE_CACHE, DATA_CACHE].includes(k))
        .map((k) => caches.delete(k))
    );
    self.clients.claim();
  })());
});

const isTile = (url) =>
  /\.(png|jpg|jpeg|webp)$/.test(url.pathname) &&
  /tile|tiles|tile\.openstreetmap|arcgisonline|cartocdn|mapbox|googleapis/.test(url.hostname);

const isData = (url) =>
  (url.origin === self.location.origin && url.pathname.startsWith('/api/')) ||
  /noaa\.gov|weather\.gov|water\.noaa\.gov|hydrograph|forecast/.test(url.hostname + url.pathname);

async function cacheFirst(req, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      await cache.put(req, res.clone());
      if (maxEntries) pruneCache(cache, maxEntries);
    }
    return res;
  } catch {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || networkPromise || Response.error();
}

async function pruneCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    const toDelete = keys.length - maxEntries;
    for (let i = 0; i < toDelete; i++) {
      await cache.delete(keys[i]);
    }
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (isTile(url)) {
    event.respondWith(cacheFirst(request, TILE_CACHE, MAX_TILE_ENTRIES));
    return;
  }
  if (isData(url)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

self.addEventListener('message', async (event) => {
  const { type } = event.data || {};
  if (type === 'CLEAR_OFFLINE_CACHES') {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
});
