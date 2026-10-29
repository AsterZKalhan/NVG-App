// Écoute de l'événement push envoyé par l'Edge Function
self.addEventListener('push', function (event) {
  let data = { title: 'Normandy Viking Gaming', body: 'Nouvelle notification du Valhalla !' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || 'https://app.nvg-tv.com/Logos/favicon.png',
    badge: 'https://app.nvg-tv.com/Logos/favicon.png',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Gestion du clic sur la notification pour réouvrir l'app
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});