/* GARAGE · Marketplace — recibe las notificaciones push con la app cerrada (Firebase Cloud Messaging). */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBhMbDb53uMJbOSQJghyyqRnzdb_JHgCCA',
  authDomain: 'garage-car-spotting.firebaseapp.com',
  projectId: 'garage-car-spotting',
  storageBucket: 'garage-car-spotting.firebasestorage.app',
  messagingSenderId: '2221013702',
  appId: '1:2221013702:web:5c53464bac2f18d1b7f5c7'
});

// Los avisos llegan con "notification", así que el navegador los muestra solo.
firebase.messaging();

// Al tocar un aviso: abre GARAGE (o la pestaña que ya esté abierta) en la sección correcta.
self.addEventListener('notificationclick', function (event) {
  var data = (event.notification && event.notification.data) || {};
  var fcm = data.FCM_MSG || {};
  var link = (fcm.fcmOptions && fcm.fcmOptions.link) || data.link || self.registration.scope;
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) { list[i].navigate(link); return list[i].focus(); }
    }
    return clients.openWindow(link);
  }));
});
