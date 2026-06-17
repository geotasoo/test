// 세계 상징 사전 - Service Worker
// Wikimedia Commons 이미지를 캐시해서 느린 인터넷에서도 빠르게 로드

const CACHE = 'wsd-img-v1';

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
  // 이전 버전 캐시 정리
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
});

self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  // Wikimedia Commons 이미지만 캐시
  if (url.indexOf('upload.wikimedia.org') === -1) return;

  event.respondWith(
    caches.open(CACHE).then(function(cache) {
      return cache.match(event.request).then(function(cached) {
        // 캐시에 있으면 즉시 반환하면서 백그라운드에서 갱신
        var netFetch = fetch(event.request).then(function(response) {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(function() {
          return cached; // 네트워크 실패 → 캐시 폴백
        });
        return cached || netFetch; // 캐시 없으면 네트워크 대기
      });
    })
  );
});
