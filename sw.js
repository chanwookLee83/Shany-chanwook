/* ═══════════════════════════════════════════════
   생산기술 주간실적 보고 — Service Worker v1.2
   캐시 전략: Cache First (오프라인 우선)
═══════════════════════════════════════════════ */

const CACHE_NAME   = 'weekly-report-v1.2';
const STATIC_CACHE = 'static-v1.2';
const DATA_CACHE   = 'data-v1.2';

/* 사전 캐시 파일 목록 */
const PRE_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon-32.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

/* ── INSTALL : 정적 파일 사전 캐싱 ── */
self.addEventListener('install', event => {
  console.log('[SW] 설치 중...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] 정적 파일 캐싱');
        return cache.addAll(PRE_CACHE);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] 캐시 실패:', err))
  );
});

/* ── ACTIVATE : 오래된 캐시 정리 ── */
self.addEventListener('activate', event => {
  console.log('[SW] 활성화 중...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DATA_CACHE)
          .map(k => {
            console.log('[SW] 구버전 캐시 삭제:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH : 캐시 우선 전략 ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Chart.js CDN — 네트워크 우선, 실패시 캐시 */
  if (url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        fetch(request)
          .then(res => { cache.put(request, res.clone()); return res; })
          .catch(() => cache.match(request))
      )
    );
    return;
  }

  /* 로컬 파일 — 캐시 우선, 없으면 네트워크 */
  if (url.protocol === 'file:' || url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (!res || res.status !== 200) return res;
          const clone = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put(request, clone));
          return res;
        });
      })
    );
    return;
  }
});

/* ── PUSH 알림 (향후 확장용) ── */
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '생산기술 주간실적';
  const options = {
    body: data.body || '새 보고서가 업데이트되었습니다.',
    icon: './icon-192.png',
    badge: './favicon-32.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || './index.html' },
    actions: [
      { action: 'open',    title: '📊 보고서 열기' },
      { action: 'dismiss', title: '닫기' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── 알림 클릭 ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(wins => {
        const win = wins.find(w => w.focused);
        if (win) return win.focus();
        return clients.openWindow(event.notification.data.url || './index.html');
      })
    );
  }
});

/* ── 메시지 수신 (캐시 강제 갱신) ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    console.log('[SW] 전체 캐시 초기화');
  }
});
