// --- MODULE « VIDÉOS YOUTUBE » ---
// Dernières vidéos de la chaîne @nvgamingtv, via la fonction Edge youtube-videos
// (API publique YouTube, sans clé API). Mise en cache 10 min côté navigateur.

let videosCache = { at: 0, data: null };
let videosLoading = false;
const VIDEOS_MAX = 12;
const VIDEOS_CHANNEL_URL = 'https://www.youtube.com/@nvgamingtv';

function escapeVideoText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadVideos(force = false) {
  const grid = document.getElementById('videosGrid');
  if (!grid || videosLoading) return;

  const fresh = videosCache.data && Date.now() - videosCache.at < 10 * 60 * 1000;
  if (fresh && !force) {
    renderVideos(videosCache.data);
    return;
  }

  videosLoading = true;
  grid.innerHTML = `
    <div class="col-span-full flex flex-col items-center justify-center gap-3 py-16 text-xs text-gray-500 italic">
      <span class="w-8 h-8 rounded-full border-2 border-[#1f293d] border-t-red-500 animate-spin"></span>
      Chargement des dernières vidéos…
    </div>
  `;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/youtube-videos?limit=${VIDEOS_MAX}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data || !Array.isArray(data.videos) || data.videos.length === 0) throw new Error('aucune vidéo');

    videosCache = { at: Date.now(), data };
    renderVideos(data);
  } catch (err) {
    console.error('Erreur chargement des vidéos YouTube :', err);
    grid.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p class="text-xs text-gray-400 italic">Impossible de charger les vidéos pour le moment.</p>
        <button type="button" onclick="loadVideos(true)" class="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-200 text-xs font-bold transition">Réessayer</button>
        <a href="${VIDEOS_CHANNEL_URL}" target="_blank" rel="noopener" class="text-[11px] text-red-400 hover:text-red-300 font-bold">Ouvrir la chaîne YouTube ↗</a>
      </div>
    `;
  } finally {
    videosLoading = false;
  }
}

function renderVideos(data) {
  const grid = document.getElementById('videosGrid');
  if (!grid) return;

  const countEl = document.getElementById('videosCount');
  if (countEl) countEl.textContent = data.videos.length;

  const channelLink = document.getElementById('videosChannelLink');
  if (channelLink) channelLink.href = data.channelUrl || VIDEOS_CHANNEL_URL;

  grid.innerHTML = data.videos.map(video => {
    const id = escapeVideoText(video.id);
    const title = escapeVideoText(video.title);
    const url = escapeVideoText(video.url);
    const thumb = escapeVideoText(video.thumbnail);
    const views = escapeVideoText(video.views);
    const published = escapeVideoText(video.published);
    const meta = [views, published].filter(Boolean).join(' · ');

    return `
      <a href="${url}" target="_blank" rel="noopener" class="group flex flex-col bg-[#121722] border border-[#1f293d] rounded-2xl overflow-hidden hover:border-red-600/60 transition">
        <span class="relative block aspect-video bg-black overflow-hidden">
          <img src="${thumb}" alt="" loading="lazy" class="w-full h-full object-cover transition duration-300 group-hover:scale-105">
          <span class="absolute inset-0 flex items-center justify-center">
            <span class="w-11 h-11 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white text-sm transition group-hover:bg-red-600 group-hover:border-red-500">▶</span>
          </span>
        </span>
        <span class="flex flex-col gap-1.5 p-3 min-w-0">
          <span class="text-xs font-bold text-white leading-snug line-clamp-2">${title}</span>
          <span class="text-[11px] text-gray-400">${meta}</span>
        </span>
      </a>
    `;
  }).join('');
}

// Met à jour le compteur de la page d'accueil / le lien sans recharger si déjà chargé.
window.addEventListener('online', () => {
  if (videosCache.data) loadVideos(true);
});
