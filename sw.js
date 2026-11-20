// ===== Walletera | sw.js =====
// Service worker: la app funciona sin conexión.
// - Archivos propios: primero la red (para ver siempre la última versión), caché si no hay conexión.
// - Recursos externos (Chart.js, tipografía): caché primero y se actualiza en segundo plano.
// - La API (/api/) nunca pasa por la caché: son datos personales y tienen que estar al día.

const CACHE = 'walletera-v3';
const ARCHIVOS = [
    './',
    './index.html',
    './main.js',
    './js/api.js',
    './js/datos.js',
    './js/dominio.js',
    './js/ejemplo.js',
    './js/exportar.js',
    './css/estilos.css',
    './categorias.json',
    './iconos.json',
    './manifest.webmanifest',
    './img/logo.svg',
    './img/favicon.svg',
    './img/icono-180.png',
    './img/icono-192.png',
    './img/icono-512.png',
    './img/icono-maskable-512.png',
    './vendor/phosphor/phosphor.css',
    './vendor/phosphor/Phosphor.woff2'
];

self.addEventListener('install', evento => {
    evento.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ARCHIVOS)));
    self.skipWaiting();
});

self.addEventListener('activate', evento => {
    evento.waitUntil(
        caches.keys()
            .then(claves => Promise.all(claves.filter(clave => clave !== CACHE).map(clave => caches.delete(clave))))
            .then(() => self.clients.claim())
    );
});

async function primeroLaRed(pedido) {
    const cache = await caches.open(CACHE);
    try {
        const respuesta = await fetch(pedido);
        if (respuesta.ok) cache.put(pedido, respuesta.clone());
        return respuesta;
    } catch {
        const guardada = await cache.match(pedido, { ignoreSearch: true });
        if (guardada) return guardada;
        if (pedido.mode === 'navigate') return cache.match('./index.html');
        throw new Error('Sin conexión');
    }
}

async function primeroLaCache(evento) {
    const cache = await caches.open(CACHE);
    const guardada = await cache.match(evento.request);
    const actualizar = fetch(evento.request)
        .then(respuesta => {
            if (respuesta.ok || respuesta.type === 'opaque') cache.put(evento.request, respuesta.clone());
            return respuesta;
        })
        .catch(() => guardada ?? Response.error());
    if (guardada) {
        evento.waitUntil(actualizar);
        return guardada;
    }
    return actualizar;
}

self.addEventListener('fetch', evento => {
    const { request } = evento;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    const mismoOrigen = url.origin === self.location.origin;
    if (mismoOrigen && url.pathname.startsWith('/api/')) return;
    evento.respondWith(mismoOrigen ? primeroLaRed(request) : primeroLaCache(evento));
});
