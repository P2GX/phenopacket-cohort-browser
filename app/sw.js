// Service worker: makes the viewer usable offline after the first visit.
//
// Strategy: network-first for everything (so a deploy is picked up on the
// next online visit), falling back to the cache when offline. Successful
// GET responses — including the Pyodide runtime from the CDN — are cached.

const CACHE = 'cohort-explorer-v1';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

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
      .catch(() => caches.match(request))
  );
});
