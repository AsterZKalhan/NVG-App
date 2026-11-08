// --- MODULE « STREAMS NVG » (style équipe Twitch) ---
// Liste des membres ayant une chaîne Twitch (vue nvg_streamers), statut via la fonction twitch-live.
// Le lecteur ne se recharge que lorsqu'on change de membre (pas à chaque actualisation du statut).

let streamsMembers = [];
let streamsStatus = {};
let selectedStreamChannel = null;
let loadedPlayerChannel = null;
let streamsPipClosed = false;

function streamStatusOf(login) {
  return streamsStatus[login] || { live: false, viewers: 0, title: '', game: '', avatar: '' };
}

async function renderStreams() {
  const { data, error } = await supabaseClient.from('nvg_streamers').select('*').order('name');
  if (error) {
    console.error("Erreur chargement des streamers :", error);
    return;
  }
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
    list.innerHTML = `<p class="text-xs text-gray-500 italic p-2">Aucun membre n'a renseigné sa chaîne Twitch.</p>`;
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

function updateStreamPlayer() {
  const player = document.getElementById('streamsPlayer');
  const empty = document.getElementById('streamsEmpty');
  const login = selectedStreamChannel;
  if (!player || !empty) return;

  if (!login) {
    player.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  player.classList.remove('hidden');
  empty.classList.add('hidden');

  if (loadedPlayerChannel !== login) {
    player.src = `https://player.twitch.tv/?channel=${login}&parent=app.nvg-tv.com&parent=localhost`;
    loadedPlayerChannel = login;
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

function enterStreamsPip() {
  if (!loadedPlayerChannel || streamsPipClosed) return false;
  const section = document.getElementById('streams');
  const player = document.getElementById('streamsPlayer');
  if (!section || !player || !player.getAttribute('src')) return false;
  section.classList.remove('hidden');
  section.classList.add('streams-pip-mode');
  return true;
}

function exitStreamsPip() {
  const section = document.getElementById('streams');
  if (section) section.classList.remove('streams-pip-mode');
  streamsPipClosed = false;
}

function closeStreamsPip() {
  streamsPipClosed = true;
  const player = document.getElementById('streamsPlayer');
  if (player) player.removeAttribute('src');
  loadedPlayerChannel = null;
  const section = document.getElementById('streams');
  if (section) {
    section.classList.remove('streams-pip-mode');
    section.classList.add('hidden');
  }
}

// Rafraîchit uniquement le statut (liste et infos), toutes les 30 s quand le module est affiché.
setInterval(() => {
  const section = document.getElementById('streams');
  if (!document.hidden && section && !section.classList.contains('hidden') && streamsMembers.length > 0) {
    refreshStreamsStatus();
  }
}, 30000);
