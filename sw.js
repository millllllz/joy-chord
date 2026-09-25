// Cache name is tied to the on-page build-version tag in index.html — bump
// both together so a new deploy invalidates the old cache instead of a
// visitor getting stuck on a stale offline copy forever.
const CACHE_NAME = 'joychord-b31c147';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './src/audio.js',
  './src/chords.js',
  './src/debug.js',
  './src/degree-joystick.js',
  './src/effects.js',
  './src/fullscreen.js',
  './src/index.js',
  './src/keyboard-view.js',
  './src/modifier-joystick.js',
  './src/persistence.js',
  './src/settings.js',
  './src/vocoder.js',
  './src/wedge-geometry.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Network-first, falling back to cache only when the network fails (i.e.
// actually offline). This used to be stale-while-revalidate — always answer
// from cache immediately, refresh in the background for *next* time — which
// sounds harmless but meant a visit shortly after any deploy could get some
// resources from the new deploy and others (already cached) from the old
// one: e.g. a fresh index.html with a new effect's dialog markup, paired
// with a stale cached src/index.js from before that effect's toggle button
// was wired up, so the button renders but does nothing. Network-first fetches
// every resource fresh on every online load, so HTML and JS always land from
// the same deploy together; offline is still covered by the cache fallback.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
