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

// ── 백그라운드 메시지 수신 ──
// webpush.notification이 네이티브로 표시 → showNotification 호출 안 함 (중복 방지)
// return으로 Promise 반환 → Firebase SDK가 완료까지 SW 유지 (중요!)
messaging.onBackgroundMessage((payload) => {
  return self.registration.getNotifications().then(notifs => {
    // webpush.notification이 먼저 표시되므로 notifs.length = 현재 알림 수 (새 것 포함)
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
