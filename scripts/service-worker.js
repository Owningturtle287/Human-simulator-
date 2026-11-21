const prefix = 'human-simulator:' + new URL(self.registration.scope).pathname + ':';
const name = prefix + '__VERSION__';
const files = __FILES__;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(name).then(cache => cache.addAll(files)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(prefix) && key !== name).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  const key = request.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : request;
  event.respondWith(caches.open(name).then(async cache => (await cache.match(key)) ?? fetch(request)));
});
