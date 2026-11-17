/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
try {
  importScripts('/api/firebase-sw-config.js');
} catch (_) {
  // En local sin Vercel puede usarse firebase-config local si se configura
}

if (!self.__FIREBASE_CONFIG__ || !self.__FIREBASE_CONFIG__.apiKey) {
  self.__FIREBASE_CONFIG__ = {
    apiKey: 'AIzaSyA0u2DcfghFR1-gEzJcRpSb778jBFHjcEE',
    authDomain: 'finca-manager-d5e3e.firebaseapp.com',
    projectId: 'finca-manager-d5e3e',
    storageBucket: 'finca-manager-d5e3e.firebasestorage.app',
    messagingSenderId: '1096670243449',
    appId: '1:1096670243449:web:a0a7c5c7b84f18dcde02a8',
    measurementId: 'G-Q9BC6RMWJC',
  };
}

if (self.__FIREBASE_CONFIG__ && self.__FIREBASE_CONFIG__.apiKey) {
  firebase.initializeApp(self.__FIREBASE_CONFIG__);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || payload?.data?.title || 'Finca Manager';
    const body = payload?.notification?.body || payload?.data?.body || '';
    const url = payload?.data?.url || '/#dashboard';
    const tag = payload?.data?.ref_id || payload?.data?.type || 'finca-notif';
    return self.registration.showNotification(title, {
      body,
      icon: '/pwa-512x512.svg',
      badge: '/pwa-512x512.svg',
      vibrate: [200, 100, 200],
      requireInteraction: true,
      renotify: true,
      tag,
      data: { url },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/#dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
