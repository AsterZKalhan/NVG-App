// --- GESTION DES PROPOSITIONS DE JEUX ---

const NIEUWHEIM_LOGO = './Logos/logo-nieuwheim.png';
const NIEUWHEIM_CARD_LOGO = './Logos/logo-nieuwheim-complet.png';

let gamesCache = [];
let gamesFilter = 'all';
let editingGameId = null;

function isGameLink(link) {
  return /^https:\/\//i.test(link || '');
}

const gameImageCache = {};

async function fetchGameImage(link) {
  if (!(link in gameImageCache)) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/steam-header?url=${encodeURIComponent(link)}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      });
      const data = await res.json();
      gameImageCache[link] = data.image || '';
    } catch (err) {
      gameImageCache[link] = '';
    }
  }
  return gameImageCache[link];
}

async function hydrateGameBanners(root) {
  const imgs = root.querySelectorAll('img[data-game-link]');
  for (const img of imgs) {
    const url = await fetchGameImage(img.dataset.gameLink);
    if (url) img.src = url;
    else img.parentElement.style.display = 'none';
  }
}

function isGamesAdmin() {
  return !!currentUser && (
    currentUser.role === 'admin' ||
    currentUser.rank === 'Grand Jarl' ||
    currentUser.rank === 'Divinité'
  );
}

// Libellé court d'un événement : on retire le préfixe [NVG] (la saison reste dans le logo).
function gameEventLabel(event) {
  return (event.title || '').replace(/^\[NVG\]\s*/, '');
}

function gameEventLogo(event) {
  const map = typeof eventLogos !== 'undefined' ? eventLogos : {};
  return `./Logos/${map[event.category] || 'logo-nvg.png'}`;
}

function upcomingNvgEvents() {
  const todayStr = new Date().toISOString().split('T')[0];
  return (db.events || [])
    .filter(e => (e.category || '').startsWith('NVG') && (e.date_debut || todayStr) >= todayStr)
    .sort((a, b) => (a.date_debut || '').localeCompare(b.date_debut || ''));
}

// Valeur de formulaire correspondant à un jeu : '', 'nieuwheim', 'idea' ou 'event:<id>'.
function targetValueOf(game) {
  if (!game) return '';
  if (game.target_type === 'nieuwheim') return 'nieuwheim';
  if (game.target_type === 'idea') return 'idea';
  if (game.event_id) return 'event:' + game.event_id;
  return '';
}

// --- FILTRES (Tous / Nieuwheim / Idées / un événement) ---

function setGamesFilter(key) {
  gamesFilter = key;
  renderGameFilters();
  renderGamesList();
}

function filteredGames() {
  if (gamesFilter === 'nieuwheim') return gamesCache.filter(g => g.target_type === 'nieuwheim');
  if (gamesFilter === 'idea') return gamesCache.filter(g => g.target_type === 'idea');
  if (gamesFilter.startsWith('event:')) {
    const eventId = gamesFilter.slice(6);
    return gamesCache.filter(g => g.event_id === eventId);
  }
  return gamesCache;
}

function renderGameFilters() {
  const container = document.getElementById('gamesFilters');
  if (!container) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const eventsWithGames = new Set(gamesCache.filter(g => g.event_id).map(g => g.event_id));
  const events = (db.events || [])
    .filter(e => (e.category || '').startsWith('NVG') &&
      ((e.date_debut || todayStr) >= todayStr || eventsWithGames.has(e.id)))
    .sort((a, b) => (a.date_debut || '').localeCompare(b.date_debut || ''));

  const pills = [
    { key: 'all', label: 'Tous', count: gamesCache.length },
    { key: 'nieuwheim', label: 'Nieuwheim', count: gamesCache.filter(g => g.target_type === 'nieuwheim').length, img: NIEUWHEIM_LOGO }
  ];
  const ideaCount = gamesCache.filter(g => g.target_type === 'idea').length;
  if (ideaCount > 0) {
    pills.push({ key: 'idea', label: '💡 Idées NVG', count: ideaCount });
  }
  events.forEach(ev => {
    pills.push({
      key: 'event:' + ev.id,
      label: gameEventLabel(ev),
      count: gamesCache.filter(g => g.event_id === ev.id).length,
      img: gameEventLogo(ev)
    });
  });

  // Si le filtre actif n'existe plus (événement supprimé), on revient sur « Tous ».
  if (!pills.some(p => p.key === gamesFilter)) gamesFilter = 'all';

  container.innerHTML = pills.map(pill => {
    const active = pill.key === gamesFilter;
    const cls = active
      ? 'bg-red-600 text-white border-red-500 shadow'
      : 'bg-[#121722] text-gray-400 border-[#1f293d] hover:text-white';
    return `
      <button type="button" onclick="setGamesFilter('${pill.key}')" class="flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold transition ${cls}">
        ${pill.img ? `<img src="${pill.img}" alt="" class="h-4 w-auto object-contain">` : ''}
        <span>${escapeHtml(pill.label)}</span>
        <span class="opacity-60">${pill.count}</span>
      </button>
    `;
  }).join('');

  const counter = document.getElementById('gamesCount');
  if (counter) counter.textContent = gamesCache.length;
}

// --- FORMULAIRE ---

function renderGameTargetSelect(selectedValue) {
  const select = document.getElementById('gameTarget');
  if (!select) return;

  const events = upcomingNvgEvents();
  let html = `<option value="">— Choisir une destination —</option>
    <option value="nieuwheim">Nieuwheim (soirée en ligne)</option>`;

  // L'idée « sans événement » reste dans le groupe des événements NVG à venir.
  html += `<optgroup label="Événements NVG à venir">` + events.map(ev =>
    `<option value="event:${ev.id}">${escapeHtml(gameEventLabel(ev))}${ev.date_debut ? ' — ' + escapeHtml(ev.date_debut) : ''}</option>`
  ).join('') + `<option value="idea">Un événement quelconque NVG (Juste une idée)</option></optgroup>`;

  select.innerHTML = html;

  // Événement passé encore rattaché au jeu en cours d'édition : on ajoute son option.
  if (selectedValue && selectedValue.startsWith('event:') && !Array.from(select.options).some(o => o.value === selectedValue)) {
    const ev = (db.events || []).find(e => e.id === selectedValue.slice(6));
    if (ev) {
      const option = document.createElement('option');
      option.value = selectedValue;
      option.textContent = `${gameEventLabel(ev)}${ev.date_debut ? ' — ' + ev.date_debut : ''}`;
      select.appendChild(option);
    }
  }

  select.value = selectedValue || '';
  onGameTargetChange();
}

function onGameTargetChange() {
  const select = document.getElementById('gameTarget');
  const isNieuwheim = !!select && select.value === 'nieuwheim';
  ['gameReleaseDateWrap', 'gameCommentWrap'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !isNieuwheim);
  });
}

function resetGameForm() {
  editingGameId = null;
  ['gameTitle', 'gameLink', 'gameImg', 'gameComment', 'gameReleaseDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const submitBtn = document.getElementById('gameSubmitBtn');
  if (submitBtn) submitBtn.textContent = 'Proposer ce jeu';
  const cancelBtn = document.getElementById('gameCancelEditBtn');
  if (cancelBtn) cancelBtn.classList.add('hidden');
  renderGameTargetSelect('');
}

function cancelGameEdit() {
  resetGameForm();
}

function editGame(gameId) {
  const game = gamesCache.find(g => g.id === gameId);
  if (!game) return;

  editingGameId = gameId;
  document.getElementById('gameTitle').value = game.title || '';
  document.getElementById('gameLink').value = game.link || '';
  document.getElementById('gameImg').value = game.img && game.img.startsWith('http') ? game.img : '';
  document.getElementById('gameComment').value = game.comment || '';
  document.getElementById('gameReleaseDate').value = game.release_date || '';
  renderGameTargetSelect(targetValueOf(game));

  const submitBtn = document.getElementById('gameSubmitBtn');
  if (submitBtn) submitBtn.textContent = 'Enregistrer les modifications';
  const cancelBtn = document.getElementById('gameCancelEditBtn');
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  const card = document.getElementById('gameFormCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Proposer un nouveau jeu ou enregistrer les modifications.
async function addGameProposal() {
  const titleInput = document.getElementById('gameTitle');
  if (!titleInput) return;

  const title = titleInput.value.trim();
  const link = (document.getElementById('gameLink')?.value || '').trim();
  const imgUrl = (document.getElementById('gameImg')?.value || '').trim();
  const target = document.getElementById('gameTarget')?.value || '';

  if (!title) {
    alert("Veuillez saisir au moins le nom du jeu.");
    return;
  }

  if (!target) {
    alert("Choisis « Nieuwheim », un événement NVG à venir ou « Juste une idée ».");
    return;
  }

  const isNieuwheim = target === 'nieuwheim';
  const isIdea = target === 'idea';
  const eventId = target.startsWith('event:') ? target.slice(6) : null;
  const comment = isNieuwheim ? (document.getElementById('gameComment')?.value || '').trim() : '';
  const releaseDate = isNieuwheim ? (document.getElementById('gameReleaseDate')?.value || '').trim() : '';

  let finalImg = imgUrl;
  if (!finalImg && isGameLink(link)) {
    finalImg = await fetchGameImage(link);
  }

  const payload = {
    title: title,
    link: link,
    img: finalImg,
    target_type: isNieuwheim ? 'nieuwheim' : (isIdea ? 'idea' : 'event'),
    event_id: isNieuwheim || isIdea ? null : eventId,
    comment: isNieuwheim && comment ? comment : null,
    release_date: isNieuwheim && releaseDate ? releaseDate : null
  };

  if (editingGameId) {
    const { error } = await supabaseClient
      .from('nvg_games')
      .update(payload)
      .eq('id', editingGameId);

    if (error) {
      alert("Erreur lors de la modification : " + error.message);
      return;
    }

    resetGameForm();
    alert("Proposition mise à jour.");
    loadGames();
    return;
  }

  payload.id = 'game_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  payload.author = currentUser ? currentUser.name : 'Viking Anonyme';
  payload.votes = 0;

  const { error } = await supabaseClient
    .from('nvg_games')
    .insert([payload]);

  if (error) {
    alert("Erreur lors de la proposition du jeu : " + error.message);
    return;
  }

  resetGameForm();
  alert("Jeu proposé avec succès !");
  loadGames();
}

// --- AFFICHAGE ---

function gameTargetBadge(game) {
  if (game.target_type === 'nieuwheim') {
    // Logo complet affiché directement sur la carte : le lettrage est blanc avec un contour noir.
    // Recadrage : le fichier 1920x1080 a des marges transparentes, le contenu est centré.
    return `
      <span class="relative overflow-hidden shrink-0" style="width:74px;height:24px;" title="Nieuwheim">
        <img src="${NIEUWHEIM_CARD_LOGO}" alt="Nieuwheim" class="absolute max-w-none" style="width:127.5%;left:50%;top:50%;transform:translate(-50%,-50%);">
      </span>
    `;
  }

  if (game.target_type === 'idea') {
    return `
      <span class="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/40 rounded-lg px-2 py-1 shrink-0" title="Idée en attente : à rattacher au prochain événement via Éditer">
        <span class="text-[10px] font-bold text-amber-400 whitespace-nowrap">💡 Idée NVG</span>
      </span>
    `;
  }

  if (game.event_id) {
    const ev = (db.events || []).find(e => e.id === game.event_id);
    if (!ev) return '';
    return `
      <span class="flex items-center gap-1.5 bg-white/5 border border-[#1f293d] rounded-lg px-2 py-1 shrink-0 max-w-[55%]" title="${escapeHtml(ev.title || '')}">
        <img src="${gameEventLogo(ev)}" alt="" class="h-3.5 w-auto object-contain">
        <span class="text-[10px] font-bold text-gray-300 truncate">${escapeHtml(gameEventLabel(ev))}</span>
      </span>
    `;
  }

  return '';
}

function gameVoteBlock(game) {
  const voters = Array.isArray(game.voters) ? game.voters : [];
  const hasVoted = !!currentUser && voters.some(v => v.id === currentUser.id);
  let tip;
  if (voters.length) {
    tip = `<p class="votes-tip-title">Ont voté</p><ul>${voters.map(v => `<li>${escapeHtml(v.name || 'Anonyme')}</li>`).join('')}</ul>`;
  } else if ((game.votes || 0) > 0) {
    tip = `<p class="votes-tip-title">${game.votes} vote(s)</p><p>Détail non disponible pour les votes antérieurs.</p>`;
  } else {
    tip = `<p class="votes-tip-title">Aucun vote pour le moment</p>`;
  }
  const button = hasVoted
    ? `<span class="px-2.5 py-1 text-gray-500 text-xs font-bold">✓ Voté</span>`
    : `<button onclick="voteGame('${game.id}')" class="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-lg transition">+1</button>`;
  return `
    <span class="votes-wrap">
      <span class="text-xs font-bold text-amber-400 cursor-default">🔥 ${game.votes || 0} votes</span>
      <span class="votes-tip">${tip}</span>
    </span>
    ${button}`;
}

async function resetGameVotes(gameId) {
  if (!isGamesAdmin()) return;
  const game = gamesCache.find(g => g.id === gameId);
  if (!game) return;
  if (!confirm(`Remettre à zéro les votes de « ${game.title} » ?`)) return;

  const { data, error } = await supabaseClient
    .from('nvg_games')
    .update({ votes: 0, voters: [] })
    .eq('id', gameId)
    .select()
    .single();

  if (error || !data) {
    console.error("Erreur reset votes :", error);
    alert("Les votes n'ont pas pu être réinitialisés.");
    return;
  }

  Object.assign(game, data);
  renderGamesList();
}

function renderGamesList() {
  const container = document.getElementById('gamesList');
  if (!container) return;

  const games = filteredGames();
  const isAdmin = isGamesAdmin();

  if (games.length === 0) {
    const emptyLabel = gamesFilter === 'idea'
      ? "Aucune idée en attente de rattachement."
      : (gamesFilter === 'all'
        ? "Aucun jeu proposé pour le moment."
        : "Aucun jeu proposé pour cette destination pour le moment.");
    container.innerHTML = `<p class="text-xs text-gray-400 md:col-span-3 p-4 bg-[#121722]/70 border border-[#1f293d] rounded-xl italic">${emptyLabel}</p>`;
    return;
  }

  container.innerHTML = games.map(game => `
    <div class="bg-[#121722] border border-[#1f293d] rounded-2xl overflow-hidden flex flex-col justify-between shadow-lg group">
      <div>
        ${(game.img && game.img.startsWith('http')) || isGameLink(game.link) ? `
          <div class="h-32 w-full overflow-hidden bg-black/40 border-b border-[#1f293d]">
            <img ${game.img && game.img.startsWith('http') ? `src="${escapeHtml(game.img)}"` : `data-game-link="${escapeHtml(game.link)}"`} referrerpolicy="no-referrer" alt="Bannière" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.style.display='none'">
          </div>
        ` : ''}
        <div class="p-5 space-y-2">
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-sm font-black text-white uppercase tracking-wider min-w-0">${escapeHtml(game.title)}</h3>
            ${gameTargetBadge(game)}
          </div>
          ${game.link && game.link !== 'NULL' ? `<a href="${game.link.startsWith('http') ? escapeHtml(game.link) : 'https://' + escapeHtml(game.link)}" target="_blank" rel="noopener" class="text-xs text-red-400 hover:underline inline-block truncate max-w-full">🔗 Lien externe</a>` : ''}
          ${game.target_type === 'nieuwheim' && game.release_date ? `<p class="text-[11px] text-gray-400">📅 Sortie : <span class="text-gray-200 font-bold">${escapeHtml(game.release_date)}</span></p>` : ''}
          ${game.target_type === 'nieuwheim' && game.comment ? `<p class="text-xs text-gray-300 whitespace-pre-line break-words">💬 ${escapeHtml(game.comment)}</p>` : ''}
          <p class="text-[11px] text-gray-400 pt-1">Proposé par : <span class="text-white font-bold">${escapeHtml(game.author || 'Anonyme')}</span></p>
        </div>
      </div>

      <div class="p-5 pt-0 flex items-center justify-between">
        <div class="flex items-center gap-2">
          ${gameVoteBlock(game)}
        </div>

        ${isAdmin ? `
          <div class="flex gap-2">
            <button onclick="resetGameVotes('${game.id}')" class="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-bold rounded-lg transition">Reset votes ↺</button>
            <button onclick="editGame('${game.id}')" class="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-400 hover:text-black text-[11px] font-bold rounded-lg transition">Éditer ✏️</button>
            <button onclick="deleteGame('${game.id}')" class="px-2.5 py-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-[11px] font-bold rounded-lg transition">Supprimer 🗑️</button>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');

  hydrateGameBanners(container);
}

// Charger et afficher la liste des jeux proposés
async function loadGames() {
  const { data: games, error } = await supabaseClient
    .from('nvg_games')
    .select('*');

  if (error) {
    console.error("Erreur chargement jeux :", error);
    return;
  }

  gamesCache = (games || []).sort((a, b) => (b.votes || 0) - (a.votes || 0));
  renderGameFilters();
  renderGamesList();
}

// Appelé à l'ouverture de l'onglet : rafraîchit les événements proposés dans la liste déroulante.
function refreshGamesTab() {
  const select = document.getElementById('gameTarget');
  renderGameTargetSelect(select ? select.value : '');
  loadGames();
}

// Voter pour un jeu (+1)
async function voteGame(gameId) {
  if (!currentUser) {
    alert("Connecte-toi pour voter.");
    return;
  }
  const game = gamesCache.find(g => g.id === gameId);
  if (!game) return;
  const voters = Array.isArray(game.voters) ? game.voters : [];
  if (voters.some(v => v.id === currentUser.id)) return;

  const { data, error } = await supabaseClient
    .from('nvg_games')
    .update({
      votes: (game.votes || 0) + 1,
      voters: [...voters, { id: currentUser.id, name: currentUser.name }]
    })
    .eq('id', gameId)
    .select()
    .single();

  if (error || !data) {
    console.error("Erreur vote :", error);
    alert("Le vote n'a pas pu être enregistré.");
    return;
  }

  Object.assign(game, data);
  renderGamesList();
}

// Fonction pour supprimer un jeu (Admin)
async function deleteGame(gameId) {
  if (!confirm("Es-tu sûr de vouloir supprimer cette proposition de jeu ?")) return;

  const { error } = await supabaseClient
    .from('nvg_games')
    .delete()
    .eq('id', gameId);

  if (error) {
    alert("Erreur lors de la suppression : " + error.message);
    return;
  }

  if (editingGameId === gameId) resetGameForm();
  loadGames();
}

// Sécurité anti-XSS de base
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
