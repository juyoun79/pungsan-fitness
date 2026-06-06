// Firebase Messaging Service Worker

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// ── 앱 버전 (배포할 때마다 숫자 1씩 올려주세요) ──
const APP_VERSION = '1.0.4';
const CACHE_NAME  = 'pungsan-v' + APP_VERSION;

// ── Network First 캐시 전략 ──
// 항상 네트워크에서 최신 파일을 먼저 가져오고
// 네트워크 실패 시에만 캐시 사용 (오프라인 대비)
const CACHE_TARGETS = ['/', '/index.html', '/style.css', '/admin.js', '/workout.js', '/community.js', '/diet.js', '/messages.js', '/equipment.js', '/foods.js', '/manifest.json'];

self.addEventListener('install', (event) => {
  // 새 SW 즉시 활성화 (waiting 단계 건너뜀)
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_TARGETS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // 이전 버전 캐시 삭제
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith('pungsan-v') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      )
    ).then(() => {
      // 모든 열린 탭에 새 버전 알림
      return self.clients.claim().then(() => {
        return self.clients.matchAll({ type: 'window' }).then(clientList => {
          clientList.forEach(client => {
            client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION });
          });
        });
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // 같은 도메인 요청만 처리 (Firebase API 등 외부 요청 제외)
  if (!url.origin.includes('pungsan-fitness') && !url.origin.includes('workers.dev')) return;
  // API 요청은 캐시 안 함
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request).then(response => {
      // 네트워크 성공 → 캐시 업데이트 후 반환
      if (response && response.status === 200 && response.type === 'basic') {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone)).catch(() => {});
      }
      return response;
    }).catch(() => {
      // 네트워크 실패 → 캐시에서 반환
      return caches.match(event.request);
    })
  );
});

firebase.initializeApp({
  apiKey: "AIzaSyBlp0SIVRO0SKZWGGa7OLyhnEZTnruMnH8",
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
