// Firebase Messaging Service Worker

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// ── 앱 버전 (배포할 때마다 숫자 1씩 올려주세요) ──
const APP_VERSION = '1.7.1';
const CACHE_NAME  = 'pungsan-v' + APP_VERSION;

const CACHE_TARGETS = ['/index.html', '/style.css', '/admin.js', '/workout.js', '/community.js', '/diet.js', '/messages.js', '/equipment.js', '/manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // 캐시 사전 저장 (실패해도 SW 설치는 계속)
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        CACHE_TARGETS.map(url => cache.add(url).catch(() => {}))
      );
    }).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith('pungsan-v') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      )
    ).then(() => {
      return self.clients.claim().then(() => {
        return self.clients.matchAll({ type: 'window' }).then(clientList => {
          clientList.forEach(client => {
            client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION });
          });
        });
      });
    }).catch(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // GET 요청만 처리
  if (event.request.method !== 'GET') return;
  // 같은 도메인만 처리
  if (!url.origin.includes('pungsan-fitness') && !url.origin.includes('workers.dev')) return;
  // API 요청 제외
  if (url.pathname.startsWith('/api/')) return;
  // Firebase 등 외부 스크립트 제외
  if (url.hostname !== location.hostname && !url.hostname.endsWith('workers.dev')) return;

  event.respondWith(
    fetch(event.request).then(response => {
      // 정상 응답이면 캐시에 저장
      if (response && response.status === 200) {
        try {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone).catch(() => {});
          }).catch(() => {});
        } catch(e) {}
      }
      return response;
    }).catch(() => {
      // 네트워크 실패 → 캐시에서 반환
      return caches.match(event.request).then(cached => {
        return cached || new Response('오프라인 상태입니다. 인터넷 연결을 확인해주세요.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
});

// ── 앱에서 버전 조회 요청 처리 ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'SW_VERSION', version: APP_VERSION });
  }
});

firebase.initializeApp({
  authDomain: "pungsan-fitness.firebaseapp.com",
  databaseURL: "https://pungsan-fitness-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pungsan-fitness",
  storageBucket: "pungsan-fitness.firebasestorage.app",
  messagingSenderId: "416807539212",
  appId: "1:416807539212:web:486a9f2da61a686befd429"
});

const messaging = firebase.messaging();

// ── 백그라운드 메시지 수신 ──
messaging.onBackgroundMessage((payload) => {
  return self.registration.getNotifications().then(notifs => {
    const count = notifs.length;
    if ('setAppBadge' in navigator) {
      return navigator.setAppBadge(Math.max(count, 1)).catch(() => {});
    }
  }).catch(() => {});
});

// ── 알림 클릭 시 앱 포커스 ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifType = (event.notification.data && event.notification.data.notifType) || 'notice';
  const targetUrl = 'https://pungsan-fitness.juyoun79.workers.dev?notif=' + notifType + '&t=' + Date.now();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('pungsan-fitness') && 'focus' in client) {
          client.postMessage({ type: 'NOTIF_CLICK', notifType });
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
