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

// 백그라운드 메시지 수신 처리
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  const title = d._title || (payload.notification && payload.notification.title) || '풍산휘트니스@기구필라테스';
  const body  = d._body  || (payload.notification && payload.notification.body)  || '';

  // 배지 카운트 증가 (현재 표시된 알림 수 + 1)
  if ('setAppBadge' in navigator) {
    self.registration.getNotifications().then(notifications => {
      const newCount = notifications.length + 1;
      navigator.setAppBadge(newCount).catch(() => {});
      // 배지 카운트를 캐시에 저장 (앱에서 참조용)
      self.registration.active && self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'BADGE_COUNT', count: newCount }));
      });
    });
  }

  self.registration.showNotification(title, {
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { ...d, notifType: d.type || 'notice' }
  });
});

// 알림 클릭 시 앱 포커스 또는 새 탭 열기
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifType = (event.notification.data && event.notification.data.notifType) || 'notice';
  // URL에 파라미터 추가해서 팝업 트리거 (앱이 새로 로딩될 때도 처리 가능)
  const targetUrl = 'https://pungsan-fitness.juyoun79.workers.dev?notif=' + notifType + '&t=' + Date.now();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('pungsan-fitness') && 'focus' in client) {
          // 앱이 이미 열려있으면 postMessage로 팝업 트리거
          client.postMessage({ type: 'NOTIF_CLICK', notifType });
          return client.focus();
        }
      }
      // 앱이 닫혀있으면 URL 파라미터로 팝업 트리거
      return clients.openWindow(targetUrl);
    })
  );
});
