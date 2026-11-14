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
let myTeams = [];
let myRegistrations = [];
let adminRegs = [];
let adminPlayers = [];
let editingPlayerId = null;
let profileIdentity = { first_name: '', last_name: '', birth_date: '' };
let pendingJoinCode = null;
let editingTournamentId = null;
let editingGameId = null;
let viewingTournamentId = null;

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
  const [g, t, regs] = await Promise.all([
    supabaseClient.from('nvg_tournament_games').select('*').order('name'),
    supabaseClient.from('nvg_tournaments').select('*').order('starts_at', { ascending: true, nullsFirst: false }),
    supabaseClient.from('nvg_tournament_registrations_public').select('tournament_id,status')
  ]);
  games = g.data || [];
  tournaments = t.data || [];
  publicRegs = regs.data || [];
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
        <p class="text-[10px] text-gray-400">${escapeHtml(gameName(t.game_id))} · ${escapeHtml(FORMAT_LABELS[t.format] || t.format)}</p>
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

function registrationPaymentBlock(reg) {
  const status = reg.payment_status || 'not_required';
  const fee = Number(reg.nvg_tournaments?.entry_fee_cents) || 0;
  if (status !== 'awaiting') return '';
  return `<div class="flex flex-col items-start gap-1">
      <span class="text-[10px] font-bold text-amber-400">⏳ ${fee > 0 ? `${escapeHtml(formatFee(fee))} à régler` : 'Paiement en attente'}</span>
      <button onclick="payRegistration('${reg.id}')" class="rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-black text-black transition hover:bg-amber-400">Régler mon inscription</button>
    </div>`;
}

function payRegistration(registrationId) {
  const reg = myRegistrations.find((r) => r.id === registrationId);
  if (!reg) return;
  const t = reg.nvg_tournaments || {};
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
  const banner = safeUrl(t.banner_url) || gameBanner(t.game_id);
  const toornament = externalLink(t.toornament_url);
  return `
    <div class="relative h-32 sm:h-36 overflow-hidden bg-[#07090e]">
      <div class="absolute inset-0 opacity-70" style="background-image:url('./Logos/fond-app.svg');background-repeat:repeat;background-size:130px"></div>
      <div class="absolute inset-0 bg-gradient-to-br from-red-950/70 via-[#121722]/80 to-[#0b0f17]/90"></div>
      ${banner
        ? `<img src="${banner}" alt="" loading="lazy" onerror="this.remove()" class="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105">`
        : `<p class="absolute inset-0 flex items-center justify-center px-8 text-center text-lg sm:text-xl font-black uppercase tracking-[0.22em] text-white/15">${escapeHtml(gameName(t.game_id))}</p>`}
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
  const banner = safeUrl(t.banner_url) || gameBanner(t.game_id);
  const logo = gameLogo(t.game_id);
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
        : `<p class="absolute inset-0 flex items-center justify-center px-8 text-center text-xl font-black uppercase tracking-[0.22em] text-white/15">${escapeHtml(gameName(t.game_id))}</p>`}
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
          <p class="truncate text-[10px] font-black uppercase tracking-[0.18em] text-amber-400/80">${escapeHtml(gameName(t.game_id))}</p>
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

      <div>
        <h3 class="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white">${trophyIcon('h-4 w-4 text-amber-400')} Récompenses</h3>
        <div class="grid gap-2 sm:grid-cols-3">${prizeRows(t)}</div>
      </div>

      ${t.rules ? `<div><h3 class="mb-1 text-xs font-black uppercase tracking-wider text-white">Règlement</h3><p class="whitespace-pre-line text-[11px] leading-relaxed text-gray-400">${escapeHtml(t.rules)}</p></div>` : ''}

      ${Number(t.entry_fee_cents) > 0 ? `
        <div class="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
          <p class="text-[10px] font-black uppercase tracking-wider text-amber-400">Inscription : ${escapeHtml(formatFee(t.entry_fee_cents))}</p>
          ${t.payment_instructions ? `<p class="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-gray-300">${escapeHtml(t.payment_instructions)}</p>` : ''}
          ${externalLink(t.payment_url) ? `<a href="${externalLink(t.payment_url)}" target="_blank" rel="noopener" class="mt-2 inline-block rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-black text-black transition hover:bg-amber-400">Régler mon inscription</a>` : ''}
        </div>` : ''}

      <div class="flex flex-wrap items-center gap-2 border-t border-[#1f293d] pt-4">
        ${already
          ? `<div class="flex flex-wrap items-center gap-2">
              <span class="px-2 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wider rounded-lg">✅ Inscrit</span>
              <a href="${accountUrl('registrations')}" onclick="event.preventDefault();closeTournamentDetails({ push: false });goAccount('registrations')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-lg transition">📋 Gérer mon inscription</a>
              ${myTeam ? `<a href="${accountUrl('teams')}" onclick="event.preventDefault();closeTournamentDetails({ push: false });goAccount('teams')" class="px-3 py-2 bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-300 text-[11px] font-bold rounded-lg transition">🛡️ Gérer mon équipe</a>` : ''}
            </div>`
          : myTeam
            ? `<a href="${accountUrl('teams')}" onclick="event.preventDefault();closeTournamentDetails({ push: false });goAccount('teams')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-lg transition">🛡️ Gérer mon équipe</a>`
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

function tournamentCard(t) {
  const count = registeredCount(t.id);
  const unit = t.mode === 'team' ? 'équipe(s)' : 'joueur(s)';
  const places = t.max_participants ? `${count} / ${t.max_participants} ${unit}` : `${count} ${unit}`;
  const open = t.status === 'open';
  const already = isRegistered(t.id);
  const myTeam = t.mode === 'team' ? myTeams.find((team) => team.tournament_id === t.id) : null;
  const toornament = externalLink(t.toornament_url);
  const logo = gameLogo(t.game_id);
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
            <p class="truncate text-[10px] font-black uppercase tracking-[0.18em] text-amber-400/80">${escapeHtml(gameName(t.game_id))}</p>
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
          ${already
            ? `<a href="${accountUrl('registrations')}" onclick="event.preventDefault();goAccount('registrations')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-lg transition">📋 Gérer mon inscription</a>`
            : myTeam
              ? `<a href="${accountUrl('teams')}" onclick="event.preventDefault();goAccount('teams')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-lg transition">🛡️ Gérer mon équipe</a>`
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
    const banner = safeUrl(t.banner_url);
    const logo = gameLogo(t.game_id);
    const toornament = externalLink(t.toornament_url);
    return `
    <div class="flex items-center gap-3 overflow-hidden rounded-xl border border-[#1f293d] bg-[#07090e] transition hover:border-amber-500/40">
      <div class="relative h-16 w-24 shrink-0 overflow-hidden bg-[#121722]">
        ${banner ? `<img src="${banner}" alt="" loading="lazy" onerror="this.remove()" class="h-full w-full object-cover">` : ''}
        ${!banner && logo ? `<img src="${logo}" alt="" loading="lazy" onerror="this.remove()" class="absolute inset-0 m-auto max-h-10 max-w-[80%] object-contain opacity-70">` : ''}
      </div>
      <div class="min-w-0 flex-1 py-2">
        <p class="truncate text-xs font-black text-white">${toornament ? `<a href="${toornament}" target="_blank" rel="noopener" class="hover:text-amber-300">${escapeHtml(t.name)}</a>` : escapeHtml(t.name)}</p>
        <p class="text-[10px] text-gray-400">${escapeHtml(gameName(t.game_id))} · ${escapeHtml(modeLabel(t))} · ${escapeHtml(dateRange(t))}</p>
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
  const [teams, regs] = await Promise.all([
    supabaseClient.from('nvg_tournament_teams')
      .select('id,tournament_id,name,tag,captain_id,invite_code,created_at,nvg_tournament_team_members(user_id,role,nvg_users(name,rank)),nvg_tournaments(name,mode,team_min,team_max,status)')
      .order('created_at', { ascending: false }),
    supabaseClient.from('nvg_tournament_registrations')
      .select('id,tournament_id,team_id,user_id,status,platform_id,payment_status,payment_reference,paid_at,created_at,nvg_tournaments(name,mode,team_min,team_max,entry_fee_cents,payment_url,payment_instructions),nvg_tournament_teams(name)')
      .order('created_at', { ascending: false })
  ]);
  myTeams = teams.data || [];
  myRegistrations = regs.data || [];
  renderMyTeams();
  renderMyRegistrations();
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

function renderMyRegistrations() {
  const box = $('myRegistrations');
  // Une inscription annulée disparaît de l'espace membre (elle reste dans le back-office).
  const visible = myRegistrations.filter((r) => r.status !== 'cancelled');
  if (!visible.length) {
    box.innerHTML = '<div class="bg-[#121722] border border-[#1f293d] rounded-2xl p-5 text-xs text-gray-400">Aucune inscription pour le moment.</div>';
    return;
  }
  box.innerHTML = visible.map((reg) => {
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
      .select('id,tournament_id,status,platform_id,payment_status,payment_reference,paid_at,created_at,user_id,team_id,nvg_tournament_teams(name,tag),nvg_users(name,first_name,last_name,birth_date)')
      .order('created_at', { ascending: false })
      .limit(500),
    supabaseClient.from('nvg_users')
      .select('id,name,email,verified,first_name,last_name,birth_date')
      .order('name')
      .limit(1000)
  ]);
  adminRegs = regsRes.data || [];
  adminPlayers = playersRes.data || [];
  renderAdminTournaments();
  renderAdminPlayers();
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
        </div>
        <div class="flex shrink-0 items-center gap-1">
          ${safeUrl(g.banner_url) ? '<span class="text-[9px] text-emerald-400" title="Bannière enregistrée">bannière</span>' : ''}
          <button onclick="editGame('${g.id}')" class="rounded border border-[#1f293d] bg-white/5 px-2 py-1 text-[10px] font-bold text-gray-300 transition hover:bg-white/10">✏️</button>
        </div>
      </div>`).join('')
    : '<p class="text-gray-500">Aucun jeu enregistré.</p>';
  const select = $('tourGame');
  if (select) {
    select.innerHTML = '<option value="">Jeu (facultatif)</option>' + games.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  }
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
  box.innerHTML = rows.length
    ? rows.map((t) => {
      const s = adminTournamentStats(t);
      return `
      <div class="rounded-xl border border-[#1f293d] bg-[#07090e] px-3 py-3 space-y-2">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-xs font-bold text-white truncate">${escapeHtml(t.name)}</p>
            <p class="text-[10px] text-gray-500">${escapeHtml(gameName(t.game_id))} · ${t.published ? 'publié' : 'masqué'}${t.toornament_id ? ' · Toornament lié' : ''} · ${escapeHtml(feeLabel(t))}</p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <button onclick="showAdminRegs('${t.id}')" class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300 transition hover:bg-amber-500/20">📋 Voir les inscriptions</button>
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
  $('adminRegsSubtitle').textContent = `${t.name} · ${gameName(t.game_id)} · ${feeLabel(t)}`;
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
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        <div class="min-w-0">
          <p class="text-xs font-black text-white truncate">${team ? `🛡️ ${escapeHtml(team.name)}${team.tag ? ` [${escapeHtml(team.tag)}]` : ''}` : `👤 ${escapeHtml(pseudo)}`}</p>
          <p class="text-[10px] text-gray-400">Pseudo site : <span class="text-gray-200">${escapeHtml(pseudo)}</span>${team ? ` · capitaine : ${escapeHtml(pseudo)}` : ''}</p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="rounded-full border px-2 py-1 text-[9px] font-black uppercase ${r.status === 'confirmed' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : r.status === 'cancelled' ? 'text-gray-500 border-[#1f293d] bg-white/5' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}">${escapeHtml(REG_LABELS[r.status] || r.status)}</span>
          ${paymentBadge(payment)}
        </div>
      </div>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] sm:grid-cols-4">
        <div><dt class="text-gray-500">Pseudo en jeu</dt><dd class="font-bold text-gray-200">${escapeHtml(r.platform_id || '—')}</dd></div>
        <div><dt class="text-gray-500">Prénom</dt><dd class="font-bold text-gray-200">${escapeHtml(user.first_name || '—')}</dd></div>
        <div><dt class="text-gray-500">Nom</dt><dd class="font-bold text-gray-200">${escapeHtml(user.last_name || '—')}</dd></div>
        <div><dt class="text-gray-500">Naissance</dt><dd class="font-bold text-gray-200">${escapeHtml(birth)}</dd></div>
        <div class="col-span-2"><dt class="text-gray-500">Identité complète</dt><dd class="font-bold text-gray-200">${escapeHtml(fullName)}</dd></div>
        <div class="col-span-2"><dt class="text-gray-500">Inscrit le</dt><dd class="font-bold text-gray-200">${escapeHtml(formatDate(r.created_at))}</dd></div>
      </dl>
      <div class="flex flex-wrap items-center gap-2 border-t border-[#1f293d] pt-2">
        <button onclick="setRegistrationStatus('${r.id}','confirmed')" class="text-[10px] font-bold text-emerald-400 hover:text-emerald-300">Confirmer</button>
        <button onclick="setRegistrationStatus('${r.id}','waitlist')" class="text-[10px] font-bold text-amber-400 hover:text-amber-300">Liste d'attente</button>
        <button onclick="setRegistrationStatus('${r.id}','cancelled')" class="text-[10px] font-bold text-red-400 hover:text-red-300">Annuler</button>
        ${payment === 'paid'
          ? `<button onclick="setPaymentStatus('${r.id}','refunded')" class="ml-auto text-[10px] font-bold text-sky-400 hover:text-sky-300">💸 Rembourser</button>`
          : `<button onclick="setPaymentStatus('${r.id}','paid')" class="ml-auto text-[10px] font-bold text-emerald-400 hover:text-emerald-300">✅ Marquer payé</button>`}
        ${payment === 'paid' || payment === 'refunded'
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
  $('editName').value = t.name || '';
  $('editStatus').value = t.status || 'draft';
  const size = t.mode === 'solo' ? 1 : Math.min(6, Math.max(2, Number(t.team_min) || 2));
  $('editTeamSize').value = String(size);
  $('editMax').value = t.max_participants || '';
  $('editFee').value = Number(t.entry_fee_cents) > 0 ? (Number(t.entry_fee_cents) / 100).toFixed(2) : '';
  $('editPrizeFirst').value = t.prize_first || t.prize || '';
  $('editPrizeSecond').value = t.prize_second || '';
  $('editPrizeThird').value = t.prize_third || '';
  $('editStart').value = toLocalInput(t.starts_at);
  $('editClose').value = toLocalInput(t.registration_closes_at);
  $('editDesc').value = t.description || '';
  $('editBanner').value = t.banner_url || '';
  $('editToornament').value = t.toornament_url || '';
  $('editPaymentUrl').value = t.payment_url || '';
  $('editPaymentInstructions').value = t.payment_instructions || '';
  $('editPublished').checked = !!t.published;
  const panel = $('adminEdit');
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeEdit() {
  $('adminEdit').classList.add('hidden');
  editingTournamentId = null;
}

async function saveTournament() {
  if (!editingTournamentId) return;
  const name = $('editName').value.trim();
  if (!name) { notify('Le nom du tournoi est obligatoire.', true); return; }
  const maxRaw = $('editMax').value.trim();
  const size = parseInt($('editTeamSize').value, 10) || 1;
  const bannerUrl = safeUrl($('editBanner').value);
  const toornamentUrl = safeUrl($('editToornament').value);
  const patch = {
    name,
    mode: size === 1 ? 'solo' : 'team',
    team_min: size,
    team_max: size,
    status: $('editStatus').value,
    max_participants: maxRaw ? parseInt(maxRaw, 10) : null,
    entry_fee_cents: eurosToCents($('editFee').value),
    prize_first: $('editPrizeFirst').value.trim() || null,
    prize_second: $('editPrizeSecond').value.trim() || null,
    prize_third: $('editPrizeThird').value.trim() || null,
    starts_at: $('editStart').value ? new Date($('editStart').value).toISOString() : null,
    registration_closes_at: $('editClose').value ? new Date($('editClose').value).toISOString() : null,
    description: $('editDesc').value.trim() || null,
    banner_url: bannerUrl || null,
    toornament_url: toornamentUrl || null,
    toornament_id: toornamentIdFromUrl(toornamentUrl),
    payment_url: safeUrl($('editPaymentUrl').value) || null,
    payment_instructions: $('editPaymentInstructions').value.trim() || null,
    published: $('editPublished').checked
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

async function saveGame() {
  const name = $('gameName').value.trim();
  if (!name) { notify('Saisis un nom de jeu.', true); return; }
  const payload = {
    name,
    slug: slugify(name),
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
  const size = parseInt($('tourTeamSize').value, 10) || 1;
  const bannerUrl = safeUrl($('tourBanner').value);
  const toornamentUrl = safeUrl($('tourToornament').value);
  try {
    const { data, error } = await supabaseClient.from('nvg_tournaments').insert({
      slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      game_id: $('tourGame').value || null,
      description: $('tourDesc').value.trim() || null,
      mode: size === 1 ? 'solo' : 'team',
      format: $('tourFormat').value,
      team_min: size,
      team_max: size,
      max_participants: parseInt($('tourMax').value, 10) || null,
      entry_fee_cents: eurosToCents($('tourFee').value),
      prize_first: $('tourPrizeFirst').value.trim() || null,
      prize_second: $('tourPrizeSecond').value.trim() || null,
      prize_third: $('tourPrizeThird').value.trim() || null,
      starts_at: $('tourStart').value ? new Date($('tourStart').value).toISOString() : null,
      registration_closes_at: $('tourClose').value ? new Date($('tourClose').value).toISOString() : null,
      status: $('tourStatus').value,
      published: $('tourPublished').checked,
      banner_url: bannerUrl || null,
      toornament_url: toornamentUrl || null,
      toornament_id: toornamentIdFromUrl(toornamentUrl),
      payment_url: safeUrl($('tourPaymentUrl').value) || null,
      payment_instructions: $('tourPaymentInstructions').value.trim() || null
    }).select('id').single();
    if (error) throw new Error(error.message);
    ['tourName', 'tourBanner', 'tourToornament', 'tourPrizeFirst', 'tourPrizeSecond', 'tourPrizeThird',
      'tourFee', 'tourPaymentUrl', 'tourPaymentInstructions', 'tourMax'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
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

init();
