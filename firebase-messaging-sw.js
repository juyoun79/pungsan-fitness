// Firebase Messaging Service Worker

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

// ── 배지 카운트 (Cache API로 영구 저장) ──
async function incrementBadge() {
  try {
    const cache = await caches.open('pungsan-badge-v1');
    const res = await cache.match('/badge-count');
    const prev = res ? ((await res.json()).count || 0) : 0;
    const count = prev + 1;
    await cache.put('/badge-count', new Response(JSON.stringify({ count }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    // 서비스워커에서 직접 배지 설정 시도
    if ('setAppBadge' in navigator) navigator.setAppBadge(count).catch(() => {});
    // 앱이 열려있으면 창 컨텍스트에서도 setAppBadge 호출 (iOS 호환성)
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
      clients.forEach(client => client.postMessage({ type: 'BADGE_COUNT', count }));
    });
  } catch {}
}

// ── 백그라운드 메시지 수신 ──
// webpush.notification이 Chrome/iOS에서 네이티브로 1번만 표시
// 여기서는 showNotification 호출하지 않음 → 중복 방지
messaging.onBackgroundMessage((payload) => {
  // 배지만 증가
  incrementBadge();
  // showNotification 호출 안 함 - webpush.notification이 네이티브로 표시
});

// ── 알림 클릭 시 앱 포커스 ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // webpush.notification.data에서 notifType 읽기
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
