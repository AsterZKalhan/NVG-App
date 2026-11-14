// --- MODULE « STREAMS NVG » (style équipe Twitch) ---
// Liste des membres ayant une chaîne Twitch (vue nvg_streamers), statut via la fonction twitch-live.
// Le lecteur ne se recharge que lorsqu'on change de membre (pas à chaque actualisation du statut).

let streamsMembers = [];
let streamsLoadFailed = false;
let streamsStatus = {};
let selectedStreamChannel = null;
let loadedPlayerChannel = null;
let streamsPipClosed = false;
let twitchPlayer = null;
let twitchPlayerChannel = null;
let twitchEmbedPromise = null;
let streamIsPlaying = false;

function streamStatusOf(login) {
  return streamsStatus[login] || { live: false, viewers: 0, title: '', game: '', avatar: '' };
}

async function loadStreamersData() {
  const { data, error } = await supabaseClient.from('nvg_streamers').select('*').order('name');
  if (!error) return data || [];

  console.error('Erreur chargement des streamers :', error);
  // Repli : lecture publique de la vue, sans jeton de session. Utile quand la
  // session du navigateur est expirée ou refusée par un bloqueur de requêtes.
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/nvg_streamers?select=*&order=name`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (res.ok) return await res.json();
    console.error('Erreur chargement des streamers (repli) : HTTP', res.status);
  } catch (err) {
    console.error('Erreur réseau des streamers :', err);
  }
  return null;
}

async function renderStreams() {
  const data = await loadStreamersData();
  streamsLoadFailed = data === null;
  // Seuls les Viking, Grand Jarl et Divinité sont listés (les Petits Vikings sont exclus).
  const allowedRanks = ['Viking', 'Grand Jarl', 'Divinité'];
  streamsMembers = (data || []).filter(s => s.twitch_channel && allowedRanks.includes(s.rank));
  await refreshStreamsStatus();
}

async function refreshStreamsStatus() {
  const logins = streamsMembers.map(s => s.twitch_channel.toLowerCase());
  if (logins.length > 0) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/twitch-live?logins=${logins.join(',')}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      });
      if (res.ok) streamsStatus = (await res.json()).streams || {};
    } catch (err) {
      console.error("Erreur statut des streams", err);
    }
  }

  const sorted = sortedStreamMembers();
  if (!selectedStreamChannel || !streamsMembers.some(s => s.twitch_channel.toLowerCase() === selectedStreamChannel)) {
    selectedStreamChannel = sorted.length ? sorted[0].twitch_channel.toLowerCase() : null;
  }

  renderStreamMembers(sorted);
  updateStreamPlayer();
}

function sortedStreamMembers() {
  return [...streamsMembers].sort((a, b) => {
    const sa = streamStatusOf(a.twitch_channel.toLowerCase());
    const sb = streamStatusOf(b.twitch_channel.toLowerCase());
    if (sa.live !== sb.live) return sa.live ? -1 : 1;
    if (sa.viewers !== sb.viewers) return sb.viewers - sa.viewers;
    return a.name.localeCompare(b.name);
  });
}

function renderStreamMembers(sorted) {
  const countEl = document.getElementById('streamsCount');
  if (countEl) countEl.textContent = sorted.length;

  const list = document.getElementById('streamsMembers');
  if (!list) return;
  if (sorted.length === 0) {
    list.innerHTML = streamsLoadFailed
      ? `<div class="p-2 space-y-2">
          <p class="text-xs text-red-400 italic">Impossible de charger les chaînes Twitch.</p>
          <p class="text-[11px] text-gray-500">Vérifie ta connexion. Si le problème persiste, désactive le bloqueur de publicités pour ce site, puis réessaie.</p>
          <button type="button" onclick="renderStreams()" class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-200 text-[11px] font-bold transition">Réessayer</button>
        </div>`
      : `<p class="text-xs text-gray-500 italic p-2">Aucun membre n'a renseigné sa chaîne Twitch.</p>`;
    return;
  }

  list.innerHTML = sorted.map(member => {
    const login = member.twitch_channel.toLowerCase();
    const st = streamStatusOf(login);
    const selected = login === selectedStreamChannel;
    const avatar = st.avatar || '';
    return `
      <button type="button" onclick="selectStreamChannel('${login}')" class="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition ${selected ? 'bg-white/10' : 'hover:bg-white/5'}">
        <div class="w-8 h-8 rounded-full bg-[#07090e] border border-[#1f293d] overflow-hidden flex items-center justify-center shrink-0 text-sm">
          ${avatar ? `<img src="${escapeHtmlSafe(avatar)}" alt="" class="w-full h-full object-cover">` : '👤'}
        </div>
        <span class="flex-1 min-w-0 text-xs font-bold text-white truncate">${escapeHtmlSafe(member.name)}</span>
        ${st.live
          ? `<span class="flex items-center gap-1 text-[11px] font-bold text-red-500 shrink-0"><span class="w-2 h-2 rounded-full bg-red-500"></span>${st.viewers}</span>`
          : `<span class="w-2 h-2 rounded-full bg-gray-600 shrink-0"></span>`}
      </button>
    `;
  }).join('');
}

function selectStreamChannel(login) {
  selectedStreamChannel = login;
  renderStreamMembers(sortedStreamMembers());
  updateStreamPlayer();
}

// --- LECTEUR TWITCH (API Embed) ---
// L'API permet de connaître l'état de lecture : le mini-lecteur n'est activé que
// lorsque le flux joue réellement (pas s'il est en pause ou arrêté).

function loadTwitchEmbedApi() {
  if (window.Twitch && window.Twitch.Player) return Promise.resolve();
  if (twitchEmbedPromise) return twitchEmbedPromise;
  twitchEmbedPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://player.twitch.tv/js/embed/v1.js';
    script.async = true;
    script.onload = () => {
      if (window.Twitch && window.Twitch.Player) resolve();
      else {
        twitchEmbedPromise = null;
        reject(new Error('API Twitch indisponible'));
      }
    };
    script.onerror = () => {
      // Ne pas mémoriser l'échec : un prochain passage pourra réessayer.
      twitchEmbedPromise = null;
      reject(new Error('API Twitch indisponible'));
    };
    document.head.appendChild(script);
  });
  return twitchEmbedPromise;
}

async function loadTwitchPlayer(channel) {
  try {
    await loadTwitchEmbedApi();
    if (loadedPlayerChannel !== channel) return;
    if (!twitchPlayer) {
      streamIsPlaying = false;
      twitchPlayer = new Twitch.Player('streamsPlayer', {
        channel,
        parent: ['app.nvg-tv.com', 'localhost'],
        width: '100%',
        height: '100%',
        autoplay: true
      });
      twitchPlayerChannel = channel;
      attachTwitchPlayerEvents();
    } else if (twitchPlayerChannel !== channel) {
      streamIsPlaying = false;
      twitchPlayerChannel = channel;
      twitchPlayer.setChannel(channel);
    }
  } catch (err) {
    console.error('Lecteur Twitch indisponible :', err);
    // Repli : iframe classique si l'API d'embed ne peut pas être chargée.
    // Dans ce cas l'état de lecture est inconnu, donc pas de mini-lecteur.
    if (loadedPlayerChannel !== channel) return;
    const container = document.getElementById('streamsPlayer');
    if (!container) return;
    const url = `https://player.twitch.tv/?channel=${channel}&parent=app.nvg-tv.com&parent=localhost`;
    let iframe = container.querySelector('iframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.setAttribute('allowfullscreen', 'true');
      container.appendChild(iframe);
    }
    iframe.src = url;
  }
}

function attachTwitchPlayerEvents() {
  const API = window.Twitch && window.Twitch.Player;
  if (!API || !twitchPlayer) return;
  const on = (name, handler) => {
    if (API[name]) twitchPlayer.addEventListener(API[name], handler);
  };
  on('PLAY', () => { streamIsPlaying = true; });
  on('PLAYING', () => { streamIsPlaying = true; });
  on('PAUSE', () => {
    streamIsPlaying = false;
    leaveStreamsPipOnStop();
  });
  on('ENDED', () => {
    streamIsPlaying = false;
    leaveStreamsPipOnStop();
  });
  on('OFFLINE', () => {
    streamIsPlaying = false;
    leaveStreamsPipOnStop();
  });
  on('PLAYBACK_BLOCKED', () => { streamIsPlaying = false; });
}

// Vérifie l'état réel du lecteur : le mini-lecteur ne doit jamais s'afficher
// sur une image figée (pause) ou un flux arrêté.
function twitchIsPaused() {
  if (!twitchPlayer) return true;
  try {
    if (typeof twitchPlayer.isPaused === 'function') return twitchPlayer.isPaused();
  } catch (e) {
    // Lecteur pas encore prêt : on se fie à l'état connu.
  }
  return !streamIsPlaying;
}

// Si le flux est mis en pause ou s'arrête alors qu'il est en mini-lecteur, on
// referme le mini-lecteur au lieu de laisser une vignette figée sur l'écran.
function leaveStreamsPipOnStop() {
  const section = document.getElementById('streams');
  if (!section || !section.classList.contains('streams-pip-mode')) return;
  section.classList.remove('streams-pip-mode');
  section.classList.remove('streams-pip-dragging');
  section.style.left = '';
  section.style.top = '';
  section.style.right = '';
  section.style.bottom = '';
  section.classList.add('hidden');
}

function updateStreamPlayer() {
  const player = document.getElementById('streamsPlayer');
  const empty = document.getElementById('streamsEmpty');
  const login = selectedStreamChannel;
  if (!player || !empty) return;

  if (!login) {
    player.classList.add('hidden');
    empty.classList.remove('hidden');
    if (twitchPlayer) twitchPlayer.pause();
    streamIsPlaying = false;
    return;
  }
  player.classList.remove('hidden');
  empty.classList.add('hidden');

  if (loadedPlayerChannel !== login) {
    loadedPlayerChannel = login;
    loadTwitchPlayer(login);
  }

  const member = streamsMembers.find(s => s.twitch_channel.toLowerCase() === login);
  const st = streamStatusOf(login);
  const avatarEl = document.getElementById('streamsInfoAvatar');
  if (avatarEl) {
    if (st.avatar) {
      avatarEl.src = st.avatar;
      avatarEl.classList.remove('hidden');
    } else {
      avatarEl.classList.add('hidden');
    }
  }
  document.getElementById('streamsInfoName').textContent = member ? member.name : login;
  document.getElementById('streamsInfoTitle').textContent = st.live ? st.title : 'Hors ligne';
  document.getElementById('streamsInfoGame').textContent = st.live && st.game ? st.game : '';
  const viewersEl = document.getElementById('streamsInfoViewers');
  viewersEl.textContent = st.live ? `● ${st.viewers} spectateurs` : '';
  viewersEl.className = st.live ? 'text-xs font-bold text-red-500' : 'hidden';
  document.getElementById('streamsInfoLink').href = `https://twitch.tv/${login}`;
}

// --- MINI-LECTEUR (picture-in-picture de l'application) ---
// On ne déplace pas l'iframe (cela rechargerait le flux) : la section Streams est
// simplement réduite dans un coin quand on change d'onglet, puis remise en place.

// Si l'onglet Streams est masqué sans mini-lecteur (flux pas encore prêt, par
// exemple), on met le lecteur en pause pour éviter un son de fond sans image.
function pauseStreamsIfNotPip() {
  const section = document.getElementById('streams');
  if (section && section.classList.contains('streams-pip-mode')) return;
  if (twitchPlayer && streamIsPlaying) {
    try { twitchPlayer.pause(); } catch (e) { /* lecteur non prêt */ }
  }
  streamIsPlaying = false;
}

function enterStreamsPip() {
  // Pas de mini-lecteur si le flux est en pause, arrêté, ou jamais lancé.
  if (!loadedPlayerChannel || streamsPipClosed || !streamIsPlaying || !twitchPlayer) return false;
  if (twitchIsPaused()) return false;
  const section = document.getElementById('streams');
  const player = document.getElementById('streamsPlayer');
  if (!section || !player) return false;
  // Un seul mini-lecteur à la fois : on ferme celui des vidéos s'il est ouvert.
  const videosSection = document.getElementById('videos');
  if (videosSection && videosSection.classList.contains('videos-pip-mode') && typeof closeVideosPip === 'function') {
    closeVideosPip();
  }
  section.classList.remove('hidden');
  section.classList.add('streams-pip-mode');
  restoreStreamsPipPosition();
  return true;
}

function exitStreamsPip() {
  const section = document.getElementById('streams');
  if (section) {
    section.classList.remove('streams-pip-mode');
    section.classList.remove('streams-pip-dragging');
    section.style.left = '';
    section.style.top = '';
    section.style.right = '';
    section.style.bottom = '';
  }
  streamsPipClosed = false;
}

function closeStreamsPip() {
  streamsPipClosed = true;
  streamsPipDrag = null;
  if (twitchPlayer) twitchPlayer.pause();
  streamIsPlaying = false;
  const section = document.getElementById('streams');
  if (section) {
    section.classList.remove('streams-pip-mode');
    section.classList.remove('streams-pip-dragging');
    section.style.left = '';
    section.style.top = '';
    section.style.right = '';
    section.style.bottom = '';
    section.classList.add('hidden');
  }
}

// --- Déplacement du mini-lecteur ---
const STREAMS_PIP_POS_KEY = 'nvg_streams_pip_pos';
let streamsPipDrag = null;

function applyStreamsPipPosition(left, top) {
  const section = document.getElementById('streams');
  if (!section || !section.classList.contains('streams-pip-mode')) return;
  const rect = section.getBoundingClientRect();
  const margin = 8;
  const width = rect.width || Math.min(360, window.innerWidth - 32);
  const height = rect.height || (width * 9 / 16);
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  const x = Math.min(Math.max(left, margin), maxLeft);
  const y = Math.min(Math.max(top, margin), maxTop);
  section.style.left = x + 'px';
  section.style.top = y + 'px';
  section.style.right = 'auto';
  section.style.bottom = 'auto';
}

function restoreStreamsPipPosition() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STREAMS_PIP_POS_KEY) || 'null');
  } catch (e) {
    saved = null;
  }
  if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
  applyStreamsPipPosition(saved.left, saved.top);
}

function saveStreamsPipPosition() {
  const section = document.getElementById('streams');
  if (!section) return;
  const rect = section.getBoundingClientRect();
  try {
    localStorage.setItem(STREAMS_PIP_POS_KEY, JSON.stringify({
      left: Math.round(rect.left),
      top: Math.round(rect.top)
    }));
  } catch (e) {
    // Stockage indisponible : la position reste valable pour la session.
  }
}

function startStreamsPipDrag(event) {
  const section = document.getElementById('streams');
  if (!section || !section.classList.contains('streams-pip-mode')) return;
  event.preventDefault();
  const rect = section.getBoundingClientRect();
  streamsPipDrag = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
  section.classList.add('streams-pip-dragging');
  const handle = event.currentTarget;
  if (handle && handle.setPointerCapture) {
    try { handle.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
  }
}

function moveStreamsPipDrag(event) {
  if (!streamsPipDrag) return;
  event.preventDefault();
  applyStreamsPipPosition(
    event.clientX - streamsPipDrag.offsetX,
    event.clientY - streamsPipDrag.offsetY
  );
}

function endStreamsPipDrag(event) {
  if (!streamsPipDrag) return;
  streamsPipDrag = null;
  const section = document.getElementById('streams');
  if (section) {
    section.classList.remove('streams-pip-dragging');
    saveStreamsPipPosition();
  }
  const handle = event.currentTarget;
  if (handle && handle.releasePointerCapture) {
    try { handle.releasePointerCapture(event.pointerId); } catch (e) { /* ignore */ }
  }
}

// Garde le mini-lecteur dans l'écran si la fenêtre est redimensionnée.
window.addEventListener('resize', () => {
  const section = document.getElementById('streams');
  if (!section || !section.classList.contains('streams-pip-mode')) return;
  const rect = section.getBoundingClientRect();
  applyStreamsPipPosition(rect.left, rect.top);
});

// Rafraîchit uniquement le statut (liste et infos), toutes les 30 s quand le module est affiché.
setInterval(() => {
  const section = document.getElementById('streams');
  if (!document.hidden && section && !section.classList.contains('hidden') && streamsMembers.length > 0) {
    refreshStreamsStatus();
  }
}, 30000);
