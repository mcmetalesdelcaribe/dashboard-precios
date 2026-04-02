const CACHE = 'mc-metales-v1';

const STATIC = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];

// Instalar: cachear archivos estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC))
  );
  self.skipWaiting();
});

// Activar: eliminar cachés antiguas
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
        // Fallback offline para navegación
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
