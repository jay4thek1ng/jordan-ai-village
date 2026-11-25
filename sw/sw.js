// Jordan AI Village service worker (generated at build time; edit sw/sw.js).
// App shell, rooms, and pixel sprites are precached. Status is network-first.
// Cloudflare Access login redirects are never stored: only a basic 200 that
// was not redirected may enter the cache. Navigation falls back to that cache.
const CACHE = 'village-__VERSION__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('village-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(res) {
  return res.type === 'basic' && res.status === 200 && !res.redirected;
}

async function fromCache(req, isData) {
  const url = new URL(req.url);
  const hit = await caches.match(isData ? url.pathname : req, { ignoreSearch: true });
  if (hit) return hit;
  if (req.mode === 'navigate') return caches.match('./');
  return undefined;
}

async function networkFirst(req) {
  const url = new URL(req.url);
  const isData = url.pathname.includes('/data/');
  try {
    const res = await fetch(req, { credentials: 'same-origin' });
    if (cacheable(res)) {
      const cache = await caches.open(CACHE);
      await cache.put(isData ? url.pathname : req, res.clone());
      return res;
    }
    // Redirect or non-200: do not cache (an Access login page must not become the app).
    if (req.mode === 'navigate' || res.redirected) {
      const cached = await fromCache(req, isData);
      if (cached) return cached;
    }
    return res;
  } catch {
    const cached = await fromCache(req, isData);
    if (cached) return cached;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const isData = url.pathname.includes('/data/');
  if (isData || req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req, { credentials: 'same-origin' })),
  );
});
