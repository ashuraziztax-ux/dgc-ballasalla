// DGC Control Panel — Service Worker v224
// Strategy: network-first for HTML (always get latest), cache-first for assets

const CACHE = 'dgc-v224'; // bump this with every release to bust old caches

self.addEventListener('install', e => {
  self.skipWaiting(); // activate immediately — don't wait for old tabs to close
});

self.addEventListener('activate', e => {
  // Delete all old caches (dgc-v1, dgc-v2, etc.)
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/dgc-ballasalla/' || url.pathname === '/dgc-ballasalla';

  if (isHTML) {
    // NETWORK-FIRST for HTML: always try to get the latest version
    // Only fall back to cache if completely offline
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Cache the fresh response for offline use
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request)) // offline fallback
    );
  } else {
    // CACHE-FIRST for other assets (PDFs, icons, etc.)
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
