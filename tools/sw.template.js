// Service worker (ARCHITECTURE §12). tools/build.mjs turns this template into dist/sw.js, filling
// in the cache name (a hash of every shipped file) and the list of files to precache. Because
// the name changes whenever any file changes, a new version always installs a complete new cache.

const CACHE = '__CACHE_NAME__';
const PRECACHE = __PRECACHE__;

/** Everything is resolved against the worker's scope, so the app works under any subpath. */
const absolute = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: 'reload' skips the browser's HTTP cache, so a new version can never install stale files.
      // addAll is all-or-nothing: if any file fails, this install fails and the old version keeps running.
      await cache.addAll(PRECACHE.map((path) => new Request(absolute(path), { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('gs-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit) return hit;
      if (request.mode === 'navigate') {
        const shell = await cache.match(absolute('index.html'));
        if (shell) return shell;
      }
      try {
        return await fetch(request);
      } catch {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })(),
  );
});

// The page asks for the new version to take over only when the player taps "Reload".
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
