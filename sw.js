// Offline shell. Everything the app needs is cached on first load; nothing else is cached.
// Calls to Jinx (Ollama) and every other site go straight to the network, never through the cache.
// Bump VERSION whenever any file below changes, so phones fetch the new copy.
const VERSION = '1.3.0';
const CACHE = 'clearance-ledger-' + VERSION;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/store.js',
  'js/core/barcode.js',
  'js/core/bundles.js',
  'js/core/calc.js',
  'js/core/format.js',
  'js/core/items.js',
  'js/core/market.js',
  'js/core/settings.js',
  'js/core/state.js',
  'js/core/vision.js',
  'js/services/camera.js',
  'js/services/market.js',
  'js/services/ollama.js',
  'js/services/storage.js',
  'js/ui/check.js',
  'js/ui/dom.js',
  'js/ui/haul.js',
  'js/ui/link.js',
  'js/ui/pairs.js',
  'js/ui/scan.js',
  'js/ui/setup.js',
  'vendor/zxing.min.js',
  'fonts/barlow-latin-400-normal.woff2',
  'fonts/barlow-latin-500-normal.woff2',
  'fonts/barlow-latin-600-normal.woff2',
  'fonts/barlow-condensed-latin-700-normal.woff2',
  'fonts/barlow-condensed-latin-800-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2',
  'fonts/ibm-plex-mono-latin-500-normal.woff2',
  'fonts/ibm-plex-mono-latin-600-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('clearance-ledger-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // network only
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    return fetch(req);
  })());
});
