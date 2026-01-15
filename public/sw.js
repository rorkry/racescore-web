// Service Worker for RaceScore PWA
const CACHE_NAME = 'racescore-v3';
const STATIC_CACHE_NAME = 'racescore-static-v3';
const API_CACHE_NAME = 'racescore-api-v3';

// 静的アセット（長期キャッシュ）- 存在するファイルのみ
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

// インストール時に静的アセットをキャッシュ
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      // 個別にキャッシュしてエラーを無視
      return Promise.allSettled(
        STATIC_ASSETS.map(url => 
          cache.add(url).catch(err => console.warn(`[SW] Failed to cache ${url}:`, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.includes('-v3'))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// フェッチ戦略
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // POSTリクエストはキャッシュしない
  if (event.request.method !== 'GET') {
    return;
  }
  
  // APIリクエストの場合：Network First with Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // 成功したらキャッシュに保存（クローン可能な場合のみ）
          if (response.ok && response.status === 200) {
            try {
              const responseClone = response.clone();
              caches.open(API_CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone).catch(() => {});
              }).catch(() => {});
            } catch (e) {
              // clone failed - ignore
            }
          }
          return response;
        })
        .catch(() => {
          // ネットワークエラー時はキャッシュから返す
          return caches.match(event.request);
        })
    );
    return;
  }

  // 静的アセット（JS/CSS/画像）の場合：Cache First with Network Fallback
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          if (response.ok) {
            try {
              const responseClone = response.clone();
              caches.open(STATIC_CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone).catch(() => {});
              }).catch(() => {});
            } catch (e) {
              // clone failed - ignore
            }
          }
          return response;
        }).catch(() => {
          return new Response('', { status: 404 });
        });
      })
    );
    return;
  }

  // HTMLページの場合：Network First
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          try {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone).catch(() => {});
            }).catch(() => {});
          } catch (e) {
            // clone failed - ignore
          }
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
