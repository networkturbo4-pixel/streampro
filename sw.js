/**
 * Service Worker - StreamManager Pro PWA
 * Versión: 1.0.0
 * Estrategias de caché:
 * - Navegación (HTML): Network-First con fallback a index.html / offline.html
 * - Activos estáticos (CSS, JS, Fuentes, Iconos): Stale-While-Revalidate
 * - Peticiones API GET: Network-First con caché de respaldo para consulta offline
 * - Peticiones API POST/PUT/DELETE: Network-Only con respuesta JSON amigable en caso offline
 */

const CACHE_VERSION = 'v1.0.2';
const STATIC_CACHE = `stream-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `stream-dynamic-${CACHE_VERSION}`;
const API_CACHE = `stream-api-${CACHE_VERSION}`;

// Lista de archivos críticos para pre-cachear durante la instalación
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './index.php',
    './offline.html',
    './manifest.webmanifest',
    './manifest.json',
    './assets/css/style.css',
    './assets/js/api.js',
    './assets/js/auth.js',
    './assets/js/app.js',
    './assets/js/pwa.js',
    './assets/icons/favicon.svg',
    './assets/icons/favicon.png',
    './assets/icons/icon.svg',
    './assets/icons/icon-72x72.png',
    './assets/icons/icon-96x96.png',
    './assets/icons/icon-128x128.png',
    './assets/icons/icon-144x144.png',
    './assets/icons/icon-152x152.png',
    './assets/icons/icon-192x192.png',
    './assets/icons/icon-384x384.png',
    './assets/icons/icon-512x512.png',
    './assets/icons/icon-maskable-192x192.png',
    './assets/icons/icon-maskable-512x512.png',
    './assets/icons/apple-touch-icon.png'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                // Precachear uno por uno para que un recurso no detenga a los demás
                return Promise.allSettled(
                    PRECACHE_ASSETS.map((asset) => cache.add(asset))
                );
            })
            .then(() => self.skipWaiting())
    );
});

// Activación y limpieza de cachés antiguas
self.addEventListener('activate', (event) => {
    const currentCaches = [STATIC_CACHE, DYNAMIC_CACHE, API_CACHE];

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (!currentCaches.includes(name)) {
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interceptor de peticiones (Fetch)
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Manejo de peticiones API (GET vs Mutations)
    if (url.pathname.includes('/api/')) {
        if (request.method === 'GET') {
            // Network-First para consultas API
            event.respondWith(
                fetch(request)
                    .then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            const resClone = networkResponse.clone();
                            caches.open(API_CACHE).then((cache) => cache.put(request, resClone));
                        }
                        return networkResponse;
                    })
                    .catch(async () => {
                        const cached = await caches.match(request);
                        if (cached) return cached;

                        return new Response(JSON.stringify({
                            success: false,
                            error: 'Estás sin conexión a internet. Mostrando datos locales.',
                            offline: true
                        }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    })
            );
            return;
        } else {
            // Peticiones de mutación (POST, PUT, DELETE) -> Network-Only con fallback offline
            event.respondWith(
                fetch(request).catch(() => {
                    return new Response(JSON.stringify({
                        success: false,
                        error: 'No se puede completar la operación sin conexión a internet.',
                        offline: true
                    }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
            );
            return;
        }
    }

    // 2. Navegación de páginas (HTML principal)
    if (request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse.status === 200) {
                        const resClone = networkResponse.clone();
                        caches.open(STATIC_CACHE).then((cache) => cache.put(request, resClone));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    // Intento 1: Servir la URL navegada desde caché
                    const cached = await caches.match(request);
                    if (cached) return cached;

                    // Intento 2: Servir index.html cacheado
                    const cachedIndex = await caches.match('./index.html') || await caches.match('./');
                    if (cachedIndex) return cachedIndex;

                    // Intento 3: Página offline de cortesía
                    const cachedOffline = await caches.match('./offline.html');
                    if (cachedOffline) return cachedOffline;

                    return new Response('<h1>Sin conexión a internet</h1>', {
                        headers: { 'Content-Type': 'text/html' }
                    });
                })
        );
        return;
    }

    // 3. Fuentes externas (Google Fonts)
    if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(request).then((networkResponse) => {
                    const resClone = networkResponse.clone();
                    caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, resClone));
                    return networkResponse;
                }).catch(() => caches.match(request));
            })
        );
        return;
    }

    // 4. Recursos estáticos locales (CSS, JS, Imágenes, SVG) -> Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const resClone = networkResponse.clone();
                        caches.open(STATIC_CACHE).then((cache) => cache.put(request, resClone));
                    }
                    return networkResponse;
                })
                .catch(() => cachedResponse);

            return cachedResponse || fetchPromise;
        })
    );
});

// Escuchar mensajes del cliente (ej: forzar actualización)
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
