// --- MODULE « VIDÉOS YOUTUBE » ---
// Les 3 dernières vidéos de la chaîne @nvgamingtv, lisibles directement dans l'application.
// Données : fonction Edge youtube-videos (API publique YouTube, sans clé API).
//
// Mise à jour « à la publication » : la fonction renvoie un ETag basé uniquement sur
// les identifiants des vidéos. Tant qu'aucune nouvelle vidéo n'est publiée, YouTube
// répond 304 (rien à télécharger) et l'affichage ne bouge pas, même si le nombre de
// vues change. Dès qu'une vidéo sort, la réponse change et l'onglet se met à jour.

const VIDEOS_MAX = 3;
const VIDEOS_CHANNEL_URL = 'https://www.youtube.com/@nvgamingtv';
const VIDEOS_STORAGE_KEY = 'nvg_youtube_videos_v2';
const VIDEOS_CHECK_MS = 5 * 60 * 1000; // vérification légère au maximum toutes les 5 min

let videosCache = loadStoredVideos();
let videosLoading = false;
let selectedVideoId = null;
let selectedByUser = false;
let loadedVideoId = null;

function loadStoredVideos() {
  try {
    const raw = localStorage.getItem(VIDEOS_STORAGE_KEY);
    if (!raw) return { data: null, etag: null, checkedAt: 0 };
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data || !Array.isArray(parsed.data.videos)) {
      return { data: null, etag: null, checkedAt: 0 };
    }
    return { data: parsed.data, etag: parsed.etag || null, checkedAt: parsed.checkedAt || 0 };
  } catch (_err) {
    return { data: null, etag: null, checkedAt: 0 };
  }
}

function saveStoredVideos() {
  try {
    localStorage.setItem(VIDEOS_STORAGE_KEY, JSON.stringify({
      data: videosCache.data,
      etag: videosCache.etag,
      checkedAt: videosCache.checkedAt
    }));
  } catch (_err) {
    // Stockage indisponible (navigation privée saturée) : le module fonctionne quand même.
  }
}

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
  if (!grid) return 'error';
  if (videosLoading) return 'busy';

  // Affichage immédiat de ce qui est déjà connu (aucune attente).
  if (videosCache.data) renderVideos(videosCache.data);

  const checkedRecently = Date.now() - (videosCache.checkedAt || 0) < VIDEOS_CHECK_MS;
  if (!force && checkedRecently) return 'cached';

  videosLoading = true;
  if (!videosCache.data) {
    grid.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center gap-3 py-12 text-xs text-gray-500 italic">
        <span class="w-8 h-8 rounded-full border-2 border-[#1f293d] border-t-red-500 animate-spin"></span>
        Chargement des dernières vidéos…
      </div>
    `;
  }

  try {
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    };
    // En actualisation forcée (admin), on ignore la version connue et le cache serveur.
    if (videosCache.etag && !force) headers['If-None-Match'] = videosCache.etag;

    const url = `${SUPABASE_URL}/functions/v1/youtube-videos?limit=${VIDEOS_MAX}${force ? '&refresh=1' : ''}`;
    const res = await fetch(url, { headers });

    // 304 : aucune nouvelle vidéo, on ne touche à rien.
    if (res.status === 304) {
      videosCache.checkedAt = Date.now();
      saveStoredVideos();
      return 'unchanged';
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data || !Array.isArray(data.videos) || data.videos.length === 0) throw new Error('aucune vidéo');

    const previousEtag = videosCache.etag;
    const freshEtag = res.headers.get('ETag') || null;

    videosCache = {
      data,
      etag: freshEtag,
      checkedAt: Date.now()
    };
    saveStoredVideos();
    renderVideos(data);

    return previousEtag && freshEtag && previousEtag === freshEtag ? 'unchanged' : 'updated';
  } catch (err) {
    console.error('Erreur chargement des vidéos YouTube :', err);
    // Les vidéos déjà affichées restent en place ; l'erreur n'apparaît que si la page est vide.
    if (!videosCache.data) {
      showVideosPlayerError();
      grid.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p class="text-xs text-gray-400 italic">Impossible de charger les vidéos pour le moment.</p>
          <button type="button" onclick="loadVideos(true)" class="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-200 text-xs font-bold transition">Réessayer</button>
        </div>
      `;
    }
    videosCache.checkedAt = Date.now();
    saveStoredVideos();
    return 'error';
  } finally {
    videosLoading = false;
  }
}

// Bouton réservé aux admins : force une vraie récupération (ignore ETag et cache serveur).
async function forceRefreshVideos() {
  const btn = document.getElementById('videosRefreshBtn');
  if (!btn || btn.disabled) return;

  const originalHtml = btn.innerHTML;
  const showResult = (text) => {
    btn.innerHTML = text;
    setTimeout(() => { btn.innerHTML = originalHtml; }, 2500);
  };

  btn.disabled = true;
  btn.innerHTML = '⏳ Actualisation…';

  try {
    const result = await loadVideos(true);
    if (result === 'updated') showResult('✅ Vidéos actualisées');
    else if (result === 'unchanged') showResult('✅ Déjà à jour');
    else if (result === 'busy') showResult('⏳ En cours…');
    else showResult('⚠️ Échec');
  } finally {
    btn.disabled = false;
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

  // Tant que l'utilisateur n'a rien choisi, on suit la vidéo la plus récente.
  if (!selectedByUser || !videos.some(v => v.id === selectedVideoId)) {
    selectedVideoId = videos[0].id;
    selectedByUser = false;
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
  selectedByUser = true;
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

// Vérification légère quand l'onglet reste ouvert (et uniquement s'il est visible).
setInterval(() => {
  const section = document.getElementById('videos');
  if (document.hidden || !section || section.classList.contains('hidden')) return;
  loadVideos();
}, 60 * 60 * 1000);

// Au retour sur l'application (PWA remise au premier plan), on revérifie.
document.addEventListener('visibilitychange', () => {
  const section = document.getElementById('videos');
  if (document.hidden || !section || section.classList.contains('hidden')) return;
  loadVideos();
});
