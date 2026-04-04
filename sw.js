const CACHE = 'mc-metales-v3';

const STATIC = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/lightweight-charts/dist/lightweight-charts.standalone.production.js'
];

// Instalar: cachear archivos estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC))
  );
  self.skipWaiting();
});

// Activar: eliminar cachés antiguas, tomar control inmediato
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: estrategia mixta
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // HTML: Network First para asegurar siempre la versión más reciente
  if (request.mode === 'navigate' || (request.destination === 'document')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE).then(cache => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // Llamadas a la API: network-first, cachear para offline
  if (url.hostname === 'mc-metales-precios.azurewebsites.net') {
    // No cachear endpoints de escritura (guardar, login, alertas POST)
    const soloLectura = url.pathname.endsWith('/onza') ||
                        url.pathname.endsWith('/dolar') ||
                        url.pathname.endsWith('/historial');
    if (!soloLectura) return; // dejar pasar sin interceptar

    event.respondWith(
      fetch(request.clone())
        .then(response => {
          if (response.ok) {
            caches.open(CACHE).then(cache => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Archivos estáticos y CDN: cache-first, luego network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && (url.protocol === 'https:' || url.protocol === 'http:')) {
          caches.open(CACHE).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
