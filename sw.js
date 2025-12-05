/* ========================================
   SERVICE WORKER - SafeProducts PWA
   Gestión de caché, sincronización offline
   y estrategias de red
   ======================================== */

// Versión del cache
const CACHE_VERSION = 'SafeProducts-v1.0';
const CACHE_ASSETS = 'SafeProducts-assets-v1.0';
const CACHE_API = 'SafeProducts-api-v1.0';

// Archivos críticos a cachear en instalación
const CRITICAL_ASSETS = [
    // HTML
    '/',
    '/index.html',
    '/login.html',
    '/home.html',
    '/productos.html',
    '/escanear.html',
    '/movimientos.html',
    '/registro.html',
    '/offline.html',
    
    // CSS
    '/css/styles.css',
    '/css/productos.css',
    
    // JavaScript - Core
    '/js/db.js',
    '/js/app.js',
    '/js/sync.js',
    '/js/components.js',
    '/js/notifications.js',
    '/js/auth.js',
    '/js/auth-ui.js',
    
    // JavaScript - Specific
    '/js/qr-handler.js',
    '/js/escanear.js',
    '/js/productos.js',
    '/js/movimientos.js',
    '/js/firebase-config.js',
    
    // Librerías
    '/libs/qrcode.min.js',
    
    // Manifest
    '/manifest.json'
];

/* ========================================
   FASE 1: INSTALACIÓN
   ======================================== */
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker: Instalando...');
    
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => {
            console.log('📦 Cacheando archivos críticos...');
            
            return cache.addAll(CRITICAL_ASSETS).then(() => {
                console.log('✅ Archivos críticos cacheados');
                // Forzar que el SW tome control inmediatamente
                return self.skipWaiting();
            }).catch((error) => {
                console.warn('⚠️ Error cacheando algunos archivos:', error);
                // No fallar si algunos archivos no se pueden cachear
                return cache.addAll(CRITICAL_ASSETS.filter(url => {
                    // Intentar cachear solo HTML, CSS y JS principales
                    return url.includes('.html') || 
                           url.includes('.css') || 
                           url.includes('db.js') ||
                           url.includes('sync.js') ||
                           url.includes('manifest.json');
                }));
            });
        })
    );
});

/* ========================================
   FASE 2: ACTIVACIÓN
   ======================================== */
self.addEventListener('activate', (event) => {
    console.log('⚡ Service Worker: Activando...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Eliminar caches antiguos
                    if (cacheName !== CACHE_VERSION && 
                        cacheName !== CACHE_ASSETS && 
                        cacheName !== CACHE_API) {
                        console.log(`🗑️ Eliminando cache antigua: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Service Worker activado');
            return self.clients.claim();
        })
    );
});

/* ========================================
   FASE 3: INTERCEPCIÓN DE REQUESTS
   ======================================== */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    let url;
    
    try {
        url = new URL(request.url);
    } catch (error) {
        console.error('❌ Error parseando URL:', request.url, error);
        return;
    }
    
    // No cachear solicitudes a localhost en dev
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return;
    }
    
    // Estrategia según el tipo de archivo
    if (request.method === 'GET') {
        // 1. HTML - Cache First
        if (request.destination === 'document' || url.pathname.endsWith('.html')) {
            event.respondWith(cacheFirstStrategy(request));
        }
        // 2. CSS y JS - Cache First con revalidación
        else if (request.destination === 'style' || request.destination === 'script') {
            event.respondWith(cacheFirstWithRevalidation(request));
        }
        // 3. API Firebase - Network First
        else if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')) {
            event.respondWith(networkFirstStrategy(request));
        }
        // 4. Imágenes - Cache First con timeout
        else if (request.destination === 'image') {
            event.respondWith(cacheFirstWithTimeout(request));
        }
        // 5. Default - Cache First
        else {
            event.respondWith(cacheFirstStrategy(request));
        }
    }
});

/* ========================================
   ESTRATEGIA 1: CACHE FIRST
   Usa cache si existe, sino va a red
   ======================================== */
async function cacheFirstStrategy(request) {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    
    if (cached) {
        console.log(`📦 Cache HIT: ${request.url}`);
        return cached;
    }
    
    try {
        console.log(`🌐 Fetching: ${request.url}`);
        const response = await fetch(request);
        
        // Cachear solo respuestas exitosas
        if (response.ok) {
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        console.error(`❌ Fetch fallido: ${request.url}`, error);
        
        // Fallback a offline.html para documentos
        if (request.destination === 'document') {
            const offlinePage = await cache.match('/offline.html');
            if (offlinePage) {
                return offlinePage;
            }
        }
        
        // Fallback genérico
        return new Response('No disponible offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/plain'
            })
        });
    }
}

/* ========================================
   ESTRATEGIA 2: CACHE FIRST CON REVALIDACIÓN
   Usa cache pero actualiza en background
   ======================================== */
async function cacheFirstWithRevalidation(request) {
    const cache = await caches.open(CACHE_ASSETS);
    const cached = await cache.match(request);
    
    if (cached) {
        console.log(`📦 Cache HIT: ${request.url}`);
        
        // Revalidar en background
        fetch(request).then((response) => {
            if (response.ok) {
                cache.put(request, response);
                console.log(`🔄 Cache actualizado: ${request.url}`);
            }
        }).catch(() => {
            // Silenciosamente falla si no hay conexión
        });
        
        return cached;
    }
    
    try {
        console.log(`🌐 Fetching: ${request.url}`);
        const response = await fetch(request);
        
        if (response.ok) {
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        console.error(`❌ Fetch fallido: ${request.url}`, error);
        return new Response('No disponible offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

/* ========================================
   ESTRATEGIA 3: NETWORK FIRST
   Va a red primero, fallback a cache
   ======================================== */
async function networkFirstStrategy(request) {
    const cache = await caches.open(CACHE_API);
    
    try {
        console.log(`🌐 Network First: ${request.url}`);
        const response = await fetch(request);
        
        if (response.ok) {
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        console.warn(`⚠️ Network fallido, usando cache: ${request.url}`);
        const cached = await cache.match(request);
        
        if (cached) {
            console.log(`📦 Retornando cached API response`);
            return cached;
        }
        
        // Si no hay cache de API, retornar error
        return new Response(JSON.stringify({
            error: 'Sin conexión y sin datos cacheados'
        }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'application/json'
            })
        });
    }
}

/* ========================================
   ESTRATEGIA 4: CACHE FIRST CON TIMEOUT
   Espera un tiempo antes de usar cache
   ======================================== */
async function cacheFirstWithTimeout(request) {
    const cache = await caches.open(CACHE_ASSETS);
    const timeout = 3000; // 3 segundos
    
    try {
        // Intentar fetch con timeout
        const fetchPromise = fetch(request);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
        );
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (response.ok) {
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        console.warn(`⚠️ Timeout/Error en fetch: ${request.url}`);
        const cached = await cache.match(request);
        
        if (cached) {
            console.log(`📦 Usando imagen cacheada`);
            return cached;
        }
        
        // Placeholder para imágenes no disponibles
        return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
            '<rect fill="#e0e0e0" width="200" height="200"/>' +
            '<text x="100" y="100" text-anchor="middle" fill="#999">Sin imagen</text>' +
            '</svg>',
            {
                headers: { 'Content-Type': 'image/svg+xml' }
            }
        );
    }
}

/* ========================================
   SINCRONIZACIÓN EN BACKGROUND
   ======================================== */
self.addEventListener('sync', (event) => {
    console.log('📡 Background Sync event:', event.tag);
    
    if (event.tag === 'sync-products') {
        event.waitUntil(syncProducts());
    } else if (event.tag === 'sync-movements') {
        event.waitUntil(syncMovements());
    }
});

async function syncProducts() {
    try {
        console.log('🔄 Sincronizando productos...');
        // Aquí iría la lógica de sincronización con Firebase
        // Llamar a sync.js
        return Promise.resolve();
    } catch (error) {
        console.error('❌ Error sincronizando productos:', error);
        throw error; // El navegador reintentará
    }
}

async function syncMovements() {
    try {
        console.log('🔄 Sincronizando movimientos...');
        // Aquí iría la lógica de sincronización con Firebase
        // Llamar a sync.js
        return Promise.resolve();
    } catch (error) {
        console.error('❌ Error sincronizando movimientos:', error);
        throw error;
    }
}

/* ========================================
   NOTIFICACIONES PUSH
   ======================================== */
self.addEventListener('push', (event) => {
    console.log('🔔 Push notification recibida:', event);
    
    const options = {
        body: 'Tienes una notificación importante',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%232563eb" width="192" height="192"/><text x="96" y="120" font-size="80" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial">SP</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><circle cx="96" cy="96" r="96" fill="%232563eb"/></svg>',
        tag: 'safeproducts-notification',
        requireInteraction: false,
        vibrate: [100, 50, 100]
    };
    
    if (event.data) {
        try {
            const data = event.data.json();
            options.body = data.message || options.body;
            options.tag = data.tag || options.tag;
        } catch (e) {
            options.body = event.data.text();
        }
    }
    
    event.waitUntil(
        self.registration.showNotification('SafeProducts', options)
    );
});

/* ========================================
   CLICK EN NOTIFICACIONES
   ======================================== */
self.addEventListener('notificationclick', (event) => {
    console.log('👆 Notificación clickeada:', event.notification.tag);
    
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Si ya existe una ventana abierta, enfocarse en ella
            for (const client of clientList) {
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // Si no existe, abrir una nueva
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});

/* ========================================
   LOGS INICIALES
   ======================================== */
console.log('✅ Service Worker cargado - SafeProducts PWA');
console.log(`📦 Cache version: ${CACHE_VERSION}`);
console.log('🌐 Modo: Production');
