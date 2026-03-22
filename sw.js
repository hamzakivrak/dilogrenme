const CACHE_NAME = 'dil-ai-v4'; 

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// AĞ-ÖNCELİKLİ (Network-First) STRATEJİ: Her zaman en güncel kodu çeker!
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).then((response) => {
            return caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, response.clone());
                return response;
            });
        }).catch(() => {
            return caches.match(event.request); // Sadece internet yoksa hafızadan kullan
        })
    );
});
