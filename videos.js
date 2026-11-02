// --- MODULE « VIDÉOS YOUTUBE » ---
// Les 3 dernières vidéos de la chaîne @nvgamingtv, lisibles directement dans l'application.
// Données : fonction Edge youtube-videos (API publique YouTube, sans clé API).
// Mise à jour une fois par jour (cache serveur et navigateur : 24 h).

const VIDEOS_MAX = 3;
const VIDEOS_CACHE_MS = 24 * 60 * 60 * 1000;
const VIDEOS_CHANNEL_URL = 'https://www.youtube.com/@nvgamingtv';

let videosCache = { at: 0, data: null };
let videosLoading = false;
let selectedVideoId = null;
let loadedVideoId = null;

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

  const fresh = videosCache.data && Date.now() - videosCache.at < VIDEOS_CACHE_MS;
  if (fresh && !force) {
    renderVideos(videosCache.data);
    return;
  }

  videosLoading = true;
  grid.innerHTML = `
    <div class="col-span-full flex flex-col items-center justify-center gap-3 py-12 text-xs text-gray-500 italic">
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
    showVideosPlayerError();
    grid.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center gap-3 py-10 text-center">
        <p class="text-xs text-gray-400 italic">Impossible de charger les vidéos pour le moment.</p>
        <button type="button" onclick="loadVideos(true)" class="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-200 text-xs font-bold transition">Réessayer</button>
      </div>
    `;
  } finally {
    videosLoading = false;
  }
}

function renderVideos(data) {
  const grid = document.getElementById('videosGrid');
  if (!grid) return;

  const videos = data.videos;
  const countEl = document.getElementById('videosCount');
  if (countEl) countEl.textContent = videos.length;

  const channelLink = document.getElementById('videosChannelLink');
  if (channelLink) channelLink.href = data.channelUrl || VIDEOS_CHANNEL_URL;

  if (!videos.some(v => v.id === selectedVideoId)) {
    selectedVideoId = videos[0].id;
  }

  renderVideosPlayer(videos);

  grid.innerHTML = videos.map(video => {
    const id = escapeVideoText(video.id);
    const title = escapeVideoText(video.title);
    const thumb = escapeVideoText(video.thumbnail);
    const meta = [video.views, video.published].filter(Boolean).map(escapeVideoText).join(' · ');
    const selected = video.id === selectedVideoId;

    return `
      <button type="button" onclick="selectVideo('${id}')" aria-label="Lire : ${title}" aria-pressed="${selected}"
        class="group flex flex-col text-left bg-[#121722] border rounded-2xl overflow-hidden transition ${selected ? 'border-red-600' : 'border-[#1f293d] hover:border-red-600/60'}">
        <span class="relative block aspect-video bg-black overflow-hidden">
          <img src="${thumb}" alt="" loading="lazy" class="w-full h-full object-cover transition duration-300 group-hover:scale-105">
          <span class="absolute inset-0 flex items-center justify-center">
            <span class="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs transition ${selected ? 'bg-red-600 border border-red-500' : 'bg-black/60 border border-white/20 group-hover:bg-red-600 group-hover:border-red-500'}">▶</span>
          </span>
        </span>
        <span class="flex flex-col gap-1 p-3 min-w-0">
          <span class="text-xs font-bold text-white leading-snug line-clamp-2">${title}</span>
          <span class="text-[11px] text-gray-400">${meta}</span>
        </span>
      </button>
    `;
  }).join('');
}

function renderVideosPlayer(videos) {
  const player = document.getElementById('videosPlayer');
  const current = videos.find(v => v.id === selectedVideoId);
  if (!player || !current) return;

  if (loadedVideoId !== current.id) {
    player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(current.id)}?rel=0&modestbranding=1`;
    loadedVideoId = current.id;
  }

  const titleEl = document.getElementById('videosCurrentTitle');
  if (titleEl) titleEl.textContent = current.title;

  const metaEl = document.getElementById('videosCurrentMeta');
  if (metaEl) {
    metaEl.textContent = [current.views, current.published].filter(Boolean).join(' · ');
  }

  const linkEl = document.getElementById('videosCurrentLink');
  if (linkEl) linkEl.href = current.url;
}

function selectVideo(videoId) {
  selectedVideoId = videoId;
  if (videosCache.data) renderVideos(videosCache.data);
}

function showVideosPlayerError() {
  const player = document.getElementById('videosPlayer');
  if (!player) return;
  player.removeAttribute('src');
  loadedVideoId = null;
  const titleEl = document.getElementById('videosCurrentTitle');
  if (titleEl) titleEl.textContent = 'Vidéos indisponibles';
  const metaEl = document.getElementById('videosCurrentMeta');
  if (metaEl) metaEl.textContent = '';
  const linkEl = document.getElementById('videosCurrentLink');
  if (linkEl) linkEl.href = VIDEOS_CHANNEL_URL;
}

// Le module se rafraîchit de lui-même si la page reste ouverte plus de 24 h.
setInterval(() => {
  const section = document.getElementById('videos');
  if (document.hidden || !section || section.classList.contains('hidden')) return;
  if (videosCache.data && Date.now() - videosCache.at >= VIDEOS_CACHE_MS) loadVideos(true);
}, 60 * 60 * 1000);
