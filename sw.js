const CACHE_NAME = 'dil-ai-v5';

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
    const req = event.request;
    // Sadece GET istekleri; Gemini API (POST) ve diğer API çağrıları SW'ye hiç girmesin
    if (req.method !== 'GET' || req.url.includes('generativelanguage.googleapis.com')) return;

    event.respondWith(
        fetch(req).then((response) => {
            if (response && (response.ok || response.type === 'opaque')) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return response;
        }).catch(() => {
            return caches.match(req); // Sadece internet yoksa hafızadan kullan
        })
    );
});
