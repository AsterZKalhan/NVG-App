// Sondages : cartes (bannière + lien, comme les propositions de l'application).
// Tournoi des 9 Mondes : 9 jeux, quels qu'ils soient.
// Décathlon : 3 colonnes (5v5, 2v2, 1v1), 3 jeux par colonne.
// Les règles sont appliquées par nvg_poll_cast.

const POLL_PICKS = 9;
const POLL_COLUMN_PICKS = 3;
const POLL_COLUMNS = [
  { key: '5v5', label: '5v5' },
  { key: '2v2', label: '2v2' },
  { key: '1v1', label: '1v1' }
];

function pollVoteColumn(key) {
  return key === '1v1x10' ? '1v1' : key;
}

function pollFormatBadge(key) {
  if (key !== '1v1x10') return '';
  return '<span class="ml-1 shrink-0 text-[9px] font-black uppercase tracking-wider text-sky-300">1v1 x10</span>';
}

const pollImageCache = {};
let pollId = null;
let pollSettings = { title: '', intro: '', open: false, mode: 'nine_worlds' };
let pollGames = [];
let pollSelected = new Set();
let pollEditingGameId = null;
let pollAdminPolls = [];
let pollAdminId = null;
let pollCreating = false;
let pollAdminGames = [];
let pollVotes = [];
let pollLocked = false;
let pollDone = false;
let pollSubmitting = false;

function pollDb() {
  return window.nvgSupabase || null;
}

function pollEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pollHttps(value) {
  const url = String(value ?? '').trim();
  return /^https:\/\//i.test(url) ? url : '';
}

function pollNotify(message, isError = false) {
  if (typeof notify === 'function') notify(message, isError);
  else window.alert(message);
}

function pollHide(el, hide) {
  if (!el) return;
  el.hidden = !!hide;
  el.classList.toggle('hidden', !!hide);
}

function pollIsDecathlon(mode) {
  return (mode || pollSettings.mode) === 'decathlon';
}

function pollModeLabel(mode) {
  return pollIsDecathlon(mode) ? 'Décathlon' : 'Tournoi des 9 Mondes';
}

function pollPriceLabel(cents) {
  const value = Math.max(0, Math.round(Number(cents) || 0));
  if (value === 0) return 'Gratuit';
  return (value / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function pollPriceCentsFromInput(inputId) {
  const raw = String(document.getElementById(inputId)?.value ?? '').replace(',', '.').trim();
  if (raw === '') return 0;
  const euros = Number(raw);
  if (!Number.isFinite(euros) || euros < 0) return null;
  return Math.round(euros * 100);
}

function pollVotedKey(id) {
  return id ? `nvg_poll_voted_${id}` : '';
}

function pollErrorCode(error) {
  const message = String(error?.message || error || '');
  if (/already_voted/i.test(message)) return 'already_voted';
  if (/need_three/i.test(message)) return 'need_three';
  if (/need_nine/i.test(message)) return 'need_nine';
  if (/poll_closed/i.test(message)) return 'poll_closed';
  if (/invalid_email/i.test(message)) return 'invalid_email';
  if (/invalid_games/i.test(message)) return 'invalid_games';
  if (/nvg_poll|schema cache|does not exist|PGRST205/i.test(message)) return 'missing';
  return '';
}

function pollMessage(code) {
  if (code === 'already_voted') return 'Vous avez déjà voté';
  if (code === 'need_three') return 'Tu dois choisir exactement 3 jeux dans chaque colonne.';
  if (code === 'need_nine') return 'Tu dois choisir exactement 9 jeux.';
  if (code === 'poll_closed') return 'Le vote est fermé.';
  if (code === 'invalid_email') return 'Adresse e-mail invalide.';
  if (code === 'invalid_games') return 'Un jeu n’est plus disponible. Recharge la page.';
  if (code === 'missing') return 'Les sondages ne sont pas encore en place. Exécute le script SQL tournament-poll dans Supabase.';
  return 'Le vote n’a pas pu être enregistré.';
}

function pollHasVotedHere() {
  const key = pollVotedKey(pollId);
  if (!key) return false;
  try { return localStorage.getItem(key) === '1'; } catch (_) { return false; }
}

function pollRememberVote() {
  const key = pollVotedKey(pollId);
  if (!key) return;
  try { localStorage.setItem(key, '1'); } catch (_) { /* stockage indisponible */ }
  pollSyncResultsButton();
}

function pollSyncResultsButton() {
  pollHide(document.getElementById('pollResultsBtn'), !(pollId && (pollDone || pollHasVotedHere())));
}

function pollColumnCount(columnKey) {
  return [...pollSelected].filter((id) => pollVoteColumn(pollGames.find((game) => game.id === id)?.column_key) === columnKey).length;
}

function pollSelectionReady() {
  if (pollIsDecathlon()) return POLL_COLUMNS.every((column) => pollColumnCount(column.key) === POLL_COLUMN_PICKS);
  return pollSelected.size === POLL_PICKS;
}

function pollCountLabel() {
  if (pollIsDecathlon()) {
    return POLL_COLUMNS.map((column) => `${column.label} ${pollColumnCount(column.key)}/${POLL_COLUMN_PICKS}`).join(' · ');
  }
  return `${pollSelected.size} / ${POLL_PICKS}`;
}

function pollSyncCount() {
  const count = document.getElementById('pollCount');
  const button = document.getElementById('pollSubmit');
  const ready = pollSelectionReady() && !pollLocked;
  if (count) {
    count.textContent = pollCountLabel();
    count.className = ready ? 'text-sm font-black text-emerald-400' : 'text-sm font-black text-amber-300';
  }
  if (button) button.disabled = !ready || pollSubmitting;
}

async function pollFetchImage(link) {
  const safe = pollHttps(link);
  if (!safe) return '';
  if (!(safe in pollImageCache)) {
    try {
      const res = await fetch(`${window.NVG_SUPABASE_URL}/functions/v1/steam-header?url=${encodeURIComponent(safe)}`, {
        headers: {
          apikey: window.NVG_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.NVG_SUPABASE_ANON_KEY}`
        }
      });
      const data = await res.json();
      pollImageCache[safe] = pollHttps(data.image) || '';
    } catch (_) {
      pollImageCache[safe] = '';
    }
  }
  return pollImageCache[safe];
}

function pollHydrate(root) {
  if (!root) return;
  root.querySelectorAll('img[data-game-link]').forEach(async (img) => {
    const url = await pollFetchImage(img.dataset.gameLink);
    if (url) img.src = url;
    else if (img.parentElement) img.parentElement.style.display = 'none';
  });
}

function pollBanner(kind, text) {
  const box = document.getElementById('pollBanner');
  if (!box) return;
  if (!text) {
    pollHide(box, true);
    box.textContent = '';
    return;
  }
  const styles = {
    error: 'border-red-500/40 bg-red-600/10 text-red-300',
    ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    info: 'border-amber-500/40 bg-amber-500/10 text-amber-200'
  };
  box.className = `rounded-2xl border px-4 py-3 text-sm font-bold ${styles[kind] || styles.info}`;
  box.textContent = text;
  pollHide(box, false);
}

function pollCard(game, canVote) {
  const selected = pollSelected.has(game.id);
  const image = pollHttps(game.image_url);
  const link = pollHttps(game.link);
  return `
    <div role="button" tabindex="0" onclick="togglePollPick('${game.id}')" onkeydown="pollPickKey(event, '${game.id}')"
      class="flex items-center gap-3 rounded-xl border ${selected ? 'border-red-500 ring-1 ring-red-500' : 'border-[#1f293d]'} bg-[#121722] p-2 text-left ${canVote ? 'cursor-pointer' : ''}">
      <div class="aspect-[460/215] w-36 shrink-0 overflow-hidden rounded-lg bg-black sm:w-44">
        <img ${image ? `src="${pollEsc(image)}"` : `data-game-link="${pollEsc(link)}"`} referrerpolicy="no-referrer" alt="" class="h-full w-full object-contain" onerror="this.style.display='none'">
      </div>
      <div class="min-w-0 flex-1 space-y-0.5">
        <h3 class="truncate text-xs font-black uppercase tracking-wider text-white">${pollEsc(game.title)}${pollFormatBadge(game.column_key)}</h3>
        <p class="text-[10px] font-black uppercase tracking-wider text-amber-300">${pollEsc(pollPriceLabel(game.price_cents))}</p>
        ${link ? `<a href="${pollEsc(link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="inline-block max-w-full truncate text-[10px] text-red-400 hover:underline">🔗 Lien</a>` : ''}
      </div>
      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-red-500 bg-red-600 text-white' : 'border-white/20 bg-black/50 text-transparent'} text-[10px] font-black">✓</span>
    </div>`;
}

function renderPoll() {
  const title = document.getElementById('pollTitle');
  const intro = document.getElementById('pollIntro');
  const grid = document.getElementById('pollGrid');
  const form = document.getElementById('pollForm');
  if (title) title.textContent = pollSettings.title || 'Sondage';
  if (intro) intro.textContent = pollSettings.intro || '';
  if (!grid) return;

  const activeGames = pollGames.filter((game) => game.column_key || !pollIsDecathlon());
  const tooFew = pollIsDecathlon()
    ? POLL_COLUMNS.some((column) => activeGames.filter((game) => pollVoteColumn(game.column_key) === column.key).length < POLL_COLUMN_PICKS)
    : activeGames.length < POLL_PICKS;
  const canVote = !!pollSettings.open && !tooFew && !pollDone;
  pollLocked = !canVote;

  if (!activeGames.length) {
    grid.innerHTML = '<p class="text-xs text-gray-400 p-4 bg-[#121722] border border-[#1f293d] rounded-xl">Aucun jeu n’est proposé pour le moment.</p>';
  } else if (pollIsDecathlon()) {
    grid.innerHTML = POLL_COLUMNS.map((column) => {
      const games = activeGames.filter((game) => pollVoteColumn(game.column_key) === column.key);
      return `
        <section class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-black uppercase tracking-wider text-white">${column.label}</h2>
            <p class="text-xs font-black ${pollColumnCount(column.key) === POLL_COLUMN_PICKS ? 'text-emerald-400' : 'text-amber-300'}">${pollColumnCount(column.key)} / ${POLL_COLUMN_PICKS}</p>
          </div>
          <div class="grid grid-cols-1 gap-2 lg:grid-cols-2">
            ${games.map((game) => pollCard(game, canVote)).join('') || '<p class="text-xs text-gray-500">Aucun jeu dans cette colonne.</p>'}
          </div>
        </section>`;
    }).join('');
    pollHydrate(grid);
  } else {
    grid.innerHTML = `<div class="grid grid-cols-1 gap-2 lg:grid-cols-2">${activeGames.map((game) => pollCard(game, canVote)).join('')}</div>`;
    pollHydrate(grid);
  }

  pollHide(form, !canVote);
  if (!pollDone) {
    if (!pollSettings.open) pollBanner('info', 'Le vote est fermé.');
    else if (!activeGames.length) pollBanner('info', '');
    else if (tooFew) pollBanner('info', pollIsDecathlon()
      ? 'Le vote ouvrira lorsqu’il y aura au moins 3 jeux dans chaque colonne.'
      : 'Le vote ouvrira lorsqu’au moins 9 jeux seront en ligne.');
    else pollBanner('info', '');
  }
  pollSyncCount();
  pollSyncResultsButton();
}

async function renderPollList() {
  const list = document.getElementById('pollList');
  const db = pollDb();
  if (!list || !db) return;
  list.innerHTML = '<p class="text-xs text-gray-400">Chargement des sondages…</p>';
  const { data, error } = await db.from('nvg_polls').select('id,title,intro,mode,open').eq('open', true).order('created_at', { ascending: false });
  const code = pollErrorCode(error);
  if (code === 'missing') {
    list.innerHTML = `<p class="text-sm text-red-300">${pollEsc(pollMessage('missing'))}</p>`;
    return;
  }
  if (error) {
    list.innerHTML = '<p class="text-sm text-red-300">Impossible de charger les sondages.</p>';
    return;
  }
  const polls = data || [];
  if (!polls.length) {
    list.innerHTML = '<p class="text-sm text-gray-400">Aucun sondage n’est ouvert pour le moment.</p>';
    return;
  }
  list.innerHTML = `
    <div>
      <p class="text-[11px] uppercase tracking-[0.3em] text-amber-400 font-black">Sondages</p>
      <h1 class="text-2xl font-black text-white mt-1">À toi de voter</h1>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${polls.map((poll) => `
        <button type="button" onclick="openPoll('${poll.id}')" class="bg-[#121722] border border-[#1f293d] rounded-2xl p-5 text-left hover:border-red-500 transition">
          <h2 class="text-base font-black text-white">${pollEsc(poll.title)}</h2>
          ${poll.intro ? `<p class="text-xs text-gray-400 mt-2">${pollEsc(poll.intro)}</p>` : ''}
        </button>`).join('')}
    </div>`;
}

function openPoll(id) {
  const url = `${window.location.pathname}?tab=vote&poll=${encodeURIComponent(id)}`;
  window.history.pushState({ tab: 'vote', poll: id }, document.title, url);
  loadPoll();
}

async function loadPoll() {
  const list = document.getElementById('pollList');
  const detail = document.getElementById('pollDetail');
  const db = pollDb();
  pollDone = false;
  pollSelected = new Set();
  pollHide(document.getElementById('pollResults'), true);
  const id = new URLSearchParams(window.location.search).get('poll') || '';
  if (!db) return;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    pollId = null;
    pollHide(detail, true);
    pollHide(list, false);
    await renderPollList();
    return;
  }
  pollId = id;
  pollHide(list, true);
  pollHide(detail, false);
  const grid = document.getElementById('pollGrid');
  if (grid) grid.innerHTML = '<p class="text-xs text-gray-400">Chargement du sondage…</p>';
  const [settings, games] = await Promise.all([
    db.from('nvg_polls').select('id,title,intro,mode,open').eq('id', id).maybeSingle(),
    db.from('nvg_poll_games').select('id,title,link,image_url,column_key,position,price_cents').eq('poll_id', id).eq('active', true).order('position').order('title')
  ]);
  const code = pollErrorCode(settings.error || games.error);
  if (code === 'missing') {
    if (grid) grid.innerHTML = '';
    pollBanner('error', pollMessage('missing'));
    pollHide(document.getElementById('pollForm'), true);
    return;
  }
  if (settings.error || games.error || !settings.data) {
    if (grid) grid.innerHTML = '';
    pollBanner('error', 'Ce sondage est introuvable.');
    pollHide(document.getElementById('pollForm'), true);
    return;
  }
  pollSettings = settings.data;
  pollGames = games.data || [];
  renderPoll();
}

function togglePollPick(id) {
  if (pollLocked || pollSubmitting) return;
  if (pollSelected.has(id)) {
    pollSelected.delete(id);
  } else if (pollIsDecathlon()) {
    const column = pollVoteColumn(pollGames.find((game) => game.id === id)?.column_key);
    if (pollColumnCount(column) >= POLL_COLUMN_PICKS) {
      pollNotify('Pas plus de 3 jeux dans cette colonne.', true);
      return;
    }
    pollSelected.add(id);
  } else if (pollSelected.size >= POLL_PICKS) {
    pollNotify('Pas plus de 9 jeux.', true);
    return;
  } else {
    pollSelected.add(id);
  }
  renderPoll();
}

function pollPickKey(event, id) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    togglePollPick(id);
  }
}

async function submitPollVote(event) {
  event.preventDefault();
  if (pollSubmitting || pollLocked || !pollId) return;
  if (!pollSelectionReady()) {
    pollBanner('error', pollMessage(pollIsDecathlon() ? 'need_three' : 'need_nine'));
    return;
  }
  const emailInput = document.getElementById('pollEmail');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    pollBanner('error', pollMessage('invalid_email'));
    return;
  }
  const db = pollDb();
  if (!db) return;
  pollSubmitting = true;
  pollSyncCount();
  const { error } = await db.rpc('nvg_poll_cast', { p_poll: pollId, p_email: email, p_games: [...pollSelected] });
  pollSubmitting = false;
  const code = pollErrorCode(error);
  if (code === 'already_voted') {
    pollRememberVote();
    pollBanner('error', 'Vous avez déjà voté');
    pollSyncCount();
    return;
  }
  if (error) {
    pollBanner('error', pollMessage(code));
    pollSyncCount();
    return;
  }
  if (emailInput) emailInput.value = '';
  pollDone = true;
  pollRememberVote();
  renderPoll();
  pollBanner('ok', 'Vote enregistré. Merci !');
}

function pollRankRows(rows, limit) {
  const ranked = [...(rows || [])].sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0)
    || String(a.title || '').localeCompare(String(b.title || ''), 'fr'));
  const cutoff = ranked.length >= limit ? Number(ranked[limit - 1].votes) || 0 : null;
  return ranked.map((game, index) => {
    const votes = Number(game.votes) || 0;
    const eligible = cutoff === null || (cutoff > 0 ? votes >= cutoff : index < limit);
    return { game, index, votes, eligible };
  });
}

function pollRankHtml(rows, limit, title) {
  const ranked = pollRankRows(rows, limit);
  if (!ranked.length) return `<p class="text-xs text-gray-500">${pollEsc(title)} : aucun jeu.</p>`;
  return `
    <div class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-black text-white">${pollEsc(title)}</h2>
        <p class="text-[10px] text-gray-500">Les ${limit} premiers à cet instant sont éligibles</p>
      </div>
      ${ranked.map(({ game, index, votes, eligible }) => {
        const image = pollHttps(game.image_url);
        return `
          <div class="flex items-center gap-3 rounded-xl border px-3 py-2 ${eligible ? 'border-amber-400/60 bg-amber-500/10' : 'border-[#1f293d] bg-[#07090e]'}">
            ${eligible
              ? '<span class="w-14 shrink-0 text-[9px] font-black uppercase tracking-wider text-amber-300">Éligible</span>'
              : '<span class="w-14 shrink-0" aria-hidden="true"></span>'}
            <span class="w-5 shrink-0 text-xs font-black ${eligible ? 'text-amber-200' : 'text-gray-500'}">${index + 1}</span>
            ${image ? `<img src="${pollEsc(image)}" alt="" referrerpolicy="no-referrer" class="h-8 w-14 shrink-0 rounded object-cover" onerror="this.style.display='none'">` : ''}
            <p class="min-w-0 flex-1 truncate text-xs font-bold ${eligible ? 'text-white' : 'text-gray-300'}">${pollEsc(game.title)}${pollFormatBadge(game.column_key)}</p>
            <p class="shrink-0 text-[11px] font-black ${eligible ? 'text-amber-200' : 'text-gray-400'}">${votes} vote${votes > 1 ? 's' : ''}</p>
          </div>`;
      }).join('')}
    </div>`;
}

function renderPollRanking(rows) {
  const box = document.getElementById('pollResults');
  if (!box) return;
  if (pollIsDecathlon()) {
    box.innerHTML = POLL_COLUMNS.map((column) => pollRankHtml(
      (rows || []).filter((row) => pollVoteColumn(row.column_key) === column.key),
      POLL_COLUMN_PICKS,
      column.label
    )).join('');
    return;
  }
  box.innerHTML = pollRankHtml(rows || [], POLL_PICKS, 'Classement');
}

async function togglePollResults() {
  if (!(pollDone || pollHasVotedHere()) || !pollId) return;
  const box = document.getElementById('pollResults');
  const db = pollDb();
  if (!box || !db) return;
  if (!box.hidden) {
    pollHide(box, true);
    return;
  }
  pollHide(box, false);
  box.innerHTML = '<p class="text-xs text-gray-400">Chargement du classement…</p>';
  const { data, error } = await db.rpc('nvg_poll_ranking', { p_poll: pollId });
  if (error) {
    box.innerHTML = `<p class="text-xs text-red-300">${pollEsc(pollMessage(pollErrorCode(error)) || 'Impossible de charger le classement.')}</p>`;
    return;
  }
  renderPollRanking(data || []);
}

function pollPreviewGameImage() {
  const img = document.getElementById('pollGameImagePreview');
  const empty = document.getElementById('pollGameImageEmpty');
  const url = pollHttps(document.getElementById('pollGameImage')?.value);
  if (!img || !empty) return;
  if (!url) {
    pollHide(img, true);
    img.removeAttribute('src');
    pollHide(empty, false);
    return;
  }
  img.src = url;
  pollHide(img, false);
  pollHide(empty, true);
}

async function pollFillImageFromLink() {
  const imageInput = document.getElementById('pollGameImage');
  const link = document.getElementById('pollGameLink')?.value || '';
  if (!imageInput || imageInput.value.trim()) return;
  const image = await pollFetchImage(link);
  if (!image || imageInput.value.trim()) return;
  imageInput.value = image;
  pollPreviewGameImage();
}

function pollAdminMode() {
  return pollAdminPolls.find((poll) => poll.id === pollAdminId)?.mode || 'nine_worlds';
}

function cancelPollGameEdit() {
  pollEditingGameId = null;
  const form = document.getElementById('pollGameForm');
  if (form) form.reset();
  const active = document.getElementById('pollGameActive');
  if (active) active.checked = true;
  const submit = document.getElementById('pollGameSubmit');
  if (submit) submit.textContent = 'Ajouter le jeu';
  pollHide(document.getElementById('pollGameCancel'), true);
  pollPreviewGameImage();
}

function editPollGame(id) {
  const game = pollAdminGames.find((item) => item.id === id);
  if (!game) return;
  pollEditingGameId = id;
  document.getElementById('pollGameTitle').value = game.title || '';
  document.getElementById('pollGameLink').value = game.link || '';
  document.getElementById('pollGameImage').value = game.image_url || '';
  document.getElementById('pollGameActive').checked = game.active !== false;
  const priceInput = document.getElementById('pollGamePrice');
  if (priceInput) priceInput.value = ((Number(game.price_cents) || 0) / 100).toFixed(2);
  const column = document.getElementById('pollGameColumn');
  if (column && game.column_key) column.value = game.column_key;
  document.getElementById('pollGameSubmit').textContent = 'Enregistrer le jeu';
  pollHide(document.getElementById('pollGameCancel'), false);
  pollPreviewGameImage();
  document.getElementById('pollGameTitle')?.focus();
}

async function savePollGame(event) {
  event.preventDefault();
  const db = pollDb();
  if (!db || !pollAdminId) return;
  const title = document.getElementById('pollGameTitle').value.trim();
  const link = pollHttps(document.getElementById('pollGameLink').value);
  let image = pollHttps(document.getElementById('pollGameImage').value);
  if (!title || !link) {
    pollNotify('Indique un nom et un lien https.', true);
    return;
  }
  const priceCents = pollPriceCentsFromInput('pollGamePrice');
  if (priceCents === null) {
    pollNotify('Indique un prix positif, ou 0 pour gratuit.', true);
    return;
  }
  if (!image) image = await pollFetchImage(link);
  const decathlon = pollIsDecathlon(pollAdminMode());
  const payload = {
    poll_id: pollAdminId,
    title,
    link,
    image_url: image || null,
    column_key: decathlon ? document.getElementById('pollGameColumn').value : null,
    active: !!document.getElementById('pollGameActive').checked,
    price_cents: priceCents
  };
  let error;
  if (pollEditingGameId) {
    ({ error } = await db.from('nvg_poll_games').update(payload).eq('id', pollEditingGameId));
  } else {
    const same = pollAdminGames.filter((game) => !decathlon || pollVoteColumn(game.column_key) === pollVoteColumn(payload.column_key));
    payload.position = same.length ? Math.max(...same.map((game) => Number(game.position) || 0)) + 1 : 0;
    ({ error } = await db.from('nvg_poll_games').insert(payload));
  }
  if (error) {
    pollNotify(pollErrorCode(error) === 'missing' ? pollMessage('missing') : 'Le jeu n’a pas pu être enregistré.', true);
    return;
  }
  pollNotify(pollEditingGameId ? 'Jeu mis à jour.' : 'Jeu ajouté.');
  cancelPollGameEdit();
  await loadPollAdmin();
}

async function deletePollGame(id) {
  const game = pollAdminGames.find((item) => item.id === id);
  if (!game || !window.confirm(`Retirer « ${game.title} » du sondage ?`)) return;
  const db = pollDb();
  const { error } = await db.from('nvg_poll_games').delete().eq('id', id);
  if (error) {
    pollNotify('Ce jeu a déjà reçu des votes. Décoche « Visible dans le vote » plutôt que de le supprimer.', true);
    return;
  }
  if (pollEditingGameId === id) cancelPollGameEdit();
  await loadPollAdmin();
}

async function movePollGame(id, direction) {
  const game = pollAdminGames.find((item) => item.id === id);
  if (!game) return;
  const decathlon = pollIsDecathlon(pollAdminMode());
  const pool = pollAdminGames
    .filter((item) => !decathlon || pollVoteColumn(item.column_key) === pollVoteColumn(game.column_key))
    .sort((a, b) => (a.position - b.position) || a.title.localeCompare(b.title, 'fr'));
  const index = pool.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= pool.length) return;
  const next = pool.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  const db = pollDb();
  const results = await Promise.all(next.map((entry, position) => db.from('nvg_poll_games').update({ position }).eq('id', entry.id)));
  if (results.some((result) => result.error)) {
    pollNotify('L’ordre n’a pas pu être enregistré.', true);
    return;
  }
  await loadPollAdmin();
}

function renderPollAdminGames() {
  const box = document.getElementById('pollAdminGames');
  if (!box) return;
  pollHide(document.getElementById('pollGameColumnWrap'), !pollIsDecathlon(pollAdminMode()));
  if (!pollAdminGames.length) {
    box.innerHTML = '<p class="text-[11px] text-gray-500">Aucun jeu dans ce sondage.</p>';
    return;
  }
  const groups = pollIsDecathlon(pollAdminMode())
    ? POLL_COLUMNS.map((column) => ({ label: column.label, games: pollAdminGames.filter((game) => pollVoteColumn(game.column_key) === column.key) }))
    : [{ label: '', games: pollAdminGames }];
  box.innerHTML = groups.map((group) => {
    const sorted = [...group.games].sort((a, b) => (a.position - b.position) || a.title.localeCompare(b.title, 'fr'));
    return `
      ${group.label ? `<p class="pt-2 text-[10px] font-black uppercase tracking-wider text-amber-300">${group.label}</p>` : ''}
      ${sorted.map((game) => {
        const image = pollHttps(game.image_url);
        const link = pollHttps(game.link);
        return `
          <div class="flex items-center gap-3 rounded-xl border border-[#1f293d] bg-[#07090e] p-2">
            <div class="aspect-[460/215] h-12 w-auto shrink-0 overflow-hidden rounded-lg bg-black">
              ${image ? `<img src="${pollEsc(image)}" alt="" referrerpolicy="no-referrer" class="h-full w-full object-contain" onerror="this.style.display='none'">` : ''}
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-black text-white">${pollEsc(game.title)}${pollFormatBadge(game.column_key)}</p>
              <p class="truncate text-[10px] ${game.active ? 'text-emerald-400' : 'text-gray-500'}">${game.active ? 'Visible' : 'Masqué'} · ${pollEsc(pollPriceLabel(game.price_cents))}${link ? ` · ${pollEsc(link)}` : ''}</p>
            </div>
            <div class="flex shrink-0 gap-1">
              <button type="button" onclick="movePollGame('${game.id}', -1)" class="px-2 py-1 text-[11px] text-gray-300 hover:text-white" aria-label="Monter">↑</button>
              <button type="button" onclick="movePollGame('${game.id}', 1)" class="px-2 py-1 text-[11px] text-gray-300 hover:text-white" aria-label="Descendre">↓</button>
              <button type="button" onclick="editPollGame('${game.id}')" class="px-2 py-1 bg-amber-500/20 text-amber-300 text-[10px] font-bold rounded-lg">Éditer</button>
              <button type="button" onclick="deletePollGame('${game.id}')" class="px-2 py-1 bg-red-600/20 text-red-300 text-[10px] font-bold rounded-lg">Retirer</button>
            </div>
          </div>`;
      }).join('') || '<p class="text-[11px] text-gray-500">Aucun jeu.</p>'}`;
  }).join('');
}

function renderPollResults() {
  const box = document.getElementById('pollAdminResults');
  if (!box) return;
  const total = pollVotes.length;
  const counts = new Map(pollAdminGames.map((game) => [game.id, 0]));
  pollVotes.forEach((vote) => {
    (vote.nvg_poll_choices || []).forEach((choice) => {
      counts.set(choice.game_id, (counts.get(choice.game_id) || 0) + 1);
    });
  });
  const rows = pollAdminGames.map((game) => ({ ...game, votes: counts.get(game.id) || 0 }));
  const ranking = pollIsDecathlon(pollAdminMode())
    ? POLL_COLUMNS.map((column) => pollRankHtml(rows.filter((row) => pollVoteColumn(row.column_key) === column.key), POLL_COLUMN_PICKS, column.label)).join('')
    : pollRankHtml(rows, POLL_PICKS, 'Classement');
  const voters = pollVotes.map((vote) => {
    const when = new Date(vote.created_at);
    const label = Number.isNaN(when.getTime()) ? '' : when.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const names = (vote.nvg_poll_choices || [])
      .map((choice) => pollAdminGames.find((game) => game.id === choice.game_id)?.title || 'Jeu retiré')
      .sort((a, b) => a.localeCompare(b, 'fr'));
    return `
      <div class="flex flex-wrap items-start justify-between gap-2 border-t border-[#1f293d] py-2">
        <div class="min-w-0">
          <p class="font-bold text-white">${pollEsc(vote.email)}</p>
          <p class="text-[10px] text-gray-500">${pollEsc(label)} · ${pollEsc(names.join(', '))}</p>
        </div>
        <button type="button" onclick="deletePollVote('${vote.id}')" class="px-2 py-1 text-[10px] font-bold text-red-300 hover:text-white">Annuler ce vote</button>
      </div>`;
  }).join('');
  box.innerHTML = `
    <p class="text-sm font-black text-white">${total} vote${total > 1 ? 's' : ''}</p>
    <div class="space-y-4">${total ? ranking : '<p class="text-[11px] text-gray-500">Aucun vote pour le moment.</p>'}</div>
    ${voters ? `<details class="pt-2"><summary class="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-gray-400">Voir les adresses</summary><div class="mt-2">${voters}</div></details>` : ''}`;
}

function fillPollForm(poll) {
  document.getElementById('pollSettingsTitle').value = poll?.title || '';
  document.getElementById('pollSettingsIntro').value = poll?.intro || '';
  document.getElementById('pollSettingsOpen').checked = !!poll?.open;
  const mode = document.getElementById('pollSettingsMode');
  mode.value = poll?.mode === 'decathlon' ? 'decathlon' : 'nine_worlds';
  mode.disabled = !!poll;
  pollHide(document.getElementById('pollSettingsForm'), false);
}

function startPollCreate() {
  pollCreating = true;
  pollAdminId = null;
  pollHide(document.getElementById('pollAdminEditor'), true);
  fillPollForm(null);
  document.getElementById('pollSettingsMode').disabled = false;
  renderPollAdminList();
  document.getElementById('pollSettingsTitle')?.focus();
}

function cancelPollCreate() {
  pollCreating = false;
  const current = pollAdminPolls.find((poll) => poll.id === pollAdminId);
  if (current) fillPollForm(current);
  else pollHide(document.getElementById('pollSettingsForm'), true);
}

function renderPollAdminList() {
  const box = document.getElementById('pollAdminList');
  if (!box) return;
  if (!pollAdminPolls.length) {
    box.innerHTML = '<p class="text-[11px] text-gray-500">Aucun sondage. Crée le premier avec « Nouveau sondage ».</p>';
    return;
  }
  box.innerHTML = pollAdminPolls.map((poll) => `
    <button type="button" onclick="selectPollAdmin('${poll.id}')" class="w-full rounded-xl border px-3 py-2 text-left transition ${poll.id === pollAdminId ? 'border-red-500 bg-red-600/10' : 'border-[#1f293d] bg-[#07090e] hover:border-white/20'}">
      <p class="text-xs font-black text-white">${pollEsc(poll.title)}</p>
      <p class="text-[10px] ${poll.open ? 'text-emerald-400' : 'text-gray-500'}">${pollEsc(pollModeLabel(poll.mode))} · ${poll.open ? 'Ouvert' : 'Fermé'}</p>
    </button>`).join('');
}

async function selectPollAdmin(id) {
  pollCreating = false;
  pollAdminId = id;
  const poll = pollAdminPolls.find((item) => item.id === id);
  fillPollForm(poll);
  pollHide(document.getElementById('pollAdminEditor'), false);
  const title = document.getElementById('pollAdminEditorTitle');
  if (title) title.textContent = poll?.title || 'Jeux';
  await loadPollAdmin();
}

async function savePollSettings(event) {
  event.preventDefault();
  const db = pollDb();
  if (!db) return;
  const payload = {
    title: document.getElementById('pollSettingsTitle').value.trim(),
    intro: document.getElementById('pollSettingsIntro').value.trim(),
    open: !!document.getElementById('pollSettingsOpen').checked
  };
  if (!payload.title) {
    pollNotify('Indique un titre.', true);
    return;
  }
  let error;
  let created = null;
  if (pollCreating || !pollAdminId) {
    payload.mode = document.getElementById('pollSettingsMode').value === 'decathlon' ? 'decathlon' : 'nine_worlds';
    const inserted = await db.from('nvg_polls').insert(payload).select('id').single();
    error = inserted.error;
    created = inserted.data;
  } else {
    ({ error } = await db.from('nvg_polls').update(payload).eq('id', pollAdminId));
  }
  if (error) {
    pollNotify(pollErrorCode(error) === 'missing' ? pollMessage('missing') : 'Le sondage n’a pas pu être enregistré.', true);
    return;
  }
  pollCreating = false;
  if (created?.id) pollAdminId = created.id;
  pollNotify(payload.open ? 'Le vote est ouvert.' : 'Sondage enregistré.');
  await loadPollAdmin();
}

async function deletePoll() {
  const poll = pollAdminPolls.find((item) => item.id === pollAdminId);
  if (!poll || !window.confirm(`Supprimer le sondage « ${poll.title} » et tous ses votes ?`)) return;
  const db = pollDb();
  const votes = await db.from('nvg_poll_votes').delete().eq('poll_id', pollAdminId);
  if (votes.error) {
    pollNotify('Le sondage n’a pas pu être supprimé.', true);
    return;
  }
  const games = await db.from('nvg_poll_games').delete().eq('poll_id', pollAdminId);
  if (games.error) {
    pollNotify('Les jeux n’ont pas pu être retirés.', true);
    return;
  }
  const { error } = await db.from('nvg_polls').delete().eq('id', pollAdminId);
  if (error) {
    pollNotify('Le sondage n’a pas pu être supprimé.', true);
    return;
  }
  pollAdminId = null;
  pollHide(document.getElementById('pollAdminEditor'), true);
  pollHide(document.getElementById('pollSettingsForm'), true);
  pollNotify('Sondage supprimé.');
  await loadPollAdmin();
}

async function deletePollVote(id) {
  if (!window.confirm('Annuler ce vote ? La personne pourra revoter avec la même adresse.')) return;
  const db = pollDb();
  const { error } = await db.from('nvg_poll_votes').delete().eq('id', id);
  if (error) {
    pollNotify('Le vote n’a pas pu être annulé.', true);
    return;
  }
  pollNotify('Vote annulé.');
  await loadPollAdmin();
}

async function loadPollAdmin() {
  const db = pollDb();
  const list = document.getElementById('pollAdminList');
  if (!db || !list) return;
  const { data, error } = await db.from('nvg_polls').select('id,title,intro,mode,open,created_at').order('created_at', { ascending: false });
  if (pollErrorCode(error) === 'missing') {
    list.innerHTML = `<p class="text-xs text-red-300">${pollEsc(pollMessage('missing'))}</p>`;
    return;
  }
  if (error) {
    list.innerHTML = '<p class="text-xs text-red-300">Impossible de charger les sondages.</p>';
    return;
  }
  pollAdminPolls = data || [];
  if (pollAdminId && !pollAdminPolls.some((poll) => poll.id === pollAdminId)) pollAdminId = null;
  renderPollAdminList();
  if (!pollAdminId) {
    pollAdminGames = [];
    pollVotes = [];
    return;
  }
  const current = pollAdminPolls.find((poll) => poll.id === pollAdminId);
  if (!pollCreating) fillPollForm(current);
  pollHide(document.getElementById('pollAdminEditor'), false);
  const [games, votes] = await Promise.all([
    db.from('nvg_poll_games').select('id,title,link,image_url,column_key,position,price_cents,active').eq('poll_id', pollAdminId).order('position').order('title'),
    db.from('nvg_poll_votes').select('id,email,created_at,nvg_poll_choices(game_id)').eq('poll_id', pollAdminId).order('created_at', { ascending: false })
  ]);
  pollAdminGames = games.data || [];
  pollVotes = votes.error ? [] : (votes.data || []);
  renderPollAdminGames();
  if (votes.error) {
    const box = document.getElementById('pollAdminResults');
    if (box) box.textContent = 'Les résultats sont réservés aux admins connectés.';
    return;
  }
  renderPollResults();
}

function copyPollLink() {
  if (!pollAdminId) return;
  const url = `${window.location.origin}${window.location.pathname}?tab=vote&poll=${pollAdminId}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => pollNotify('Lien du vote copié.')).catch(() => pollNotify(url));
    return;
  }
  pollNotify(url);
}

document.getElementById('pollForm')?.addEventListener('submit', submitPollVote);
document.getElementById('pollSettingsForm')?.addEventListener('submit', savePollSettings);
document.getElementById('pollGameForm')?.addEventListener('submit', savePollGame);
