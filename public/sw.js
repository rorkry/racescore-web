// Service Worker for RaceScore Web App
const CACHE_NAME = 'racescore-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// インストール時にキャッシュを作成
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch((err) => {
        console.log('Cache addAll error:', err);
        // キャッシュが失敗しても、Service Workerは登録される
      });
    })
  );
  self.skipWaiting();
});

// アクティベーション時に古いキャッシュを削除
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
    })
  );
  self.clients.claim();
});

// フェッチイベント：ネットワークファースト戦略
self.addEventListener('fetch', (event) => {
  // APIリクエストはネットワークのみ
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Network error' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // その他のリクエスト：ネットワークファースト
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 成功したレスポンスをキャッシュに保存
        if (response.ok) {
          const cache = caches.open(CACHE_NAME);
          cache.then((c) => c.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => {
        // ネットワークエラー時はキャッシュから取得
        return caches.match(event.request).then((response) => {
          return response || new Response('Offline', { status: 503 });
        });
      })
  );
});
