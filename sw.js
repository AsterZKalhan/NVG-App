// Cache des fichiers de l'application (scripts, CSS, images) : rechargement plus rapide.
// __BUILD__ est remplacé à chaque déploiement (deploy.yml) : les anciens caches sont supprimés.
// Les données (Supabase, fonctions Edge) sont hors de ce cache : toujours demandées au réseau.
const APP_CACHE = 'nvg-app-__BUILD__';
const APP_STATIC_FILE = /\.(js|css|png|jpe?g|webp|json|svg)$/i;

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (key) { return key.startsWith('nvg-app-') && key !== APP_CACHE; }).map(function (key) { return caches.delete(key); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(appNetworkFirst(request));
    return;
  }
  if (APP_STATIC_FILE.test(url.pathname)) {
    event.respondWith(appCacheFirst(request));
  }
});

async function appCacheFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function appNetworkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
}

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
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      if (list.length > 0) {
        list[0].focus();
        list[0].postMessage({ tab: 'notifications' });
        return;
      }
      return clients.openWindow('/#notifications');
    })
  );
});