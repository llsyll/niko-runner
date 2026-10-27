const CACHE_NAME = 'niko-run-v8';
const ASSETS = [
    './',
    './index.html',
    './style.css?v=8',
    './main.js?v=8',
    './tm-worker.js',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
    );
});
