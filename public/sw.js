const CACHE_NAME = 'pescamon-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/export.geojson'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorar requisições do Vite dev server (HMR, módulos JS/TS/JSX, WebSocket)
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules') ||
    url.pathname.startsWith('/src') ||
    url.search.includes('t=') ||
    url.search.includes('v=') ||
    event.request.headers.get('accept')?.includes('text/html') === false &&
      (url.pathname.endsWith('.jsx') || url.pathname.endsWith('.tsx') ||
       url.pathname.endsWith('.ts')  || url.pathname.endsWith('.js') &&
       url.search.length > 0)
  ) {
    return; // deixa o browser lidar normalmente
  }

  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cache.match(event.request))
    )
  );
});

self.addEventListener('push', (event) => {
  let data = { title: '🎣 Pescamon', body: 'Nova notificação', tag: 'pescamon', url: '/' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { /* ignore */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/logo.png',
      badge: '/logo.png',
      renotify: true,
      data: { url: data.url }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, url } = event.data;
    self.registration.showNotification(title || '🎣 Pescamon', {
      body: body || '',
      tag: tag || 'pescamon',
      icon: '/logo.png',
      badge: '/logo.png',
      renotify: true,
      data: { url: url || '/' }
    });
  }
});
