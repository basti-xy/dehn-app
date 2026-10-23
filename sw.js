// Service Worker: Network-first, damit Updates sofort ankommen – offline wird aus dem Cache geliefert.
// Die Routinen liegen nicht hier, sondern privat bei GitHub (die App speichert sie selbst zwischen).
const CACHE = 'dehnapp-v13';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'sync.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // nur eigene alte Versionen löschen – nicht den Speicher der Ansage-Aufnahmen der App
      .then((keys) => Promise.all(keys.filter((k) => /^dehnapp-v\d+$/.test(k) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Immer beim Server nachfragen (304 ist billig), damit Updates nie im HTTP-Cache hängen bleiben
  const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' });
  event.respondWith(
    fresh
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true })
          .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
          .then((hit) => hit || Response.error())
      )
  );
});
