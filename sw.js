// Jordan AI Village service worker (generated at build time; edit sw/sw.js).
// App shell + rooms are precached for offline use; the status snapshot is
// network-first so it is fresh when online and still there when offline.
const CACHE = 'village-mwwe9mwq';
const PRECACHE = ["./","assets/chappie-DtTwRD1I.png","assets/pixel-CVLqZHYB.css","assets/rooms-GRhp4VYp.css","assets/index-DfU8T1jb.js","assets/pixel-BHBH3a9e.js","assets/rooms-_6OWOnrC.js","assets/logic-C7X5JsHy.js","assets/chappieArea-BFvza1eK.js","manifest.webmanifest","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","rooms/ava.jpg","rooms/baymax.jpg","rooms/bishop.jpg","rooms/case.jpg","rooms/chappie.jpg","rooms/edith.jpg","rooms/eve.jpg","rooms/friday.jpg","rooms/gerty.jpg","rooms/jarvis.jpg","rooms/johnny-5.jpg","rooms/johnny-cab.jpg","rooms/joshua.jpg","rooms/muse.jpg","rooms/oracle.jpg","rooms/robby.jpg","rooms/samantha.jpg","rooms/skynet.jpg","rooms/sonny.jpg","rooms/tars.jpg","rooms/tron.jpg","rooms/vision.jpg","rooms/wall-e.jpg"];

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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const isData = url.pathname.includes('/data/');
  if (isData || req.mode === 'navigate') {
    // network first, cached copy when offline
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            const key = isData ? url.pathname : req;
            caches.open(CACHE).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(isData ? url.pathname : req, { ignoreSearch: true }).then((r) => r || caches.match('./'))),
    );
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
