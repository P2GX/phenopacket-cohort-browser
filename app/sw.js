// Service worker: makes the viewer a fully offline-capable installable app.
//
// On install it pre-caches EVERYTHING the app needs — including the Python
// runtime (Pyodide), fonts, Chart.js, the statistics modules and the example
// cohort — so after one online visit the app works with no connection at all
// (and can be installed to the Dock / Start menu like a normal program).
//
// Fetch strategy stays network-first: a deploy is picked up on the next
// online visit, the cache is only the offline fallback.
//
// BUMP `VERSION` when you change this list (or ship a release) so old caches
// are cleaned up.

const VERSION = 'v2';
const CACHE = `cohort-explorer-${VERSION}`;

const CORE = [
  '.',
  'index.html',
  'manifest.json',
  'version.json',
  'CHANGELOG.md',
  'css/app.css',
  'js/app.js',
  'js/config.js',
  'js/filecheck.js',
  'js/core/pybridge.js',
  'js/core/registry.js',
  'js/core/tables.js',
  'js/core/charts.js',
  'js/core/format.js',
  'js/tabs/index.js',
  'js/tabs/demographics.js',
  'js/tabs/diagnoses.js',
  'js/tabs/genes.js',
  'js/tabs/phenotypes.js',
  'js/tabs/diseases.js',
  'js/tabs/measurements.js',
  'js/tabs/browser.js',
  'js/tabs/about.js',
  'vendor/chart.umd.min.js',
  'vendor/fonts/fonts.css',
  'vendor/fonts/fraunces-latin-300-normal.woff2',
  'vendor/fonts/fraunces-latin-300-italic.woff2',
  'vendor/fonts/dm-mono-latin-400-normal.woff2',
  'vendor/fonts/dm-mono-latin-500-normal.woff2',
  'vendor/pyodide/pyodide.js',
  'vendor/pyodide/pyodide.mjs',
  'vendor/pyodide/pyodide.asm.mjs',
  'vendor/pyodide/pyodide.asm.wasm',
  'vendor/pyodide/python_stdlib.zip',
  'vendor/pyodide/pyodide-lock.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

async function precache() {
  const cache = await caches.open(CACHE);

  // Core assets — cache each individually so one miss doesn't abort install
  await Promise.allSettled(CORE.map(url => cache.add(url)));

  // Python statistics modules (list is dynamic)
  try {
    const pyManifest = await (await fetch('py/manifest.json')).json();
    await cache.add('py/manifest.json');
    await Promise.allSettled(pyManifest.map(p => cache.add(`py/${p}`)));
  } catch (e) { /* offline install — keep whatever we have */ }

  // Example cohort (so "Load example cohort" works offline too)
  try {
    const examples = await (await fetch('examples/manifest.json')).json();
    await cache.add('examples/manifest.json');
    await Promise.allSettled(examples.map(n => cache.add(`examples/${n}`)));
  } catch (e) { /* optional */ }
}

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        // Offline navigation fallback → app shell
        if (request.mode === 'navigate') {
          const shell = await caches.match('index.html');
          if (shell) return shell;
        }
        throw new Error('offline and not cached: ' + request.url);
      })
  );
});
