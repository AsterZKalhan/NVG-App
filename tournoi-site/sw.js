// Cache des fichiers statiques du site du tournoi (scripts, CSS, images).
// Le nom du cache contient l'identifiant du déploiement (__BUILD__, remplacé par le
// workflow deploy-tournament.yml) : à chaque déploiement, les anciens caches sont supprimés.
// Les données (Supabase) ne passent jamais par ce cache : elles sont toujours demandées au réseau.
const CACHE = 'tournoi-static-__BUILD__';
const STATIC_FILE = /\.(js|css|png|jpe?g|webp|json)$/i;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('tournoi-static-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (STATIC_FILE.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

// Fichiers statiques : copie locale si elle existe, sinon réseau puis mise en cache.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// Pages : réseau d'abord (nouvelle version tout de suite), copie locale hors ligne en secours.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
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
