// Tournoi des 9 Mondes — espace public et membre.
// Comptes NVG (Supabase), inscriptions solo ou en équipe.
// Les créations d'équipe, jointures par code et inscriptions passent par des
// fonctions SECURITY DEFINER : le navigateur ne décide jamais des règles.

const SUPABASE_URL = 'https://fxewefwwpowhnacrxfdp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZXdlZnd3cG93aG5hY3J4ZmRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxOTQ5NTksImV4cCI6MjEwODc3MDk1OX0.nDlHFbpzBipH3Po61OkzNdAfPnCRaCNOwa1aN6ap8qk';
const TOURNAMENT_SITE_URL = 'https://letournoides9mondes.nvg-tv.com';

const supabaseClient = window.NVG_SHARED_AUTH_STORAGE
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: window.NVG_SHARED_AUTH_STORAGE } })
  : supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

let currentUser = null;
let isAdmin = false;
let games = [];
let tournaments = [];
let publicRegs = [];
let publicTeams = [];
let tournamentMatches = [];
let myTeams = [];
let myRegistrations = [];
let myParticipations = [];
let manageTournamentId = null;
let adminRegs = [];
let adminPlayers = [];
let editingPlayerId = null;
let profileIdentity = { first_name: '', last_name: '', birth_date: '' };
let pendingJoinCode = null;
let editingTournamentId = null;
let editingGameId = null;
let viewingTournamentId = null;
let viewingTeamsTournamentId = null;
let adminTeams = [];
let adminEventPlayers = [];
let viewingMatchTournamentId = null;

const STATUS_LABELS = {
  draft: 'Brouillon',
  open: 'Inscriptions ouvertes',
  closed: 'Inscriptions fermées',
  running: 'En cours',
  finished: 'Terminé',
  cancelled: 'Annulé'
};
const STATUS_STYLES = {
  draft: 'bg-white/5 text-gray-400 border-[#1f293d]',
  open: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  closed: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  running: 'bg-red-600/15 text-red-400 border-red-600/30',
  finished: 'bg-white/5 text-gray-400 border-[#1f293d]',
  cancelled: 'bg-white/5 text-gray-500 border-[#1f293d]'
};
const FORMAT_LABELS = { online: 'En ligne', lan: 'LAN', both: 'En ligne et LAN' };
const REG_LABELS = { pending: 'En attente', confirmed: 'Confirmée', waitlist: "Liste d'attente", cancelled: 'Annulée' };
const PAYMENT_LABELS = {
  not_required: 'Inscription gratuite',
  awaiting: 'En attente de paiement',
  paid: 'Participation validée',
  refunded: 'Remboursement effectué'
};
const PAYMENT_STYLES = {
  not_required: 'text-gray-400 border-[#1f293d] bg-white/5',
  awaiting: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  paid: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  refunded: 'text-sky-400 border-sky-500/30 bg-sky-500/10'
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function notify(message, isError = false) {
  let toast = $('nvgToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nvgToast';
    toast.className = 'fixed bottom-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl text-xs font-bold shadow-2xl border transition';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `fixed bottom-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl text-xs font-bold shadow-2xl border transition ${
    isError ? 'bg-red-950 border-red-600/50 text-red-200' : 'bg-[#121722] border-emerald-500/40 text-emerald-300'
  }`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.remove(), 5000);
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function friendlyAuthError(message) {
  const m = String(message || '');
  if (m.includes('Invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('Email not confirmed')) return 'Confirme d’abord ton adresse e-mail (vérifie ta boîte de réception).';
  if (m.includes('User already registered')) return 'Un compte existe déjà avec cette adresse.';
  if (m.includes('Password should be at least')) return 'Le mot de passe est trop court.';
  if (m.toLowerCase().includes('rate limit') || m.includes('Too many requests')) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  return m;
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'tournoi';
}

function gameName(id) {
  return games.find((g) => g.id === id)?.name || 'Jeu libre';
}

function gameLogo(id) {
  return safeUrl(gameById(id)?.logo_url);
}

function gameBanner(id) {
  return safeUrl(gameById(id)?.banner_url);
}

function gameById(id) {
  return games.find((g) => g.id === id) || null;
}

// Nombre de joueurs par équipe rattaché au jeu (null = non précisé).
function gameTeamSize(id) {
  const size = Number(gameById(id)?.team_size) || 0;
  return size >= 1 && size <= 6 ? size : 0;
}

// Libellé court du mode de score d'un jeu. `none` = mode non précisé.
function gameScoringLabel(mode) {
  if (mode === 'cumulative') return 'cumul';
  if (mode === 'wins') return 'victoires';
  if (mode === 'none') return 'aucun';
  if (mode === 'bo3') return 'BO3 2v2';
  return 'confrontation';
}

// Un jeu « BO3 2v2 » se joue toujours à deux joueurs par équipe.
function syncGameModeHints() {
  if ($('gameScoringMode')?.value === 'bo3' && $('gameTeamSize')) {
    if (Number($('gameTeamSize').value) !== 2) $('gameTeamSize').value = '2';
  }
}

function gameOptionLabel(game) {
  const size = Number(game?.team_size) || 0;
  const bits = [];
  if (size) bits.push(size === 1 ? 'solo' : `${size} joueurs`);
  bits.push(gameScoringLabel(game?.scoring_mode));
  return `${game.name} — ${bits.join(' · ')}`;
}

function applyGameTeamSize() {
  if ($('tourFormatType')?.value === 'bo9') return;
  const gameId = $('tourGame')?.value;
  const hint = $('tourTeamSizeHint');
  if (!gameId) {
    if (hint) hint.textContent = '';
    return;
  }
  // Jeu 1v1 en victoires (ex. Hearthstone) : une équipe de 5 joue 5 duels.
  const size = gameById(gameId)?.scoring_mode === 'wins' && gameTeamSize(gameId) === 1 ? 5 : gameTeamSize(gameId);
  const select = $('tourTeamSize');
  if (size && select) select.value = String(size);
  if (hint) {
    hint.textContent = size
      ? `Format du jeu : ${size === 1 ? 'solo' : `${size} joueurs par équipe`}`
      : 'Le format du jeu n’est pas précisé.';
  }
}

// ---------------------------------------------------------------------------
// Format BO9 « Multigaming Esport »
// ---------------------------------------------------------------------------
// 9 jeux en trois catégories. Chaque catégorie vaut 9 points (ou 15 en All-In) :
//   collectif 5v5    : 1 unité × 3 pts   (All-In × 5)
//   escarmouche 2v2  : 2 unités × 1,5 pt (All-In × 2,5)
//   duel 1v1         : 5 unités × 0,6 pt (All-In × 1)
// Total : 27 points en classique, 45 en All-In. La majorité gagne.

const BO9_CATEGORIES = [
  { key: 'collectif', label: 'Collectif 5v5', short: 'Collectif', icon: '🛡️', tone: 'text-amber-400' },
  { key: 'escarmouche', label: 'Escarmouche 2v2 / 3v3', short: 'Escarmouche', icon: '🎯', tone: 'text-emerald-400' },
  { key: 'duel', label: 'Duel 1v1', short: 'Duel', icon: '⚔️', tone: 'text-sky-400' }
];

const BO9_UNITS = { collectif: 1, escarmouche: 2, duel: 5 };
const BO9_POINTS = {
  classic: { collectif: 3, escarmouche: 1.5, duel: 0.6 },
  allin: { collectif: 5, escarmouche: 2.5, duel: 1 }
};

function bo9Config(t) {
  const cfg = t?.format_config;
  return cfg && cfg.type === 'bo9' && Array.isArray(cfg.games) && cfg.games.length === 9 ? cfg : null;
}

function isBo9(t) {
  return Boolean(bo9Config(t));
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatPoints(value) {
  return round2(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function bo9Slot(cfg, slotNumber) {
  return (cfg?.games || []).find((g) => Number(g.slot) === Number(slotNumber)) || null;
}

// Escarmouche 2v2 : deux BO1 de binômes (A1/A2 vs B1/B2, puis A3/A4 vs B3/B4),
// le 5e joueur au repos. Si chaque équipe gagne un BO1, les deux binômes
// vainqueurs jouent une finale 2v2 — un joueur peut être remplacé par le 5e.
// Le vainqueur de la finale remporte le jeu et la totalité de ses points.
function bo9SlotPairMode(slot) {
  if (!slot || slot.scoring === 'cumulative' || slot.scoring === 'wins') return false;
  if (typeof slot.pair_mode === 'boolean') return slot.pair_mode;
  return gameTeamSize(slot.game_id) === 2;
}

// Départage 2v2 : BO1 simple par défaut, BO3 (premier à 2 manches) quand le jeu
// est réglé sur le mode de score « BO3 2v2 ».
function bo9SlotPairBo3(slot) {
  return bo9SlotPairMode(slot) && (slot.pair_format === 'bo3' || slot.scoring === 'bo3');
}

// Nombre de duels individuels d'un slot : c'est le nombre d'unités de la
// catégorie (duel 1v1 = 5, escarmouche = 2, collectif = 1). Un jeu « victoires »
// se joue sur ce nombre de 1v1, un jeu en cumul additionne ce nombre de joueurs
// par équipe (ex. 5v5 Trackmania = 10 joueurs au total).
function bo9DuelCount(slot) {
  return Math.max(1, Number(slot?.units) || 1);
}

function bo9PairDeciderScore(game) {
  if (game?.final_a == null || game?.final_b == null) return null;
  const a = Number(game.final_a);
  const b = Number(game.final_b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b };
}

function bo9PairWins(game) {
  const p1 = game?.pair1 === 'a' || game?.pair1 === 'b' ? game.pair1 : '';
  const p2 = game?.pair2 === 'a' || game?.pair2 === 'b' ? game.pair2 : '';
  if (!p1 || !p2) return { a: 0, b: 0, split: false, winner: null };
  const split = p1 !== p2;
  const final = game?.final === 'a' || game?.final === 'b' ? game.final : '';
  const a = (p1 === 'a' ? 1 : 0) + (p2 === 'a' ? 1 : 0) + (split && final === 'a' ? 1 : 0);
  const b = (p1 === 'b' ? 1 : 0) + (p2 === 'b' ? 1 : 0) + (split && final === 'b' ? 1 : 0);
  return { a, b, split, winner: a > b ? 'a' : b > a ? 'b' : null };
}

function bo9TotalPoints(cfg) {
  return round2((cfg?.games || []).reduce((sum, g) => sum + Number(g.units) * Number(g.points_per_unit), 0));
}

function bo9MercyThreshold(cfg) {
  return Math.floor(bo9TotalPoints(cfg) / 2) + 1;
}

function bo9CategoryTotal(cfg, category) {
  return round2((cfg?.games || [])
    .filter((g) => g.category === category)
    .reduce((sum, g) => sum + Number(g.units) * Number(g.points_per_unit), 0));
}

function bo9PointsModeLabel(cfg) {
  return cfg?.points_mode === 'allin' ? 'All-In' : 'Classique';
}

function bo9GameLabel(cfg, slotNumber) {
  const slot = bo9Slot(cfg, slotNumber);
  return slot ? gameName(slot.game_id) : 'Jeu';
}

// Points d'un match : unités gagnées par jeu × barème, carte capitaine doublée.
function bo9MatchTotals(match, cfg) {
  const cards = match?.captain_card || {};
  let a = 0;
  let b = 0;
  (Array.isArray(match?.games) ? match.games : []).forEach((g) => {
    const slot = bo9Slot(cfg, g.slot);
    if (!slot) return;
    if (slot.scoring === 'cumulative') {
      // Jeu en cumul (ex. Trackmania en time attack) : le total de points de
      // chaque équipe désigne le vainqueur du jeu. Égalité = points partagés.
      const value = (Number(slot.units) || 0) * (Number(slot.points_per_unit) || 0);
      const rawA = Number(g.points_raw_a) || 0;
      const rawB = Number(g.points_raw_b) || 0;
      if (rawA > rawB) a += value;
      else if (rawB > rawA) b += value;
      else { a += value / 2; b += value / 2; }
      return;
    }
    if (slot.scoring === 'wins') {
      // Victoires individuelles (ex. Hearthstone) : chaque joueur affronte son
      // homologue en 1v1 ; l'équipe qui gagne le plus de duels remporte le jeu.
      const value = (Number(slot.units) || 0) * (Number(slot.points_per_unit) || 0);
      const winsA = Number(g.wins_a) || 0;
      const winsB = Number(g.wins_b) || 0;
      if (winsA > winsB) a += value;
      else if (winsB > winsA) b += value;
      else { a += value / 2; b += value / 2; }
      return;
    }
    if (bo9SlotPairMode(slot) && (g.pair1 || g.pair2)) {
      // 2v2 : deux BO1 de binômes puis finale si 1–1. Le vainqueur du jeu
      // empoche tous les points du slot (pas de partage).
      const value = (Number(slot.units) || 0) * (Number(slot.points_per_unit) || 0);
      const pair = bo9PairWins(g);
      if (pair.winner === 'a') a += value;
      else if (pair.winner === 'b') b += value;
      return;
    }
    const max = Number(slot.units) || 0;
    const unitsA = Math.max(0, Math.min(max, Number(g.units_a) || 0));
    const unitsB = Math.max(0, Math.min(max, Number(g.units_b) || 0));
    const per = Number(slot.points_per_unit) || 0;
    let pointsA = unitsA * per;
    let pointsB = unitsB * per;
    if (Number(cards.a) === Number(g.slot)) pointsA *= 2;
    if (Number(cards.b) === Number(g.slot)) pointsB *= 2;
    a += pointsA;
    b += pointsB;
  });
  return { a: round2(a), b: round2(b) };
}

// Libellé d'un tournoi : jeu unique ou « 9 jeux · Décathlon Esport ».
function tournamentGamesLabel(t) {
  const cfg = bo9Config(t);
  if (cfg) return `9 jeux · Multigaming Esport`;
  return gameName(t.game_id);
}

function bo9FirstGameId(t) {
  return bo9Config(t)?.games?.[0]?.game_id || null;
}

function tournamentBannerUrl(t) {
  return safeUrl(t.banner_url) || gameBanner(t.game_id) || gameBanner(bo9FirstGameId(t));
}

// Le logo propre à l'événement remplace celui du jeu.
function tournamentLogoUrl(t) {
  return safeUrl(t.logo_url) || gameLogo(t.game_id) || gameLogo(bo9FirstGameId(t));
}


function safeUrl(value) {
  const raw = String(value ?? '').trim();
  return /^https?:\/\/\S+$/i.test(raw) ? raw : '';
}

function externalLink(value) {
  const url = safeUrl(value);
  if (!url) return '';
  return escapeHtml(url);
}

// Un lien Toornament contient l'identifiant du tournoi ; on le stocke pour la
// future synchronisation API sans dépendre du format de l'URL publique.
function toornamentIdFromUrl(value) {
  const url = safeUrl(value);
  if (!url) return null;
  const match = url.match(/toornament\.com\/[^/]*\/?tournaments\/(\d+)/i) || url.match(/toornament\.com\/tournaments\/(\d+)/i);
  return match ? match[1] : null;
}

function tournamentById(id) {
  return tournaments.find((t) => t.id === id);
}

function inviteUrl(code) {
  return `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(code)}`;
}

// --- Navigation ---

const TAB_NAMES = ['home', 'tournaments', 'account', 'admin'];
const ADMIN_PANES = ['players', 'games', 'create', 'manage'];
const ACCOUNT_PANES = ['info', 'teams', 'registrations'];
let adminPane = 'manage';
let accountPane = 'info';

function routeState() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  const admin = params.get('admin');
  const account = params.get('account');
  return {
    tab: TAB_NAMES.includes(tab) ? tab : 'home',
    tournament: params.get('tournament') || null,
    admin: ADMIN_PANES.includes(admin) ? admin : null,
    account: ACCOUNT_PANES.includes(account) ? account : null
  };
}

function openAccountPane(name, options = {}) {
  if (!ACCOUNT_PANES.includes(name)) name = 'info';
  accountPane = name;
  document.querySelectorAll('.account-pane').forEach((el) => {
    el.classList.toggle('hidden', el.id !== `accountPane-${name}`);
  });
  document.querySelectorAll('#accountNav .admin-nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.accountPane === name);
  });
  if (options.push !== false) {
    const url = routeUrl('account', { account: name });
    if (currentUrl() !== url) {
      window.history.pushState({ tab: 'account', account: name }, document.title, url);
    }
  }
}

function accountUrl(pane = 'info') {
  return routeUrl('account', { account: pane });
}

function goAccount(pane = 'info') {
  openTab('account', { push: false });
  openAccountPane(pane);
  // Garantit une URL complète (?tab=account&account=…) même si l'onglet était déjà ouvert.
  const url = accountUrl(pane);
  if (currentUrl() !== url) {
    window.history.pushState({ tab: 'account', account: pane }, document.title, url);
  }
}

function openAdminPane(name, options = {}) {
  if (!ADMIN_PANES.includes(name)) name = 'manage';
  adminPane = name;
  document.querySelectorAll('.admin-pane').forEach((el) => {
    el.classList.toggle('hidden', el.id !== `adminPane-${name}`);
  });
  document.querySelectorAll('.admin-nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.adminPane === name);
  });
  if (name === 'players') renderAdminPlayers();
  if (name === 'manage') renderAdminTournaments();
  if (options.push !== false) {
    const url = routeUrl('admin', { admin: name });
    if (currentUrl() !== url) {
      window.history.pushState({ tab: 'admin', admin: name }, document.title, url);
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function routeUrl(tab, extra = {}) {
  const params = new URLSearchParams();
  if (tab && tab !== 'home') params.set('tab', tab);
  Object.entries(extra).forEach(([key, value]) => { if (value) params.set(key, value); });
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}`;
}

function currentUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

function pushRoute(tab, extra = {}) {
  const url = routeUrl(tab, extra);
  if (currentUrl() === url) return;
  window.history.pushState({ tab, ...extra }, document.title, url);
}

function openTab(name, options = {}) {
  const { push = true, replace = false } = options;
  if (name === 'admin' && !isAdmin) name = 'home';
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.add('hidden'));
  const section = $(`tab-${name}`);
  if (section) section.classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === name));
  if (push || replace) {
    const url = routeUrl(name);
    if (replace) {
      window.history.replaceState({ tab: name }, document.title, url);
    } else if (currentUrl() !== url) {
      window.history.pushState({ tab: name }, document.title, url);
    }
  }
  if (name === 'tournaments' || name === 'home') loadPublic();
  if (name === 'account') {
    openAccountPane(routeState().account || accountPane, { push: false });
    refreshAccount();
  }
  if (name === 'admin') {
    openAdminPane(routeState().admin || adminPane, { push: false });
    loadAdmin();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Applique l'URL courante (retour/avant du navigateur, lien direct).
function applyRoute() {
  const { tab, tournament } = routeState();
  openTab(tab, { push: false });
  if (tournament) {
    openTournamentDetails(tournament, { push: false });
  } else {
    closeTournamentDetails({ push: false });
  }
}

// --- Données publiques ---

async function loadPublic() {
  const [g, t, regs, teams, matches] = await Promise.all([
    supabaseClient.from('nvg_tournament_games').select('*').order('name'),
    supabaseClient.from('nvg_tournaments').select('*').order('starts_at', { ascending: true, nullsFirst: false }),
    supabaseClient.from('nvg_tournament_registrations_public').select('tournament_id,status'),
    supabaseClient.from('nvg_tournament_teams_public').select('id,tournament_id,name,tag,member_count'),
    supabaseClient.from('nvg_tournament_matches').select('*').order('created_at', { ascending: true })
  ]);
  games = g.data || [];
  tournaments = t.data || [];
  publicRegs = regs.data || [];
  publicTeams = teams.data || [];
  tournamentMatches = matches.data || [];
  renderTournaments();
  renderHomeTournaments();
  renderCalendar();
  if (isAdmin) renderAdminGames();
}

function renderCalendar() {
  const box = $('calendarList');
  if (!box) return;
  const dated = tournaments
    .filter((t) => t.starts_at || t.registration_closes_at)
    .sort((a, b) => new Date(a.starts_at || a.registration_closes_at) - new Date(b.starts_at || b.registration_closes_at));
  if (!dated.length) {
    box.innerHTML = '<p class="text-xs text-gray-500">Le calendrier sera publié avec les premiers tournois.</p>';
    return;
  }
  box.innerHTML = dated.map((t) => `
    <div class="flex flex-wrap items-center justify-between gap-2 border border-[#1f293d] rounded-xl px-4 py-2.5 bg-[#07090e]">
      <div class="min-w-0">
        <p class="text-xs font-bold text-white truncate">${escapeHtml(t.name)}</p>
        <p class="text-[10px] text-gray-400">${escapeHtml(tournamentGamesLabel(t))} · ${escapeHtml(FORMAT_LABELS[t.format] || t.format)}</p>
      </div>
      <div class="text-right shrink-0">
        <p class="text-[11px] font-bold ${t.status === 'open' ? 'text-emerald-400' : 'text-gray-300'}">${t.starts_at ? `🏁 ${escapeHtml(formatDate(t.starts_at))}` : '📅 Date à confirmer'}</p>
        ${t.registration_closes_at ? `<p class="text-[10px] text-gray-500">Inscriptions jusqu'au ${escapeHtml(formatDate(t.registration_closes_at))}</p>` : ''}
      </div>
    </div>`).join('');
}

function registeredCount(tournamentId) {
  return publicRegs.filter((r) => r.tournament_id === tournamentId).length;
}

function isRegistered(tournamentId) {
  return myRegistrations.some((r) => r.tournament_id === tournamentId && r.status !== 'cancelled');
}

function formatDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dateRange(t) {
  if (t.starts_at && t.ends_at) return `${formatDay(t.starts_at)} – ${formatDay(t.ends_at)}`;
  if (t.starts_at) return formatDay(t.starts_at);
  return 'Dates à confirmer';
}

function modeLabel(t) {
  if (t.mode === 'solo') return 'Joueur (solo)';
  const min = Number(t.team_min) || 1;
  const max = Number(t.team_max) || min;
  if (min === max) return min === 1 ? 'Joueur (solo)' : `Équipe (${min} joueurs)`;
  return `Équipe (${min}–${max} joueurs)`;
}

function formatFee(cents) {
  const value = Number(cents) || 0;
  if (value <= 0) return 'Gratuit';
  return (value / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function eurosToCents(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return 0;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function feeLabel(t) {
  const fee = Number(t?.entry_fee_cents) || 0;
  return fee > 0 ? `Inscription : ${formatFee(fee)}` : 'Inscription gratuite';
}

function paymentBadge(status) {
  const key = status || 'not_required';
  return `<span class="rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${PAYMENT_STYLES[key] || PAYMENT_STYLES.not_required}">${escapeHtml(PAYMENT_LABELS[key] || key)}</span>`;
}

// Le paiement n'est possible que tant que les inscriptions sont ouvertes.
function paymentOpen(t) {
  return t?.status === 'open';
}

function paymentClosedNote() {
  return '<p class="text-[10px] text-gray-400">Paiement clôturé : contacte l’organisation pour toute modification ou remboursement.</p>';
}

function registrationPaymentBlock(reg) {
  const status = reg.payment_status || 'not_required';
  const fee = Number(reg.nvg_tournaments?.entry_fee_cents) || 0;
  if (status !== 'awaiting') return '';
  if (!paymentOpen(reg.nvg_tournaments)) {
    return `<div class="flex flex-col items-start gap-1">
      <span class="text-[10px] font-bold text-amber-400">⏳ ${fee > 0 ? `${escapeHtml(formatFee(fee))} à régler` : 'Paiement en attente'}</span>
      ${paymentClosedNote()}
    </div>`;
  }
  return `<div class="flex flex-col items-start gap-1">
      <span class="text-[10px] font-bold text-amber-400">⏳ ${fee > 0 ? `${escapeHtml(formatFee(fee))} à régler` : 'Paiement en attente'}</span>
      <button onclick="payRegistration('${reg.id}')" class="rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-black text-black transition hover:bg-amber-400">Régler mon inscription</button>
    </div>`;
}

function payRegistration(registrationId) {
  const reg = myRegistrations.find((r) => r.id === registrationId);
  if (!reg) return;
  const t = reg.nvg_tournaments || {};
  if (!paymentOpen(t)) {
    notify('Paiement clôturé : contacte l’organisation pour toute modification ou remboursement.', true);
    return;
  }
  const url = externalLink(t.payment_url);
  if (url) {
    window.open(url, '_blank', 'noopener');
    notify('Page de règlement ouverte dans un nouvel onglet.');
    return;
  }
  const instructions = String(t.payment_instructions || '').trim();
  notify(instructions
    ? `Paiement : ${instructions}`
    : 'Aucun lien de règlement pour ce tournoi. Contacte la NVG pour payer ton inscription.');
}

function tournamentBanner(t) {
  const banner = tournamentBannerUrl(t);
  const toornament = externalLink(t.toornament_url);
  return `
    <div class="relative h-32 sm:h-36 overflow-hidden bg-[#07090e]">
      <div class="absolute inset-0 opacity-70" style="background-image:url('./Logos/fond-app.svg');background-repeat:repeat;background-size:130px"></div>
      <div class="absolute inset-0 bg-gradient-to-br from-red-950/70 via-[#121722]/80 to-[#0b0f17]/90"></div>
      ${banner
        ? `<img src="${banner}" alt="" loading="lazy" onerror="this.remove()" class="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105">`
        : `<p class="absolute inset-0 flex items-center justify-center px-8 text-center text-lg sm:text-xl font-black uppercase tracking-[0.22em] text-white/15">${escapeHtml(tournamentGamesLabel(t))}</p>`}
      <div class="absolute inset-0 bg-gradient-to-t from-[#121722] via-[#121722]/30 to-transparent"></div>
      <span class="absolute left-3 top-3 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wider backdrop-blur ${STATUS_STYLES[t.status] || STATUS_STYLES.draft}">${escapeHtml(STATUS_LABELS[t.status] || t.status)}</span>
      ${toornament ? `<a href="${toornament}" target="_blank" rel="noopener" title="Page officielle du tournoi sur Toornament" class="absolute right-3 top-3 rounded-md border border-white/20 bg-black/60 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/90 backdrop-blur transition hover:border-amber-400/70 hover:text-amber-300">Toornament</a>` : ''}
    </div>`;
}

function hasPrizes(t) {
  return Boolean(t.prize_first || t.prize_second || t.prize_third || t.prize);
}

function trophyIcon(cls = 'h-4 w-4') {
  return `<svg viewBox="0 0 24 24" fill="currentColor" class="${cls}" aria-hidden="true"><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/><path d="M4 3h2v4H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm16 0h-2v4h2a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1Z" opacity=".65"/><path d="M11 14h2v3h3.2a.8.8 0 0 1 .8.8V21H7v-3.2a.8.8 0 0 1 .8-.8H11v-3Z"/></svg>`;
}

function prizeRows(t) {
  const rows = [
    { place: '1re place', value: t.prize_first || t.prize, tone: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
    { place: '2e place', value: t.prize_second, tone: 'text-slate-200 border-white/25 bg-white/5' },
    { place: '3e place', value: t.prize_third, tone: 'text-orange-300 border-orange-500/30 bg-orange-500/10' }
  ];
  return rows.map((r) => `
    <div class="flex items-center gap-3 rounded-xl border px-3 py-2.5 ${r.tone}">
      <span class="shrink-0">${trophyIcon('h-5 w-5')}</span>
      <div class="min-w-0">
        <p class="text-[9px] font-black uppercase tracking-wider opacity-80">${r.place}</p>
        <p class="text-xs font-bold ${r.value ? 'text-white' : 'text-gray-500'}">${escapeHtml(r.value || 'À confirmer')}</p>
      </div>
    </div>`).join('');
}

function closeTournamentDetails(options = {}) {
  const modal = $('tournamentModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  document.body.classList.remove('overflow-hidden');
  if (options.push === false) return;
  if (!routeState().tournament) return;
  if (window.history.state && window.history.state.tournament) {
    window.history.back();
  } else {
    window.history.replaceState({ tab: routeState().tab }, document.title, routeUrl(routeState().tab));
  }
}

function signupFromDetails(id) {
  closeTournamentDetails();
  openTab('tournaments');
  openSignup(id);
}

function openTournamentDetails(id, options = {}) {
  const t = tournamentById(id);
  if (!t) return;
  if (options.push !== false) pushRoute(routeState().tab, { tournament: id });
  const banner = tournamentBannerUrl(t);
  const logo = tournamentLogoUrl(t);
  const initials = escapeHtml((gameById(t.game_id)?.name || t.name || '?').slice(0, 2).toUpperCase());
  const toornament = externalLink(t.toornament_url);
  const count = registeredCount(t.id);
  const unit = t.mode === 'team' ? 'équipe(s)' : 'joueur(s)';
  const places = t.max_participants ? `${count} / ${t.max_participants} ${unit}` : `${count} ${unit}`;
  const open = t.status === 'open';
  const already = isRegistered(t.id);
  const myTeam = t.mode === 'team' ? myTeams.find((team) => team.tournament_id === t.id) : null;

  $('tournamentModalBody').innerHTML = `
    <div class="relative h-40 sm:h-52 overflow-hidden bg-[#07090e]">
      <div class="absolute inset-0 opacity-60" style="background-image:url('./Logos/fond-app.svg');background-repeat:repeat;background-size:140px"></div>
      <div class="absolute inset-0 bg-gradient-to-br from-red-950/70 via-[#121722]/80 to-[#0b0f17]/90"></div>
      ${banner
        ? `<img src="${banner}" alt="" onerror="this.remove()" class="absolute inset-0 h-full w-full object-cover">`
        : `<p class="absolute inset-0 flex items-center justify-center px-8 text-center text-xl font-black uppercase tracking-[0.22em] text-white/15">${escapeHtml(tournamentGamesLabel(t))}</p>`}
      <div class="absolute inset-0 bg-gradient-to-t from-[#0b0f17] via-[#0b0f17]/40 to-transparent"></div>
      <button onclick="closeTournamentDetails()" class="absolute right-3 top-3 h-8 w-8 rounded-lg border border-white/20 bg-black/60 text-sm font-bold text-white/90 backdrop-blur transition hover:border-amber-400/70 hover:text-amber-300" aria-label="Fermer">✕</button>
      <span class="absolute left-3 top-3 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wider backdrop-blur ${STATUS_STYLES[t.status] || STATUS_STYLES.draft}">${escapeHtml(STATUS_LABELS[t.status] || t.status)}</span>
    </div>
    <div class="space-y-5 p-5">
      <div class="flex items-start gap-3">
        <div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
          ${logo
            ? `<img src="${logo}" alt="" onerror="this.remove()" class="h-full w-full object-contain p-1.5">`
            : `<span class="text-base font-black text-gray-400">${initials}</span>`}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-[10px] font-black uppercase tracking-[0.18em] text-amber-400/80">${escapeHtml(tournamentGamesLabel(t))}</p>
          <h2 class="mt-1 text-xl font-black leading-snug text-white">${escapeHtml(t.name)}</h2>
          <p class="mt-1 text-xs text-gray-400">${escapeHtml(dateRange(t))}</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded border border-[#2a3750] px-2 py-1 text-[10px] font-bold text-gray-300">${escapeHtml(modeLabel(t))}</span>
        <span class="rounded border border-[#2a3750] px-2 py-1 text-[10px] font-bold text-gray-300">${escapeHtml(FORMAT_LABELS[t.format] || t.format)}</span>
        <span class="rounded border px-2 py-1 text-[10px] font-bold ${Number(t.entry_fee_cents) > 0 ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-[#2a3750] text-gray-400'}">${escapeHtml(feeLabel(t))}</span>
        <span class="rounded border border-[#2a3750] px-2 py-1 text-[10px] font-bold text-gray-300">👥 ${escapeHtml(places)}</span>
      </div>

      ${t.description ? `<p class="whitespace-pre-line text-xs leading-relaxed text-gray-300">${escapeHtml(t.description)}</p>` : ''}

      ${bo9FormatBlock(t)}
      ${bo9CompetitionBlock(t)}
      ${isStandard(t) ? standardCompetitionBlock(t) : ''}

      <div>
        <h3 class="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white">${trophyIcon('h-4 w-4 text-amber-400')} Récompenses</h3>
        <div class="grid gap-2 sm:grid-cols-3">${prizeRows(t)}</div>
      </div>

      ${t.rules ? `<div><h3 class="mb-1 text-xs font-black uppercase tracking-wider text-white">Règlement</h3><p class="whitespace-pre-line text-[11px] leading-relaxed text-gray-400">${escapeHtml(t.rules)}</p></div>` : ''}

      ${Number(t.entry_fee_cents) > 0 ? `
        <div class="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
          <p class="text-[10px] font-black uppercase tracking-wider text-amber-400">Inscription : ${escapeHtml(formatFee(t.entry_fee_cents))}</p>
          ${t.payment_instructions ? `<p class="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-gray-300">${escapeHtml(t.payment_instructions)}</p>` : ''}
          ${!paymentOpen(t) ? `<div class="mt-2">${paymentClosedNote()}</div>` : externalLink(t.payment_url) ? `<a href="${externalLink(t.payment_url)}" target="_blank" rel="noopener" class="mt-2 inline-block rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-black text-black transition hover:bg-amber-400">Régler mon inscription</a>` : ''}
        </div>` : ''}

      <div class="flex flex-wrap items-center gap-2 border-t border-[#1f293d] pt-4">
        ${currentUser && (already || myTeam || (t.mode === 'team' && open) || myParticipations.some((p) => p.tournament_id === t.id))
          ? `<div class="flex flex-wrap items-center gap-2">
              ${already ? '<span class="px-2 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wider rounded-lg">✅ Inscrit</span>' : ''}
              <button onclick="closeTournamentDetails({ push: false });openManage('${t.id}')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-lg transition">⚙️ Gérer ma participation</button>
            </div>`
          : open
            ? `<button onclick="signupFromDetails('${t.id}')" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-lg transition">S'inscrire</button>`
            : '<span class="px-3 py-2 bg-white/5 border border-[#1f293d] text-gray-500 text-[11px] font-bold rounded-lg">Inscriptions fermées</span>'}
        ${toornament ? `<a href="${toornament}" target="_blank" rel="noopener" class="px-3 py-2 bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-300 text-[11px] font-bold rounded-lg transition">Page Toornament</a>` : ''}
        ${t.registration_closes_at ? `<span class="ml-auto text-[10px] text-gray-500">Clôture : ${escapeHtml(formatDate(t.registration_closes_at))}</span>` : ''}
      </div>
    </div>`;

  $('tournamentModal').classList.remove('hidden');
  $('tournamentModal').classList.add('flex');
  document.body.classList.add('overflow-hidden');
}

// --- Affichage public du format BO9 ---

function teamNameById(id) {
  if (!id) return 'À déterminer';
  const pub = publicTeams.find((team) => team.id === id);
  if (pub) return pub.name;
  const mine = myTeams.find((team) => team.id === id);
  if (mine) return mine.name;
  const reg = adminRegs.find((r) => r.team_id === id);
  if (reg?.nvg_tournament_teams) return reg.nvg_tournament_teams.name;
  return 'Équipe';
}

function teamTagById(id) {
  const pub = publicTeams.find((team) => team.id === id);
  if (pub?.tag) return pub.tag;
  const reg = adminRegs.find((r) => r.team_id === id);
  return reg?.nvg_tournament_teams?.tag || '';
}

function teamLabelById(id) {
  if (!id) return 'À déterminer';
  const tag = teamTagById(id);
  return tag ? `${teamNameById(id)} [${tag}]` : teamNameById(id);
}

// Format d'un jeu dans le BO9, affiché sous son nom.
function bo9SlotFormatLabel(slot) {
  if (!slot.game_id) return { text: 'Jeu à choisir', tone: 'text-gray-500' };
  if (slot.scoring === 'cumulative') return { text: `cumul · ${bo9DuelCount(slot) * 2} joueurs`, tone: 'text-fuchsia-300' };
  if (slot.scoring === 'wins') return { text: `victoires · ${bo9DuelCount(slot)} 1v1`, tone: 'text-violet-300' };
  if (bo9SlotPairMode(slot)) return { text: bo9SlotPairBo3(slot) ? '2v2 · BO3' : '2v2 · finale si 1–1', tone: 'text-emerald-300' };
  const size = gameTeamSize(slot.game_id);
  return { text: size ? `${size}v${size} · confrontation` : 'confrontation', tone: 'text-sky-300' };
}

function bo9FormatBlock(t) {
  const cfg = bo9Config(t);
  if (!cfg) return '';
  const total = bo9TotalPoints(cfg);
  const mercy = cfg.mercy !== false;
  const captain = cfg.captain_card !== false;
  const pickBan = cfg.pick_ban !== false;
  return `
    <div class="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300">⚔️ Format BO9 — Multigaming Esport</h3>
        <span class="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-300">${total} points · ${escapeHtml(bo9PointsModeLabel(cfg))}</span>
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-3">
        ${BO9_CATEGORIES.map((cat) => {
          const slots = cfg.games.filter((g) => g.category === cat.key).sort((a, b) => a.slot - b.slot);
          return `<div class="rounded-lg border border-[#1f293d] bg-[#07090e] p-2.5">
            <p class="text-[10px] font-black uppercase tracking-wider ${cat.tone}">${cat.icon} ${cat.label}</p>
            <ul class="mt-1.5 space-y-1">
              ${slots.map((s) => {
                const format = bo9SlotFormatLabel(s);
                return `<li class="flex items-center justify-between gap-2 text-[10px]">
                <span class="flex min-w-0 items-center gap-1.5 text-gray-200">${gameLogo(s.game_id) ? `<img src="${gameLogo(s.game_id)}" alt="" onerror="this.remove()" class="inline-block h-[1em] w-[1em] shrink-0 object-contain">` : ''}<span class="min-w-0">
                  <span class="block truncate">${escapeHtml(gameName(s.game_id))}</span>
                  <span class="block truncate text-[9px] font-bold ${format.tone}">${escapeHtml(format.text)}</span>
                </span></span>
                <span class="shrink-0 text-gray-500">${formatPoints(Number(s.units) * Number(s.points_per_unit))} pts</span>
              </li>`;
              }).join('')}
            </ul>
            <p class="mt-1.5 border-t border-[#1f293d] pt-1 text-right text-[9px] font-bold text-gray-400">${formatPoints(bo9CategoryTotal(cfg, cat.key))} pts</p>
          </div>`;
        }).join('')}
      </div>
      <p class="mt-2 text-[10px] leading-relaxed text-gray-400">
        ${bo9MercyThreshold(cfg)} points pour gagner${mercy ? ' (mercy rule)' : ''} · ${pickBan ? 'pick & ban de l’ordre des jeux' : 'ordre des jeux fixe'}${captain ? ' · carte capitaine sur un duel 1v1' : ''}.
      </p>
    </div>`;
}

function bo9PublicMatchCard(match, cfg, labelText = '') {
  const totals = bo9MatchTotals(match, cfg);
  const finished = match.status === 'finished';
  const winnerA = finished && match.winner_team && match.winner_team === match.team_a;
  const winnerB = finished && match.winner_team && match.winner_team === match.team_b;
  const played = (Array.isArray(match.games) ? match.games : []).filter(Boolean);
  return `
    <div class="rounded-lg border border-[#1f293d] bg-[#07090e] p-2.5">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 space-y-0.5">
          ${labelText ? `<p class="text-[9px] font-black uppercase tracking-wider text-gray-500">${escapeHtml(labelText)}</p>` : ''}
          <p class="truncate text-[11px] font-bold ${winnerA ? 'text-emerald-300' : 'text-gray-200'}">${escapeHtml(teamLabelById(match.team_a))}</p>
          <p class="truncate text-[11px] font-bold ${winnerB ? 'text-emerald-300' : 'text-gray-200'}">${escapeHtml(teamLabelById(match.team_b))}</p>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-sm font-black ${finished ? 'text-white' : 'text-gray-500'}">${finished || played.length ? `${formatPoints(totals.a)} — ${formatPoints(totals.b)}` : '—'}</p>
          <p class="text-[9px] font-bold ${finished ? (match.mercy ? 'text-amber-400' : 'text-emerald-400') : 'text-gray-500'}">${finished ? (match.mercy ? 'Mercy' : 'Terminé') : 'À venir'}</p>
        </div>
      </div>
      ${played.length ? `<details class="mt-2 border-t border-[#1f293d] pt-1.5">
        <summary class="cursor-pointer text-[9px] font-bold uppercase tracking-wider text-gray-500">Détail des jeux</summary>
        <ul class="mt-1 space-y-0.5">
          ${played.map((g) => {
            const slot = bo9Slot(cfg, g.slot);
            if (!slot) return '';
            if (bo9SlotPairMode(slot) && (g.pair1 || g.pair2)) {
              const pair = bo9PairWins(g);
              const bo3 = bo9SlotPairBo3(slot);
              const decider = bo9PairDeciderScore(g);
              const mark = pair.split && g.final ? (bo3 ? '2v2 · BO3' : '2v2 · finale') : '2v2';
              const deciderText = bo3 && pair.split && g.final && decider
                ? ` <span class="text-[9px] text-gray-500">· départage ${decider.a}–${decider.b}</span>`
                : '';
              return `<li class="flex items-center justify-between gap-2 text-[10px]"><span class="truncate text-gray-400">${escapeHtml(gameName(slot.game_id))} <span class="text-[9px] font-bold uppercase tracking-wider text-emerald-300">${mark}</span></span><span class="shrink-0 font-bold text-gray-200">${pair.a} — ${pair.b}${deciderText}</span></li>`;
            }
            if (slot.scoring === 'wins') {
              return `<li class="flex items-center justify-between gap-2 text-[10px]"><span class="truncate text-gray-400">${escapeHtml(gameName(slot.game_id))} <span class="text-[9px] font-bold uppercase tracking-wider text-violet-300">victoires</span></span><span class="shrink-0 font-bold text-gray-200">${Number(g.wins_a) || 0} — ${Number(g.wins_b) || 0}</span></li>`;
            }
            const cumulative = slot.scoring === 'cumulative';
            const scoreA = cumulative ? (g.points_raw_a ?? 0) : (Number(g.units_a) || 0);
            const scoreB = cumulative ? (g.points_raw_b ?? 0) : (Number(g.units_b) || 0);
            const mark = cumulative ? ' <span class="text-[9px] font-bold uppercase tracking-wider text-fuchsia-300">cumul</span>' : '';
            return `<li class="flex items-center justify-between gap-2 text-[10px]"><span class="truncate text-gray-400">${escapeHtml(gameName(slot.game_id))}${mark}</span><span class="shrink-0 font-bold text-gray-200">${formatPoints(scoreA)} — ${formatPoints(scoreB)}</span></li>`;
          }).join('')}
        </ul>
      </details>` : ''}
    </div>`;
}

function bo9PoolStandings(groupName, cfg, matches) {
  const rows = new Map();
  const ensure = (id) => {
    if (!id) return null;
    if (!rows.has(id)) rows.set(id, { id, played: 0, wins: 0, draws: 0, losses: 0, points: 0, scored: 0, conceded: 0 });
    return rows.get(id);
  };
  matches
    .filter((m) => m.phase === 'pool' && m.group_name === groupName)
    .forEach((m) => {
      ensure(m.team_a);
      ensure(m.team_b);
      if (m.status !== 'finished') return;
      const a = ensure(m.team_a);
      const b = ensure(m.team_b);
      if (!a || !b) return;
      a.played += 1;
      b.played += 1;
      a.scored += Number(m.points_a) || 0;
      a.conceded += Number(m.points_b) || 0;
      b.scored += Number(m.points_b) || 0;
      b.conceded += Number(m.points_a) || 0;
      if (m.winner_team && m.winner_team === m.team_a) {
        a.wins += 1; b.losses += 1; a.points += 3;
      } else if (m.winner_team && m.winner_team === m.team_b) {
        b.wins += 1; a.losses += 1; b.points += 3;
      } else {
        a.draws += 1; b.draws += 1; a.points += 1; b.points += 1;
      }
    });
  return [...rows.values()].sort((x, y) => (
    (y.points - x.points)
    || ((y.scored - y.conceded) - (x.scored - x.conceded))
    || (y.scored - x.scored)
    || teamNameById(x.id).localeCompare(teamNameById(y.id), 'fr')
  ));
}

function bo9PoolTable(groupName, cfg, matches) {
  const standings = bo9PoolStandings(groupName, cfg, matches);
  return `
    <div class="overflow-hidden rounded-xl border border-[#1f293d] bg-[#07090e]">
      <p class="border-b border-[#1f293d] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-300">Poule ${escapeHtml(groupName)}</p>
      <table class="w-full text-[10px]">
        <thead class="text-gray-500">
          <tr>
            <th class="px-2 py-1 text-left font-bold">#</th>
            <th class="px-2 py-1 text-left font-bold">Équipe</th>
            <th class="px-1 py-1 text-center font-bold">J</th>
            <th class="px-1 py-1 text-center font-bold">V</th>
            <th class="px-1 py-1 text-center font-bold">N</th>
            <th class="px-1 py-1 text-center font-bold">D</th>
            <th class="px-1 py-1 text-center font-bold">Pts</th>
            <th class="px-2 py-1 text-right font-bold">Diff.</th>
          </tr>
        </thead>
        <tbody>
          ${standings.map((r, i) => `<tr class="border-t border-[#1f293d]">
            <td class="px-2 py-1 text-gray-500">${i + 1}</td>
            <td class="max-w-[9rem] truncate px-2 py-1 font-bold text-gray-200">${escapeHtml(teamLabelById(r.id))}</td>
            <td class="px-1 py-1 text-center text-gray-400">${r.played}</td>
            <td class="px-1 py-1 text-center text-gray-400">${r.wins}</td>
            <td class="px-1 py-1 text-center text-gray-400">${r.draws}</td>
            <td class="px-1 py-1 text-center text-gray-400">${r.losses}</td>
            <td class="px-1 py-1 text-center font-black text-white">${r.points}</td>
            <td class="px-2 py-1 text-right ${r.scored - r.conceded >= 0 ? 'text-emerald-400' : 'text-red-400'}">${r.scored - r.conceded > 0 ? '+' : ''}${formatPoints(r.scored - r.conceded)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function bo9BracketView(matches, cfg) {
  const bracket = matches.filter((m) => m.phase === 'bracket');
  const third = matches.find((m) => m.phase === 'third');
  const rounds = [...new Set(bracket.map((m) => m.round))].sort((a, b) => a - b);
  const totalRounds = rounds.length ? Math.max(...rounds) : 0;
  return `
    <div class="space-y-3">
      ${rounds.map((round) => `
        <div>
          <p class="mb-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400">${escapeHtml(bracketRoundLabel(round, totalRounds))}</p>
          <div class="grid gap-2 sm:grid-cols-2">
            ${bracket.filter((m) => m.round === round).sort((a, b) => a.position - b.position).map((m) => bo9PublicMatchCard(m, cfg)).join('')}
          </div>
        </div>`).join('')}
      ${third ? `<div>
        <p class="mb-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400">Petite finale</p>
        <div class="grid gap-2 sm:grid-cols-2">${bo9PublicMatchCard(third, cfg)}</div>
      </div>` : ''}
    </div>`;
}

// Matchs de poule repliés : le classement reste visible, le détail des
// rencontres s'ouvre à la demande pour ne pas alourdir la fiche.
function bo9PoolMatchesBlock(groupName, cfg, matches) {
  const list = matches
    .filter((m) => m.phase === 'pool' && m.group_name === groupName)
    .sort((a, b) => (a.round - b.round) || (a.position - b.position));
  if (!list.length) return '';
  const finished = list.filter((m) => m.status === 'finished').length;
  return `
    <details class="rounded-xl border border-[#1f293d] bg-[#07090e]">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
        <span class="text-[10px] font-black uppercase tracking-wider text-gray-300">Rencontres — poule ${escapeHtml(groupName)}</span>
        <span class="text-[9px] font-bold ${finished === list.length ? 'text-emerald-400' : 'text-gray-500'}">${finished} / ${list.length} terminés</span>
      </summary>
      <div class="space-y-1.5 border-t border-[#1f293d] p-2">
        ${list.map((m) => bo9PublicMatchCard(m, cfg, `Round ${m.round}`)).join('')}
      </div>
    </details>`;
}

function bo9CompetitionBlock(t) {
  const cfg = bo9Config(t);
  if (!cfg) return '';
  const matches = tournamentMatches.filter((m) => m.tournament_id === t.id);
  if (!matches.length) return '';
  const poolMatches = matches.filter((m) => m.phase === 'pool');
  const groups = [...new Set(poolMatches.map((m) => m.group_name).filter(Boolean))].sort();
  return `
    <div class="space-y-4">
      ${groups.length ? `<div>
        <h3 class="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white">🏟️ Phase de poules</h3>
        <div class="grid gap-2 sm:grid-cols-2">${groups.map((g) => bo9PoolTable(g, cfg, poolMatches)).join('')}</div>
        <div class="mt-2 grid gap-2 sm:grid-cols-2">${groups.map((g) => bo9PoolMatchesBlock(g, cfg, poolMatches)).join('')}</div>
      </div>` : ''}
      ${matches.some((m) => m.phase !== 'pool') ? `<div>
        <h3 class="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white">🏆 Phase finale</h3>
        ${bo9BracketView(matches, cfg)}
      </div>` : ''}
    </div>`;
}

// --- Moteur de compétition (admin) ---

function bracketRoundLabel(round, totalRounds) {
  const fromEnd = totalRounds - round;
  return ['Finale', 'Demi-finale', 'Quart de finale', 'Huitième de finale'][fromEnd] || `Tour ${round}`;
}

function bracketSeedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const nextSize = order.length * 2;
    const next = [];
    order.forEach((seed) => { next.push(seed, nextSize + 1 - seed); });
    order = next;
  }
  return order;
}

function roundRobinRounds(teams) {
  const list = [...teams];
  if (list.length % 2 === 1) list.push(null);
  const size = list.length;
  const rounds = [];
  for (let r = 0; r < size - 1; r += 1) {
    const pairs = [];
    for (let i = 0; i < size / 2; i += 1) pairs.push([list[i], list[size - 1 - i]]);
    rounds.push(pairs);
    const fixed = list[0];
    const rest = list.slice(1);
    rest.unshift(rest.pop());
    list.splice(0, list.length, fixed, ...rest);
  }
  return rounds;
}

function adminTeamsFor(tournamentId) {
  const map = new Map();
  adminRegs
    .filter((r) => r.tournament_id === tournamentId && r.status === 'confirmed' && r.team_id)
    .forEach((r) => {
      if (!map.has(r.team_id)) {
        map.set(r.team_id, {
          id: r.team_id,
          name: r.nvg_tournament_teams?.name || 'Équipe',
          tag: r.nvg_tournament_teams?.tag || ''
        });
      }
    });
  return [...map.values()];
}

async function loadMatchesOnly() {
  const { data, error } = await supabaseClient
    .from('nvg_tournament_matches')
    .select('*')
    .order('created_at', { ascending: true });
  if (!error) tournamentMatches = data || [];
  return tournamentMatches;
}

async function generateBo9Pools(tournamentId) {
  const t = tournamentById(tournamentId);
  const cfg = bo9Config(t);
  if (!cfg) return;
  if (!cfg.complete) {
    notify('Choisis les 9 jeux du tournoi avant de générer les poules.', true);
    return;
  }
  const poolCount = Number(cfg.pool_count) || 4;
  const poolSize = Number(cfg.pool_size) || 4;
  const teams = adminTeamsFor(tournamentId);
  const needed = poolCount * poolSize;
  if (teams.length !== needed) {
    notify(`Il faut exactement ${needed} équipes confirmées pour ${poolCount} poules de ${poolSize}. Actuellement : ${teams.length}.`, true);
    return;
  }
  if (!window.confirm(`Générer ${poolCount} poules de ${poolSize} équipes ?\n\nLes matchs et le bracket existants seront effacés.`)) return;
  const { error: delError } = await supabaseClient.from('nvg_tournament_matches').delete().eq('tournament_id', tournamentId);
  if (delError) { notify('Erreur : ' + delError.message, true); return; }
  const shuffled = [...teams];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const groups = ['A', 'B', 'C', 'D', 'E', 'F'];
  const rows = [];
  for (let p = 0; p < poolCount; p += 1) {
    const groupTeams = shuffled.slice(p * poolSize, (p + 1) * poolSize);
    const rounds = roundRobinRounds(groupTeams);
    rounds.forEach((round, ri) => {
      round.forEach((pair, pi) => {
        if (!pair[0] || !pair[1]) return;
        rows.push({
          tournament_id: tournamentId,
          phase: 'pool',
          round: ri + 1,
          position: pi + 1,
          group_name: groups[p],
          label: `Poule ${groups[p]}`,
          team_a: pair[0].id,
          team_b: pair[1].id,
          status: 'scheduled'
        });
      });
    });
  }
  const { error } = await supabaseClient.from('nvg_tournament_matches').insert(rows);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify(`${rows.length} matchs de poule générés.`);
  await loadMatchesOnly();
  renderAdminMatchPanel();
}

async function generateBo9Bracket(tournamentId) {
  const t = tournamentById(tournamentId);
  const cfg = bo9Config(t);
  if (!cfg) return;
  const matches = tournamentMatches.filter((m) => m.tournament_id === tournamentId);
  const poolMatches = matches.filter((m) => m.phase === 'pool');
  if (!poolMatches.length) { notify('Génère d’abord les poules.', true); return; }
  const unfinished = poolMatches.filter((m) => m.status !== 'finished');
  if (unfinished.length) {
    notify(`Il reste ${unfinished.length} match(s) de poule à terminer.`, true);
    return;
  }
  const groups = [...new Set(poolMatches.map((m) => m.group_name).filter(Boolean))].sort();
  const perPool = Number(cfg.qualifiers_per_pool) || 2;
  const seeds = [];
  for (let rank = 0; rank < perPool; rank += 1) {
    groups.forEach((group) => {
      const standing = bo9PoolStandings(group, cfg, poolMatches)[rank];
      if (standing) seeds.push(standing.id);
    });
  }
  const size = seeds.length;
  if (![2, 4, 8, 16].includes(size)) {
    notify(`Le bracket demande 2, 4, 8 ou 16 qualifiés (actuellement ${size}).`, true);
    return;
  }
  if (!window.confirm(`Générer le bracket à ${size} équipes ?\n\nLe bracket existant sera effacé.`)) return;
  const { error: delError } = await supabaseClient.from('nvg_tournament_matches')
    .delete().eq('tournament_id', tournamentId).neq('phase', 'pool');
  if (delError) { notify('Erreur : ' + delError.message, true); return; }

  const order = bracketSeedOrder(size);
  const firstRound = [];
  for (let i = 0; i < size; i += 2) {
    firstRound.push([seeds[order[i] - 1], seeds[order[i + 1] - 1]]);
  }
  const totalRounds = Math.log2(size);
  let previous = [];
  for (let round = 1; round <= totalRounds; round += 1) {
    const count = size / (2 ** round);
    const rows = [];
    for (let pos = 1; pos <= count; pos += 1) {
      const row = {
        tournament_id: tournamentId,
        phase: 'bracket',
        round,
        position: pos,
        label: bracketRoundLabel(round, totalRounds),
        status: 'scheduled',
        team_a: round === 1 ? firstRound[pos - 1][0] : null,
        team_b: round === 1 ? firstRound[pos - 1][1] : null
      };
      rows.push(row);
    }
    const { data, error } = await supabaseClient.from('nvg_tournament_matches').insert(rows).select('id,position');
    if (error) { notify('Erreur : ' + error.message, true); return; }
    if (previous.length) {
      for (const prev of previous) {
        const target = data.find((x) => x.position === Math.floor((prev.position - 1) / 2) + 1);
        if (!target) continue;
        await supabaseClient.from('nvg_tournament_matches')
          .update({ next_match_id: target.id, next_slot: prev.position % 2 === 1 ? 'a' : 'b' })
          .eq('id', prev.id);
      }
    }
    previous = data;
  }
  if (cfg.third_place !== false && totalRounds >= 2) {
    await supabaseClient.from('nvg_tournament_matches').insert({
      tournament_id: tournamentId,
      phase: 'third',
      round: totalRounds,
      position: 1,
      label: 'Petite finale',
      status: 'scheduled'
    });
  }
  notify(`Bracket à ${size} équipes généré.`);
  await loadMatchesOnly();
  renderAdminMatchPanel();
}

async function deleteBo9Matches(tournamentId) {
  if (!window.confirm('Effacer tous les matchs (poules et bracket) de ce tournoi ?')) return;
  const { error } = await supabaseClient.from('nvg_tournament_matches').delete().eq('tournament_id', tournamentId);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify('Matchs effacés.');
  await loadMatchesOnly();
  renderAdminMatchPanel();
}

async function advanceBo9Match(match, loserId) {
  if (match.next_match_id && match.next_slot && match.winner_team) {
    const column = match.next_slot === 'a' ? 'team_a' : 'team_b';
    await supabaseClient.from('nvg_tournament_matches')
      .update({ [column]: match.winner_team, updated_at: new Date().toISOString() })
      .eq('id', match.next_match_id);
  }
  if (match.phase !== 'bracket') return;
  const t = tournamentById(match.tournament_id);
  const cfg = bo9Config(t);
  if (!cfg || cfg.third_place === false) return;
  const rounds = tournamentMatches
    .filter((m) => m.tournament_id === match.tournament_id && m.phase === 'bracket')
    .map((m) => Number(m.round) || 0);
  const totalRounds = rounds.length ? Math.max(...rounds) : 0;
  if (match.round !== totalRounds - 1) return;
  const third = tournamentMatches.find((m) => m.tournament_id === match.tournament_id && m.phase === 'third');
  if (!third || !loserId) return;
  const column = match.position === 1 ? 'team_a' : 'team_b';
  await supabaseClient.from('nvg_tournament_matches')
    .update({ [column]: loserId, updated_at: new Date().toISOString() })
    .eq('id', third.id);
}

function bo9MatchInputs(matchId, slotNumber, suffix) {
  return $(`bo9-m-${matchId}-s${slotNumber}-${suffix}`);
}

// Affiche la finale 2v2 uniquement quand les deux BO1 sont partagés (1–1).
function syncBo9PairFinal(matchId, slotNumber) {
  const p1 = bo9MatchInputs(matchId, slotNumber, 'p1')?.value || '';
  const p2 = bo9MatchInputs(matchId, slotNumber, 'p2')?.value || '';
  const wrap = $(`bo9-m-${matchId}-s${slotNumber}-final-wrap`);
  const final = bo9MatchInputs(matchId, slotNumber, 'final');
  const split = Boolean(p1 && p2 && p1 !== p2);
  if (wrap) wrap.classList.toggle('hidden', !split);
  if (!split && final) final.value = '';
}

// Lit la saisie d'un jeu 2v2 : les deux BO1 de binômes et, si 1–1, le
// départage (BO1 simple ou BO3 selon le jeu).
function bo9PairEntry(matchId, slot) {
  const p1 = bo9MatchInputs(matchId, slot.slot, 'p1')?.value || '';
  const p2 = bo9MatchInputs(matchId, slot.slot, 'p2')?.value || '';
  if (!p1 && !p2) return { skip: true };
  if (!p1 || !p2) {
    return { error: `Jeu « ${gameName(slot.game_id)} » : indique le vainqueur des deux BO1 de binômes.` };
  }
  const entry = { slot: slot.slot, pair1: p1, pair2: p2, final: '' };
  if (p1 === p2) return { entry };

  const raw = bo9MatchInputs(matchId, slot.slot, 'final')?.value || '';
  if (bo9SlotPairBo3(slot)) {
    // Les options encodent le score côté vainqueur : `a2-0`, `a2-1`, `b2-1`, `b2-0`.
    const m = /^([ab])([0-2])-([0-2])$/.exec(raw);
    const valid = Boolean(m) && ['a2-0', 'a2-1', 'b2-1', 'b2-0'].includes(raw);
    if (!valid) {
      return { error: `Jeu « ${gameName(slot.game_id)} » : chaque équipe a gagné un BO1, désigne le vainqueur du départage BO3 (2–0 ou 2–1).` };
    }
    const winnerScore = Number(m[2]);
    const loserScore = Number(m[3]);
    entry.final = m[1];
    entry.final_a = m[1] === 'a' ? winnerScore : loserScore;
    entry.final_b = m[1] === 'b' ? winnerScore : loserScore;
    return { entry };
  }
  if (raw !== 'a' && raw !== 'b') {
    return { error: `Jeu « ${gameName(slot.game_id)} » : chaque équipe a gagné un BO1, désigne le vainqueur de la finale 2v2.` };
  }
  entry.final = raw;
  return { entry };
}

function previewBo9Match(matchId) {
  const match = tournamentMatches.find((m) => m.id === matchId);
  if (!match) return;
  const t = tournamentById(match.tournament_id);
  const cfg = bo9Config(t);
  if (!cfg) return;
  const games = [];
  cfg.games.forEach((slot) => {
    if (bo9SlotPairMode(slot)) {
      const pair = bo9PairEntry(matchId, slot);
      if (!pair.skip && !pair.error) games.push(pair.entry);
      return;
    }
    const a = bo9MatchInputs(matchId, slot.slot, 'a');
    const b = bo9MatchInputs(matchId, slot.slot, 'b');
    if (!a || !b) return;
    if (a.value === '' && b.value === '') return;
    if (slot.scoring === 'wins') {
      games.push({ slot: slot.slot, scoring: 'wins', wins_a: Number(a.value) || 0, wins_b: Number(b.value) || 0 });
    } else if (slot.scoring === 'cumulative') {
      games.push({ slot: slot.slot, scoring: 'cumulative', points_raw_a: Number(a.value) || 0, points_raw_b: Number(b.value) || 0 });
    } else {
      games.push({ slot: slot.slot, units_a: Number(a.value) || 0, units_b: Number(b.value) || 0 });
    }
  });
  const capA = $(`bo9-m-${matchId}-cap-a`)?.value;
  const capB = $(`bo9-m-${matchId}-cap-b`)?.value;
  const totals = bo9MatchTotals({ games, captain_card: { a: capA ? Number(capA) : null, b: capB ? Number(capB) : null } }, cfg);
  const threshold = bo9MercyThreshold(cfg);
  const el = $(`bo9-m-${matchId}-preview`);
  if (el) {
    el.textContent = `${formatPoints(totals.a)} — ${formatPoints(totals.b)}${totals.a >= threshold || totals.b >= threshold ? ' · mercy atteinte' : ''}`;
  }
}

async function saveBo9MatchResult(matchId) {
  const match = tournamentMatches.find((m) => m.id === matchId);
  if (!match) return;
  if (!resultsOpen(tournamentById(match.tournament_id))) return;
  const t = tournamentById(match.tournament_id);
  const cfg = bo9Config(t);
  if (!cfg) return;
  const games = [];
  let incomplete = false;
  for (const slot of cfg.games) {
    if (bo9SlotPairMode(slot)) {
      const pair = bo9PairEntry(matchId, slot);
      if (pair.skip) continue;
      if (pair.error) {
        notify(pair.error, true);
        return;
      }
      games.push(pair.entry);
      continue;
    }
    const aEl = bo9MatchInputs(matchId, slot.slot, 'a');
    const bEl = bo9MatchInputs(matchId, slot.slot, 'b');
    if (!aEl || !bEl) continue;
    const touched = aEl.value !== '' || bEl.value !== '';
    if (!touched) continue;
    if (slot.scoring === 'wins') {
      if (aEl.value === '' || bEl.value === '') {
        notify(`Jeu « ${gameName(slot.game_id)} » : indique le nombre de victoires individuelles des deux équipes.`, true);
        return;
      }
      const maxWins = bo9DuelCount(slot);
      const winsA = Number(aEl.value);
      const winsB = Number(bEl.value);
      if (!Number.isInteger(winsA) || !Number.isInteger(winsB) || winsA < 0 || winsB < 0 || winsA > maxWins || winsB > maxWins || winsA + winsB > maxWins) {
        notify(`Jeu « ${gameName(slot.game_id)} » : indique entre 0 et ${maxWins} victoires par équipe (${maxWins} duels individuels au total).`, true);
        return;
      }
      if (winsA + winsB === 0) {
        notify(`Jeu « ${gameName(slot.game_id)} » : indique au moins un duel gagné.`, true);
        return;
      }
      games.push({ slot: slot.slot, scoring: 'wins', wins_a: winsA, wins_b: winsB });
      continue;
    }
    if (slot.scoring === 'cumulative') {
      if (aEl.value === '' || bEl.value === '') {
        notify(`Jeu « ${gameName(slot.game_id)} » : indique le total de points des deux équipes.`, true);
        return;
      }
      const rawA = Number(aEl.value);
      const rawB = Number(bEl.value);
      if (!Number.isFinite(rawA) || !Number.isFinite(rawB) || rawA < 0 || rawB < 0) {
        notify(`Jeu « ${gameName(slot.game_id)} » : totaux de points invalides.`, true);
        return;
      }
      games.push({ slot: slot.slot, scoring: 'cumulative', points_raw_a: rawA, points_raw_b: rawB });
      continue;
    }
    const unitsA = Number(aEl.value) || 0;
    const unitsB = Number(bEl.value) || 0;
    if (unitsA < 0 || unitsB < 0 || unitsA > slot.units || unitsB > slot.units || unitsA + unitsB !== Number(slot.units)) {
      notify(`Jeu « ${gameName(slot.game_id)} » : indique ${slot.units} unité(s) au total (A + B).`, true);
      return;
    }
    if (aEl.value === '' || bEl.value === '') incomplete = true;
    games.push({ slot: slot.slot, units_a: unitsA, units_b: unitsB });
  }
  if (!games.length) { notify('Saisis au moins un jeu.', true); return; }
  const capA = $(`bo9-m-${matchId}-cap-a`)?.value;
  const capB = $(`bo9-m-${matchId}-cap-b`)?.value;
  const captainCard = { a: capA ? Number(capA) : null, b: capB ? Number(capB) : null };
  const totals = bo9MatchTotals({ games, captain_card: captainCard }, cfg);
  const threshold = bo9MercyThreshold(cfg);
  const mercyReached = cfg.mercy !== false && (totals.a >= threshold || totals.b >= threshold);
  const complete = games.length === cfg.games.length;
  const finished = mercyReached || complete;
  let winner = null;
  if (totals.a > totals.b) winner = match.team_a;
  else if (totals.b > totals.a) winner = match.team_b;
  if (finished && !winner && match.phase !== 'pool') {
    notify('Égalité en phase finale : corrige les scores pour désigner un vainqueur.', true);
    return;
  }
  const patch = {
    games,
    captain_card: captainCard,
    points_a: totals.a,
    points_b: totals.b,
    winner_team: winner,
    mercy: mercyReached,
    status: finished ? 'finished' : 'live',
    updated_at: new Date().toISOString()
  };
  const { error } = await supabaseClient.from('nvg_tournament_matches').update(patch).eq('id', matchId);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  if (finished && winner) {
    const loser = winner === match.team_a ? match.team_b : match.team_a;
    await advanceBo9Match({ ...match, winner_team: winner }, loser);
  }
  notify(incomplete && finished ? 'Résultat enregistré (certains jeux sont vides).' : 'Résultat enregistré.');
  await loadMatchesOnly();
  renderAdminMatchPanel();
}

async function saveBo9PickOrder(matchId, order) {
  const { error } = await supabaseClient.from('nvg_tournament_matches')
    .update({ pick_order: order, updated_at: new Date().toISOString() })
    .eq('id', matchId);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  await loadMatchesOnly();
  renderAdminMatchPanel();
}

function shuffleBo9Order(matchId) {
  const match = tournamentMatches.find((m) => m.id === matchId);
  const cfg = bo9Config(tournamentById(match?.tournament_id));
  if (!match || !cfg) return;
  const order = cfg.games.map((g) => g.slot);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  saveBo9PickOrder(matchId, order);
}

function moveBo9Game(matchId, slotNumber, direction) {
  const match = tournamentMatches.find((m) => m.id === matchId);
  const cfg = bo9Config(tournamentById(match?.tournament_id));
  if (!match || !cfg) return;
  const order = (Array.isArray(match.pick_order) && match.pick_order.length === cfg.games.length)
    ? [...match.pick_order]
    : cfg.games.map((g) => g.slot);
  const index = order.findIndex((s) => Number(s) === Number(slotNumber));
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  saveBo9PickOrder(matchId, order);
}

function adminBo9MatchCard(match, cfg, labelText = '') {
  const totals = bo9MatchTotals(match, cfg);
  const threshold = bo9MercyThreshold(cfg);
  const order = (Array.isArray(match.pick_order) && match.pick_order.length === cfg.games.length)
    ? match.pick_order
    : cfg.games.map((g) => g.slot);
  const slotByNumber = new Map(cfg.games.map((g) => [Number(g.slot), g]));
  const played = new Map((Array.isArray(match.games) ? match.games : []).map((g) => [Number(g.slot), g]));
  // La carte capitaine ne double qu'un duel 1v1 joué en confrontation.
  const duelSlots = cfg.games.filter((g) => g.category === 'duel' && g.scoring !== 'cumulative' && g.scoring !== 'wins' && !bo9SlotPairMode(g)).sort((a, b) => a.slot - b.slot);
  const cards = match.captain_card || {};
  const finished = match.status === 'finished';
  return `
    <details class="rounded-xl border border-[#1f293d] bg-[#07090e]">
      <summary class="cursor-pointer list-none p-2.5">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            ${labelText ? `<p class="text-[9px] font-black uppercase tracking-wider text-gray-500">${escapeHtml(labelText)}</p>` : ''}
            <p class="truncate text-[11px] font-bold ${finished && match.winner_team === match.team_a ? 'text-emerald-300' : 'text-gray-200'}">${escapeHtml(teamLabelById(match.team_a))}</p>
            <p class="truncate text-[11px] font-bold ${finished && match.winner_team === match.team_b ? 'text-emerald-300' : 'text-gray-200'}">${escapeHtml(teamLabelById(match.team_b))}</p>
          </div>
          <div class="shrink-0 text-right">
            <p class="text-sm font-black ${finished ? 'text-white' : 'text-gray-400'}">${formatPoints(totals.a)} — ${formatPoints(totals.b)}</p>
            <p class="text-[9px] font-bold ${finished ? (match.mercy ? 'text-amber-400' : 'text-emerald-400') : 'text-gray-500'}">${finished ? (match.mercy ? `Mercy (${threshold})` : 'Terminé') : `${formatPoints(threshold)} pts pour gagner`}</p>
          </div>
        </div>
      </summary>
      <div class="space-y-3 border-t border-[#1f293d] p-3">
        ${cfg.pick_ban !== false ? `<div>
          <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p class="text-[9px] font-black uppercase tracking-wider text-gray-500">Ordre des jeux (pick &amp; ban)</p>
            <button onclick="shuffleBo9Order('${match.id}')" class="rounded border border-[#1f293d] bg-white/5 px-2 py-1 text-[9px] font-bold text-gray-300 transition hover:bg-white/10">🔀 Tirer</button>
          </div>
          <div class="flex flex-wrap gap-1">
            ${order.map((slotNumber, index) => {
              const slot = slotByNumber.get(Number(slotNumber));
              if (!slot) return '';
              return `<span class="inline-flex items-center gap-1 rounded border border-[#1f293d] bg-[#121722] px-1.5 py-1 text-[9px] text-gray-300">
                <span class="text-gray-500">${index + 1}.</span>${escapeHtml(gameName(slot.game_id))}
                <button onclick="moveBo9Game('${match.id}', ${slotNumber}, -1)" title="Monter" class="text-gray-500 hover:text-white">▲</button>
                <button onclick="moveBo9Game('${match.id}', ${slotNumber}, 1)" title="Descendre" class="text-gray-500 hover:text-white">▼</button>
              </span>`;
            }).join('')}
          </div>
        </div>` : ''}
        <div class="space-y-1.5">
          ${order.map((slotNumber, index) => {
            const slot = slotByNumber.get(Number(slotNumber));
            if (!slot) return '';
            const score = played.get(Number(slotNumber)) || {};
            const cumulative = slot.scoring === 'cumulative';
            const pairMode = bo9SlotPairMode(slot);
            const slotValue = Number(slot.units) * Number(slot.points_per_unit);
            if (pairMode) {
              const p1 = score.pair1 || '';
              const p2 = score.pair2 || '';
              const bo3 = bo9SlotPairBo3(slot);
              const final = score.final || '';
              const split = Boolean(p1 && p2 && p1 !== p2);
              const pair = bo9PairWins(score);
              const decider = bo9PairDeciderScore(score);
              const teamA = teamLabelById(match.team_a);
              const teamB = teamLabelById(match.team_b);
              const deciderOptions = bo3
                ? `<option value="">—</option>
                      <option value="a2-0" ${final === 'a' && decider?.a === 2 && (decider?.b || 0) === 0 ? 'selected' : ''}>${escapeHtml(teamA)} 2–0</option>
                      <option value="a2-1" ${final === 'a' && decider?.a === 2 && decider?.b === 1 ? 'selected' : ''}>${escapeHtml(teamA)} 2–1</option>
                      <option value="b2-1" ${final === 'b' && decider?.a === 1 && decider?.b === 2 ? 'selected' : ''}>${escapeHtml(teamB)} 2–1</option>
                      <option value="b2-0" ${final === 'b' && decider?.b === 2 && (decider?.a || 0) === 0 ? 'selected' : ''}>${escapeHtml(teamB)} 2–0</option>`
                : `<option value="">—</option>
                      <option value="a" ${final === 'a' ? 'selected' : ''}>${escapeHtml(teamA)}</option>
                      <option value="b" ${final === 'b' ? 'selected' : ''}>${escapeHtml(teamB)}</option>`;
              return `<div class="space-y-1.5 rounded-lg border border-emerald-500/25 bg-[#121722] px-2 py-1.5">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate text-[10px] font-bold text-gray-200">${index + 1}. ${escapeHtml(gameName(slot.game_id))} <span class="text-[9px] font-bold text-emerald-300">2v2${bo3 ? ' · BO3' : ''}</span></p>
                    <p class="text-[9px] text-gray-500">Escarmouche · deux BO1 de binômes · ${formatPoints(slotValue)} pts au vainqueur${pair.winner ? ` · binômes ${pair.a}–${pair.b}` : ''}</p>
                  </div>
                </div>
                <div class="grid grid-cols-1 gap-1 sm:grid-cols-3">
                  <label class="block">
                    <span class="mb-0.5 block text-[9px] font-black uppercase tracking-wider text-gray-500">Binôme 1 · A1/A2 – B1/B2</span>
                    <select id="bo9-m-${match.id}-s${slotNumber}-p1" onchange="syncBo9PairFinal('${match.id}', ${slotNumber}); previewBo9Match('${match.id}')" class="w-full rounded-lg border border-[#1f293d] bg-[#07090e] px-2 py-1.5 text-[10px] text-white">
                      <option value="">—</option>
                      <option value="a" ${p1 === 'a' ? 'selected' : ''}>${escapeHtml(teamA)}</option>
                      <option value="b" ${p1 === 'b' ? 'selected' : ''}>${escapeHtml(teamB)}</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="mb-0.5 block text-[9px] font-black uppercase tracking-wider text-gray-500">Binôme 2 · A3/A4 – B3/B4</span>
                    <select id="bo9-m-${match.id}-s${slotNumber}-p2" onchange="syncBo9PairFinal('${match.id}', ${slotNumber}); previewBo9Match('${match.id}')" class="w-full rounded-lg border border-[#1f293d] bg-[#07090e] px-2 py-1.5 text-[10px] text-white">
                      <option value="">—</option>
                      <option value="a" ${p2 === 'a' ? 'selected' : ''}>${escapeHtml(teamA)}</option>
                      <option value="b" ${p2 === 'b' ? 'selected' : ''}>${escapeHtml(teamB)}</option>
                    </select>
                  </label>
                  <label id="bo9-m-${match.id}-s${slotNumber}-final-wrap" class="block ${split ? '' : 'hidden'}">
                    <span class="mb-0.5 block text-[9px] font-black uppercase tracking-wider text-amber-400">${bo3 ? 'Départage BO3 (1–1)' : 'Départage 2v2 (1–1)'}</span>
                    <select id="bo9-m-${match.id}-s${slotNumber}-final" onchange="previewBo9Match('${match.id}')" class="w-full rounded-lg border border-amber-500/40 bg-[#07090e] px-2 py-1.5 text-[10px] text-white">
                      ${deciderOptions}
                    </select>
                  </label>
                </div>
                <p class="text-[9px] text-gray-500">Si chaque équipe gagne un BO1, les deux binômes vainqueurs jouent ${bo3 ? 'un départage en BO3 (premier à 2 manches)' : 'la finale 2v2'} ; le 5e joueur peut remplacer un des deux joueurs.</p>
              </div>`;
            }
            const wins = slot.scoring === 'wins';
            const maxWins = bo9DuelCount(slot);
            const valueA = wins ? (score.wins_a ?? '') : cumulative ? (score.points_raw_a ?? '') : (score.units_a ?? '');
            const valueB = wins ? (score.wins_b ?? '') : cumulative ? (score.points_raw_b ?? '') : (score.units_b ?? '');
            const inputMax = cumulative ? '' : wins ? `max="${maxWins}"` : `max="${slot.units}"`;
            const scoringDetail = wins
              ? `${maxWins} duels individuels · ${formatPoints(slotValue)} pts au vainqueur`
              : cumulative
                ? `total d’équipe · ${formatPoints(slotValue)} pts au vainqueur`
                : `${slot.units} unité(s) × ${formatPoints(slot.points_per_unit)} pt = ${formatPoints(slotValue)} pts`;
            return `<div class="grid grid-cols-1 gap-1.5 rounded-lg border border-[#1f293d] bg-[#121722] px-2 py-1.5 sm:grid-cols-[1fr_auto] sm:items-center">
              <div class="min-w-0">
                <p class="truncate text-[10px] font-bold text-gray-200">${index + 1}. ${escapeHtml(gameName(slot.game_id))}${wins ? ' <span class="text-[9px] font-bold text-violet-300">Victoires</span>' : cumulative ? ' <span class="text-[9px] font-bold text-fuchsia-300">Cumul</span>' : ''}</p>
                <p class="text-[9px] text-gray-500">${slot.category === 'collectif' ? 'Collectif' : slot.category === 'escarmouche' ? 'Escarmouche' : 'Duel'} · ${scoringDetail}</p>
              </div>
              <div class="flex items-center gap-1">
                <input id="bo9-m-${match.id}-s${slotNumber}-a" type="number" min="0" ${inputMax} value="${valueA}" oninput="previewBo9Match('${match.id}')" aria-label="${wins ? 'Victoires individuelles équipe A' : cumulative ? 'Points cumulés équipe A' : 'Unités équipe A'}" class="w-12 rounded border border-[#1f293d] bg-[#07090e] px-1.5 py-1 text-center text-[11px] text-white">
                <span class="text-gray-500">–</span>
                <input id="bo9-m-${match.id}-s${slotNumber}-b" type="number" min="0" ${inputMax} value="${valueB}" oninput="previewBo9Match('${match.id}')" aria-label="${wins ? 'Victoires individuelles équipe B' : cumulative ? 'Points cumulés équipe B' : 'Unités équipe B'}" class="w-12 rounded border border-[#1f293d] bg-[#07090e] px-1.5 py-1 text-center text-[11px] text-white">
                <span class="ml-1 text-[9px] text-gray-500">${wins ? `/ ${maxWins}` : cumulative ? 'pts' : `/ ${slot.units}`}</span>
              </div>
            </div>`;
          }).join('')}
        </div>
        ${cfg.captain_card !== false && duelSlots.length ? `<div class="grid gap-2 sm:grid-cols-2">
          ${[['a', match.team_a], ['b', match.team_b]].map(([side, teamId]) => `<label class="block">
            <span class="mb-0.5 block text-[9px] font-black uppercase tracking-wider text-gray-500">Carte capitaine — ${escapeHtml(teamNameById(teamId))}</span>
            <select id="bo9-m-${match.id}-cap-${side}" onchange="previewBo9Match('${match.id}')" class="w-full rounded-lg border border-[#1f293d] bg-[#07090e] px-2 py-1.5 text-[10px] text-white">
              <option value="">Aucune</option>
              ${duelSlots.map((slot) => `<option value="${slot.slot}" ${Number(cards[side]) === Number(slot.slot) ? 'selected' : ''}>${escapeHtml(gameName(slot.game_id))}</option>`).join('')}
            </select>
          </label>`).join('')}
        </div>` : ''}
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-[#1f293d] pt-2">
          <span id="bo9-m-${match.id}-preview" class="text-[10px] font-bold text-amber-300">${formatPoints(totals.a)} — ${formatPoints(totals.b)}</span>
          <button onclick="saveBo9MatchResult('${match.id}')" class="rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-black text-black transition hover:bg-amber-400">💾 Enregistrer le résultat</button>
        </div>
      </div>
    </details>`;
}

function renderAdminMatchPanel() {
  const panel = $('adminMatchPanel');
  if (!panel) return;
  const t = tournamentById(viewingMatchTournamentId);
  if (t && isStandard(t)) { renderStandardMatchPanel(t); return; }
  const cfg = bo9Config(t);
  if (!t || !cfg) { panel.classList.add('hidden'); return; }
  const matches = tournamentMatches.filter((m) => m.tournament_id === t.id);
  const poolMatches = matches.filter((m) => m.phase === 'pool');
  const groups = [...new Set(poolMatches.map((m) => m.group_name).filter(Boolean))].sort();
  const teams = adminTeamsFor(t.id);
  const needed = (Number(cfg.pool_count) || 4) * (Number(cfg.pool_size) || 4);
  const poolDone = poolMatches.length > 0 && poolMatches.every((m) => m.status === 'finished');
  $('adminMatchSubtitle').textContent = `${t.name} · ${cfg.pool_count} poules de ${cfg.pool_size} · ${bo9TotalPoints(cfg)} points (${bo9PointsModeLabel(cfg)}) · ${teams.length}/${needed} équipes confirmées`;
  $('adminMatchTools').innerHTML = `
    <button onclick="generateBo9Pools('${t.id}')" class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[10px] font-bold text-amber-300 transition hover:bg-amber-500/20">🏗️ Générer les poules</button>
    <button onclick="generateBo9Bracket('${t.id}')" class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-300 transition hover:bg-emerald-500/20">🏁 Générer le bracket</button>
    ${matches.length ? `<button onclick="deleteBo9Matches('${t.id}')" class="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold text-red-300 transition hover:bg-red-500/20">🗑️ Effacer les matchs</button>` : ''}
    ${poolMatches.length ? `<span class="text-[10px] font-bold ${poolDone ? 'text-emerald-400' : 'text-gray-500'}">${poolMatches.filter((m) => m.status === 'finished').length} / ${poolMatches.length} matchs de poule terminés</span>` : ''}
  `;
  if (!matches.length) {
    $('adminMatchBody').innerHTML = `<p class="rounded-xl border border-[#1f293d] bg-[#07090e] p-3 text-xs text-gray-400">Aucun match. Génère les poules dès que les ${needed} équipes sont confirmées. Les inscriptions en équipe se font depuis la fiche du tournoi.</p>`;
    panel.classList.remove('hidden');

    return;
  }
  $('adminMatchBody').innerHTML = `
    ${groups.map((group) => `
      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-xs font-black uppercase tracking-wider text-white">🏟️ Poule ${escapeHtml(group)}</h3>
          <span class="text-[10px] text-gray-500">${poolMatches.filter((m) => m.group_name === group && m.status === 'finished').length} / ${poolMatches.filter((m) => m.group_name === group).length} terminés</span>
        </div>
        ${bo9PoolTable(group, cfg, poolMatches)}
        <div class="space-y-1.5">
          ${poolMatches.filter((m) => m.group_name === group).sort((a, b) => a.round - b.round || a.position - b.position).map((m) => adminBo9MatchCard(m, cfg, `Round ${m.round}`)).join('')}
        </div>
      </div>`).join('')}
    ${matches.some((m) => m.phase !== 'pool') ? `<div class="space-y-2">
      <h3 class="text-xs font-black uppercase tracking-wider text-white">🏆 Phase finale</h3>
      ${bo9BracketAdmin(matches, cfg)}
    </div>` : ''}
  `;
  panel.classList.remove('hidden');

}

function bo9BracketAdmin(matches, cfg) {
  const bracket = matches.filter((m) => m.phase === 'bracket');
  const third = matches.find((m) => m.phase === 'third');
  const rounds = [...new Set(bracket.map((m) => m.round))].sort((a, b) => a - b);
  const totalRounds = rounds.length ? Math.max(...rounds) : 0;
  return `
    ${rounds.map((round) => `
      <div>
        <p class="mb-1 text-[10px] font-black uppercase tracking-wider text-gray-400">${escapeHtml(bracketRoundLabel(round, totalRounds))}</p>
        <div class="grid gap-1.5 sm:grid-cols-2">
          ${bracket.filter((m) => m.round === round).sort((a, b) => a.position - b.position).map((m) => adminBo9MatchCard(m, cfg)).join('')}
        </div>
      </div>`).join('')}
    ${third ? `<div>
      <p class="mb-1 text-[10px] font-black uppercase tracking-wider text-gray-400">Petite finale</p>
      <div class="grid gap-1.5 sm:grid-cols-2">${adminBo9MatchCard(third, cfg)}</div>
    </div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Formats standard (jeu unique) : élimination directe, poules / championnat
// en round robin. Les autres formats (double élimination, poules + élimination,
// suisse) ne sont pas encore générés.
// ---------------------------------------------------------------------------

const STANDARD_GENERATED_FORMATS = ['single_elim', 'double_elim', 'round_robin', 'league', 'swiss', 'groups_playoffs'];

function isStandard(t) {
  return t?.format_config?.type === 'standard';
}

function standardFormat(t) {
  return t?.format_config?.format || 'single_elim';
}

async function generateStandardMatches(tournamentId) {
  await loadPublic();
  const t = tournamentById(tournamentId);
  if (!t) {
    notify('Ce tournoi n’existe plus. Rafraîchis la page.', true);
    closeAdminMatchPanel();
    return;
  }
  if (!isStandard(t)) return;
  const format = standardFormat(t);
  if (!STANDARD_GENERATED_FORMATS.includes(format)) {
    notify(`Le format « ${STANDARD_FORMAT_LABELS[format] || format} » n’est pas encore généré.`, true);
    return;
  }
  const teams = adminTeamsFor(tournamentId);
  if (teams.length < 2) { notify('Il faut au moins 2 équipes confirmées.', true); return; }
  if (format === 'double_elim' && ![4, 8, 16].includes(teams.length)) {
    notify(`La double élimination demande 4, 8 ou 16 équipes (actuellement ${teams.length}).`, true);
    return;
  }
  const poolCount = Number(t.format_config?.pool_count) || 2;
  if (format === 'groups_playoffs' && teams.length < poolCount * 2) {
    notify(`Il faut au moins ${poolCount * 2} équipes pour ${poolCount} poules.`, true);
    return;
  }
  if (!window.confirm(`Générer les matchs (${STANDARD_FORMAT_LABELS[format]}) pour ${teams.length} équipes ?\n\nLes matchs existants seront effacés.`)) return;
  const { error: delError } = await supabaseClient.from('nvg_tournament_matches').delete().eq('tournament_id', tournamentId);
  if (delError) { notify('Erreur : ' + delError.message, true); return; }
  if (format === 'swiss') {
    await loadMatchesOnly();
    await generateSwissRound(tournamentId);
    return;
  }
  let error;
  if (format === 'single_elim') error = await insertStandardBracket(tournamentId, teams);
  else if (format === 'double_elim') error = await insertStandardDoubleElim(tournamentId, teams);
  else if (format === 'groups_playoffs') {
    const groups = Array.from({ length: poolCount }, () => []);
    [...teams].sort(() => Math.random() - 0.5).forEach((team, i) => groups[i % poolCount].push(team));
    error = await insertStandardPools(tournamentId, groups, false);
  } else error = await insertStandardRoundRobin(tournamentId, teams, format === 'league');
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify('Matchs générés.');
  await loadMatchesOnly();
  renderAdminMatchPanel();
}

// Une ou plusieurs poules en round robin (aller, ou aller-retour).
async function insertStandardPools(tournamentId, groupsTeams, doubleLeg) {
  const letters = 'ABCDEFGH';
  const rows = [];
  groupsTeams.forEach((teams, gi) => {
    const rounds = roundRobinRounds(teams);
    const legs = doubleLeg ? [false, true] : [false];
    legs.forEach((reverse, leg) => {
      rounds.forEach((round, ri) => {
        round.forEach((pair, pi) => {
          if (!pair[0] || !pair[1]) return;
          const [a, b] = reverse ? [pair[1], pair[0]] : pair;
          rows.push({
            tournament_id: tournamentId,
            phase: 'pool',
            round: leg * rounds.length + ri + 1,
            position: pi + 1,
            group_name: letters[gi],
            label: groupsTeams.length > 1 ? `Poule ${letters[gi]}` : (doubleLeg && leg ? 'Retour' : 'Aller'),
            team_a: a.id,
            team_b: b.id,
            status: 'scheduled'
          });
        });
      });
    });
  });
  const { error } = await supabaseClient.from('nvg_tournament_matches').insert(rows);
  return error;
}

function insertStandardRoundRobin(tournamentId, teams, doubleLeg) {
  return insertStandardPools(tournamentId, [teams], doubleLeg);
}

// Pairage sans rematch, en suivant le classement : on prend le mieux classé et
// on cherche le premier adversaire compatible, avec retour arrière si besoin.
function swissPairs(list, played) {
  if (!list.length) return [];
  const [first, ...rest] = list;
  for (let i = 0; i < rest.length; i += 1) {
    const second = rest[i];
    if (played.has([first.id, second.id].sort().join('|'))) continue;
    const others = rest.filter((_, j) => j !== i);
    const tail = swissPairs(others, played);
    if (tail) return [[first, second], ...tail];
  }
  return null;
}

// Suisse : une ronde à la fois. Appariement par classement, en évitant les
// rencontres déjà jouées ; un nombre impair de joueurs donne une exemption
// (victoire) au moins bien classé qui n'en a pas encore eu.
async function generateSwissRound(tournamentId) {
  const t = tournamentById(tournamentId);
  if (!t || standardFormat(t) !== 'swiss') return;
  const teams = adminTeamsFor(tournamentId);
  const all = tournamentMatches.filter((m) => m.tournament_id === tournamentId);
  const pools = all.filter((m) => m.phase === 'pool');
  const current = pools.length ? Math.max(...pools.map((m) => m.round)) : 0;
  const total = Number(t.format_config?.rounds) || Math.ceil(Math.log2(Math.max(2, teams.length)));
  if (current >= total) { notify(`Les ${total} rondes sont jouées.`, true); return; }
  if (pools.some((m) => m.status !== 'finished')) { notify('Termine d’abord la ronde en cours.', true); return; }
  const order = current === 0
    ? [...teams].sort(() => Math.random() - 0.5)
    : standardStandings(all).map((r) => r.id);
  const ranked = [...teams].sort((x, y) => {
    const ix = order.indexOf(x.id);
    const iy = order.indexOf(y.id);
    return (ix < 0 ? 1e9 : ix) - (iy < 0 ? 1e9 : iy);
  });
  const played = new Set(pools.filter((m) => m.team_a && m.team_b).map((m) => [m.team_a, m.team_b].sort().join('|')));
  const hadBye = new Set(pools.filter((m) => m.team_a && !m.team_b).map((m) => m.team_a));
  const remaining = [...ranked];
  const rows = [];
  let bye = null;
  if (remaining.length % 2 === 1) {
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      if (!hadBye.has(remaining[i].id)) { bye = remaining[i]; break; }
    }
    if (!bye) bye = remaining[remaining.length - 1];
    remaining.splice(remaining.indexOf(bye), 1);
  }
  const round = current + 1;
  let position = 1;
  const pairs = swissPairs(remaining, played) || remaining.reduce((acc, team, i, list) => (
    i % 2 === 0 && list[i + 1] ? [...acc, [team, list[i + 1]]] : acc
  ), []);
  pairs.forEach(([a, b]) => {
    rows.push({ tournament_id: tournamentId, phase: 'pool', round, position: position++, group_name: 'A', label: `Ronde ${round}`, team_a: a.id, team_b: b.id, status: 'scheduled', points_a: 0, points_b: 0 });
  });
  if (bye) {
    rows.push({ tournament_id: tournamentId, phase: 'pool', round, position: position++, group_name: 'A', label: `Ronde ${round}`, team_a: bye.id, team_b: null, status: 'finished', winner_team: bye.id, points_a: 0, points_b: 0 });
  }
  const { error } = await supabaseClient.from('nvg_tournament_matches').insert(rows);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify(`Ronde ${round} générée.`);
  await loadMatchesOnly();
  renderAdminMatchPanel();
}

// Poules + élimination : les N premiers de chaque poule (tour par tour, en
// alternant les poules) forment le tableau, têtes de série comprises.
async function generateStandardPlayoffBracket(tournamentId) {
  const t = tournamentById(tournamentId);
  if (!t || standardFormat(t) !== 'groups_playoffs') return;
  const all = tournamentMatches.filter((m) => m.tournament_id === tournamentId);
  const pools = all.filter((m) => m.phase === 'pool');
  if (!pools.length) { notify('Génère d’abord les poules.', true); return; }
  if (pools.some((m) => m.status !== 'finished')) { notify('Termine d’abord tous les matchs de poule.', true); return; }
  const letters = [...new Set(pools.map((m) => m.group_name))].sort();
  const qualifiers = Number(t.format_config?.qualifiers_per_pool) || 2;
  const standingsByGroup = letters.map((g) => standardStandings(pools.filter((m) => m.group_name === g)));
  const seeds = [];
  for (let rank = 0; rank < qualifiers; rank += 1) {
    standingsByGroup.forEach((rows) => { if (rows[rank]) seeds.push({ id: rows[rank].id }); });
  }
  if (seeds.length < 2) { notify('Pas assez de qualifiés.', true); return; }
  if (t.format_config?.tree === 'double' && ![4, 8, 16].includes(seeds.length)) {
    notify(`La double élimination demande 4, 8 ou 16 qualifiés (actuellement ${seeds.length}).`, true);
    return;
  }
  if (!window.confirm(`Générer le tableau à ${seeds.length} qualifiés ?\n\nLe tableau existant sera effacé (les poules sont conservées).`)) return;
  const { error: delError } = await supabaseClient.from('nvg_tournament_matches').delete().eq('tournament_id', tournamentId).neq('phase', 'pool');
  if (delError) { notify('Erreur : ' + delError.message, true); return; }
  const error = t.format_config?.tree === 'double'
    ? await insertStandardDoubleElim(tournamentId, seeds, true)
    : await insertStandardBracket(tournamentId, seeds, true, true);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify('Tableau généré.');
  await loadMatchesOnly();
  renderAdminMatchPanel();
}

// Élimination directe avec exemptions : la taille du tableau est la puissance
// de 2 supérieure ou égale au nombre d'équipes. Un match avec une exemption est
// enregistré terminé et son vainqueur monte directement au tour suivant.
async function insertStandardBracket(tournamentId, teams, keepOrder = false, thirdPlace = false) {
  const shuffled = [...teams];
  if (!keepOrder) {
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }
  let size = 2;
  while (size < shuffled.length) size *= 2;
  const seedOf = (seed) => shuffled[seed - 1] || null;
  const order = bracketSeedOrder(size);
  const firstRound = [];
  for (let i = 0; i < size; i += 2) firstRound.push([seedOf(order[i]), seedOf(order[i + 1])]);
  const totalRounds = Math.log2(size);
  let previous = [];
  let semis = [];
  for (let round = 1; round <= totalRounds; round += 1) {
    const count = size / (2 ** round);
    const rows = [];
    for (let pos = 1; pos <= count; pos += 1) {
      const pair = round === 1 ? firstRound[pos - 1] : [null, null];
      const bye = round === 1 && (!pair[0] || !pair[1]);
      const winner = bye ? (pair[0] || pair[1]) : null;
      rows.push({
        tournament_id: tournamentId,
        phase: 'bracket',
        round,
        position: pos,
        label: bracketRoundLabel(round, totalRounds),
        status: bye ? 'finished' : 'scheduled',
        team_a: pair[0]?.id || null,
        team_b: pair[1]?.id || null,
        winner_team: winner?.id || null
      });
    }
    const { data, error } = await supabaseClient.from('nvg_tournament_matches').insert(rows).select('id,position,winner_team');
    if (error) return error;
    for (const prev of previous) {
      const target = data.find((x) => x.position === Math.floor((prev.position - 1) / 2) + 1);
      if (!target) continue;
      const column = prev.position % 2 === 1 ? 'team_a' : 'team_b';
      const update = { next_match_id: target.id, next_slot: prev.position % 2 === 1 ? 'a' : 'b' };
      const { error: linkError } = await supabaseClient.from('nvg_tournament_matches').update(update).eq('id', prev.id);
      if (linkError) return linkError;
      if (prev.winner_team) {
        const { error: byeError } = await supabaseClient.from('nvg_tournament_matches')
          .update({ [column]: prev.winner_team }).eq('id', target.id);
        if (byeError) return byeError;
      }
    }
    if (round === totalRounds - 1) semis = data;
    previous = data;
  }
  if (thirdPlace && totalRounds >= 2) {
    const { data: third, error: thirdError } = await supabaseClient.from('nvg_tournament_matches')
      .insert({ tournament_id: tournamentId, phase: 'third', round: totalRounds, position: 1, label: 'Petite finale', status: 'scheduled' })
      .select('id')
      .single();
    if (thirdError) return thirdError;
    for (const semi of semis) {
      const { error: linkError } = await supabaseClient.from('nvg_tournament_matches')
        .update({ loser_next_match_id: third.id, loser_next_slot: semi.position === 1 ? 'a' : 'b' })
        .eq('id', semi.id);
      if (linkError) return linkError;
    }
  }
  return null;
}

// Double élimination (4, 8 ou 16 équipes, sans exemption) : tableau des
// gagnants, repêchage et grande finale. Le perdant d'un match du tableau des
// gagnants descend dans le repêchage ; le vainqueur du repêchage affronte le
// vainqueur du tableau des gagnants en grande finale.
async function insertStandardDoubleElim(tournamentId, teams, keepOrder = false) {
  const seeded = [...teams];
  if (!keepOrder) {
    for (let i = seeded.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [seeded[i], seeded[j]] = [seeded[j], seeded[i]];
    }
  }
  const size = seeded.length;
  const rounds = Math.log2(size);
  const lowerRounds = 2 * (rounds - 1);
  const winners = (r, p) => `W${r}-${p}`;
  const losers = (r, p) => `L${r}-${p}`;
  const grand = 'G-1';
  const nodes = new Map();
  const add = (key, phase, round, position, label, teamA = null, teamB = null) => {
    nodes.set(key, {
      key,
      id: crypto.randomUUID(),
      tournament_id: tournamentId,
      phase,
      round,
      position,
      label,
      team_a: teamA,
      team_b: teamB,
      status: 'scheduled',
      next: null,
      loser: null
    });
  };
  for (let r = 1; r <= rounds; r += 1) {
    for (let p = 1; p <= size / 2 ** r; p += 1) {
      const first = r === 1 ? seeded[bracketSeedOrder(size)[(p - 1) * 2] - 1] : null;
      const second = r === 1 ? seeded[bracketSeedOrder(size)[(p - 1) * 2 + 1] - 1] : null;
      add(winners(r, p), 'winners', r, p, bracketRoundLabel(r, rounds), first?.id || null, second?.id || null);
    }
  }
  for (let r = 1; r <= lowerRounds; r += 1) {
    const count = r % 2 === 1 ? size / 2 ** ((r - 1) / 2 + 2) : size / 2 ** (r / 2 + 1);
    for (let p = 1; p <= count; p += 1) add(losers(r, p), 'losers', r, p, `Repêchage ${r}`);
  }
  add(grand, 'grand', 1, 1, 'Grande finale');

  const link = (from, to, slot) => {
    if (!to) return;
    from.next = { id: nodes.get(to).id, slot };
  };
  const dropTo = (from, to, slot) => {
    from.loser = { id: nodes.get(to).id, slot };
  };
  for (let r = 1; r <= rounds; r += 1) {
    for (let p = 1; p <= size / 2 ** r; p += 1) {
      const node = nodes.get(winners(r, p));
      if (r < rounds) link(node, winners(r + 1, Math.ceil(p / 2)), p % 2 === 1 ? 'a' : 'b');
      else link(node, grand, 'a');
      if (r === 1) dropTo(node, losers(1, Math.ceil(p / 2)), p % 2 === 1 ? 'a' : 'b');
      else dropTo(node, losers(2 * (r - 1), size / 2 ** r + 1 - p), 'b');
    }
  }
  for (let r = 1; r <= lowerRounds; r += 1) {
    const count = r % 2 === 1 ? size / 2 ** ((r - 1) / 2 + 2) : size / 2 ** (r / 2 + 1);
    for (let p = 1; p <= count; p += 1) {
      const node = nodes.get(losers(r, p));
      if (r === lowerRounds) link(node, grand, 'b');
      else if (r % 2 === 1) link(node, losers(r + 1, p), 'a');
      else link(node, losers(r + 1, Math.ceil(p / 2)), p % 2 === 1 ? 'a' : 'b');
    }
  }

  const rows = [...nodes.values()].map((n) => ({
    id: n.id,
    tournament_id: n.tournament_id,
    phase: n.phase,
    round: n.round,
    position: n.position,
    label: n.label,
    team_a: n.team_a,
    team_b: n.team_b,
    status: n.status,
    next_match_id: n.next?.id || null,
    next_slot: n.next?.slot || null,
    loser_next_match_id: n.loser?.id || null,
    loser_next_slot: n.loser?.slot || null
  }));
  const { error } = await supabaseClient.from('nvg_tournament_matches').insert(rows);
  return error;
}

// Classement d'une phase en round robin : victoire 3, nul 1, défaite 0.
function standardStandings(matches) {
  const rows = new Map();
  const ensure = (id) => {
    if (!id) return null;
    if (!rows.has(id)) rows.set(id, { id, played: 0, wins: 0, draws: 0, losses: 0, points: 0, scored: 0, conceded: 0 });
    return rows.get(id);
  };
  const poolMatches = matches.filter((m) => m.phase === 'pool');
  poolMatches.forEach((m) => { ensure(m.team_a); ensure(m.team_b); });
  poolMatches.filter((m) => m.status === 'finished').forEach((m) => {
    const a = ensure(m.team_a);
    if (a && !m.team_b) {
      // Exemption (suisse) : victoire sans score.
      a.played += 1; a.wins += 1; a.points += 3;
      return;
    }
    const b = ensure(m.team_b);
    if (!a || !b) return;
    const pa = Number(m.points_a) || 0;
    const pb = Number(m.points_b) || 0;
    a.played += 1; b.played += 1;
    a.scored += pa; a.conceded += pb;
    b.scored += pb; b.conceded += pa;
    if (pa > pb) { a.wins += 1; a.points += 3; b.losses += 1; }
    else if (pb > pa) { b.wins += 1; b.points += 3; a.losses += 1; }
    else { a.draws += 1; b.draws += 1; a.points += 1; b.points += 1; }
  });
  return [...rows.values()].sort((x, y) => y.points - x.points
    || (y.scored - y.conceded) - (x.scored - x.conceded)
    || y.scored - x.scored);
}

function standardStandingsTable(matches) {
  const rows = standardStandings(matches);
  if (!rows.length) return '';
  return `
    <div class="overflow-hidden rounded-xl border border-[#1f293d] bg-[#07090e]">
      <table class="w-full text-[10px]">
        <thead class="bg-white/5 text-gray-400">
          <tr>
            <th class="px-2 py-1 text-left font-black">Équipe</th>
            <th class="px-1 py-1 text-center font-black">J</th>
            <th class="px-1 py-1 text-center font-black">V</th>
            <th class="px-1 py-1 text-center font-black">N</th>
            <th class="px-1 py-1 text-center font-black">D</th>
            <th class="px-2 py-1 text-center font-black">Pts</th>
            <th class="px-2 py-1 text-right font-black">Diff.</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `<tr class="border-t border-[#1f293d]">
            <td class="truncate px-2 py-1 font-bold text-gray-200">${escapeHtml(teamLabelById(r.id))}</td>
            <td class="px-1 py-1 text-center text-gray-400">${r.played}</td>
            <td class="px-1 py-1 text-center text-gray-400">${r.wins}</td>
            <td class="px-1 py-1 text-center text-gray-400">${r.draws}</td>
            <td class="px-1 py-1 text-center text-gray-400">${r.losses}</td>
            <td class="px-2 py-1 text-center font-black text-white">${r.points}</td>
            <td class="px-2 py-1 text-right ${r.scored - r.conceded >= 0 ? 'text-emerald-400' : 'text-red-400'}">${r.scored - r.conceded > 0 ? '+' : ''}${formatPoints(r.scored - r.conceded)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// Filtres des matchs de poule : par poule et par journée.
function standardPoolFilters(scopeId, matches) {
  const groups = [...new Set(matches.map((m) => m.group_name).filter(Boolean))].sort();
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const select = 'rounded-lg border border-[#1f293d] bg-[#07090e] px-2 py-1.5 text-[10px] font-bold text-white';
  return `<div class="flex flex-wrap items-center gap-2">
    ${groups.length > 1 ? `<select data-filter="group" onchange="filterStandardPools('${scopeId}')" class="${select}" aria-label="Filtrer par poule">
      <option value="all">Toutes les poules</option>
      ${groups.map((g) => `<option value="${escapeHtml(g)}">Poule ${escapeHtml(g)}</option>`).join('')}
    </select>` : ''}
    <select data-filter="round" onchange="filterStandardPools('${scopeId}')" class="${select}" aria-label="Filtrer par round">
      <option value="all">Tous les rounds</option>
      ${rounds.map((r) => `<option value="${r}">Round ${r}</option>`).join('')}
    </select>
  </div>`;
}

function filterStandardPools(scopeId) {
  const root = document.getElementById(scopeId);
  if (!root) return;
  const group = root.querySelector('[data-filter="group"]')?.value || 'all';
  const round = root.querySelector('[data-filter="round"]')?.value || 'all';
  root.querySelectorAll('[data-pool-item]').forEach((el) => {
    const visible = (group === 'all' || el.dataset.group === group) && (round === 'all' || el.dataset.round === round);
    el.style.display = visible ? '' : 'none';
  });
}

// Un classement par poule s'il y a plusieurs poules, sinon un seul classement.
function standardStandingsBlocks(matches) {
  const groups = [...new Set(matches.filter((m) => m.phase === 'pool').map((m) => m.group_name))].sort();
  if (groups.length <= 1) return standardStandingsTable(matches);
  return groups.map((g) => `<div class="space-y-1">
    <p class="text-[10px] font-black uppercase tracking-wider text-gray-400">Poule ${escapeHtml(g)}</p>
    ${standardStandingsTable(matches.filter((m) => m.group_name === g))}
  </div>`).join('');
}

function standardMatchScore(m) {
  if (m.status !== 'finished') return '—';
  return `${formatPoints(m.points_a)} — ${formatPoints(m.points_b)}`;
}

function standardPublicMatchCard(m, labelText = '') {
  const finished = m.status === 'finished';
  const exempt = !m.team_a || !m.team_b;
  const winnerA = finished && m.winner_team && m.winner_team === m.team_a;
  const winnerB = finished && m.winner_team && m.winner_team === m.team_b;
  return `
    <div class="rounded-lg border border-[#1f293d] bg-[#07090e] p-2.5">
      ${labelText ? `<p class="text-[9px] font-black uppercase tracking-wider text-gray-500">${escapeHtml(labelText)}</p>` : ''}
      ${standardMatchGameLine(m)}
      <div class="mt-0.5 flex items-center justify-between gap-2">
        <div class="min-w-0 space-y-0.5">
          <p class="truncate text-[11px] font-bold ${winnerA ? 'text-emerald-300' : 'text-gray-200'}">${escapeHtml(teamLabelById(m.team_a))}</p>
          <p class="truncate text-[11px] font-bold ${winnerB ? 'text-emerald-300' : 'text-gray-200'}">${escapeHtml(teamLabelById(m.team_b))}</p>
        </div>
        <p class="shrink-0 text-sm font-black ${finished ? 'text-white' : 'text-gray-500'}">${exempt && !m.team_a && !m.team_b ? '' : standardMatchScore(m)}</p>
      </div>
      ${exempt && (m.team_a || m.team_b) ? '<p class="mt-1 text-[9px] text-gray-500">Exempt</p>' : ''}
    </div>`;
}

// Regroupe les matchs d'élimination par phase (tableau, gagnants, repêchage,
// grande finale) puis par tour.
function standardBracketGroups(matches) {
  const titles = { bracket: 'Tableau', winners: 'Tableau des gagnants', losers: 'Repêchage', grand: 'Grande finale', third: 'Petite finale' };
  return Object.keys(titles).map((phase) => {
    const list = matches.filter((m) => m.phase === phase);
    if (!list.length) return null;
    const rounds = [...new Set(list.map((m) => m.round))].sort((a, b) => a - b);
    return {
      title: titles[phase],
      rounds: rounds.map((round) => ({
        label: list.find((m) => m.round === round)?.label || `Tour ${round}`,
        matches: list.filter((m) => m.round === round).sort((a, b) => a.position - b.position)
      }))
    };
  }).filter(Boolean);
}

function standardBracketHtml(matches, cardFn) {
  return standardBracketGroups(matches).map((group) => `<div class="space-y-2">
    <h4 class="text-[10px] font-black uppercase tracking-wider text-amber-300">${escapeHtml(group.title)}</h4>
    ${group.rounds.map((round) => `<div>
      <p class="mb-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400">${escapeHtml(round.label)}</p>
      <div class="grid gap-2 sm:grid-cols-2">${round.matches.map((m) => cardFn(m)).join('')}</div>
    </div>`).join('')}
  </div>`).join('');
}

// Affichage en arbre : une colonne par tour, chaque match centré entre ses deux qualifiés.
const TREE_ROW_PX = 36;
const TREE_CARD_PX = 64;
const TREE_LINE = '#334155';

function standardTreeCard(m) {
  const finished = m.status === 'finished';
  const row = (team, score, winner) => `<div class="flex items-center justify-between gap-2 px-2 ${winner ? 'font-black text-emerald-300' : 'text-gray-300'}" style="height:${TREE_CARD_PX / 2 - 1}px">
    <span class="truncate text-[10px]">${escapeHtml(team ? teamLabelById(team) : (m.team_a || m.team_b ? 'Exempt' : 'À déterminer'))}</span>
    <span class="shrink-0 text-[10px] font-black">${finished && team ? formatPoints(score) : ''}</span>
  </div>`;
  const winA = finished && m.winner_team && m.winner_team === m.team_a;
  const winB = finished && m.winner_team && m.winner_team === m.team_b;
  return `<div class="rounded-lg border border-[#1f293d] bg-[#0f141f] overflow-hidden" style="height:${TREE_CARD_PX}px">
    ${row(m.team_a, m.points_a, winA)}
    <div class="border-t border-[#1f293d]"></div>
    ${row(m.team_b, m.points_b, winB)}
  </div>`;
}

function standardTreeHtml(list) {
  const rounds = [...new Set(list.map((m) => m.round))].sort((a, b) => a - b);
  const count = rounds.length;
  const first = list.filter((m) => m.round === rounds[0]).length;
  const rowsTotal = first * 2;
  const labels = rounds.map((round, ri) => `<p style="grid-column:${ri + 1};grid-row:1" class="text-center text-[10px] font-black uppercase tracking-wider text-gray-400">${escapeHtml(bracketRoundLabel(round, count))}</p>`);
  const cards = rounds.flatMap((round, ri) => {
    const span = 2 ** (ri + 1);
    return list.filter((m) => m.round === round)
      .sort((a, b) => a.position - b.position)
      .map((m, p) => {
        const hasNext = ri < count - 1;
        const upper = p % 2 === 0;
        const connectors = hasNext ? `
          <span class="absolute" style="right:-12px;top:50%;width:12px;border-top:1px solid ${TREE_LINE}"></span>
          ${upper ? `<span class="absolute" style="right:-12px;top:50%;height:${span * TREE_ROW_PX}px;border-right:1px solid ${TREE_LINE}"></span>` : ''}` : '';
        return `<div class="relative self-center" style="grid-column:${ri + 1};grid-row:${p * span + 2} / span ${span}">
          ${standardTreeCard(m)}
          ${connectors}
        </div>`;
      });
  });
  return `<div class="overflow-x-auto pb-2">
    <div class="grid" style="grid-template-columns:repeat(${count},minmax(170px,1fr));column-gap:24px;grid-template-rows:24px repeat(${rowsTotal},${TREE_ROW_PX}px);min-width:${count * 200}px">
      ${labels.join('')}
      ${cards.join('')}
    </div>
  </div>`;
}

// Tableau public : arbre pour le tableau et les gagnants, cartes pour le repêchage, la finale et la petite finale.
function standardBracketPublicHtml(matches) {
  return ['bracket', 'winners', 'losers', 'grand', 'third'].map((phase) => {
    const list = matches.filter((m) => m.phase === phase);
    if (!list.length) return '';
    if (phase === 'bracket' || phase === 'winners') {
      return `<div class="space-y-2">
        <h4 class="text-[10px] font-black uppercase tracking-wider text-amber-300">${phase === 'bracket' ? 'Tableau' : 'Tableau des gagnants'}</h4>
        ${standardTreeHtml(list)}
      </div>`;
    }
    return standardBracketHtml(list, (m) => standardPublicMatchCard(m));
  }).join('');
}

function standardCompetitionBlock(t) {
  const matches = tournamentMatches.filter((m) => m.tournament_id === t.id);
  if (!matches.length) return '';
  const format = standardFormat(t);
  const pools = matches.filter((m) => m.phase === 'pool');
  const bracket = matches.filter((m) => m.phase !== 'pool');
  return `
    <div class="space-y-4">
      ${pools.length ? `<div>
        <h3 class="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white">🏟️ Classement</h3>
        ${standardStandingsBlocks(matches)}
        <div id="stdPoolsPublic" class="mt-2 space-y-2">
          ${standardPoolFilters('stdPoolsPublic', pools)}
          <div class="grid gap-2 sm:grid-cols-2">
            ${pools.sort((a, b) => a.round - b.round || a.position - b.position).map((m) => `<div data-pool-item data-group="${escapeHtml(m.group_name || '')}" data-round="${m.round}">${standardPublicMatchCard(m, `${m.label || 'Match'} · Round ${m.round}`)}</div>`).join('')}
          </div>
        </div>
      </div>` : ''}
      ${bracket.length ? `<div class="space-y-3">
        <h3 class="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white">🏆 ${escapeHtml(STANDARD_FORMAT_LABELS[format] || 'Tableau')}</h3>
        ${standardBracketPublicHtml(bracket)}
      </div>` : ''}
    </div>`;
}

function adminStandardMatchCard(m, labelText = '') {
  const matchTournament = tournamentById(m.tournament_id);
  if (isStandardBo3(m, matchTournament)) return adminStandardBo3Card(m, matchTournament, labelText);
  const finished = m.status === 'finished';
  const exempt = !m.team_a || !m.team_b;
  if (exempt) {
    return `<div class="rounded-lg border border-[#1f293d] bg-[#07090e] p-2.5 text-[10px] text-gray-500">${labelText ? `${escapeHtml(labelText)} · ` : ''}${m.team_a || m.team_b ? `${escapeHtml(teamLabelById(m.team_a || m.team_b))} · exempt` : 'En attente des qualifiés'}</div>`;
  }
  const t = tournamentById(m.tournament_id);
  const mode = standardScoringMode(t);
  const max = mode === 'bo3' ? 2 : mode === 'wins' ? standardDuelCount(t) : null;
  const maxAttr = max ? `max="${max}"` : '';
  return `
    <div class="rounded-lg border border-[#1f293d] bg-[#121722] px-2.5 py-2">
      ${labelText ? `<p class="mb-1 text-[9px] font-black uppercase tracking-wider text-gray-500">${escapeHtml(labelText)}</p>` : ''}
      <div class="flex flex-wrap items-center gap-2">
        <span class="min-w-0 flex-1 truncate text-[10px] font-bold text-gray-200">${escapeHtml(teamLabelById(m.team_a))}</span>
        <input id="std-m-${m.id}-a" type="number" min="0" ${maxAttr} value="${finished ? formatPoints(m.points_a) : ''}" aria-label="Score équipe A" class="w-14 rounded border border-[#1f293d] bg-[#07090e] px-1.5 py-1 text-center text-[11px] text-white">
        <span class="text-gray-500">–</span>
        <input id="std-m-${m.id}-b" type="number" min="0" ${maxAttr} value="${finished ? formatPoints(m.points_b) : ''}" aria-label="Score équipe B" class="w-14 rounded border border-[#1f293d] bg-[#07090e] px-1.5 py-1 text-center text-[11px] text-white">
        <span class="min-w-0 flex-1 truncate text-right text-[10px] font-bold text-gray-200">${escapeHtml(teamLabelById(m.team_b))}</span>
        <button onclick="saveStandardMatchResult('${m.id}')" class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300 transition hover:bg-amber-500/20">Enregistrer</button>
      </div>
    </div>`;
}

// Les résultats ne se saisissent qu'une fois le tournoi « en cours ».
function resultsOpen(t) {
  if (t?.status === 'running') return true;
  notify('Les résultats se saisissent quand le tournoi est « en cours ».', true);
  return false;
}

// Mode de score d'un tournoi standard = mode du jeu choisi (confrontation par défaut).
function standardScoringMode(t) {
  return gameById(t?.game_id)?.scoring_mode || 'versus';
}

// Nombre de duels 1v1 d'un tournoi « victoires » : la taille d'équipe du tournoi.
function standardDuelCount(t) {
  return Number(t?.team_min) || 5;
}

function standardScoreHint(t) {
  const mode = standardScoringMode(t);
  if (mode === 'cumulative') return 'Total de points de chaque équipe : le plus haut gagne.';
  if (mode === 'wins') return `Duels 1v1 gagnés sur ${standardDuelCount(t)} : l’équipe qui en gagne le plus remporte le match.`;
  if (mode === 'bo3') return 'Série BO3 entre binômes : 2–0 ou 2–1.';
  return 'Score de chaque équipe.';
}

// Renvoie un message d'erreur si le score ne correspond pas au mode du jeu.
function standardScoreRule(t, a, b) {
  const mode = standardScoringMode(t);
  if (mode === 'wins') {
    const duels = standardDuelCount(t);
    if (a + b > duels) return `Indique au plus ${duels} duels gagnés au total.`;
    if (a + b === 0) return 'Indique au moins un duel gagné.';
  }
  if (mode === 'bo3' && !(Math.max(a, b) === 2 && Math.min(a, b) <= 1)) {
    return 'Une série BO3 se termine 2–0 ou 2–1.';
  }
  return null;
}

// --- Poules + arbre (multigaming) : un jeu par tour, finale BO3 ---

function standardTreeSize(t) {
  return (Number(t?.format_config?.pool_count) || 2) * (Number(t?.format_config?.qualifiers_per_pool) || 2);
}

// La finale (arbre simple : dernier tour ; arbre double : grande finale) se joue en BO3.
function isStandardBo3(m, t) {
  if (!t || standardFormat(t) !== 'groups_playoffs') return false;
  const rounds = Math.log2(standardTreeSize(t));
  return m.phase === 'grand' || (m.phase === 'bracket' && m.round === rounds);
}

// Clé du tour de jeu : P1 = journée 1 des poules, B2 = 2e tour de l'arbre, etc.
function standardRoundKey(m, t) {
  const rounds = Math.log2(standardTreeSize(t));
  if (m.phase === 'pool') return `P${m.round}`;
  if (m.phase === 'third') return 'T';
  if (isStandardBo3(m, t)) return null;
  if (m.phase === 'bracket') return `B${m.round}`;
  if (m.phase === 'winners') return m.round === rounds ? 'WF' : `W${m.round}`;
  if (m.phase === 'losers') return `L${m.round}`;
  return null;
}

// Liste des tours à associer à un jeu, selon la taille de l'arbre.
function standardRoundKeys(t) {
  const rounds = Math.log2(standardTreeSize(t));
  const teams = adminTeamsFor(t.id).length || standardTreeSize(t) * 2;
  const poolSize = Math.ceil(teams / (Number(t.format_config?.pool_count) || 2));
  const poolRounds = poolSize % 2 === 0 ? poolSize - 1 : poolSize;
  const keys = [];
  for (let r = 1; r <= poolRounds; r += 1) keys.push(`P${r}`);
  if (t.format_config?.tree === 'double') {
    for (let r = 1; r < rounds; r += 1) keys.push(`W${r}`);
    keys.push('WF');
    for (let r = 1; r <= 2 * (rounds - 1); r += 1) keys.push(`L${r}`);
  } else {
    for (let r = 1; r < rounds; r += 1) keys.push(`B${r}`);
    keys.push('T');
  }
  keys.push('F1', 'F2', 'F3');
  return keys;
}

function standardRoundKeyLabel(key) {
  if (key.startsWith('P')) return `Poules · round ${key.slice(1)}`;
  if (key === 'WF') return 'Finale des gagnants';
  if (key.startsWith('W')) return `Gagnants · tour ${key.slice(1)}`;
  if (key.startsWith('L')) return `Repêchage · tour ${key.slice(1)}`;
  if (key.startsWith('B')) return `Tableau · tour ${key.slice(1)}`;
  if (key === 'T') return 'Petite finale (BO1)';
  if (key.startsWith('F')) return `Finale BO3 · jeu ${key.slice(1)}`;
  return key;
}

// Ligne « jeu du tour » d'un match BO1 (la finale BO3 affiche chaque jeu à part).
function standardMatchGameLine(m) {
  const t = tournamentById(m.tournament_id);
  if (!t || isStandardBo3(m, t)) return '';
  const gameId = standardRoundGameId(t, standardRoundKey(m, t));
  if (!gameId) return '';
  const logo = gameLogo(gameId);
  return `<p class="flex items-center gap-1 text-[9px] font-bold text-violet-300">${logo ? `<img src="${logo}" alt="" onerror="this.remove()" class="inline-block h-[1em] w-[1em] shrink-0 object-contain">` : ''}<span class="truncate">${escapeHtml(gameName(gameId))}</span></p>`;
}

function standardRoundGameId(t, key) {
  return t?.format_config?.round_games?.[key] || null;
}

function standardGameLabel(gameId) {
  return gameId ? gameName(gameId) : 'Jeu à définir';
}

function standardRoundGamesForm(t) {
  const current = t.format_config?.round_games || {};
  const options = (selected) => '<option value="">—</option>'
    + games.map((g) => `<option value="${g.id}" ${g.id === selected ? 'selected' : ''}>${escapeHtml(gameOptionLabel(g))}</option>`).join('');
  return `
    <section class="space-y-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
      <h3 class="text-[10px] font-black uppercase tracking-wider text-violet-300">🎮 Jeu de chaque tour</h3>
      <p class="text-[10px] text-gray-500">Un jeu par tour, qu’un jeu peut retrouver à un autre tour. Modifiable avant ou pendant l’évènement : les matchs à venir prennent le jeu de leur tour.</p>
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        ${standardRoundKeys(t).map((key) => `<label class="block">
          <span class="mb-0.5 block text-[9px] font-black uppercase tracking-wider text-gray-500">${escapeHtml(standardRoundKeyLabel(key))}</span>
          <select id="std-rg-${key}" class="${MANAGE_INPUT_CLASS}">${options(current[key])}</select>
        </label>`).join('')}
      </div>
      <button onclick="saveStandardRoundGames('${t.id}')" class="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[10px] font-bold text-violet-300 transition hover:bg-violet-500/20">Enregistrer les jeux</button>
    </section>`;
}

async function saveStandardRoundGames(tournamentId) {
  const t = tournamentById(tournamentId);
  if (!t) return;
  const map = {};
  standardRoundKeys(t).forEach((key) => {
    const value = $(`std-rg-${key}`)?.value;
    if (value) map[key] = value;
  });
  const { error } = await supabaseClient.from('nvg_tournaments')
    .update({ format_config: { ...t.format_config, round_games: map } })
    .eq('id', tournamentId);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify('Jeux par tour enregistrés.');
  await loadPublic();
  renderAdminMatchPanel();
}

function adminStandardBo3Card(m, t, labelText = '') {
  const teamA = teamLabelById(m.team_a);
  const teamB = teamLabelById(m.team_b);
  if (!m.team_a || !m.team_b) {
    return `<div class="rounded-lg border border-[#1f293d] bg-[#07090e] p-2.5 text-[10px] text-gray-500">${labelText ? `${escapeHtml(labelText)} · ` : ''}En attente des qualifiés</div>`;
  }
  const picked = new Map((Array.isArray(m.games) ? m.games : []).map((g) => [Number(g.slot), g.winner]));
  const finished = m.status === 'finished';
  return `
    <div class="space-y-1.5 rounded-lg border border-amber-500/30 bg-[#121722] px-2.5 py-2">
      <p class="text-[9px] font-black uppercase tracking-wider text-amber-300">${escapeHtml(labelText || m.label || 'Finale')} · BO3</p>
      <p class="text-[10px] font-bold text-gray-200">${escapeHtml(teamA)} <span class="text-gray-500">contre</span> ${escapeHtml(teamB)}</p>
      ${[1, 2, 3].map((n) => `<label class="flex items-center gap-2 text-[10px]">
        <span class="w-44 shrink-0 truncate text-gray-400">Jeu ${n} · ${escapeHtml(standardGameLabel(standardRoundGameId(t, `F${n}`)))}</span>
        <select id="std-g-${m.id}-${n}" class="${MANAGE_INPUT_CLASS} py-1">
          <option value="">—</option>
          <option value="a" ${picked.get(n) === 'a' ? 'selected' : ''}>${escapeHtml(teamA)}</option>
          <option value="b" ${picked.get(n) === 'b' ? 'selected' : ''}>${escapeHtml(teamB)}</option>
        </select>
      </label>`).join('')}
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-[10px] text-gray-500">${finished ? `Vainqueur : ${escapeHtml(teamLabelById(m.winner_team))}` : `Score : ${formatPoints(m.points_a)} — ${formatPoints(m.points_b)}`}</span>
        <button onclick="saveStandardMatchResult('${m.id}')" class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300 transition hover:bg-amber-500/20">Enregistrer</button>
      </div>
    </div>`;
}

// Saisie d'une finale BO3 : jeux renseignés dans l'ordre, la série s'arrête à 2 manches gagnées.
async function saveStandardBo3Result(match, t) {
  if (!match.team_a || !match.team_b) { notify('Les deux équipes ne sont pas encore connues.', true); return; }
  const played = [];
  let a = 0;
  let b = 0;
  let gap = false;
  for (let n = 1; n <= 3; n += 1) {
    const winner = $(`std-g-${match.id}-${n}`)?.value || '';
    if (!winner) { gap = true; continue; }
    if (gap) { notify('Renseigne les jeux dans l’ordre (jeu 1, puis 2, puis 3).', true); return; }
    if (a === 2 || b === 2) continue;
    played.push({ slot: n, winner, game_id: standardRoundGameId(t, `F${n}`) });
    if (winner === 'a') a += 1; else b += 1;
  }
  if (!played.length) { notify('Indique le résultat d’au moins un jeu.', true); return; }
  const finished = a === 2 || b === 2;
  const winnerTeam = a === 2 ? match.team_a : b === 2 ? match.team_b : null;
  const loserTeam = a === 2 ? match.team_b : b === 2 ? match.team_a : null;
  const patch = {
    games: played,
    points_a: a,
    points_b: b,
    winner_team: winnerTeam,
    status: finished ? 'finished' : 'live',
    updated_at: new Date().toISOString()
  };
  const { error } = await supabaseClient.from('nvg_tournament_matches').update(patch).eq('id', match.id);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  if (finished) await advanceStandardMatch({ ...match, ...patch }, winnerTeam, loserTeam);
  notify(finished ? 'Finale terminée.' : 'Résultat enregistré.');
  await loadMatchesOnly();
  renderAdminMatchPanel();
}

// Envoie le vainqueur vers le match suivant et le perdant vers le repêchage.
async function advanceStandardMatch(match, winnerId, loserId) {
  const now = new Date().toISOString();
  if (match.next_match_id && match.next_slot && winnerId) {
    await supabaseClient.from('nvg_tournament_matches')
      .update({ [match.next_slot === 'a' ? 'team_a' : 'team_b']: winnerId, updated_at: now })
      .eq('id', match.next_match_id);
  }
  if (match.loser_next_match_id && match.loser_next_slot && loserId) {
    await supabaseClient.from('nvg_tournament_matches')
      .update({ [match.loser_next_slot === 'a' ? 'team_a' : 'team_b']: loserId, updated_at: now })
      .eq('id', match.loser_next_match_id);
  }
}

async function saveStandardMatchResult(matchId) {
  const match = tournamentMatches.find((m) => m.id === matchId);
  if (!match) return;
  const matchTournament = tournamentById(match.tournament_id);
  if (!resultsOpen(matchTournament)) return;
  if (isStandardBo3(match, matchTournament)) {
    await saveStandardBo3Result(match, matchTournament);
    return;
  }
  const aEl = $(`std-m-${matchId}-a`);
  const bEl = $(`std-m-${matchId}-b`);
  if (!aEl || !bEl) return;
  if (aEl.value === '' || bEl.value === '') { notify('Indique le score des deux équipes.', true); return; }
  const a = Number(aEl.value);
  const b = Number(bEl.value);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    notify('Les scores doivent être des entiers positifs.', true);
    return;
  }
  const t = tournamentById(match.tournament_id);
  const rule = standardScoreRule(t, a, b);
  if (rule) { notify(rule, true); return; }
  const elimination = match.phase !== 'pool';
  if (elimination && a === b) { notify('Pas d’égalité en élimination directe.', true); return; }
  if (!match.team_a || !match.team_b) { notify('Les deux équipes ne sont pas encore connues.', true); return; }
  const next = match.next_match_id ? tournamentMatches.find((m) => m.id === match.next_match_id) : null;
  if (match.status === 'finished' && next && next.status === 'finished') {
    notify('Le match suivant est déjà joué : le résultat ne peut plus être modifié.', true);
    return;
  }
  const winner = a > b ? match.team_a : b > a ? match.team_b : null;
  const loser = a > b ? match.team_b : a < b ? match.team_a : null;
  const patch = {
    points_a: a,
    points_b: b,
    winner_team: winner,
    status: 'finished',
    updated_at: new Date().toISOString()
  };
  const { error } = await supabaseClient.from('nvg_tournament_matches').update(patch).eq('id', matchId);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  if (elimination) await advanceStandardMatch({ ...match, ...patch }, winner, loser);
  notify('Score enregistré.');
  await loadMatchesOnly();
  renderAdminMatchPanel();
}

function renderStandardMatchPanel(t) {
  const matches = tournamentMatches.filter((m) => m.tournament_id === t.id);
  const teams = adminTeamsFor(t.id);
  const format = standardFormat(t);
  const generated = STANDARD_GENERATED_FORMATS.includes(format);
  $('adminMatchSubtitle').textContent = `${t.name} · ${STANDARD_FORMAT_LABELS[format] || format} · ${teams.length} équipe(s) confirmée(s) · ${standardScoreHint(t)}${t.status === 'running' ? '' : ' · résultats verrouillés (tournoi non « en cours »)'}`;
  $('adminMatchTools').innerHTML = `
    ${generated ? `<button onclick="generateStandardMatches('${t.id}')" class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[10px] font-bold text-amber-300 transition hover:bg-amber-500/20">🏗️ ${format === 'swiss' ? 'Générer la ronde 1' : 'Générer les matchs'}</button>` : ''}
    ${format === 'swiss' && matches.length ? `<button onclick="generateSwissRound('${t.id}')" class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-300 transition hover:bg-emerald-500/20">➕ Ronde suivante</button>` : ''}
    ${format === 'groups_playoffs' && matches.some((m) => m.phase === 'pool') ? `<button onclick="generateStandardPlayoffBracket('${t.id}')" class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-300 transition hover:bg-emerald-500/20">🏁 Générer le tableau</button>` : ''}
    ${matches.length ? `<button onclick="deleteBo9Matches('${t.id}')" class="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold text-red-300 transition hover:bg-red-500/20">🗑️ Effacer les matchs</button>` : ''}
    ${!generated ? '<span class="text-[10px] text-gray-500">Ce format n’est pas encore généré.</span>' : ''}
  `;
  const gamesForm = format === 'groups_playoffs' ? standardRoundGamesForm(t) : '';
  if (!matches.length) {
    $('adminMatchBody').innerHTML = `${gamesForm}<p class="rounded-xl border border-[#1f293d] bg-[#07090e] p-3 text-xs text-gray-400">Aucun match. Génère les matchs dès que les équipes sont confirmées.</p>`;
  } else {
    const pools = matches.filter((m) => m.phase === 'pool').sort((a, b) => a.round - b.round || a.position - b.position);
    const bracket = matches.filter((m) => m.phase !== 'pool');
    $('adminMatchBody').innerHTML = `
      ${gamesForm}
      ${pools.length ? `<div class="space-y-2">
        <h3 class="text-xs font-black uppercase tracking-wider text-white">🏟️ Matchs</h3>
        ${standardStandingsBlocks(matches)}
        <div id="stdPoolsAdmin" class="space-y-2">
          ${standardPoolFilters('stdPoolsAdmin', pools)}
          <div class="space-y-1.5">${pools.map((m) => `<div data-pool-item data-group="${escapeHtml(m.group_name || '')}" data-round="${m.round}">${adminStandardMatchCard(m, `${m.label || 'Match'} · Round ${m.round}`)}</div>`).join('')}</div>
        </div>
      </div>` : ''}
      ${bracket.length ? `<div class="space-y-2">
        <h3 class="text-xs font-black uppercase tracking-wider text-white">🏆 Tableau</h3>
        <div class="space-y-1">
          <p class="text-[9px] font-black uppercase tracking-wider text-gray-500">Aperçu en arbre (lecture seule)</p>
          ${standardBracketPublicHtml(bracket)}
        </div>
        ${standardBracketHtml(bracket, (m) => adminStandardMatchCard(m))}
      </div>` : ''}`;
  }
  $('adminMatchPanel').classList.remove('hidden');

  applyAdminView();
}

async function showAdminMatchPanel(tournamentId) {
  const t = tournamentById(tournamentId);
  if (!t || !(isBo9(t) || isStandard(t))) { notify('Ce tournoi n’a pas de matchs à gérer.', true); return; }
  viewingMatchTournamentId = tournamentId;
  await loadMatchesOnly();
  renderAdminMatchPanel();
}

function closeAdminMatchPanel() {
  viewingMatchTournamentId = null;
  $('adminMatchPanel')?.classList.add('hidden');
}

function tournamentCard(t) {
  const count = registeredCount(t.id);
  const unit = t.mode === 'team' ? 'équipe(s)' : 'joueur(s)';
  const places = t.max_participants ? `${count} / ${t.max_participants} ${unit}` : `${count} ${unit}`;
  const open = t.status === 'open';
  const already = isRegistered(t.id);
  const myTeam = t.mode === 'team' ? myTeams.find((team) => team.tournament_id === t.id) : null;
  const toornament = externalLink(t.toornament_url);
  const logo = tournamentLogoUrl(t);
  const initials = escapeHtml((gameById(t.game_id)?.name || t.name || '?').slice(0, 2).toUpperCase());
  const title = escapeHtml(t.name);
  const statusTone = {
    open: 'text-emerald-400',
    closed: 'text-amber-400',
    running: 'text-red-400',
    draft: 'text-gray-400',
    finished: 'text-gray-400',
    cancelled: 'text-gray-500'
  }[t.status] || 'text-gray-400';
  return `
    <article class="group flex flex-col overflow-hidden rounded-2xl border border-[#1f293d] bg-[#121722] transition hover:border-amber-500/40 hover:shadow-xl hover:shadow-black/50">
      ${tournamentBanner(t)}
      <div class="flex flex-1 flex-col gap-3 p-4">
        <div class="flex items-start gap-3">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
            ${logo
              ? `<img src="${logo}" alt="" loading="lazy" onerror="this.remove()" class="h-full w-full object-contain p-1">`
              : `<span class="text-sm font-black text-gray-400">${initials}</span>`}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[10px] font-black uppercase tracking-[0.18em] text-amber-400/80">${escapeHtml(tournamentGamesLabel(t))}</p>
            <h2 class="mt-1 text-base font-black leading-snug text-white">${toornament ? `<a href="${toornament}" target="_blank" rel="noopener" class="transition hover:text-amber-300">${title}</a>` : title}</h2>
            <p class="mt-1 text-[11px] text-gray-400">${escapeHtml(dateRange(t))}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-[11px] font-bold ${statusTone}">${escapeHtml(STATUS_LABELS[t.status] || t.status)}</span>
          <span class="rounded border border-[#2a3750] px-2 py-1 text-[10px] font-bold text-gray-300">${escapeHtml(modeLabel(t))}</span>
          <span class="rounded border border-[#2a3750] px-2 py-1 text-[10px] font-bold text-gray-300">${escapeHtml(FORMAT_LABELS[t.format] || t.format)}</span>
          <span class="rounded border px-2 py-1 text-[10px] font-bold ${Number(t.entry_fee_cents) > 0 ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-[#2a3750] text-gray-400'}">${escapeHtml(feeLabel(t))}</span>
        </div>
        ${t.description ? `<p class="text-xs text-gray-400 line-clamp-2">${escapeHtml(t.description)}</p>` : ''}
        ${hasPrizes(t) ? `<p class="flex items-center gap-1.5 text-[11px] text-gray-300"><span class="text-amber-400">${trophyIcon('h-3.5 w-3.5')}</span>${escapeHtml(t.prize_first || t.prize)}</p>` : ''}
        <div class="mt-auto flex flex-wrap items-center gap-2 border-t border-[#1f293d] pt-3">
          ${currentUser && (already || myTeam || (t.mode === 'team' && open) || myParticipations.some((p) => p.tournament_id === t.id))
            ? `<button onclick="openManage('${t.id}')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-lg transition">⚙️ Gérer ma participation</button>`
            : open
              ? `<button onclick="openSignup('${t.id}')" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-lg transition">S'inscrire</button>`
              : `<span class="px-3 py-2 bg-white/5 border border-[#1f293d] text-gray-500 text-[11px] font-bold rounded-lg">Inscriptions fermées</span>`}
          <button onclick="openTournamentDetails('${t.id}')" class="px-3 py-2 bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-300 text-[11px] font-bold rounded-lg transition">Fiche</button>
          ${toornament ? `<a href="${toornament}" target="_blank" rel="noopener" title="Ouvrir la page Toornament du tournoi" class="px-3 py-2 bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-300 text-[11px] font-bold rounded-lg transition">Toornament</a>` : ''}
          <span class="ml-auto text-[10px] font-bold text-gray-500">👥 ${escapeHtml(places)}</span>
          ${t.registration_closes_at ? `<span class="w-full text-[10px] text-gray-500">Clôture des inscriptions : ${escapeHtml(formatDate(t.registration_closes_at))}</span>` : ''}
        </div>
      </div>
    </article>`;
}

function renderTournaments() {
  const list = $('tournamentsList');
  if (!tournaments.length) {
    list.innerHTML = '<div class="md:col-span-2 bg-[#121722] border border-[#1f293d] rounded-2xl p-8 text-center text-sm text-gray-400">Aucun tournoi publié pour le moment. Reviens bientôt !</div>';
    return;
  }
  list.innerHTML = tournaments.map(tournamentCard).join('');
}

function renderHomeTournaments() {
  const box = $('homeTournaments');
  const next = tournaments.filter((t) => t.status === 'open' || t.status === 'running').slice(0, 3);
  if (!next.length) {
    box.innerHTML = '<p class="text-xs text-gray-500">Aucun tournoi ouvert pour le moment. Les inscriptions arrivent bientôt.</p>';
    return;
  }
  box.innerHTML = next.map((t) => {
    const banner = tournamentBannerUrl(t);
    const logo = tournamentLogoUrl(t);
    const toornament = externalLink(t.toornament_url);
    return `
    <div class="flex items-center gap-3 overflow-hidden rounded-xl border border-[#1f293d] bg-[#07090e] transition hover:border-amber-500/40">
      <div class="relative h-16 w-24 shrink-0 overflow-hidden bg-[#121722]">
        ${banner ? `<img src="${banner}" alt="" loading="lazy" onerror="this.remove()" class="h-full w-full object-cover">` : ''}
        ${!banner && logo ? `<img src="${logo}" alt="" loading="lazy" onerror="this.remove()" class="absolute inset-0 m-auto max-h-10 max-w-[80%] object-contain opacity-70">` : ''}
      </div>
      <div class="min-w-0 flex-1 py-2">
        <p class="truncate text-xs font-black text-white">${toornament ? `<a href="${toornament}" target="_blank" rel="noopener" class="hover:text-amber-300">${escapeHtml(t.name)}</a>` : escapeHtml(t.name)}</p>
        <p class="text-[10px] text-gray-400">${escapeHtml(tournamentGamesLabel(t))} · ${escapeHtml(modeLabel(t))} · ${escapeHtml(dateRange(t))}</p>
      </div>
      <button onclick="openTab('tournaments')" class="mr-3 shrink-0 px-3 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-[10px] font-bold rounded-lg border border-red-600/40 transition">Voir</button>
    </div>`;
  }).join('');
}

// --- Inscription ---

function openSignup(tournamentId) {
  const t = tournamentById(tournamentId);
  if (!t) return;
  if (!currentUser) {
    notify('Connecte-toi avec ton compte pour t’inscrire.', true);
    goAccount('info');
    return;
  }
  if (!identityComplete()) {
    notify('Complète ton nom, prénom et date de naissance dans « Mon espace » avant de t’inscrire.', true);
    goAccount('info');
    $('profileHint')?.classList.remove('hidden');
    return;
  }
  const panel = $('signupPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-black text-white">Inscription · ${escapeHtml(t.name)}</h2>
        <p class="text-xs text-gray-400 mt-1">${t.mode === 'solo' ? 'Tournoi solo.' : (Number(t.team_min) === Number(t.team_max) ? `Tournoi en équipe de ${t.team_min} joueurs.` : `Tournoi en équipe de ${t.team_min} à ${t.team_max} joueurs.`)}</p>
        <p class="text-[11px] font-bold ${Number(t.entry_fee_cents) > 0 ? 'text-amber-400' : 'text-emerald-400'} mt-1">${escapeHtml(feeLabel(t))}</p>
      </div>
      <button onclick="closeSignup()" class="px-2 py-1 text-gray-400 hover:text-white text-sm">✕</button>
    </div>
    ${t.mode === 'solo' ? `
      <div class="flex flex-wrap gap-2 items-center">
        <input id="soloPlatform" placeholder="Pseudo en jeu (facultatif)" class="flex-1 min-w-[200px] bg-[#07090e] border border-[#1f293d] rounded-xl px-4 py-2.5 text-xs text-white">
        <button onclick="registerSolo('${t.id}')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition">Confirmer mon inscription</button>
      </div>`
    : `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input id="teamName" placeholder="Nom de l'équipe" class="sm:col-span-2 bg-[#07090e] border border-[#1f293d] rounded-xl px-4 py-2.5 text-xs text-white">
        <input id="teamTag" placeholder="Tag (ex. NVG)" maxlength="8" class="bg-[#07090e] border border-[#1f293d] rounded-xl px-4 py-2.5 text-xs text-white uppercase">
      </div>
      <div class="flex flex-wrap gap-2">
        <button onclick="createTeam('${t.id}')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition">Créer mon équipe</button>
        <button onclick="openTab('account')" class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-200 font-bold text-xs rounded-lg transition">J'ai déjà un code</button>
      </div>
      <p class="text-[11px] text-gray-500">Une fois l'équipe complète, inscris-la au tournoi depuis « Mon espace ».</p>`}
  `;
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeSignup() {
  $('signupPanel').classList.add('hidden');
  $('signupPanel').innerHTML = '';
}

async function rpc(name, params) {
  const { data, error } = await supabaseClient.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}

async function registerSolo(tournamentId) {
  const platform = $('soloPlatform')?.value?.trim() || '';
  try {
    await rpc('nvg_tournament_register_solo', { p_tournament: tournamentId, p_platform: platform });
    notify('Inscription enregistrée. Elle sera confirmée par la NVG.');
    closeSignup();
    await Promise.all([loadPublic(), loadMember()]);
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function createTeam(tournamentId) {
  const name = $('teamName')?.value?.trim() || '';
  const tag = $('teamTag')?.value?.trim() || '';
  if (!name) {
    notify('Saisis un nom d’équipe.', true);
    return;
  }
  try {
    const res = await rpc('nvg_tournament_create_team', { p_tournament: tournamentId, p_name: name, p_tag: tag || null });
    notify('Équipe créée. Partage le code à tes coéquipiers.');
    $('signupPanel').innerHTML = `
      <h2 class="text-sm font-black text-white">✅ Équipe créée</h2>
      <p class="text-xs text-gray-400">Envoie ce lien à tes coéquipiers. Ils doivent être connectés avec leur compte Tournoi des 9 Mondes.</p>
      <div class="flex flex-wrap gap-2">
        <input readonly value="${escapeHtml(inviteUrl(res.invite_code))}" class="flex-1 min-w-[220px] bg-[#07090e] border border-[#1f293d] rounded-xl px-4 py-2.5 text-[11px] text-gray-300">
        <button onclick="copyText('${escapeHtml(inviteUrl(res.invite_code))}')" class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-200 font-bold text-xs rounded-lg transition">Copier</button>
        <button onclick="goAccount('teams')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition">Mon espace</button>
      </div>
      <p class="text-[11px] text-amber-400">Code : <strong>${escapeHtml(res.invite_code)}</strong></p>`;
    await Promise.all([loadPublic(), loadMember()]);
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function joinTeam() {
  if (!currentUser) { goAccount('info'); return; }
  const code = $('joinCode').value.trim();
  if (!code) { notify('Saisis un code d’invitation.', true); return; }
  try {
    const res = await rpc('nvg_tournament_join_team', { p_code: code });
    notify(res?.already_member ? 'Tu fais déjà partie de cette équipe.' : 'Tu as rejoint l’équipe.');
    $('joinCode').value = '';
    await loadMember();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

function copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => notify('Lien copié.')).catch(() => notify(text, false));
  } else {
    notify(text, false);
  }
}

// --- Espace membre ---

async function loadMember() {
  if (!currentUser) return;
  const [teams, regs, parts] = await Promise.all([
    supabaseClient.from('nvg_tournament_teams')
      .select('id,tournament_id,name,tag,logo_url,captain_id,invite_code,created_at,nvg_tournament_team_members(user_id,role,nvg_users(name,rank)),nvg_tournaments(name,mode,team_min,team_max,status)')
      .order('created_at', { ascending: false }),
    supabaseClient.from('nvg_tournament_registrations')
      .select('id,tournament_id,team_id,user_id,status,platform_id,payment_status,payment_reference,paid_at,created_at,nvg_tournaments(name,mode,team_min,team_max,status,entry_fee_cents,payment_url,payment_instructions),nvg_tournament_teams(name)')
      .order('created_at', { ascending: false }),
    supabaseClient.from('nvg_tournament_players')
      .select('tournament_id,platform_id,joined_at')
      .eq('user_id', currentUser.id)
  ]);
  // Les admins voient toutes les équipes et inscriptions : on ne garde que celles
  // dont le joueur connecté est capitaine ou membre.
  const uid = currentUser.id;
  myTeams = (teams.data || []).filter((team) => team.captain_id === uid
    || (team.nvg_tournament_team_members || []).some((m) => m.user_id === uid));
  const myTeamIds = new Set(myTeams.map((team) => team.id));
  myRegistrations = (regs.data || []).filter((r) => r.user_id === uid || myTeamIds.has(r.team_id));
  myParticipations = parts.data || [];
  renderMyTeams();
  renderMyRegistrations();
  if (manageTournamentId) renderManage();
}

function renderMyTeams() {
  const box = $('myTeams');
  if (!myTeams.length) {
    box.innerHTML = '<div class="md:col-span-2 bg-[#121722] border border-[#1f293d] rounded-2xl p-5 text-xs text-gray-400">Aucune équipe pour le moment. Choisis un tournoi en équipe puis clique sur « S\'inscrire » pour en créer une.</div>';
    return;
  }
  box.innerHTML = myTeams.map((team) => {
    const tournament = team.nvg_tournaments || {};
    const members = team.nvg_tournament_team_members || [];
    const isCaptain = team.captain_id === currentUser?.id;
    const alreadyRegistered = myRegistrations.some((r) => r.team_id === team.id && r.status !== 'cancelled');
    const enough = members.length >= (tournament.team_min || 1);
    return `
      <article class="bg-[#121722] border border-[#1f293d] rounded-2xl p-5 space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[10px] uppercase tracking-widest text-amber-400 font-black truncate">${escapeHtml(tournament.name || 'Tournoi')}</p>
            <h3 class="text-sm font-black text-white mt-1">${escapeHtml(team.name)} ${team.tag ? `<span class="text-gray-500">[${escapeHtml(team.tag)}]</span>` : ''}</h3>
          </div>
          <span class="shrink-0 text-[10px] px-2 py-1 rounded-full border border-[#1f293d] text-gray-400">${members.length}/${tournament.team_max || '?'}</span>
        </div>
        <ul class="text-[11px] text-gray-400 space-y-1">
          ${members.map((m) => `<li>${m.role === 'captain' ? '👑' : '•'} ${escapeHtml(m.nvg_users?.name || 'Membre')}${m.user_id === currentUser?.id ? ' <span class="text-gray-600">(toi)</span>' : ''}</li>`).join('')}
        </ul>
        ${isCaptain ? `
          <div class="flex flex-wrap items-center gap-2">
            <input readonly value="${escapeHtml(inviteUrl(team.invite_code))}" class="flex-1 min-w-[160px] bg-[#07090e] border border-[#1f293d] rounded-lg px-3 py-2 text-[10px] text-gray-400">
            <button onclick="copyText('${escapeHtml(inviteUrl(team.invite_code))}')" class="px-3 py-2 bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-300 font-bold text-[10px] rounded-lg transition">Copier</button>
          </div>` : ''}
        <div class="flex flex-wrap gap-2">
          ${alreadyRegistered
            ? '<span class="px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold rounded-lg">✅ Équipe inscrite</span>'
            : isCaptain
              ? `<button onclick="registerTeam('${team.id}')" ${enough ? '' : 'disabled'} class="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px] rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed">Inscrire l'équipe${enough ? '' : ' (incomplète)'}</button>`
              : '<span class="px-3 py-2 bg-white/5 border border-[#1f293d] text-gray-500 text-[10px] font-bold rounded-lg">En attente du capitaine</span>'}
          <button onclick="leaveTeam('${team.id}')" class="px-3 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-600/40 font-bold text-[10px] rounded-lg transition">${isCaptain ? 'Dissoudre' : 'Quitter'}</button>
        </div>
      </article>`;
  }).join('');
}

// --- Gestion tournoi : page du joueur pour un tournoi ---
// Participation à l'évènement, pseudo en jeu, équipe (nom, tag, logo, code),
// inscription et paiement.

function manageSection(title, body) {
  return `<section class="space-y-3 rounded-xl border border-[#1f293d] bg-[#07090e] p-4">
    <h3 class="text-[10px] font-black uppercase tracking-wider text-amber-300">${escapeHtml(title)}</h3>
    ${body}
  </section>`;
}

const MANAGE_INPUT_CLASS = 'w-full bg-[#0b0f17] border border-[#1f293d] rounded-xl px-3 py-2 text-xs text-white';

function openManage(tournamentId) {
  if (!currentUser) {
    notify('Connecte-toi pour gérer ta participation.', true);
    goAccount('info');
    return;
  }
  manageTournamentId = tournamentId;
  renderManage();
  const modal = $('manageModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.classList.add('overflow-hidden');
  loadMember();
}

function closeManage() {
  manageTournamentId = null;
  const modal = $('manageModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  document.body.classList.remove('overflow-hidden');
}

function renderManage() {
  const box = $('manageModalBody');
  const t = tournamentById(manageTournamentId);
  if (!box || !t) return;
  const isTeam = t.mode === 'team';
  const open = t.status === 'open';
  const participation = myParticipations.find((p) => p.tournament_id === t.id);
  const team = myTeams.find((x) => x.tournament_id === t.id);
  const reg = myRegistrations.find((r) => r.tournament_id === t.id && r.status !== 'cancelled');
  const members = team?.nvg_tournament_team_members || [];
  const isCaptain = team?.captain_id === currentUser?.id;
  const teamMax = Number(t.team_max) || 5;
  const teamMin = Number(t.team_min) || 1;
  const sections = [];

  if (isTeam) {
    sections.push(manageSection('1 · Participation à l’évènement', participation
      ? `<p class="text-xs text-emerald-400">✅ Tu as rejoint l’évènement${participation.joined_at ? ` le ${escapeHtml(formatDate(participation.joined_at))}` : ''}.</p>
         ${team
           ? '<p class="text-[10px] text-gray-500">Quitte d’abord ton équipe pour quitter l’évènement.</p>'
           : `<button onclick="leaveEvent('${t.id}')" class="rounded-lg border border-red-600/40 bg-red-600/20 px-3 py-2 text-[10px] font-bold text-red-400 transition hover:bg-red-600 hover:text-white">Quitter l’évènement</button>`}`
      : `<p class="text-xs text-gray-400">Rejoins l’évènement pour créer une équipe. Si tu rejoins une équipe avec un code, tu es ajouté à l’évènement automatiquement.</p>
         ${open
           ? '<button onclick="joinEventFromManage()" class="rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-black text-black transition hover:bg-amber-400">Rejoindre l’évènement</button>'
           : '<p class="text-[11px] text-gray-500">Inscriptions fermées.</p>'}`));

    sections.push(manageSection('2 · Pseudo en jeu', `
      <div class="flex flex-wrap items-center gap-2">
        <input id="managePseudo" maxlength="40" value="${escapeHtml(participation?.platform_id || '')}" placeholder="Ton pseudo en jeu" ${participation ? '' : 'disabled'} class="${MANAGE_INPUT_CLASS} min-w-0 flex-1 disabled:opacity-40">
        <button onclick="savePlayerPseudo('${t.id}')" ${participation ? '' : 'disabled'} class="rounded-lg border border-[#1f293d] bg-white/5 px-3 py-2 text-[11px] font-bold text-gray-200 transition hover:bg-white/10 disabled:opacity-40">Enregistrer</button>
      </div>
      <p class="text-[10px] text-gray-500">Propre à ce tournoi : chaque joueur indique son pseudo.</p>`));

    let body;
    if (team) {
      body = `
        <div class="flex items-center gap-3">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <img src="${safeUrl(team.logo_url) || './Logos/no-logo.jpeg'}" alt="" onerror="this.onerror=null;this.src='./Logos/no-logo.jpeg'" class="h-full w-full object-contain p-1">
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-black text-white">${escapeHtml(team.name)} ${team.tag ? `<span class="text-gray-500">[${escapeHtml(team.tag)}]</span>` : ''}</p>
            <p class="text-[10px] text-gray-400">${members.length}/${teamMax} joueurs · ${isCaptain ? 'tu es capitaine' : 'membre'}</p>
          </div>
        </div>
        <ul class="space-y-1 text-[11px] text-gray-300">
          ${members.map((m) => `<li>${m.role === 'captain' ? '👑' : '•'} ${escapeHtml(m.nvg_users?.name || 'Joueur')}${m.user_id === currentUser?.id ? ' <span class="text-gray-600">(toi)</span>' : ''}</li>`).join('')}
        </ul>
        <div class="flex flex-wrap items-center gap-2">
          <input readonly value="${escapeHtml(inviteUrl(team.invite_code))}" class="min-w-[160px] flex-1 rounded-lg border border-[#1f293d] bg-[#0b0f17] px-3 py-2 text-[10px] text-gray-400">
          <button onclick="copyText('${escapeHtml(inviteUrl(team.invite_code))}')" class="rounded-lg border border-[#1f293d] bg-white/5 px-3 py-2 text-[10px] font-bold text-gray-300 transition hover:bg-white/10">Copier</button>
        </div>
        <p class="text-[10px] text-gray-500">Code : <strong class="text-amber-300">${escapeHtml(team.invite_code)}</strong> — à partager à tes coéquipiers (${teamMax} joueurs maximum).</p>
        <button onclick="leaveTeam('${team.id}')" class="rounded-lg border border-red-600/40 bg-red-600/20 px-3 py-2 text-[10px] font-bold text-red-400 transition hover:bg-red-600 hover:text-white">${isCaptain ? 'Dissoudre l’équipe' : 'Quitter l’équipe'}</button>`;
    } else if (participation) {
      body = `
        <div class="grid gap-2 sm:grid-cols-2">
          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-400">Nom de l’équipe</span>
            <input id="manageTeamName" maxlength="60" placeholder="Nom de l’équipe" class="${MANAGE_INPUT_CLASS}">
          </label>
          <label class="block">
            <span class="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-400">Tag (10 caractères max)</span>
            <input id="manageTeamTag" maxlength="10" placeholder="Tag" class="${MANAGE_INPUT_CLASS}">
          </label>
          <div class="block">
            <span class="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-400">Logo (URL ou image)</span>
            <div class="flex flex-wrap items-center gap-2">
              <input id="manageTeamLogo" placeholder="Vide = pas de logo" class="${MANAGE_INPUT_CLASS} min-w-0 flex-1">
              <label class="cursor-pointer rounded-lg border border-[#1f293d] bg-white/5 px-3 py-2 text-[10px] font-bold text-gray-300 transition hover:bg-white/10">
                📤 Téléverser
                <input id="manageTeamLogoFile" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange="uploadTournamentImage('teamlogo', 'manageTeamLogo', 'manageTeamName', this)">
              </label>
            </div>
          </div>
        </div>
        <button onclick="createTeamFromManage('${t.id}')" class="rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-black text-black transition hover:bg-amber-400">Créer mon équipe</button>
        <p class="text-[10px] text-gray-500">Tu seras capitaine : un code d’invitation est généré pour tes coéquipiers.</p>
        <div class="space-y-2 border-t border-[#1f293d] pt-3">
          <p class="text-[10px] font-black uppercase tracking-wider text-gray-400">Ou rejoins une équipe avec un code</p>
          <div class="flex flex-wrap gap-2">
            <input id="manageJoinCode" placeholder="Code d’invitation" class="${MANAGE_INPUT_CLASS} min-w-0 flex-1">
            <button onclick="joinTeamFromManage()" class="rounded-lg border border-[#1f293d] bg-white/5 px-3 py-2 text-[11px] font-bold text-gray-200 transition hover:bg-white/10">Rejoindre</button>
          </div>
        </div>`;
    } else {
      body = `
        <p class="text-xs text-gray-400">Rejoins d’abord l’évènement, ou rejoins directement une équipe avec un code.</p>
        <div class="flex flex-wrap gap-2">
          <input id="manageJoinCode" placeholder="Code d’invitation" class="${MANAGE_INPUT_CLASS} min-w-0 flex-1">
          <button onclick="joinTeamFromManage()" class="rounded-lg border border-[#1f293d] bg-white/5 px-3 py-2 text-[11px] font-bold text-gray-200 transition hover:bg-white/10">Rejoindre</button>
        </div>`;
    }
    sections.push(manageSection('3 · Équipe', body));
  } else {
    sections.push(manageSection('Pseudo en jeu', `<p class="text-xs text-gray-300">${escapeHtml(reg?.platform_id || 'Non renseigné')}</p><p class="text-[10px] text-gray-500">Modifiable dans « Mes inscriptions ».</p>`));
  }

  let regBody;
  if (reg) {
    const confirmed = reg.status === 'confirmed';
    regBody = `
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${confirmed ? 'border-emerald-500/40 text-emerald-400' : 'border-amber-500/40 text-amber-300'}">${confirmed ? 'Inscription confirmée' : 'En attente de validation'}</span>
        ${paymentBadge(reg.payment_status)}
      </div>
      ${registrationPaymentBlock(reg)}
      ${!team || isCaptain ? `<button onclick="cancelRegistration('${reg.id}')" class="rounded-lg border border-red-600/40 bg-red-600/20 px-3 py-2 text-[10px] font-bold text-red-400 transition hover:bg-red-600 hover:text-white">Annuler mon inscription</button>` : ''}`;
  } else if (isTeam && team && isCaptain) {
    const complete = members.length >= teamMin;
    regBody = `
      <p class="text-xs text-gray-400">${complete
        ? 'Ton équipe est prête : inscris-la au tournoi.'
        : `Équipe incomplète : ${members.length}/${teamMin} joueur(s) minimum.`}</p>
      ${open
        ? `<button onclick="registerTeam('${team.id}')" ${complete ? '' : 'disabled'} class="rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-black text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40">Inscrire l’équipe</button>`
        : '<p class="text-[11px] text-gray-500">Inscriptions fermées.</p>'}`;
  } else if (isTeam && team) {
    regBody = '<p class="text-xs text-gray-400">En attente de l’inscription de l’équipe par son capitaine.</p>';
  } else if (!isTeam) {
    regBody = open
      ? '<p class="text-xs text-gray-400">Utilise « S’inscrire » sur la fiche du tournoi.</p>'
      : '<p class="text-[11px] text-gray-500">Inscriptions fermées.</p>';
  } else {
    regBody = '<p class="text-xs text-gray-400">Pas encore inscrit : crée ou rejoins une équipe ci-dessus.</p>';
  }
  sections.push(manageSection(isTeam ? '4 · Inscription et paiement' : '2 · Inscription et paiement', regBody));

  box.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-black text-white">${escapeHtml(t.name)}</h2>
        <p class="text-[10px] text-gray-400">${escapeHtml(STATUS_LABELS[t.status] || t.status)} · ${escapeHtml(modeLabel(t))}</p>
      </div>
    </div>
    ${sections.join('')}`;
}

// Identité requise pour rejoindre un évènement ou une équipe.
function requireIdentity() {
  if (identityComplete()) return true;
  notify('Complète ton nom, prénom et date de naissance dans « Mon espace » avant de rejoindre un tournoi.', true);
  closeManage();
  goAccount('info');
  $('profileHint')?.classList.remove('hidden');
  return false;
}

async function joinEventFromManage() {
  if (!manageTournamentId || !requireIdentity()) return;
  try {
    await rpc('nvg_tournament_join_event', { p_tournament: manageTournamentId });
    notify('Tu as rejoint l’évènement.');
    await loadMember();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function savePlayerPseudo(tournamentId) {
  const value = $('managePseudo')?.value.trim() || '';
  if (value.length > 40) { notify('Pseudo trop long (40 caractères maximum).', true); return; }
  const { error } = await supabaseClient.from('nvg_tournament_players')
    .update({ platform_id: value || null })
    .eq('tournament_id', tournamentId)
    .eq('user_id', currentUser.id);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify('Pseudo enregistré.');
  await loadMember();
}

async function createTeamFromManage(tournamentId) {
  if (!requireIdentity()) return;
  const name = $('manageTeamName')?.value.trim() || '';
  const tag = $('manageTeamTag')?.value.trim() || '';
  const logo = safeUrl($('manageTeamLogo')?.value) || '';
  if (!name) { notify('Saisis un nom d’équipe.', true); return; }
  try {
    const res = await rpc('nvg_tournament_create_team', {
      p_tournament: tournamentId,
      p_name: name,
      p_tag: tag || null,
      p_logo: logo || null
    });
    notify(`Équipe créée. Code : ${res.invite_code}`);
    await loadMember();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function joinTeamFromManage() {
  if (!requireIdentity()) return;
  const code = $('manageJoinCode')?.value.trim() || '';
  if (!code) { notify('Saisis un code d’invitation.', true); return; }
  try {
    await rpc('nvg_tournament_join_team', { p_code: code });
    notify('Tu as rejoint l’équipe.');
    await loadMember();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

// Quitter l'évènement (règles vérifiées côté base : ni équipe, ni inscription active).
async function leaveEvent(tournamentId) {
  if (!window.confirm('Quitter cet évènement ?')) return;
  try {
    await rpc('nvg_tournament_leave_event', { p_tournament: tournamentId });
    notify('Tu as quitté l’évènement.');
    await loadMember();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

function renderMyRegistrations() {
  const box = $('myRegistrations');
  // Une inscription annulée disparaît de l'espace membre (elle reste dans le back-office).
  const visible = myRegistrations.filter((r) => r.status !== 'cancelled');
  // Participation à un évènement en équipe sans ligne d'inscription (ex. membre d'équipe).
  const participationOnly = myParticipations.filter((p) => !visible.some((r) => r.tournament_id === p.tournament_id));
  if (!visible.length && !participationOnly.length) {
    box.innerHTML = '<div class="bg-[#121722] border border-[#1f293d] rounded-2xl p-5 text-xs text-gray-400">Aucune inscription pour le moment.</div>';
    return;
  }
  const participationCards = participationOnly.map((p) => {
    const t = tournamentById(p.tournament_id) || {};
    const team = myTeams.find((x) => x.tournament_id === p.tournament_id);
    return `
      <div class="bg-[#121722] border border-[#1f293d] rounded-xl px-4 py-3 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-xs font-black text-white truncate">${escapeHtml(t.name || 'Tournoi')}</p>
            <p class="text-[10px] text-gray-400">${team ? `Équipe : ${escapeHtml(team.name)}` : 'Participant à l’évènement, sans équipe'} · rejoint le ${escapeHtml(formatDate(p.joined_at))}</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="openManage('${p.tournament_id}')" class="text-[10px] font-bold text-amber-400 hover:text-amber-300">⚙️ Gérer</button>
            ${team ? '' : `<button onclick="leaveEvent('${p.tournament_id}')" class="text-[10px] font-bold text-red-400 hover:text-red-300">Quitter l’évènement</button>`}
          </div>
        </div>
      </div>`;
  }).join('');
  box.innerHTML = participationCards + visible.map((reg) => {
    const label = reg.nvg_tournament_teams?.name || reg.nvg_tournaments?.name || 'Tournoi';
    const canEdit = !reg.user_id || reg.user_id === currentUser?.id;
    return `
      <div class="bg-[#121722] border border-[#1f293d] rounded-xl px-4 py-3 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-xs font-black text-white truncate">${escapeHtml(reg.nvg_tournaments?.name || 'Tournoi')}</p>
            <p class="text-[10px] text-gray-400">${escapeHtml(label)} · ${escapeHtml(formatDate(reg.created_at))}</p>
            <p class="text-[10px] text-gray-400">Pseudo en jeu : ${canEdit
              ? `<span id="regPseudo-${reg.id}" class="inline-flex flex-wrap items-center gap-1">${reg.platform_id ? escapeHtml(reg.platform_id) : '<span class="text-gray-600">non renseigné</span>'}<button onclick="editRegistrationPseudo('${reg.id}')" class="text-[10px] font-bold text-amber-400 hover:text-amber-300">✏️ Modifier</button></span>`
              : `<span class="text-gray-500">${reg.platform_id ? escapeHtml(reg.platform_id) : '—'}</span>`}</p>
            <p class="text-[10px] text-gray-500">${escapeHtml(feeLabel(reg.nvg_tournaments || {}))}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-black uppercase px-2 py-1 rounded-full border ${reg.status === 'confirmed' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}">${escapeHtml(REG_LABELS[reg.status] || reg.status)}</span>
            <button onclick="openManage('${reg.tournament_id}')" class="rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-black text-black transition hover:bg-amber-400">⚙️ Gérer mon inscription</button>
            <button onclick="cancelRegistration('${reg.id}')" class="text-[10px] font-bold text-red-400 hover:text-red-300">Annuler</button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 border-t border-[#1f293d] pt-2">${paymentBadge(reg.payment_status)}${registrationPaymentBlock(reg)}</div>
      </div>`;
  }).join('');
}

function editRegistrationPseudo(regId) {
  const reg = myRegistrations.find((r) => r.id === regId);
  if (!reg) return;
  const box = $(`regPseudo-${regId}`);
  if (!box) return;
  box.outerHTML = `
    <span id="regPseudo-${regId}" class="inline-flex flex-wrap items-center gap-1">
      <input id="regPseudoInput-${regId}" maxlength="40" value="${escapeHtml(reg.platform_id || '')}" placeholder="Pseudo en jeu (facultatif)" class="w-40 rounded border border-[#1f293d] bg-[#07090e] px-2 py-1 text-[10px] text-white">
      <button onclick="saveRegistrationPseudo('${regId}')" class="rounded bg-amber-500 px-2 py-1 text-[10px] font-black text-black hover:bg-amber-400">OK</button>
      <button onclick="renderMyRegistrations()" class="rounded border border-[#1f293d] px-2 py-1 text-[10px] font-bold text-gray-400 hover:text-white">Annuler</button>
    </span>`;
  $(`regPseudoInput-${regId}`)?.focus();
}

async function saveRegistrationPseudo(regId) {
  const input = $(`regPseudoInput-${regId}`);
  if (!input) return;
  const value = input.value.trim();
  if (value.length > 40) { notify('40 caractères maximum.', true); return; }
  try {
    const data = await rpc('nvg_tournament_set_platform_id', {
      p_registration: regId,
      p_platform: value || null
    });
    const reg = myRegistrations.find((r) => r.id === regId);
    if (reg) reg.platform_id = data || null;
    notify(value ? 'Pseudo en jeu enregistré.' : 'Pseudo en jeu retiré.');
    renderMyRegistrations();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function registerTeam(teamId) {
  const team = myTeams.find((t) => t.id === teamId);
  if (!team) return;
  const platform = window.prompt('Pseudo ou identifiant en jeu (facultatif) :', '') ?? '';
  try {
    await rpc('nvg_tournament_register_team', { p_team: teamId, p_platform: platform.trim() || null });
    notify('Équipe inscrite. La NVG va confirmer l’inscription.');
    await Promise.all([loadPublic(), loadMember()]);
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function leaveTeam(teamId) {
  const team = myTeams.find((t) => t.id === teamId);
  const captain = team && team.captain_id === currentUser?.id;
  const msg = captain
    ? `Dissoudre l’équipe « ${team.name} » ? Tous les membres seront retirés.`
    : `Quitter l’équipe « ${team?.name || ''} » ?`;
  if (!window.confirm(msg)) return;
  try {
    await rpc('nvg_tournament_leave_team', { p_team: teamId });
    notify(captain ? 'Équipe dissoute.' : 'Tu as quitté l’équipe.');
    await loadMember();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function cancelRegistration(registrationId) {
  if (!window.confirm('Annuler cette inscription ?')) return;
  try {
    await rpc('nvg_tournament_cancel', { p_registration: registrationId });
    notify('Inscription annulée.');
    await Promise.all([loadPublic(), loadMember()]);
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

// --- Admin ---

async function checkAdmin() {
  try {
    const { data, error } = await supabaseClient.rpc('nvg_is_admin');
    isAdmin = !error && data === true;
  } catch (_) {
    isAdmin = false;
  }
  $('navAdmin').classList.toggle('hidden', !isAdmin);
  $('navAdminMobile').classList.toggle('hidden', !isAdmin);
}

async function loadAdmin() {
  if (!isAdmin) return;
  await loadPublic();
  renderAdminGames();
  setGamePreviews();
  const [regsRes, playersRes] = await Promise.all([
    supabaseClient.from('nvg_tournament_registrations')
      .select('id,tournament_id,status,platform_id,payment_status,payment_reference,paid_at,created_at,user_id,team_id,nvg_tournament_teams(name,tag,logo_url),nvg_users(name,first_name,last_name,birth_date)')
      .order('created_at', { ascending: false })
      .limit(500),
    supabaseClient.from('nvg_users')
      .select('id,name,email,verified,first_name,last_name,birth_date')
      .order('name')
      .limit(1000)
  ]);
  adminRegs = regsRes.data || [];
  adminPlayers = playersRes.data || [];
  const [teamsRes, eventPlayersRes] = await Promise.all([
    supabaseClient.from('nvg_tournament_teams')
      .select('id,tournament_id,name,tag,logo_url,invite_code,captain_id,created_at,nvg_tournament_team_members(user_id,role,nvg_users(name))')
      .order('created_at', { ascending: false })
      .limit(500),
    supabaseClient.from('nvg_tournament_players')
      .select('tournament_id,user_id,platform_id,joined_at,payment_status,payment_reference,paid_at,nvg_users(name,first_name,last_name,email)')
      .order('joined_at', { ascending: false })
      .limit(2000)
  ]);
  adminTeams = teamsRes.data || [];
  adminEventPlayers = eventPlayersRes.data || [];
  renderAdminTournaments();
  renderAdminPlayers();
  if (viewingMatchTournamentId) renderAdminMatchPanel();
  if (viewingTeamsTournamentId) renderAdminTeams();
  applyAdminView();
  if (viewingTournamentId) showAdminRegs(viewingTournamentId);
}

function playerRegCount(userId) {
  return adminRegs.filter((r) => r.user_id === userId && r.status !== 'cancelled').length;
}

function renderAdminPlayers() {
  const box = $('adminPlayers');
  if (!box) return;
  const term = ($('adminPlayerSearch')?.value || '').trim().toLowerCase();
  const list = adminPlayers.filter((p) => {
    if (!term) return true;
    const haystack = [p.name, p.email, p.first_name, p.last_name].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(term);
  });
  box.innerHTML = list.length
    ? list.map((p) => {
      const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ') || '—';
      const birth = p.birth_date ? new Date(p.birth_date).toLocaleDateString('fr-FR') : '—';
      const count = playerRegCount(p.id);
      return `
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1f293d] bg-[#07090e] px-3 py-2">
          <div class="min-w-0">
            <p class="text-xs font-bold text-white truncate">${escapeHtml(p.name || 'Joueur')}${p.verified ? ' <span class="text-emerald-400" title="Compte vérifié">✓</span>' : ''}</p>
            <p class="text-[10px] text-gray-500 truncate">${escapeHtml(p.email || '')} · ${escapeHtml(fullName)} · né(e) le ${escapeHtml(birth)}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span class="text-[10px] text-gray-400">${count} inscription(s)</span>
            <button onclick="editPlayer('${p.id}')" class="rounded-lg border border-[#1f293d] bg-white/5 px-2 py-1 text-[10px] font-bold text-gray-300 transition hover:bg-white/10">✏️ Modifier</button>
          </div>
        </div>`;
    }).join('')
    : '<p class="text-xs text-gray-500">Aucun joueur trouvé.</p>';
}

function editPlayer(id) {
  const player = adminPlayers.find((p) => p.id === id);
  if (!player) return;
  editingPlayerId = id;
  if ($('adminPlayerEmail')) $('adminPlayerEmail').textContent = player.email || '';
  if ($('playerName')) $('playerName').value = player.name || '';
  if ($('playerFirstName')) $('playerFirstName').value = player.first_name || '';
  if ($('playerLastName')) $('playerLastName').value = player.last_name || '';
  if ($('playerBirthDate')) $('playerBirthDate').value = player.birth_date || '';
  const panel = $('adminPlayerEdit');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closePlayerEdit() {
  editingPlayerId = null;
  $('adminPlayerEdit')?.classList.add('hidden');
}

async function savePlayer() {
  if (!editingPlayerId) return;
  const name = $('playerName').value.trim();
  if (name.length < 2) { notify('Choisis un pseudo d’au moins 2 caractères.', true); return; }
  const patch = {
    name,
    first_name: $('playerFirstName').value.trim() || null,
    last_name: $('playerLastName').value.trim() || null,
    birth_date: $('playerBirthDate').value || null
  };
  const { error } = await supabaseClient.from('nvg_users').update(patch).eq('id', editingPlayerId);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify('Joueur mis à jour.');
  closePlayerEdit();
  await loadAdmin();
  openAdminPane('players', { push: false });
}

function renderAdminGames() {
  const box = $('adminGames');
  if (!box) return;
  box.innerHTML = games.length
    ? games.map((g) => `
      <div class="flex items-center justify-between gap-2 rounded-lg border border-[#1f293d] bg-[#07090e] px-2 py-1.5">
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-white/5">
            ${safeUrl(g.logo_url)
              ? `<img src="${safeUrl(g.logo_url)}" alt="" class="h-full w-full object-contain p-0.5" onerror="this.remove()">`
              : `<span class="text-[9px] font-black text-gray-400">${escapeHtml((g.name || '?').slice(0, 2).toUpperCase())}</span>`}
          </span>
          <span class="truncate text-[11px] font-bold text-gray-200">${escapeHtml(g.name)}</span>
          ${Number(g.team_size) ? `<span class="shrink-0 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-300" title="Joueurs par équipe">${Number(g.team_size)}v${Number(g.team_size)}</span>` : ''}
          ${g.scoring_mode === 'cumulative' ? '<span class="shrink-0 rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 text-[9px] font-bold text-fuchsia-300" title="Total des points des joueurs">Cumul</span>' : ''}
          ${g.scoring_mode === 'wins' ? '<span class="shrink-0 rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold text-violet-300" title="Victoires individuelles en 1v1">Victoires</span>' : ''}
          ${g.scoring_mode === 'none' ? '<span class="shrink-0 rounded border border-gray-500/40 bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-gray-400" title="Mode de score non précisé">Aucun</span>' : ''}
          ${g.scoring_mode === 'bo3' ? '<span class="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300" title="Deux BO1 de binômes + départage 2v2 en BO3">BO3 2v2</span>' : ''}
          ${!g.scoring_mode || g.scoring_mode === 'versus' ? '<span class="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300" title="Une équipe gagne le jeu">Confrontation</span>' : ''}
        </div>
        <div class="flex shrink-0 items-center gap-1">
          ${safeUrl(g.banner_url) ? '<span class="text-[9px] text-emerald-400" title="Bannière enregistrée">bannière</span>' : ''}
          <button onclick="editGame('${g.id}')" class="rounded border border-[#1f293d] bg-white/5 px-2 py-1 text-[10px] font-bold text-gray-300 transition hover:bg-white/10">✏️</button>
        </div>
      </div>`).join('')
    : '<p class="text-gray-500">Aucun jeu enregistré.</p>';
  const select = $('tourGame');
  if (select) {
    select.innerHTML = '<option value="">Jeu (facultatif)</option>' + games.map((g) => `<option value="${g.id}">${escapeHtml(gameOptionLabel(g))}</option>`).join('');
  }
  fillBo9GameSelects();
}

// --- Formulaire BO9 (création) ---

const BO9_SLOT_CATEGORIES = [
  'collectif', 'collectif', 'collectif',
  'escarmouche', 'escarmouche', 'escarmouche',
  'duel', 'duel', 'duel'
];

function fillBo9GameSelects() {
  refreshBo9GameSelects('.bo9-game');
  updateBo9GamesStatus();
}

// Un jeu choisi dans une case disparaît des autres cases du même BO9 :
// chaque jeu ne peut figurer qu'une fois.
function refreshBo9GameSelects(selector) {
  const selects = [...document.querySelectorAll(selector)];
  selects.forEach((select, index) => {
    const current = select.value;
    const others = selects.filter((s) => s !== select).map((s) => s.value);
    const available = games.filter((g) => g.id === current || !others.includes(g.id));
    select.innerHTML = `<option value="">Jeu ${index + 1}…</option>`
      + available.map((g) => `<option value="${g.id}">${escapeHtml(gameOptionLabel(g))}</option>`).join('');
    if (current && available.some((g) => g.id === current)) select.value = current;
    select.onchange = () => {
      refreshBo9GameSelects(selector);
      if (selector === '.bo9-game') updateBo9GamesStatus();
    };
  });
}

function updateBo9GamesStatus() {
  const status = $('bo9GamesStatus');
  if (!status) return;
  if (games.length < 9) {
    status.textContent = `Seulement ${games.length} jeu(x) en base : crée d’abord 9 jeux dans l’onglet 🎮 Jeux.`;
    status.className = 'text-[10px] text-amber-400';
    return;
  }
  const values = [...document.querySelectorAll('.bo9-game')].map((s) => s.value).filter(Boolean);
  const unique = new Set(values);
  if (values.length === 9 && unique.size === 9) {
    status.textContent = '✅ 9 jeux différents sélectionnés.';
    status.className = 'text-[10px] text-emerald-400';
  } else {
    const duplicates = values.length !== unique.size;
    status.textContent = `${unique.size} / 9 jeux sélectionnés${duplicates ? ' — un jeu est en double' : ''}.`;
    status.className = duplicates ? 'text-[10px] text-red-400' : 'text-[10px] text-gray-500';
  }
}

function syncBo9Slots() {
  const format = $('tourFormatType');
  if (!format || format.value !== 'bo9') return;
  const pools = Number($('tourBo9Pools')?.value) || 4;
  const size = Number($('tourBo9PoolSize')?.value) || 4;
  const max = $('tourMax');
  if (max) max.value = String(pools * size);
  const qualifiers = $('tourBo9Qualifiers');
  if (qualifiers) {
    [...qualifiers.options].forEach((opt) => { opt.disabled = Number(opt.value) > size; });
    if (Number(qualifiers.value) > size) qualifiers.value = String(size);
  }
}

const STANDARD_FORMAT_LABELS = {
  single_elim: 'Élimination directe',
  double_elim: 'Double élimination',
  round_robin: 'Poules (round robin)',
  groups_playoffs: 'Poules + élimination',
  league: 'Championnat (round robin global)',
  swiss: 'Suisse'
};

function toggleStandardOptions() {
  const format = $('tourStdFormat')?.value;
  $('tourStdPoolsWrap')?.classList.toggle('hidden', format !== 'groups_playoffs');
  $('tourStdQualWrap')?.classList.toggle('hidden', format !== 'groups_playoffs');
  $('tourStdTreeWrap')?.classList.toggle('hidden', format !== 'groups_playoffs');
  $('tourStdRoundsWrap')?.classList.toggle('hidden', format !== 'swiss');
}

function toggleTournamentFormat() {
  const bo9 = $('tourFormatType')?.value === 'bo9';
  toggleStandardOptions();
  $('tourBo9Wrap')?.classList.toggle('hidden', !bo9);
  $('tourStdWrap')?.classList.toggle('hidden', bo9);
  $('tourGameWrap')?.classList.toggle('hidden', bo9);
  $('tourTeamSizeWrap')?.classList.toggle('hidden', bo9);
  if (bo9) {
    const teamSize = $('tourTeamSize');
    if (teamSize) teamSize.value = '5';
    const hint = $('tourTeamSizeHint');
    if (hint) hint.textContent = '';
    syncBo9Slots();
    fillBo9GameSelects();
  } else {
    applyGameTeamSize();
  }
}

// Construit les 9 slots d'un BO9 à partir des jeux choisis (null = slot vide).
function bo9GameSlots(gameIds, mode) {
  const points = BO9_POINTS[mode];
  return gameIds.map((gameId, index) => {
    const category = BO9_SLOT_CATEGORIES[index];
    const cumulative = gameById(gameId)?.scoring_mode === 'cumulative';
    const wins = gameById(gameId)?.scoring_mode === 'wins';
    const bo3 = gameById(gameId)?.scoring_mode === 'bo3';
    const pairMode = !cumulative && !wins && (bo3 || gameTeamSize(gameId) === 2);
    return {
      slot: index + 1,
      category,
      game_id: gameId || null,
      units: BO9_UNITS[category],
      points_per_unit: points[category],
      scoring: cumulative ? 'cumulative' : wins ? 'wins' : bo3 ? 'bo3' : 'versus',
      pair_mode: pairMode,
      pair_format: pairMode && bo3 ? 'bo3' : null
    };
  });
}

function bo9FormConfig() {
  const mode = $('tourBo9Points').value === 'allin' ? 'allin' : 'classic';
  const gameIds = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => $(`bo9Game${n}`)?.value || '');
  const filled = gameIds.filter(Boolean);
  if (new Set(filled).size !== filled.length) {
    notify('Les jeux du BO9 doivent être différents.', true);
    return null;
  }
  const poolCount = Number($('tourBo9Pools').value) || 4;
  const poolSize = Number($('tourBo9PoolSize').value) || 4;
  const qualifiers = Number($('tourBo9Qualifiers').value) || 2;
  if (qualifiers > poolSize) {
    notify('Il ne peut pas y avoir plus de qualifiés que d’équipes par poule.', true);
    return null;
  }
  const bracketTeams = poolCount * qualifiers;
  if (![2, 4, 8, 16].includes(bracketTeams)) {
    notify('Le bracket doit accueillir 2, 4, 8 ou 16 qualifiés.', true);
    return null;
  }
  return {
    type: 'bo9',
    points_mode: mode,
    games: bo9GameSlots(gameIds, mode),
    complete: filled.length === 9,
    pool_count: poolCount,
    pool_size: poolSize,
    qualifiers_per_pool: qualifiers,
    pick_ban: Boolean($('tourBo9PickBan')?.checked),
    mercy: Boolean($('tourBo9Mercy')?.checked),
    captain_card: Boolean($('tourBo9Captain')?.checked),
    third_place: Boolean($('tourBo9Third')?.checked)
  };
}

function tournamentRegs(tournamentId) {
  return adminRegs.filter((r) => r.tournament_id === tournamentId && r.status !== 'cancelled');
}

function adminTournamentStats(t) {
  const regs = tournamentRegs(t.id);
  const max = Number(t.max_participants) || 0;
  const registered = regs.length;
  const paid = regs.filter((r) => r.payment_status === 'paid').length;
  const awaiting = regs.filter((r) => r.payment_status === 'awaiting').length;
  const refunded = adminRegs.filter((r) => r.tournament_id === t.id && r.payment_status === 'refunded').length;
  const percent = max > 0 ? Math.min(100, Math.round((registered / max) * 100)) : 0;
  return { max, registered, paid, awaiting, refunded, percent, free: max > 0 ? Math.max(0, max - registered) : null };
}

let adminSelectedTournamentId = null;
let adminTab = 'manage';

const ADMIN_TABS = [
  { key: 'manage', label: '⚙️ Gestion tournoi' },
  { key: 'players', label: '👤 Joueurs', teamOnly: true },
  { key: 'teams', label: '🛡️ Équipes', teamOnly: true },
  { key: 'regs', label: '📋 Inscriptions' },
  { key: 'pool', label: '🏟️ Poules', matchOnly: true },
  { key: 'bracket', label: '🏆 Bracket', matchOnly: true }
];

function adminTabsFor(t) {
  return ADMIN_TABS.filter((tab) => (!tab.teamOnly || t.mode === 'team')
    && (!tab.matchOnly || isBo9(t) || isStandard(t)));
}

// Déplace les panneaux de gestion dans la colonne de droite, sous les onglets.
function ensureAdminWorkspace() {
  const workspace = $('adminWorkspace');
  if (!workspace) return;
  ['adminEdit', 'adminRegs', 'adminTeamsPanel', 'adminMatchPanel'].forEach((id) => {
    const el = $(id);
    if (el && el.parentElement !== workspace) workspace.appendChild(el);
  });
}

function renderAdminTabs() {
  const box = $('adminTabs');
  const t = tournamentById(adminSelectedTournamentId);
  if (!box) return;
  if (!t) { box.innerHTML = ''; return; }
  box.innerHTML = adminTabsFor(t).map((tab) => `<button onclick="selectAdminTab('${tab.key}')" class="rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${tab.key === adminTab ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-[#1f293d] bg-white/5 text-gray-400 hover:text-white'}">${tab.label}</button>`).join('');
}

// Repère les blocs d'un panneau d'après leur titre (h3) et leur donne une vue.
function tagAdminSections(root, rules) {
  if (!root) return;
  root.querySelectorAll('h3').forEach((h) => {
    const rule = rules.find(([pattern]) => pattern.test(h.textContent));
    const block = h.closest('section, div.space-y-2');
    if (rule && block) block.dataset.adminView = rule[1];
  });
}

// N'affiche que les éléments liés à l'onglet actif (data-admin-view).
function applyAdminView() {
  tagAdminSections($('adminTeamsBody'), [[/Joueurs/, 'players'], [/Équipes/, 'teams']]);
  tagAdminSections($('adminMatchBody'), [[/Jeu de chaque tour/, 'pool bracket'], [/Poule|Matchs/, 'pool'], [/finale|Tableau/, 'bracket']]);
  document.querySelectorAll('[data-admin-view]').forEach((el) => {
    el.style.display = el.dataset.adminView.split(' ').includes(adminTab) ? '' : 'none';
  });
}

function selectAdminTab(name) {
  const t = tournamentById(adminSelectedTournamentId);
  if (!t) return;
  adminTab = adminTabsFor(t).some((tab) => tab.key === name) ? name : 'manage';
  $('adminWorkspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (adminTab === 'players' || adminTab === 'teams') {
    viewingTeamsTournamentId = t.id;
    renderAdminTeams();
  } else if (adminTab === 'pool' || adminTab === 'bracket') {
    viewingMatchTournamentId = t.id;
    renderAdminMatchPanel();
  } else if (adminTab === 'regs') {
    viewingTournamentId = t.id;
    showAdminRegs(t.id);
  }
  renderAdminTabs();
  applyAdminView();
}

// Ouvre un onglet pour un tournoi (boutons de la fiche).
function openAdminTab(name, tournamentId) {
  adminSelectedTournamentId = tournamentId;
  adminTab = name;
  renderAdminTournaments();
  selectAdminTab(name);
}

function selectAdminTournament(tournamentId) {
  adminSelectedTournamentId = tournamentId;
  adminTab = 'manage';
  renderAdminTournaments();
}

function renderAdminTournaments() {
  const box = $('adminTournaments');
  if (!box) return;
  const filter = $('adminTourFilter')?.value || 'all';
  const rows = tournaments.filter((t) => {
    if (filter === 'current') return ['open', 'running', 'closed'].includes(t.status);
    if (filter === 'draft') return t.status === 'draft';
    if (filter === 'finished') return ['finished', 'cancelled'].includes(t.status);
    return true;
  });
  const nav = $('adminTournamentNav');
  if (!rows.some((t) => t.id === adminSelectedTournamentId)) adminSelectedTournamentId = rows[0]?.id || null;
  const current = tournamentById(adminSelectedTournamentId);
  if (!current || !adminTabsFor(current).some((tab) => tab.key === adminTab)) adminTab = 'manage';
  if (nav) {
    nav.innerHTML = rows.length
      ? rows.map((t) => `<button onclick="selectAdminTournament('${t.id}')" class="w-full rounded-lg border px-3 py-2 text-left transition ${t.id === adminSelectedTournamentId ? 'border-amber-500/60 bg-amber-500/10' : 'border-[#1f293d] bg-[#07090e] hover:bg-white/5'}">
          <span class="block truncate text-[11px] font-bold text-white">${escapeHtml(t.name)}</span>
          <span class="block truncate text-[9px] text-gray-500">${escapeHtml(STATUS_LABELS[t.status] || t.status)} · ${t.published ? 'publié' : 'masqué'} · ${escapeHtml(tournamentGamesLabel(t))}</span>
        </button>`).join('')
      : '<p class="text-xs text-gray-500">Aucun tournoi.</p>';
  }
  box.innerHTML = rows.length
    ? rows.filter((t) => t.id === adminSelectedTournamentId).map((t) => {
      const s = adminTournamentStats(t);
      return `
      <div class="rounded-xl border border-[#1f293d] bg-[#07090e] px-3 py-3 space-y-2">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-xs font-bold text-white truncate">${escapeHtml(t.name)}</p>
            <p class="text-[10px] text-gray-500">${escapeHtml(tournamentGamesLabel(t))} · ${t.published ? 'publié' : 'masqué'}${t.toornament_id ? ' · Toornament lié' : ''} · ${escapeHtml(feeLabel(t))}</p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            ${isBo9(t) || isStandard(t) ? `<button onclick="openAdminTab('pool', '${t.id}')" class="rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-300 transition hover:bg-sky-500/20">⚔️ Gérer</button>` : ''}
            ${t.mode === 'team' ? `<button onclick="openAdminTab('teams', '${t.id}')" class="rounded-lg border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-[10px] font-bold text-violet-300 transition hover:bg-violet-500/20">👥 Équipes</button>` : ''}
            <button onclick="openAdminTab('regs', '${t.id}')" class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300 transition hover:bg-amber-500/20">📋 Voir les inscriptions</button>
            <select onchange="setTournamentStatus('${t.id}', this.value)" class="bg-[#07090e] border border-[#1f293d] rounded-lg px-2 py-1 text-[10px] text-white">
              ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
            <button onclick="editTournament('${t.id}')" class="px-2 py-1 bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-300 font-bold text-[10px] rounded-lg transition">✏️</button>
          </div>
        </div>
        <div class="space-y-1">
          <div class="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-gray-400">
            <span>${s.max > 0 ? `${s.registered} / ${s.max} inscrit(s)` : `${s.registered} inscrit(s) · illimité`}</span>
            <span>${s.max > 0 ? `${s.percent} %` : '—'}</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500" style="width:${s.percent}%"></div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500">
            <span>${s.free === null ? 'Places illimitées' : `${s.free} place(s) restante(s)`}</span>
            <span>${s.paid} payé(s) · ${s.awaiting} en attente${s.refunded ? ` · ${s.refunded} remboursé(s)` : ''}</span>
          </div>
        </div>
      </div>`;
    }).join('')
    : '<p class="text-xs text-gray-500">Aucun tournoi pour ce filtre.</p>';
  ensureAdminWorkspace();
  renderAdminTabs();
  applyAdminView();
}

// --- Admin : équipes et joueurs d'un tournoi en équipe ---

function showAdminTeams(tournamentId) {
  viewingTeamsTournamentId = tournamentId;
  renderAdminTeams();
}

function closeAdminTeams() {
  viewingTeamsTournamentId = null;
  $('adminTeamsPanel')?.classList.add('hidden');
}

function adminTeamCard(team, teamMax) {
  const members = team.nvg_tournament_team_members || [];
  const logo = safeUrl(team.logo_url);
  const search = `${team.name || ''} ${team.tag || ''}`.toLowerCase();
  return `
    <article data-team-item data-search="${escapeHtml(search)}" class="space-y-2 rounded-xl border border-[#1f293d] bg-[#07090e] p-3">
      <div class="flex items-start gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <img src="${logo || './Logos/no-logo.jpeg'}" alt="" onerror="this.onerror=null;this.src='./Logos/no-logo.jpeg'" class="h-full w-full object-contain p-1">
        </div>
        <div class="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_120px]">
          <input id="adm-team-name-${team.id}" value="${escapeHtml(team.name)}" maxlength="60" aria-label="Nom de l’équipe" class="${MANAGE_INPUT_CLASS}">
          <input id="adm-team-tag-${team.id}" value="${escapeHtml(team.tag || '')}" maxlength="10" placeholder="Tag" aria-label="Tag" class="${MANAGE_INPUT_CLASS}">
          <input id="adm-team-logo-${team.id}" value="${escapeHtml(team.logo_url || '')}" placeholder="URL du logo (vide = aucun)" aria-label="Logo" class="${MANAGE_INPUT_CLASS} sm:col-span-2">
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button onclick="adminSaveTeam('${team.id}')" class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300 transition hover:bg-amber-500/20">Enregistrer</button>
        <label class="cursor-pointer rounded-lg border border-[#1f293d] bg-white/5 px-2 py-1 text-[10px] font-bold text-gray-300 transition hover:bg-white/10">
          📤 Téléverser le logo
          <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange="uploadTournamentImage('teamlogo', 'adm-team-logo-${team.id}', 'adm-team-name-${team.id}', this)">
        </label>
        <span class="text-[10px] text-gray-500">${members.length}/${teamMax} joueurs</span>
        <div class="flex w-full flex-wrap items-center gap-2">
          <span class="text-[10px] font-bold text-gray-400">Code</span>
          <strong class="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">${escapeHtml(team.invite_code)}</strong>
          <input readonly value="${escapeHtml(inviteUrl(team.invite_code))}" aria-label="Lien d’invitation" class="${MANAGE_INPUT_CLASS} min-w-[180px] flex-1 text-[10px] text-gray-400">
          <button onclick="copyText('${escapeHtml(inviteUrl(team.invite_code))}')" class="rounded-lg border border-[#1f293d] bg-white/5 px-2 py-1 text-[10px] font-bold text-gray-300 transition hover:bg-white/10">Copier le lien</button>
        </div>
        ${team.logo_url ? `<button onclick="adminClearTeamLogo('${team.id}')" class="rounded-lg border border-[#1f293d] bg-white/5 px-2 py-1 text-[10px] font-bold text-gray-300 transition hover:bg-white/10">Retirer le logo</button>` : ''}
        <button onclick="adminDeleteTeam('${team.id}')" class="ml-auto rounded-lg border border-red-600/40 bg-red-600/20 px-2 py-1 text-[10px] font-bold text-red-400 transition hover:bg-red-600 hover:text-white">Supprimer l’équipe</button>
      </div>
      <ul class="space-y-1 text-[11px] text-gray-300">
        ${members.map((m) => `<li class="flex items-center justify-between gap-2">
          <span>${m.role === 'captain' ? '👑' : '•'} ${escapeHtml(m.nvg_users?.name || 'Joueur')}</span>
          ${m.role === 'captain'
            ? '<span class="text-[9px] text-gray-500">capitaine</span>'
            : `<button onclick="adminRemoveTeamMember('${team.id}', '${m.user_id}')" class="text-[10px] font-bold text-red-400 hover:text-red-300">Retirer</button>`}
        </li>`).join('')}
        ${Array.from({ length: Math.max(0, teamMax - members.length) }, () => '<li class="flex items-center justify-between gap-2 text-gray-600"><span>— slot libre</span></li>').join('')}
      </ul>
    </article>`;
}

// Ligne d'un joueur de l'évènement : voyant de paiement, pseudo, actions (payé, annuler, rembourser, retirer).
function adminEventPlayerRow(tournamentId, p, teamName) {
  const status = p.payment_status || 'not_required';
  const light = status === 'paid' ? 'bg-emerald-400' : status === 'refunded' ? 'bg-sky-400' : status === 'not_required' ? 'bg-gray-500' : 'bg-red-500';
  const btn = 'text-[10px] font-bold transition';
  const actions = [
    status !== 'paid' ? `<button onclick="setPlayerPayment('${tournamentId}', '${p.user_id}', 'paid')" class="${btn} text-emerald-400 hover:text-emerald-300">✅ Marquer payé</button>` : '',
    status === 'paid' ? `<button onclick="setPlayerPayment('${tournamentId}', '${p.user_id}', 'awaiting')" class="${btn} text-amber-400 hover:text-amber-300">↩️ Annuler le paiement</button>` : '',
    status === 'paid' ? `<button onclick="setPlayerPayment('${tournamentId}', '${p.user_id}', 'refunded')" class="${btn} text-sky-400 hover:text-sky-300">💸 Rembourser</button>` : '',
    status === 'refunded' ? `<button onclick="setPlayerPayment('${tournamentId}', '${p.user_id}', 'awaiting')" class="${btn} text-amber-400 hover:text-amber-300">↩️ Remettre en attente</button>` : '',
    `<button onclick="adminRemoveEventPlayer('${tournamentId}', '${p.user_id}')" class="${btn} text-red-400 hover:text-red-300">🗑️ Retirer</button>`
  ].join('');
  const search = [p.nvg_users?.name, p.nvg_users?.first_name, p.nvg_users?.last_name, p.nvg_users?.email, p.platform_id, teamName]
    .filter(Boolean).join(' ').toLowerCase();
  const u = adminPlayers.find((x) => x.id === p.user_id) || {};
  const birth = u.birth_date ? new Date(u.birth_date).toLocaleDateString('fr-FR') : '—';
  const firstName = p.nvg_users?.first_name || u.first_name;
  const lastName = p.nvg_users?.last_name || u.last_name;
  const details = `<dl class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 pl-5 text-[10px] sm:grid-cols-4">
    <div><dt class="text-gray-500">Pseudo en jeu</dt><dd class="font-bold text-gray-200">${escapeHtml(p.platform_id || '—')}</dd></div>
    <div><dt class="text-gray-500">Prénom</dt><dd class="font-bold text-gray-200">${escapeHtml(firstName || '—')}</dd></div>
    <div><dt class="text-gray-500">Nom</dt><dd class="font-bold text-gray-200">${escapeHtml(lastName || '—')}</dd></div>
    <div><dt class="text-gray-500">Naissance</dt><dd class="font-bold text-gray-200">${escapeHtml(birth)}</dd></div>
    <div class="col-span-2"><dt class="text-gray-500">Identité complète</dt><dd class="font-bold text-gray-200">${escapeHtml([firstName, lastName].filter(Boolean).join(' ') || '—')}</dd></div>
    <div class="col-span-2"><dt class="text-gray-500">Adresse e-mail</dt><dd class="font-bold text-gray-200">${escapeHtml(p.nvg_users?.email || u.email || '—')}</dd></div>
    <div class="col-span-2"><dt class="text-gray-500">Inscrit le</dt><dd class="font-bold text-gray-200">${escapeHtml(p.joined_at ? formatDate(p.joined_at) : '—')}</dd></div>
  </dl>`;
  return `<li data-player-item data-search="${escapeHtml(search)}" class="flex flex-wrap items-center gap-2 rounded-lg border border-[#1f293d] bg-[#07090e] px-3 py-2 text-[11px]">
    <details class="min-w-0 flex-1">
      <summary class="flex cursor-pointer list-none items-center gap-2">
        <span class="h-2.5 w-2.5 shrink-0 rounded-full ${light}" title="${escapeHtml(PLAYER_PAY_LABELS[status] || status)}"></span>
        <span class="min-w-0 truncate text-gray-200">${escapeHtml(p.nvg_users?.name || 'Joueur')} <span class="text-gray-500">· pseudo : ${escapeHtml(p.platform_id || '—')} · ${escapeHtml(PLAYER_PAY_LABELS[status] || status)}</span>${teamName ? ` <span class="text-[9px] font-bold text-sky-400">${escapeHtml(teamName)}</span>` : ' <span class="text-[9px] font-bold text-amber-300">sans équipe</span>'}</span>
      </summary>
      ${details}
    </details>
    <div class="flex flex-wrap items-center gap-2">${actions}</div>
  </li>`;
}

function renderAdminTeams() {
  const panel = $('adminTeamsPanel');
  const t = tournamentById(viewingTeamsTournamentId);
  if (!panel) return;
  if (!t) { closeAdminTeams(); return; }
  const teams = adminTeams.filter((x) => x.tournament_id === t.id);
  const players = adminEventPlayers.filter((p) => p.tournament_id === t.id);
  const teamMax = Number(t.team_max) || 5;
  const teamOf = new Map();
  teams.forEach((x) => (x.nvg_tournament_team_members || []).forEach((m) => teamOf.set(m.user_id, x.name)));
  $('adminTeamsSubtitle').textContent = `${t.name} · ${players.length} joueur(s) dans l’évènement · ${teams.length} équipe(s) · ${teamMax} joueurs max par équipe`;
  const prevPlayersQuery = $('adminPlayersSearch')?.value || '';
  const prevTeamsQuery = $('adminTeamsSearch')?.value || '';
  $('adminTeamsBody').innerHTML = `
    <section class="space-y-2">
      <h3 class="text-[10px] font-black uppercase tracking-wider text-amber-300">Joueurs de l’évènement (${players.length})</h3>
      <input id="adminPlayersSearch" value="${escapeHtml(prevPlayersQuery)}" oninput="filterAdminTeamsView()" placeholder="Rechercher un joueur (nom, prénom, pseudo, e-mail, équipe)…" class="${MANAGE_INPUT_CLASS}">
      ${players.length ? `<ul class="space-y-1.5">${players.map((p) => adminEventPlayerRow(t.id, p, teamOf.get(p.user_id) || null)).join('')}</ul>` : '<p class="text-xs text-gray-500">Aucun joueur n’a encore rejoint l’évènement.</p>'}
    </section>
    <section class="space-y-2">
      <h3 class="text-[10px] font-black uppercase tracking-wider text-amber-300">Équipes (${teams.length})</h3>
      <input id="adminTeamsSearch" value="${escapeHtml(prevTeamsQuery)}" oninput="filterAdminTeamsView()" placeholder="Rechercher une équipe (nom, tag)…" class="${MANAGE_INPUT_CLASS}">
      ${teams.length ? teams.map((team) => adminTeamCard(team, teamMax)).join('') : '<p class="text-xs text-gray-500">Aucune équipe.</p>'}
    </section>`;
  filterAdminTeamsView();
  panel.classList.remove('hidden');
}

// Filtre les joueurs et les équipes du panneau selon les champs de recherche.
function filterAdminTeamsView() {
  const playerQuery = ($('adminPlayersSearch')?.value || '').trim().toLowerCase();
  const teamQuery = ($('adminTeamsSearch')?.value || '').trim().toLowerCase();
  document.querySelectorAll('[data-player-item]').forEach((el) => {
    el.style.display = !playerQuery || el.dataset.search.includes(playerQuery) ? '' : 'none';
  });
  document.querySelectorAll('[data-team-item]').forEach((el) => {
    el.style.display = !teamQuery || el.dataset.search.includes(teamQuery) ? '' : 'none';
  });
}

async function adminSaveTeam(teamId) {
  const name = $(`adm-team-name-${teamId}`)?.value.trim() || '';
  const tag = $(`adm-team-tag-${teamId}`)?.value.trim() || '';
  const logoRaw = $(`adm-team-logo-${teamId}`)?.value.trim() || '';
  if (name.length < 2 || name.length > 60) { notify('Le nom doit contenir entre 2 et 60 caractères.', true); return; }
  if (tag.length > 10) { notify('Le tag ne doit pas dépasser 10 caractères.', true); return; }
  const logo = safeUrl(logoRaw);
  if (logoRaw && !logo) { notify('Adresse du logo invalide (https attendu).', true); return; }
  const { error } = await supabaseClient.from('nvg_tournament_teams')
    .update({ name, tag: tag || null, logo_url: logo || null })
    .eq('id', teamId);
  if (error) {
    notify(error.code === '23505' ? 'Une autre équipe porte déjà ce nom dans ce tournoi.' : 'Erreur : ' + error.message, true);
    return;
  }
  notify('Équipe mise à jour.');
  await loadAdmin();
}

async function adminRemoveTeamMember(teamId, userId) {
  if (!window.confirm('Retirer ce joueur de l’équipe ?')) return;
  try {
    await rpc('nvg_admin_remove_team_member', { p_team: teamId, p_user: userId });
    notify('Joueur retiré de l’équipe.');
    await loadAdmin();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

// Retire le joueur de l'évènement, et de son équipe s'il en a une (sauf capitaine).
async function adminRemoveEventPlayer(tournamentId, userId) {
  const teams = adminTeams.filter((x) => x.tournament_id === tournamentId);
  const team = teams.find((x) => (x.nvg_tournament_team_members || []).some((m) => m.user_id === userId));
  if (team && team.captain_id === userId) {
    notify('Ce joueur est capitaine : supprime son équipe d’abord.', true);
    return;
  }
  if (!window.confirm('Retirer ce joueur de l’évènement' + (team ? ' et de son équipe' : '') + ' ?')) return;
  try {
    if (team) await rpc('nvg_admin_remove_team_member', { p_team: team.id, p_user: userId });
    const { error } = await supabaseClient.from('nvg_tournament_players')
      .delete().eq('tournament_id', tournamentId).eq('user_id', userId);
    if (error) throw error;
    notify('Joueur retiré de l’évènement.');
    await loadAdmin();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

// Retire le logo : l'équipe revient à l'image par défaut.
async function adminClearTeamLogo(teamId) {
  const input = $(`adm-team-logo-${teamId}`);
  if (input) input.value = '';
  await adminSaveTeam(teamId);
}

async function adminDeleteTeam(teamId) {
  const team = adminTeams.find((x) => x.id === teamId);
  if (!window.confirm(`Supprimer l’équipe « ${team?.name || ''} » ? Ses membres restent dans l’évènement.`)) return;
  const { error } = await supabaseClient.from('nvg_tournament_teams').delete().eq('id', teamId);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify('Équipe supprimée.');
  await loadAdmin();
}

function closeAdminRegs() {
  viewingTournamentId = null;
  $('adminRegs')?.classList.add('hidden');
}

function showAdminRegs(tournamentId) {
  const t = tournamentById(tournamentId);
  if (!t) return;
  viewingTournamentId = tournamentId;
  const panel = $('adminRegs');
  const regs = adminRegs.filter((r) => r.tournament_id === tournamentId);
  const s = adminTournamentStats(t);
  $('adminRegsSubtitle').textContent = `${t.name} · ${tournamentGamesLabel(t)} · ${feeLabel(t)}`;
  $('adminRegsFill').textContent = s.max > 0 ? `${s.registered} / ${s.max} inscrit(s)` : `${s.registered} inscrit(s) · places illimitées`;
  $('adminRegsPercent').textContent = s.max > 0 ? `${s.percent} %` : '—';
  $('adminRegsBar').style.width = `${s.percent}%`;
  $('adminRegsBar').className = `h-full rounded-full transition-all ${s.percent >= 100 ? 'bg-red-500' : 'bg-gradient-to-r from-amber-500 to-emerald-500'}`;
  $('adminRegsFree').textContent = s.free === null ? 'Places illimitées' : `${s.free} place(s) restante(s)`;
  $('adminRegsPaid').textContent = `${s.paid} participation(s) validée(s) · ${s.awaiting} en attente de paiement${s.refunded ? ` · ${s.refunded} remboursée(s)` : ''}`;
  $('adminRegsList').innerHTML = regs.length
    ? regs.map((r) => adminRegistrationRow(r)).join('')
    : '<p class="text-xs text-gray-500">Aucune inscription pour ce tournoi.</p>';
  panel.classList.remove('hidden');

}

const PLAYER_PAY_LABELS = {
  not_required: 'Gratuit',
  awaiting: 'Billet à prendre',
  paid: 'Billet pris',
  refunded: 'Remboursé'
};

// Liste des joueurs d'une équipe avec leur état de paiement (voyant) et leurs actions.
function adminTeamPlayersBlock(r) {
  const team = adminTeams.find((x) => x.id === r.team_id);
  const members = team?.nvg_tournament_team_members || [];
  if (!members.length) return '';
  return `<div class="space-y-1.5 border-t border-[#1f293d] pt-2">
    <p class="text-[9px] font-black uppercase tracking-wider text-gray-500">Joueurs de l’équipe</p>
    ${members.map((m) => {
      const player = adminEventPlayers.find((p) => p.tournament_id === r.tournament_id && p.user_id === m.user_id);
      const status = player?.payment_status || 'not_required';
      const light = status === 'paid' ? 'bg-emerald-400' : status === 'refunded' ? 'bg-sky-400' : status === 'not_required' ? 'bg-gray-500' : 'bg-red-500';
      const btn = 'text-[10px] font-bold transition';
      const actions = [
        status !== 'paid' ? `<button onclick="setPlayerPayment('${r.tournament_id}', '${m.user_id}', 'paid')" class="${btn} text-emerald-400 hover:text-emerald-300">✅ Marquer payé</button>` : '',
        status === 'paid' ? `<button onclick="setPlayerPayment('${r.tournament_id}', '${m.user_id}', 'awaiting')" class="${btn} text-amber-400 hover:text-amber-300">↩️ Annuler le paiement</button>` : '',
        status === 'paid' ? `<button onclick="setPlayerPayment('${r.tournament_id}', '${m.user_id}', 'refunded')" class="${btn} text-sky-400 hover:text-sky-300">💸 Rembourser</button>` : '',
        status === 'refunded' ? `<button onclick="setPlayerPayment('${r.tournament_id}', '${m.user_id}', 'awaiting')" class="${btn} text-amber-400 hover:text-amber-300">↩️ Remettre en attente</button>` : '',
        m.role === 'captain' ? '' : `<button onclick="adminRemoveEventPlayer('${r.tournament_id}', '${m.user_id}')" class="${btn} text-red-400 hover:text-red-300">🗑️ Retirer</button>`
      ].join('');
      const u = adminPlayers.find((x) => x.id === m.user_id) || {};
      const birth = u.birth_date ? new Date(u.birth_date).toLocaleDateString('fr-FR') : '—';
      const details = `<dl class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 pl-5 text-[10px] sm:grid-cols-4">
        <div><dt class="text-gray-500">Pseudo en jeu</dt><dd class="font-bold text-gray-200">${escapeHtml(player?.platform_id || '—')}</dd></div>
        <div><dt class="text-gray-500">Prénom</dt><dd class="font-bold text-gray-200">${escapeHtml(u.first_name || '—')}</dd></div>
        <div><dt class="text-gray-500">Nom</dt><dd class="font-bold text-gray-200">${escapeHtml(u.last_name || '—')}</dd></div>
        <div><dt class="text-gray-500">Naissance</dt><dd class="font-bold text-gray-200">${escapeHtml(birth)}</dd></div>
        <div class="col-span-2"><dt class="text-gray-500">Identité complète</dt><dd class="font-bold text-gray-200">${escapeHtml([u.first_name, u.last_name].filter(Boolean).join(' ') || '—')}</dd></div>
        <div class="col-span-2"><dt class="text-gray-500">Inscrit le</dt><dd class="font-bold text-gray-200">${escapeHtml(player?.joined_at ? formatDate(player.joined_at) : '—')}</dd></div>
      </dl>`;
      return `<div class="flex flex-wrap items-center gap-2 rounded-lg border border-[#1f293d] bg-[#0b0f17] px-2 py-1.5 text-[11px]">
        <details class="min-w-0 flex-1">
          <summary class="flex cursor-pointer list-none items-center gap-2">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full ${light}" title="${escapeHtml(PLAYER_PAY_LABELS[status] || status)}"></span>
            <span class="min-w-0 truncate text-gray-200">${m.role === 'captain' ? '👑 ' : ''}${escapeHtml(m.nvg_users?.name || 'Joueur')} <span class="text-gray-500">· ${escapeHtml(PLAYER_PAY_LABELS[status] || status)}</span></span>
          </summary>
          ${details}
        </details>
        <div class="flex flex-wrap items-center gap-2">${actions}</div>
      </div>`;
    }).join('')}
  </div>`;
}

async function setPlayerPayment(tournamentId, userId, status) {
  const { error } = await supabaseClient.from('nvg_tournament_players')
    .update({
      payment_status: status,
      paid_at: status === 'paid' ? new Date().toISOString() : null
    })
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify('Paiement mis à jour.');
  await loadAdmin();
}

function adminRegistrationRow(r) {
  const user = r.nvg_users || {};
  const team = r.nvg_tournament_teams;
  const pseudo = user.name || 'Participant';
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—';
  const birth = user.birth_date ? new Date(user.birth_date).toLocaleDateString('fr-FR') : '—';
  const payment = r.payment_status || 'not_required';
  return `
    <div class="rounded-xl border border-[#1f293d] bg-[#07090e] p-3 space-y-2">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="flex min-w-0 items-start gap-2.5">
          ${team ? `<img src="${safeUrl(team.logo_url) || './Logos/no-logo.jpeg'}" alt="" onerror="this.onerror=null;this.src='./Logos/no-logo.jpeg'" class="h-9 w-9 shrink-0 rounded-lg border border-white/10 bg-white/5 object-cover">` : ''}
          <div class="min-w-0">
            <p class="text-xs font-black text-white truncate">${team ? `🛡️ ${escapeHtml(team.name)}${team.tag ? ` [${escapeHtml(team.tag)}]` : ''}` : `👤 ${escapeHtml(pseudo)}`}</p>
            <p class="text-[10px] text-gray-400">Pseudo site : <span class="text-gray-200">${escapeHtml(pseudo)}</span>${team ? ` · capitaine : ${escapeHtml(pseudo)}` : ''}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="rounded-full border px-2 py-1 text-[9px] font-black uppercase ${r.status === 'confirmed' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : r.status === 'cancelled' ? 'text-gray-500 border-[#1f293d] bg-white/5' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}">${escapeHtml(REG_LABELS[r.status] || r.status)}</span>
          ${paymentBadge(payment)}
        </div>
      </div>
      ${team ? '' : `<dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] sm:grid-cols-4">
        <div><dt class="text-gray-500">Pseudo en jeu</dt><dd class="font-bold text-gray-200">${escapeHtml(r.platform_id || '—')}</dd></div>
        <div><dt class="text-gray-500">Prénom</dt><dd class="font-bold text-gray-200">${escapeHtml(user.first_name || '—')}</dd></div>
        <div><dt class="text-gray-500">Nom</dt><dd class="font-bold text-gray-200">${escapeHtml(user.last_name || '—')}</dd></div>
        <div><dt class="text-gray-500">Naissance</dt><dd class="font-bold text-gray-200">${escapeHtml(birth)}</dd></div>
        <div class="col-span-2"><dt class="text-gray-500">Identité complète</dt><dd class="font-bold text-gray-200">${escapeHtml(fullName)}</dd></div>
        <div class="col-span-2"><dt class="text-gray-500">Inscrit le</dt><dd class="font-bold text-gray-200">${escapeHtml(formatDate(r.created_at))}</dd></div>
      </dl>`}
      ${adminTeamPlayersBlock(r)}
      <div class="flex flex-wrap items-center gap-2 border-t border-[#1f293d] pt-2">
        <button onclick="setRegistrationStatus('${r.id}','confirmed')" class="text-[10px] font-bold text-emerald-400 hover:text-emerald-300">Confirmer</button>
        <button onclick="setRegistrationStatus('${r.id}','waitlist')" class="text-[10px] font-bold text-amber-400 hover:text-amber-300">Liste d'attente</button>
        <button onclick="setRegistrationStatus('${r.id}','cancelled')" class="text-[10px] font-bold text-red-400 hover:text-red-300">Annuler</button>
        ${team ? '' : payment === 'paid'
          ? `<button onclick="setPaymentStatus('${r.id}','refunded')" class="ml-auto text-[10px] font-bold text-sky-400 hover:text-sky-300">💸 Rembourser</button>`
          : `<button onclick="setPaymentStatus('${r.id}','paid')" class="ml-auto text-[10px] font-bold text-emerald-400 hover:text-emerald-300">✅ Marquer payé</button>`}
        ${!team && (payment === 'paid' || payment === 'refunded')
          ? `<button onclick="setPaymentStatus('${r.id}','awaiting')" class="text-[10px] font-bold text-amber-400 hover:text-amber-300">↩️ Remettre en attente</button>`
          : ''}
        <button onclick="deleteRegistration('${r.id}')" class="ml-1 border-l border-[#1f293d] pl-2 text-[10px] font-bold text-red-400 hover:text-red-300">🗑️ Supprimer</button>
      </div>
    </div>`;
}

async function deleteRegistration(id) {
  const reg = adminRegs.find((r) => r.id === id);
  const teamName = reg?.nvg_tournament_teams?.name;
  const who = teamName
    ? `l’équipe « ${teamName} »`
    : `« ${reg?.nvg_users?.name || 'ce joueur'} »`;
  const extra = teamName
    ? '\n\nL’équipe elle-même n’est pas supprimée : ses membres pourront la réinscrire.'
    : '';
  if (!window.confirm(`Supprimer définitivement l’inscription de ${who} ?\n\nElle disparaîtra de la liste et la place sera libérée.${extra}`)) {
    return;
  }
  const { error } = await supabaseClient.from('nvg_tournament_registrations').delete().eq('id', id);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify('Inscription supprimée.');
  await loadAdmin();
  if (currentUser) await loadMember();
}

async function setPaymentStatus(id, paymentStatus) {
  const reg = adminRegs.find((r) => r.id === id);
  const wasRefunded = reg?.payment_status === 'refunded';
  if (paymentStatus === 'refunded'
    && !window.confirm('Marquer ce paiement comme remboursé ?\n\nL’inscription sera annulée et la place sera libérée.')) {
    return;
  }
  const patch = { payment_status: paymentStatus, updated_at: new Date().toISOString() };
  if (paymentStatus === 'paid') {
    patch.paid_at = new Date().toISOString();
    // Un paiement reçu vaut participation : on (re)confirme l'inscription.
    if (reg?.status !== 'confirmed') patch.status = 'confirmed';
  } else {
    patch.paid_at = null;
    if (paymentStatus === 'refunded') {
      // Remboursement = le joueur ne vient pas : on libère la place.
      patch.status = 'cancelled';
    } else if (paymentStatus === 'awaiting' && wasRefunded && reg?.status === 'cancelled') {
      // Retour en attente de paiement après un remboursement : la place est reprise.
      patch.status = 'confirmed';
    }
  }
  const { error } = await supabaseClient.from('nvg_tournament_registrations').update(patch).eq('id', id);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  if (paymentStatus === 'paid') {
    notify('Paiement validé, participation confirmée.');
  } else if (paymentStatus === 'refunded') {
    notify('Remboursement enregistré : inscription annulée, place libérée.');
  } else {
    notify(wasRefunded
      ? 'Paiement remis en attente, la place est reprise.'
      : 'Paiement remis en attente.');
  }
  await loadAdmin();
  await loadMember();
}

function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function editTournament(id) {
  const t = tournamentById(id);
  if (!t) return;
  editingTournamentId = id;
  const bo9 = isBo9(t);
  $('editName').value = t.name || '';
  $('editStatus').value = t.status || 'draft';
  const size = t.mode === 'solo' ? 1 : Math.min(6, Math.max(2, Number(t.team_min) || 2));
  $('editTeamSize').value = String(bo9 ? 5 : size);
  $('editTeamSize').disabled = bo9;
  $('editTeamSize').title = bo9 ? 'Format BO9 : équipes de 5 joueurs' : '';
  $('editMax').value = t.max_participants || '';
  $('editFee').value = Number(t.entry_fee_cents) > 0 ? (Number(t.entry_fee_cents) / 100).toFixed(2) : '';
  $('editPrizeFirst').value = t.prize_first || t.prize || '';
  $('editPrizeSecond').value = t.prize_second || '';
  $('editPrizeThird').value = t.prize_third || '';
  $('editStart').value = toLocalInput(t.starts_at);
  $('editClose').value = toLocalInput(t.registration_closes_at);
  $('editDesc').value = t.description || '';
  $('editBanner').value = t.banner_url || '';
  $('editLogo').value = t.logo_url || '';
  $('editToornament').value = t.toornament_url || '';
  $('editPaymentUrl').value = t.payment_url || '';
  $('editPaymentInstructions').value = t.payment_instructions || '';
  $('editPublished').checked = !!t.published;
  fillEditBo9Games(t);
  const panel = $('adminEdit');
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeEdit() {
  $('adminEdit').classList.add('hidden');
  editingTournamentId = null;
}

function bo9TournamentLocked(tournamentId) {
  return tournamentMatches.some((m) => m.tournament_id === tournamentId);
}

// Remplit les 9 sélecteurs de jeux d'un BO9 dans le panneau d'édition.
function fillEditBo9Games(t) {
  const cfg = bo9Config(t);
  const wrap = $('editBo9Wrap');
  if (!wrap) return;
  wrap.classList.toggle('hidden', !cfg);
  if (!cfg) return;
  const locked = bo9TournamentLocked(t.id);
  document.querySelectorAll('.edit-bo9-game').forEach((select, index) => {
    select.innerHTML = `<option value="">Jeu ${index + 1}…</option>`
      + games.map((g) => `<option value="${g.id}">${escapeHtml(gameOptionLabel(g))}</option>`).join('');
    select.value = cfg.games[index]?.game_id || '';
    select.disabled = locked;
  });
  refreshBo9GameSelects('.edit-bo9-game');
  const filled = cfg.games.filter((g) => g.game_id).length;
  $('editBo9Status').textContent = locked
    ? 'Des matchs existent : les jeux ne peuvent plus être modifiés.'
    : (filled === 9 ? 'Les 9 jeux sont choisis.' : `${filled}/9 jeux choisis : le tournoi reste en brouillon tant que ce n’est pas complet.`);
}

async function saveTournament() {
  if (!editingTournamentId) return;
  const name = $('editName').value.trim();
  if (!name) { notify('Le nom du tournoi est obligatoire.', true); return; }
  const maxRaw = $('editMax').value.trim();
  const edited = tournamentById(editingTournamentId);
  const cfg = bo9Config(edited);
  const size = cfg ? 5 : (parseInt($('editTeamSize').value, 10) || 1);
  const bannerUrl = safeUrl($('editBanner').value);
  const toornamentUrl = safeUrl($('editToornament').value);
  let formatPatch = {};
  let complete = true;
  if (cfg) {
    const gameIds = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => $(`editBo9Game${n}`)?.value || '');
    const filled = gameIds.filter(Boolean);
    if (new Set(filled).size !== filled.length) {
      notify('Les jeux du BO9 doivent être différents.', true);
      return;
    }
    const current = cfg.games.map((g) => g.game_id || '');
    const changed = gameIds.some((id, i) => id !== current[i]);
    if (changed && bo9TournamentLocked(editingTournamentId)) {
      notify('Des matchs existent : les jeux ne peuvent plus être modifiés.', true);
      return;
    }
    complete = filled.length === 9;
    if (changed) {
      formatPatch = { format_config: { ...cfg, games: bo9GameSlots(gameIds, cfg.points_mode), complete } };
    }
  }
  if (cfg && !complete && $('editPublished').checked) {
    notify('Tournoi laissé en brouillon : choisis les 9 jeux avant de le publier.');
  }
  const patch = {
    ...formatPatch,
    name,
    mode: cfg ? 'team' : (size === 1 ? 'solo' : 'team'),
    team_min: size,
    team_max: size,
    status: $('editStatus').value,
    max_participants: cfg
      ? (Number(cfg.pool_count) || 4) * (Number(cfg.pool_size) || 4)
      : (maxRaw ? parseInt(maxRaw, 10) : null),
    entry_fee_cents: eurosToCents($('editFee').value),
    prize_first: $('editPrizeFirst').value.trim() || null,
    prize_second: $('editPrizeSecond').value.trim() || null,
    prize_third: $('editPrizeThird').value.trim() || null,
    starts_at: $('editStart').value ? new Date($('editStart').value).toISOString() : null,
    registration_closes_at: $('editClose').value ? new Date($('editClose').value).toISOString() : null,
    description: $('editDesc').value.trim() || null,
    banner_url: bannerUrl || null,
    logo_url: safeUrl($('editLogo').value) || null,
    toornament_url: toornamentUrl || null,
    toornament_id: toornamentIdFromUrl(toornamentUrl),
    payment_url: safeUrl($('editPaymentUrl').value) || null,
    payment_instructions: $('editPaymentInstructions').value.trim() || null,
    published: cfg && !complete ? false : $('editPublished').checked
  };
  try {
    const { error } = await supabaseClient.from('nvg_tournaments').update(patch).eq('id', editingTournamentId);
    if (error) throw new Error(error.message);
    notify('Tournoi mis à jour.');
    closeEdit();
    await loadPublic();
    renderAdminTournaments();
    if (viewingTournamentId === editingTournamentId) showAdminRegs(editingTournamentId);
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function deleteTournament() {
  const t = tournamentById(editingTournamentId);
  if (!t) return;
  if (!window.confirm(`Supprimer définitivement « ${t.name} » ? Les équipes et inscriptions liées seront supprimées.`)) return;
  try {
    const { error } = await supabaseClient.from('nvg_tournaments').delete().eq('id', t.id);
    if (error) throw new Error(error.message);
    notify('Tournoi supprimé.');
    closeEdit();
    await loadPublic();
    renderAdminTournaments();
    await loadAdmin();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

const GAME_IMG_BUCKET = 'games-img';
const GAME_IMG_PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${GAME_IMG_BUCKET}/`;
const pendingGameImages = { logo: null, banniere: null };

// Chemin du fichier dans le bucket à partir de son URL publique (ou null si
// l'image vient d'ailleurs, auquel cas il n'y a rien à supprimer chez nous).
function gameImagePathFromUrl(value) {
  const url = safeUrl(value);
  if (!url) return null;
  const clean = url.split('?')[0].split('#')[0];
  if (!clean.startsWith(GAME_IMG_PUBLIC_PREFIX)) return null;
  const path = decodeURIComponent(clean.slice(GAME_IMG_PUBLIC_PREFIX.length));
  if (!path || path.includes('..') || path.startsWith('/')) return null;
  return path;
}

async function removeGameImage(path) {
  if (!path) return true;
  try {
    const { error } = await supabaseClient.storage.from(GAME_IMG_BUCKET).remove([path]);
    if (error && !/not found/i.test(error.message || '')) throw error;
    return true;
  } catch (err) {
    notify(`Ancien fichier non supprimé (${path}) : ${err.message || err}`, true);
    return false;
  }
}

// Un fichier est-il encore utilisé par un autre jeu (URL manuelle partagée) ?
function gameImagePathInUse(path, exceptGameId) {
  if (!path) return false;
  return games.some((g) => g.id !== exceptGameId
    && (gameImagePathFromUrl(g.logo_url) === path || gameImagePathFromUrl(g.banner_url) === path));
}

function currentGameImagePaths() {
  const g = editingGameId ? gameById(editingGameId) : null;
  return {
    logo: gameImagePathFromUrl(g?.logo_url),
    banniere: gameImagePathFromUrl(g?.banner_url)
  };
}

async function purgePendingGameImages(exceptGameId) {
  const stored = currentGameImagePaths();
  const jobs = [];
  Object.entries(pendingGameImages).forEach(([key, path]) => {
    if (!path || path === stored[key] || gameImagePathInUse(path, exceptGameId)) return;
    jobs.push(removeGameImage(path));
  });
  pendingGameImages.logo = null;
  pendingGameImages.banniere = null;
  if (jobs.length) await Promise.all(jobs);
}

function setGamePreviews() {
  const logo = safeUrl($('gameLogo')?.value);
  const banner = safeUrl($('gameBanner')?.value);
  const logoImg = $('gameLogoPreview');
  const logoEmpty = $('gameLogoEmpty');
  const bannerImg = $('gameBannerPreview');
  const bannerEmpty = $('gameBannerEmpty');
  if (logoImg && logoEmpty) {
    if (logo) {
      logoImg.src = logo;
      logoImg.classList.remove('hidden');
      logoEmpty.classList.add('hidden');
    } else {
      logoImg.removeAttribute('src');
      logoImg.classList.add('hidden');
      logoEmpty.classList.remove('hidden');
    }
  }
  if (bannerImg && bannerEmpty) {
    if (banner) {
      bannerImg.src = banner;
      bannerImg.classList.remove('hidden');
      bannerEmpty.classList.add('hidden');
    } else {
      bannerImg.removeAttribute('src');
      bannerImg.classList.add('hidden');
      bannerEmpty.classList.remove('hidden');
    }
  }
}

function resetGameForm() {
  editingGameId = null;
  ['gameName', 'gameLogo', 'gameBanner'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
  if ($('gameTeamSize')) $('gameTeamSize').value = '';
  if ($('gameScoringMode')) $('gameScoringMode').value = 'none';
  syncGameModeHints();
  ['gameLogoFile', 'gameBannerFile'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
  const submit = $('gameSubmit');
  if (submit) submit.textContent = 'Créer le jeu';
  $('gameCancel')?.classList.add('hidden');
  setGamePreviews();
}

async function cancelGameEdit() {
  await purgePendingGameImages(editingGameId);
  resetGameForm();
}

function editGame(id) {
  const g = gameById(id);
  if (!g) return;
  editingGameId = id;
  $('gameName').value = g.name || '';
  if ($('gameTeamSize')) $('gameTeamSize').value = g.team_size ? String(g.team_size) : '';
  if ($('gameScoringMode')) $('gameScoringMode').value = ['versus', 'cumulative', 'wins', 'none', 'bo3'].includes(g.scoring_mode) ? g.scoring_mode : 'versus';
  if ($('gameTeamSize') && g.scoring_mode === 'bo3') $('gameTeamSize').value = '2';
  $('gameLogo').value = g.logo_url || '';
  $('gameBanner').value = g.banner_url || '';
  const submit = $('gameSubmit');
  if (submit) submit.textContent = 'Enregistrer les modifications';
  $('gameCancel')?.classList.remove('hidden');
  setGamePreviews();
  $('gameName').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('gameName').focus();
}

function setUploadLabel(input, text) {
  const label = input?.closest('label');
  if (label && label.firstChild) label.firstChild.nodeValue = `${text} `;
}

async function uploadGameImage(kind, input) {
  const file = input?.files?.[0];
  if (!file) return;
  const isLogo = kind === 'logo';
  const urlField = isLogo ? $('gameLogo') : $('gameBanner');
  try {
    const name = $('gameName').value.trim();
    if (!name) throw new Error('saisis d’abord le nom du jeu.');
    if (!currentUser || !isAdmin) throw new Error('connecte-toi avec un compte administrateur.');
    if (file.size > 4 * 1024 * 1024) throw new Error('image trop lourde (4 Mo maximum).');
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error('format accepté : PNG, JPG ou WebP.');

    const path = `${slugify(name)}-${isLogo ? 'logo' : 'banniere'}.png`;
    const key = isLogo ? 'logo' : 'banniere';
    setUploadLabel(input, '⏳ Envoi…');
    const { error } = await supabaseClient.storage
      .from(GAME_IMG_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type });
    if (error) throw error;

    // Fichier envoyé avant celui-ci dans la même session et non enregistré :
    // on le supprime pour ne pas laisser d'orphelin.
    if (pendingGameImages[key] && pendingGameImages[key] !== path) {
      await removeGameImage(pendingGameImages[key]);
    }
    pendingGameImages[key] = path;

    const { data } = supabaseClient.storage.from(GAME_IMG_BUCKET).getPublicUrl(path);
    urlField.value = `${data.publicUrl}?v=${Date.now()}`;
    setGamePreviews();
    notify(`Image envoyée : ${GAME_IMG_BUCKET}/${path}`);
  } catch (err) {
    notify('Envoi impossible : ' + (err.message || err), true);
  } finally {
    setUploadLabel(input, isLogo ? '📤 Téléverser' : '📤 Téléverser la bannière');
    if (input) input.value = '';
  }
}

// Bannière ou logo de tournoi : image téléversée dans le même bucket que les
// visuels de jeux, dans le dossier `tournois/`. Le lien obtenu remplit le champ d'URL.
async function uploadTournamentImage(kind, urlFieldId, nameFieldId, input) {
  const file = input?.files?.[0];
  if (!file) return;
  try {
    if (!currentUser || !isAdmin) throw new Error('connecte-toi avec un compte administrateur.');
    if (file.size > 4 * 1024 * 1024) throw new Error('image trop lourde (4 Mo maximum).');
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error('format accepté : PNG, JPG ou WebP.');
    const name = $(nameFieldId)?.value.trim() || 'tournoi';
    const ext = /png/i.test(file.type) ? 'png' : /webp/i.test(file.type) ? 'webp' : 'jpg';
    const folder = kind === 'teamlogo' ? 'equipes' : 'tournois';
    const label = kind === 'banner' ? 'banniere' : 'logo';
    const path = `${folder}/${slugify(name)}-${label}-${Date.now()}.${ext}`;
    notify('Envoi de la bannière…');
    const { error } = await supabaseClient.storage
      .from(GAME_IMG_BUCKET)
      .upload(path, file, { cacheControl: '3600', contentType: file.type });
    if (error) throw error;
    const { data } = supabaseClient.storage.from(GAME_IMG_BUCKET).getPublicUrl(path);
    $(urlFieldId).value = data.publicUrl;
    notify(kind === 'banner' ? 'Bannière envoyée.' : 'Logo envoyé.');
  } catch (err) {
    notify('Envoi impossible : ' + (err.message || err), true);
  } finally {
    if (input) input.value = '';
  }
}

async function saveGame() {
  const name = $('gameName').value.trim();
  if (!name) { notify('Saisis un nom de jeu.', true); return; }
  const scoringMode = $('gameScoringMode')?.value;
  const bo3Mode = scoringMode === 'bo3';
  const payload = {
    name,
    slug: slugify(name),
    team_size: bo3Mode ? 2 : (Number($('gameTeamSize')?.value) || null),
    scoring_mode: ['versus', 'cumulative', 'wins', 'none', 'bo3'].includes(scoringMode) ? scoringMode : 'none',
    logo_url: safeUrl($('gameLogo').value) || null,
    banner_url: safeUrl($('gameBanner').value) || null
  };
  const gameId = editingGameId;
  const current = gameId ? gameById(gameId) : null;
  const before = {
    logo: gameImagePathFromUrl(current?.logo_url),
    banniere: gameImagePathFromUrl(current?.banner_url)
  };
  const after = {
    logo: gameImagePathFromUrl(payload.logo_url),
    banniere: gameImagePathFromUrl(payload.banner_url)
  };
  try {
    if (gameId) {
      const { error } = await supabaseClient.from('nvg_tournament_games').update(payload).eq('id', gameId);
      if (error) throw new Error(error.message);
      notify('Jeu mis à jour.');
    } else {
      const { error } = await supabaseClient.from('nvg_tournament_games').insert(payload);
      if (error) throw new Error(error.message);
      notify('Jeu créé.');
    }

    // Une fois l'enregistrement réussi, on efface les visuels remplacés
    // (renommage du jeu, passage à une URL externe, fichier non retenu…)
    // pour qu'il ne reste pas d'ancien logo ou de bannière dans le bucket.
    const removals = [];
    Object.keys(after).forEach((key) => {
      const oldPath = before[key];
      if (oldPath && oldPath !== after[key] && !gameImagePathInUse(oldPath, gameId)) {
        removals.push(removeGameImage(oldPath));
      }
    });
    Object.entries(pendingGameImages).forEach(([key, path]) => {
      if (!path || path === after[key] || gameImagePathInUse(path, gameId)) return;
      removals.push(removeGameImage(path));
    });
    pendingGameImages.logo = null;
    pendingGameImages.banniere = null;
    if (removals.length) await Promise.all(removals);

    resetGameForm();
    await loadPublic();
    renderAdminGames();
  } catch (err) {
    const message = String(err.message || err);
    notify('Erreur : ' + (/duplicate key/i.test(message) ? 'un jeu porte déjà ce nom.' : message), true);
  }
}

async function createTournament() {
  const name = $('tourName').value.trim();
  if (!name) { notify('Saisis un nom de tournoi.', true); return; }
  const bo9 = $('tourFormatType')?.value === 'bo9';
  let formatConfig = null;
  let gameId = $('tourGame').value || null;
  let mode = 'solo';
  let teamSize = parseInt($('tourTeamSize').value, 10) || 1;
  let maxParticipants = parseInt($('tourMax').value, 10) || null;
  let published = $('tourPublished').checked;
  if (bo9) {
    formatConfig = bo9FormConfig();
    if (!formatConfig) return;
    gameId = null;
    mode = 'team';
    teamSize = 5;
    maxParticipants = Number(formatConfig.pool_count) * Number(formatConfig.pool_size);
    if (!formatConfig.complete) {
      published = false;
      notify('Tournoi enregistré en brouillon : choisis les 9 jeux avant de le publier.');
    }
  } else {
    mode = teamSize === 1 ? 'solo' : 'team';
    const format = $('tourStdFormat')?.value || 'single_elim';
    formatConfig = { type: 'standard', format };
    if (format === 'groups_playoffs') {
      formatConfig.pool_count = Number($('tourStdPools')?.value) || 2;
      formatConfig.qualifiers_per_pool = Number($('tourStdQualifiers')?.value) || 2;
      formatConfig.tree = $('tourStdTree')?.value === 'double' ? 'double' : 'single';
    }
    if (format === 'swiss') {
      const rounds = parseInt($('tourStdRounds')?.value, 10);
      if (rounds > 0) formatConfig.rounds = rounds;
    }
  }
  const bannerUrl = safeUrl($('tourBanner').value);
  const toornamentUrl = safeUrl($('tourToornament').value);
  try {
    const { data, error } = await supabaseClient.from('nvg_tournaments').insert({
      slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      game_id: gameId,
      description: $('tourDesc').value.trim() || null,
      mode,
      format: $('tourFormat').value,
      format_config: formatConfig,
      team_min: teamSize,
      team_max: teamSize,
      max_participants: maxParticipants,
      entry_fee_cents: eurosToCents($('tourFee').value),
      prize_first: $('tourPrizeFirst').value.trim() || null,
      prize_second: $('tourPrizeSecond').value.trim() || null,
      prize_third: $('tourPrizeThird').value.trim() || null,
      starts_at: $('tourStart').value ? new Date($('tourStart').value).toISOString() : null,
      registration_closes_at: $('tourClose').value ? new Date($('tourClose').value).toISOString() : null,
      status: $('tourStatus').value,
      published,
      banner_url: bannerUrl || null,
      logo_url: safeUrl($('tourLogo')?.value) || null,
      toornament_url: toornamentUrl || null,
      toornament_id: toornamentIdFromUrl(toornamentUrl),
      payment_url: safeUrl($('tourPaymentUrl').value) || null,
      payment_instructions: $('tourPaymentInstructions').value.trim() || null
    }).select('id').single();
    if (error) throw new Error(error.message);
    ['tourName', 'tourBanner', 'tourToornament', 'tourPrizeFirst', 'tourPrizeSecond', 'tourPrizeThird',
      'tourFee', 'tourPaymentUrl', 'tourPaymentInstructions', 'tourMax'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
    if (bo9) {
      if ($('tourFormatType')) $('tourFormatType').value = 'single';
      document.querySelectorAll('.bo9-game').forEach((select) => { select.value = ''; });
      updateBo9GamesStatus();
      toggleTournamentFormat();
    }
    notify('Tournoi créé.');
    await loadPublic();
    renderAdminTournaments();
    return data;
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function setTournamentStatus(id, status) {
  const { error } = await supabaseClient.from('nvg_tournaments').update({ status }).eq('id', id);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify('Statut mis à jour.');
  await loadPublic();
  renderAdminTournaments();
}

async function setRegistrationStatus(id, status) {
  const patch = { status, updated_at: new Date().toISOString() };
  const reg = adminRegs.find((r) => r.id === id);
  // Réinscrire un joueur remboursé : le paiement redevient à régler.
  if (status === 'confirmed' && reg?.payment_status === 'refunded') {
    const t = tournamentById(reg.tournament_id);
    patch.payment_status = Number(t?.entry_fee_cents) > 0 ? 'awaiting' : 'not_required';
    patch.paid_at = null;
  }
  const { error } = await supabaseClient.from('nvg_tournament_registrations').update(patch).eq('id', id);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify(patch.payment_status === 'awaiting'
    ? 'Inscription rétablie : paiement à nouveau en attente.'
    : 'Inscription mise à jour.');
  await loadAdmin();
}

// --- Compte ---

function showAuthForm(mode) {
  const login = mode !== 'signup';
  $('loginForm').classList.toggle('hidden', !login);
  $('signupForm').classList.toggle('hidden', login);
  $('loginError').classList.add('hidden');
  $('signupError').classList.add('hidden');
  $('signupInfo').classList.add('hidden');
  $('authTabLogin').className = `px-3 py-2 rounded-lg text-xs font-black transition ${login ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}`;
  $('authTabSignup').className = `px-3 py-2 rounded-lg text-xs font-black transition ${!login ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}`;
}

function showAccountUi() {
  $('accountChip').classList.toggle('hidden', !currentUser);
  $('accountChip').classList.toggle('flex', !!currentUser);
  $('loginSection').classList.toggle('hidden', !!currentUser);
  $('memberSection').classList.toggle('hidden', !currentUser);
}

async function refreshAccount() {
  if (!currentUser) {
    showAccountUi();
    return;
  }
  showAccountUi();
  await Promise.all([showProfile(), checkAdmin(), loadMember()]);
}

async function signOut() {
  await supabaseClient.auth.signOut();
  window.location.href = window.location.pathname;
}

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session?.user || null;
  if (currentUser) {
    await showProfile();
    await checkAdmin();
    await loadMember();
  }
  showAccountUi();
  await loadPublic();

  const params = new URLSearchParams(window.location.search);
  const join = params.get('join');
  const confirmed = params.get('confirmed');
  if (join) {
    pendingJoinCode = join.toLowerCase();
    window.history.replaceState({}, document.title, window.location.pathname);
    if (currentUser) {
      applyPendingJoin();
    } else {
      notify('Connecte-toi avec ton compte, puis rejoins l’équipe avec le code reçu.', false);
      goAccount('info');
    }
  } else {
    applyRoute();
  }

  window.addEventListener('popstate', applyRoute);

  if (confirmed === '1') {
    notify(currentUser ? 'Adresse e-mail confirmée. Bienvenue !' : 'Adresse e-mail confirmée. Tu peux te connecter.', false);
    const pane = routeState().account || 'info';
    window.history.replaceState({ tab: 'account', account: pane }, document.title, accountUrl(pane));
  }
}

function applyPendingJoin() {
  if (!pendingJoinCode || !currentUser) return false;
  goAccount('teams');
  const input = $('joinCode');
  if (input) input.value = pendingJoinCode;
  pendingJoinCode = null;
  notify('Code d’invitation prêt : clique sur « Rejoindre ».');
  return true;
}

async function showProfile() {
  $('accountName').textContent = currentUser.email || '';
  $('memberSubtitle').textContent = currentUser.email || '';
  try {
    const { data } = await supabaseClient.from('nvg_users')
      .select('name,first_name,last_name,birth_date')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (data) {
      profileIdentity = {
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        birth_date: data.birth_date || ''
      };
      if (data.name) {
        $('accountName').textContent = data.name;
        $('memberSubtitle').textContent = `Connecté en tant que ${data.name}`;
      }
      if ($('profileName')) $('profileName').value = data.name || '';
      if ($('profileFirstName')) $('profileFirstName').value = profileIdentity.first_name;
      if ($('profileLastName')) $('profileLastName').value = profileIdentity.last_name;
      if ($('profileBirthDate')) $('profileBirthDate').value = profileIdentity.birth_date;
      $('profileHint')?.classList.toggle('hidden', identityComplete());
    }
  } catch (_) { /* profil facultatif */ }
}

function identityComplete() {
  return Boolean(profileIdentity.first_name && profileIdentity.last_name && profileIdentity.birth_date);
}

async function saveIdentity() {
  if (!currentUser) return;
  const name = $('profileName').value.trim();
  const first = $('profileFirstName').value.trim();
  const last = $('profileLastName').value.trim();
  const birth = $('profileBirthDate').value;
  if (name.length < 2) { notify('Choisis un pseudo d’au moins 2 caractères.', true); return; }
  if (!first || !last) { notify('Renseigne ton prénom et ton nom.', true); return; }
  if (!birth) { notify('Renseigne ta date de naissance.', true); return; }
  try {
    const { error } = await supabaseClient.from('nvg_users').update({
      name,
      first_name: first,
      last_name: last,
      birth_date: birth
    }).eq('id', currentUser.id);
    if (error) throw new Error(error.message);
    await supabaseClient.auth.updateUser({ data: { name, first_name: first, last_name: last, birth_date: birth } });
    profileIdentity = { first_name: first, last_name: last, birth_date: birth };
    notify('Informations enregistrées.');
    await showProfile();
  } catch (err) {
    notify('Erreur : ' + (err.message || err), true);
  }
}

async function changePassword() {
  if (!currentUser) return;
  const password = $('newPassword').value;
  const confirm = $('newPasswordConfirm').value;
  if (password.length < 8) { notify('Le mot de passe doit contenir au moins 8 caractères.', true); return; }
  if (password !== confirm) { notify('Les deux mots de passe ne correspondent pas.', true); return; }
  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw new Error(friendlyAuthError(error.message));
    $('newPassword').value = '';
    $('newPasswordConfirm').value = '';
    notify('Mot de passe modifié.');
  } catch (err) {
    notify('Erreur : ' + (err.message || err), true);
  }
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorEl = $('loginError');
  errorEl.classList.add('hidden');
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: $('loginEmail').value.trim(),
    password: $('loginPassword').value
  });
  if (error) {
    errorEl.textContent = 'Connexion impossible : ' + friendlyAuthError(error.message);
    errorEl.classList.remove('hidden');
    return;
  }
  currentUser = data.user;
  await showProfile();
  await checkAdmin();
  await loadMember();
  showAccountUi();
  if (!applyPendingJoin()) goAccount('info');
});

document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => openTab(btn.dataset.tab)));

['gameLogo', 'gameBanner'].forEach((id) => {
  const input = $(id);
  if (input) input.addEventListener('input', setGamePreviews);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeTournamentDetails();
});

$('signupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorEl = $('signupError');
  const infoEl = $('signupInfo');
  errorEl.classList.add('hidden');
  infoEl.classList.add('hidden');
  const fail = (message) => {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  };

  const name = $('signupName').value.trim();
  const firstName = $('signupFirstName').value.trim();
  const lastName = $('signupLastName').value.trim();
  const birthDate = $('signupBirthDate').value;
  const email = $('signupEmail').value.trim();
  const password = $('signupPassword').value;
  const confirm = $('signupConfirm').value;

  if (name.length < 2) { fail('Choisis un pseudo d’au moins 2 caractères.'); return; }
  if (!firstName || !lastName) { fail('Renseigne ton prénom et ton nom.'); return; }
  if (!birthDate) { fail('Renseigne ta date de naissance.'); return; }
  if (password.length < 8) { fail('Le mot de passe doit contenir au moins 8 caractères.'); return; }
  if (password !== confirm) { fail('Les deux mots de passe ne correspondent pas.'); return; }

  const btn = $('signupSubmit');
  btn.disabled = true;
  btn.textContent = 'Création…';

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { name, first_name: firstName, last_name: lastName, birth_date: birthDate },
        emailRedirectTo: `${TOURNAMENT_SITE_URL}/?tab=account&confirmed=1`
      }
    });
    if (error) throw error;

    if (data.session) {
      currentUser = data.user;
      await showProfile();
      await checkAdmin();
      await loadMember();
      showAccountUi();
      goAccount('info');
      notify('Bienvenue ! Ton compte est créé.');
    } else {
      $('signupForm').reset();
      showAuthForm('login');
      infoEl.textContent = 'Compte créé. Vérifie ta boîte e-mail : clique sur le lien de confirmation, puis connecte-toi.';
      infoEl.classList.remove('hidden');
    }
  } catch (err) {
    const raw = String(err?.message || '');
    const friendly = friendlyAuthError(raw);
    fail(friendly === raw ? 'Création impossible : ' + raw : friendly);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Créer mon compte';
  }
});

// Pages légales : indique l'espace d'origine afin que leur lien « Retour »
// ramène au tournoi (et à la page en cours) plutôt qu'à l'application NVG.
document.addEventListener('click', (event) => {
  const link = event.target.closest &&
    event.target.closest('a[href*="app.nvg-tv.com/privacy.html"], a[href*="app.nvg-tv.com/mentions-legales.html"]');
  if (!link) return;
  const url = new URL(link.href);
  url.searchParams.set('from', window.location.href);
  link.href = url.href;
});

// Session partagée : si la connexion vient d'être faite dans un autre espace
// NVG, on recharge la page au retour sur l'onglet pour récupérer le profil et
// l'espace membre, sans redemander les identifiants.
let refreshingSession = false;
async function refreshSessionFromSharedStorage() {
  if (currentUser || refreshingSession) return;
  refreshingSession = true;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) window.location.reload();
  } catch (err) {
    console.error('Reprise de session impossible :', err);
  } finally {
    refreshingSession = false;
  }
}

init().then(() => {
  window.addEventListener('focus', () => refreshSessionFromSharedStorage());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshSessionFromSharedStorage();
  });
});
