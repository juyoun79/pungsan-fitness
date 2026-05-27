// Firebase Messaging Service Worker
// 앱이 닫혀있거나 백그라운드일 때 푸시알림 수신

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

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

// ── 배지 카운트 관리 (Cache API로 영구 저장 - SW 재시작 후에도 유지) ──
async function getBadgeCount() {
  try {
    const cache = await caches.open('pungsan-badge-v1');
    const res = await cache.match('/badge-count');
    if (res) return (await res.json()).count || 0;
    return 0;
  } catch { return 0; }
}

async function incrementBadge() {
  try {
    const count = (await getBadgeCount()) + 1;
    const cache = await caches.open('pungsan-badge-v1');
    await cache.put('/badge-count', new Response(JSON.stringify({ count }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    if ('setAppBadge' in navigator) navigator.setAppBadge(count).catch(() => {});
  } catch {}
}

// ── 백그라운드 메시지 수신 처리 ──
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  const title = d._title || (payload.notification && payload.notification.title) || '풍산휘트니스@기구필라테스';
  const body  = d._body  || (payload.notification && payload.notification.body)  || '';

  const ua    = (self.navigator && self.navigator.userAgent) || '';
  const isIOS = /iP(hone|ad|od)/.test(ua);

  if (isIOS && payload.notification) {
    // iOS: notification 필드로 이미 네이티브 표시 → showNotification skip
    // 배지만 증가
    incrementBadge();
    return;
  }

  // Android: 서비스워커에서 직접 알림 표시
  self.registration.showNotification(title, {
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { ...d, notifType: d.type || 'notice' }
  }).then(() => {
    // 알림 표시 후 실제 알림 개수로 배지 설정
    return self.registration.getNotifications();
  }).then(notifs => {
    if ('setAppBadge' in navigator) navigator.setAppBadge(notifs.length).catch(() => {});
  }).catch(() => {});
});

// ── 알림 클릭 시 앱 포커스 또는 새 탭 열기 ──
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
