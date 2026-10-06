// Service worker (ARCHITECTURE §12). tools/build.mjs turns this template into dist/sw.js, filling
// in the cache name (a hash of every shipped file) and the list of files to precache. Because
// the name changes whenever any file changes, a new version always installs a complete new cache.

const CACHE = 'gs-1dc5269562a1';
const PRECACHE = ["./","assets/icons/apple-touch-icon.png","assets/icons/icon-192.png","assets/icons/icon-512.png","assets/icons/icon-maskable-512.png","assets/icons/icon.svg","data/balance.json","data/countries.json","data/governments.json","data/i18n/en.json","data/map/middle_east.topo.json","data/regions.json","data/resources.json","data/scenarios.json","index.html","manifest.webmanifest","src/core/actions.js","src/core/bus.js","src/core/clock.js","src/core/data.js","src/core/errors.js","src/core/invariants.js","src/core/migrations.js","src/core/rng.js","src/core/save.js","src/core/settings.js","src/core/state.js","src/core/stats.js","src/core/storage/idb.js","src/core/storage/memory.js","src/core/storage/types.js","src/core/turn.js","src/core/version.js","src/game.js","src/main.js","src/systems/demoRoll.js","src/ui/app.js","src/ui/assets.js","src/ui/components/dialog.js","src/ui/components/toast.js","src/ui/diagnostics/collect.js","src/ui/dom.js","src/ui/errors.js","src/ui/files.js","src/ui/format.js","src/ui/map/bake.js","src/ui/map/benchmark.js","src/ui/map/coloring.js","src/ui/map/gestures.js","src/ui/map/hit.js","src/ui/map/labelLayout.js","src/ui/map/labels.js","src/ui/map/mapData.js","src/ui/map/mapView.js","src/ui/map/overlay.js","src/ui/map/phaserMap.js","src/ui/map/topology.js","src/ui/map/view.js","src/ui/panels/countryPanel.js","src/ui/phaser.js","src/ui/platform.js","src/ui/pwa.js","src/ui/screens/diagnostics.js","src/ui/screens/map.js","src/ui/screens/play.js","src/ui/screens/saves.js","src/ui/screens/settings.js","src/ui/screens/title.js","src/ui/settings.js","src/ui/theme.css","src/util/bench.js","src/util/compress.js","src/util/hash.js","src/util/i18n.js","vendor/phaser/LICENSE.md","vendor/phaser/VERSION.json","vendor/phaser/phaser.esm.min.js","build-info.json"];

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
