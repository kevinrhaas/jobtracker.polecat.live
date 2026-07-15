// sw.js — minimal offline support for the app shell (registered with
// scope '/app/' from app/index.html; never touches the marketing site or
// archived /v/<n>/ snapshots).
//
// Strategy is network-first, cache-as-fallback: every GET always tries the
// network first and refreshes the cache with whatever comes back, so an
// online visit is never served stale JS after a deploy (this app ships new
// builds hourly). The cache only kicks in when the network is unavailable,
// which is exactly what "installable / offline-capable" needs here.
const CACHE = 'jt-shell-v2';   // bumped: Polecat Shell adoption (vendor/polecat-shell)

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('/app/');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
