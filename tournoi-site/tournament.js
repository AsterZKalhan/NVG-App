// Tournoi des 9 Mondes — espace public et membre.
// Comptes NVG (Supabase), inscriptions solo ou en équipe.
// Les créations d'équipe, jointures par code et inscriptions passent par des
// fonctions SECURITY DEFINER : le navigateur ne décide jamais des règles.

const SUPABASE_URL = 'https://fxewefwwpowhnacrxfdp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZXdlZnd3cG93aG5hY3J4ZmRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxOTQ5NTksImV4cCI6MjEwODc3MDk1OX0.nDlHFbpzBipH3Po61OkzNdAfPnCRaCNOwa1aN6ap8qk';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

let currentUser = null;
let isAdmin = false;
let games = [];
let tournaments = [];
let publicRegs = [];
let myTeams = [];
let myRegistrations = [];
let pendingJoinCode = null;
let editingTournamentId = null;

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

function slugify(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'tournoi';
}

function gameName(id) {
  return games.find((g) => g.id === id)?.name || 'Jeu libre';
}

function tournamentById(id) {
  return tournaments.find((t) => t.id === id);
}

function inviteUrl(code) {
  return `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(code)}`;
}

// --- Navigation ---

function openTab(name) {
  if (name === 'admin' && !isAdmin) name = 'home';
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.add('hidden'));
  const section = $(`tab-${name}`);
  if (section) section.classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === name));
  if (name === 'tournaments' || name === 'home') loadPublic();
  if (name === 'account') refreshAccount();
  if (name === 'admin') loadAdmin();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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

function tournamentCard(t) {
  const count = registeredCount(t.id);
  const unit = t.mode === 'team' ? 'équipe(s)' : 'joueur(s)';
  const places = t.max_participants ? `${count} / ${t.max_participants} ${unit}` : `${count} ${unit}`;
  const mode = t.mode === 'solo' ? 'Solo' : `Équipe ${t.team_min}–${t.team_max}`;
  const open = t.status === 'open';
  const already = isRegistered(t.id);
  const myTeam = t.mode === 'team' ? myTeams.find((team) => team.tournament_id === t.id) : null;
  return `
    <article class="bg-[#121722] border border-[#1f293d] rounded-2xl p-5 space-y-3 flex flex-col">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[10px] uppercase tracking-widest text-amber-400 font-black">${escapeHtml(gameName(t.game_id))}</p>
          <h2 class="text-base font-black text-white mt-1">${escapeHtml(t.name)}</h2>
        </div>
        <span class="shrink-0 px-2 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider ${STATUS_STYLES[t.status] || STATUS_STYLES.draft}">${escapeHtml(STATUS_LABELS[t.status] || t.status)}</span>
      </div>
      <p class="text-xs text-gray-400 line-clamp-3">${escapeHtml(t.description || 'Tournoi Normandy Viking Gaming.')}</p>
      <div class="grid grid-cols-2 gap-2 text-[11px] text-gray-400">
        <p>🎯 ${escapeHtml(mode)}</p>
        <p>🌐 ${escapeHtml(FORMAT_LABELS[t.format] || t.format)}</p>
        <p>📅 ${escapeHtml(formatDate(t.starts_at))}</p>
        <p>👥 ${escapeHtml(places)}</p>
      </div>
      ${t.prize ? `<p class="text-[11px] text-emerald-400">🏅 ${escapeHtml(t.prize)}</p>` : ''}
      <div class="mt-auto pt-2 flex flex-wrap items-center gap-2">
        ${already
          ? '<span class="px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold rounded-lg">✅ Inscrit</span>'
          : myTeam
            ? `<button onclick="openTab('account')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-lg transition">🛡️ Gérer mon équipe</button>`
            : open
              ? `<button onclick="openSignup('${t.id}')" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-lg transition">S'inscrire</button>`
              : `<span class="px-3 py-2 bg-white/5 border border-[#1f293d] text-gray-500 text-[11px] font-bold rounded-lg">Inscriptions fermées</span>`}
        ${t.registration_closes_at ? `<span class="text-[10px] text-gray-500">Clôture : ${escapeHtml(formatDate(t.registration_closes_at))}</span>` : ''}
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
  box.innerHTML = next.map((t) => `
    <div class="flex flex-wrap items-center justify-between gap-2 border border-[#1f293d] rounded-xl px-4 py-3 bg-[#07090e]">
      <div class="min-w-0">
        <p class="text-xs font-black text-white truncate">${escapeHtml(t.name)}</p>
        <p class="text-[10px] text-gray-400">${escapeHtml(gameName(t.game_id))} · ${escapeHtml(FORMAT_LABELS[t.format] || t.format)} · ${escapeHtml(formatDate(t.starts_at))}</p>
      </div>
      <button onclick="openTab('tournaments')" class="px-3 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-[10px] font-bold rounded-lg border border-red-600/40 transition">Voir</button>
    </div>`).join('');
}

// --- Inscription ---

function openSignup(tournamentId) {
  const t = tournamentById(tournamentId);
  if (!t) return;
  if (!currentUser) {
    notify('Connecte-toi avec ton compte NVG pour t’inscrire.', true);
    openTab('account');
    return;
  }
  const panel = $('signupPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-black text-white">Inscription · ${escapeHtml(t.name)}</h2>
        <p class="text-xs text-gray-400 mt-1">${t.mode === 'solo' ? 'Tournoi solo.' : `Tournoi en équipe de ${t.team_min} à ${t.team_max} joueurs.`}</p>
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
      <p class="text-xs text-gray-400">Envoie ce lien à tes coéquipiers. Ils doivent être connectés avec leur compte NVG.</p>
      <div class="flex flex-wrap gap-2">
        <input readonly value="${escapeHtml(inviteUrl(res.invite_code))}" class="flex-1 min-w-[220px] bg-[#07090e] border border-[#1f293d] rounded-xl px-4 py-2.5 text-[11px] text-gray-300">
        <button onclick="copyText('${escapeHtml(inviteUrl(res.invite_code))}')" class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-200 font-bold text-xs rounded-lg transition">Copier</button>
        <button onclick="openTab('account')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition">Mon espace</button>
      </div>
      <p class="text-[11px] text-amber-400">Code : <strong>${escapeHtml(res.invite_code)}</strong></p>`;
    await Promise.all([loadPublic(), loadMember()]);
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function joinTeam() {
  if (!currentUser) { openTab('account'); return; }
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
      .select('id,tournament_id,team_id,status,platform_id,created_at,nvg_tournaments(name,mode,team_min,team_max),nvg_tournament_teams(name)')
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
  if (!myRegistrations.length) {
    box.innerHTML = '<div class="bg-[#121722] border border-[#1f293d] rounded-2xl p-5 text-xs text-gray-400">Aucune inscription pour le moment.</div>';
    return;
  }
  box.innerHTML = myRegistrations.map((reg) => {
    const label = reg.nvg_tournament_teams?.name || reg.nvg_tournaments?.name || 'Tournoi';
    return `
      <div class="bg-[#121722] border border-[#1f293d] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-xs font-black text-white truncate">${escapeHtml(reg.nvg_tournaments?.name || 'Tournoi')}</p>
          <p class="text-[10px] text-gray-400">${escapeHtml(label)}${reg.platform_id ? ` · ${escapeHtml(reg.platform_id)}` : ''} · ${escapeHtml(formatDate(reg.created_at))}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[9px] font-black uppercase px-2 py-1 rounded-full border ${reg.status === 'confirmed' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : reg.status === 'cancelled' ? 'text-gray-500 border-[#1f293d] bg-white/5' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}">${escapeHtml(REG_LABELS[reg.status] || reg.status)}</span>
          ${reg.status !== 'cancelled' ? `<button onclick="cancelRegistration('${reg.id}')" class="text-[10px] font-bold text-red-400 hover:text-red-300">Annuler</button>` : ''}
        </div>
      </div>`;
  }).join('');
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
  renderAdminTournaments();
  const { data: regs } = await supabaseClient.from('nvg_tournament_registrations')
    .select('id,status,platform_id,created_at,user_id,team_id,nvg_tournaments(name),nvg_tournament_teams(name),nvg_users(name)')
    .order('created_at', { ascending: false })
    .limit(100);
  renderAdminRegistrations(regs || []);
}

function renderAdminGames() {
  const box = $('adminGames');
  if (!box) return;
  box.innerHTML = games.length
    ? games.map((g) => `<p>🎮 ${escapeHtml(g.name)}</p>`).join('')
    : '<p class="text-gray-500">Aucun jeu enregistré.</p>';
  const select = $('tourGame');
  if (select) {
    select.innerHTML = '<option value="">Jeu (facultatif)</option>' + games.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  }
}

function renderAdminTournaments() {
  const box = $('adminTournaments');
  if (!box) return;
  box.innerHTML = tournaments.length
    ? tournaments.map((t) => `
      <div class="flex flex-wrap items-center justify-between gap-2 border border-[#1f293d] rounded-xl px-3 py-2">
        <div class="min-w-0">
          <p class="text-xs font-bold text-white truncate">${escapeHtml(t.name)}</p>
          <p class="text-[10px] text-gray-500">${escapeHtml(gameName(t.game_id))} · ${t.published ? 'publié' : 'masqué'}</p>
        </div>
        <div class="flex items-center gap-1.5">
          <select onchange="setTournamentStatus('${t.id}', this.value)" class="bg-[#07090e] border border-[#1f293d] rounded-lg px-2 py-1 text-[10px] text-white">
            ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <button onclick="editTournament('${t.id}')" class="px-2 py-1 bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-300 font-bold text-[10px] rounded-lg transition">✏️</button>
        </div>
      </div>`).join('')
    : '<p class="text-xs text-gray-500">Aucun tournoi.</p>';
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
  $('editMax').value = t.max_participants || '';
  $('editPrize').value = t.prize || '';
  $('editStart').value = toLocalInput(t.starts_at);
  $('editClose').value = toLocalInput(t.registration_closes_at);
  $('editDesc').value = t.description || '';
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
  const patch = {
    name,
    status: $('editStatus').value,
    max_participants: maxRaw ? parseInt(maxRaw, 10) : null,
    prize: $('editPrize').value.trim() || null,
    starts_at: $('editStart').value ? new Date($('editStart').value).toISOString() : null,
    registration_closes_at: $('editClose').value ? new Date($('editClose').value).toISOString() : null,
    description: $('editDesc').value.trim() || null,
    published: $('editPublished').checked
  };
  try {
    const { error } = await supabaseClient.from('nvg_tournaments').update(patch).eq('id', editingTournamentId);
    if (error) throw new Error(error.message);
    notify('Tournoi mis à jour.');
    closeEdit();
    await loadPublic();
    renderAdminTournaments();
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

function renderAdminRegistrations(regs) {
  const box = $('adminRegistrations');
  if (!regs.length) {
    box.innerHTML = '<p class="text-xs text-gray-500">Aucune inscription.</p>';
    return;
  }
  box.innerHTML = regs.map((r) => `
    <div class="flex flex-wrap items-center justify-between gap-2 border border-[#1f293d] rounded-xl px-3 py-2">
      <div class="min-w-0">
        <p class="text-xs font-bold text-white truncate">${escapeHtml(r.nvg_tournament_teams?.name || r.nvg_users?.name || 'Participant')}</p>
        <p class="text-[10px] text-gray-500">${escapeHtml(r.nvg_tournaments?.name || '')} · ${escapeHtml(r.platform_id || '—')}</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[9px] uppercase font-black text-gray-400">${escapeHtml(REG_LABELS[r.status] || r.status)}</span>
        <button onclick="setRegistrationStatus('${r.id}','confirmed')" class="px-2 py-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300">Confirmer</button>
        <button onclick="setRegistrationStatus('${r.id}','waitlist')" class="px-2 py-1 text-[10px] font-bold text-amber-400 hover:text-amber-300">Attente</button>
        <button onclick="setRegistrationStatus('${r.id}','cancelled')" class="px-2 py-1 text-[10px] font-bold text-red-400 hover:text-red-300">Annuler</button>
      </div>
    </div>`).join('');
}

async function createGame() {
  const name = $('gameName').value.trim();
  if (!name) { notify('Saisis un nom de jeu.', true); return; }
  try {
    const { error } = await supabaseClient.from('nvg_tournament_games').insert({
      name,
      slug: slugify(name),
      logo_url: $('gameLogo').value.trim() || null
    });
    if (error) throw new Error(error.message);
    $('gameName').value = '';
    $('gameLogo').value = '';
    notify('Jeu créé.');
    await loadPublic();
    renderAdminGames();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function createTournament() {
  const name = $('tourName').value.trim();
  if (!name) { notify('Saisis un nom de tournoi.', true); return; }
  const mode = $('tourMode').value;
  const teamMin = parseInt($('tourTeamMin').value, 10) || 1;
  const teamMax = parseInt($('tourTeamMax').value, 10) || teamMin;
  try {
    if (teamMax < teamMin) throw new Error('le maximum doit être supérieur au minimum');
    const { data, error } = await supabaseClient.from('nvg_tournaments').insert({
      slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      game_id: $('tourGame').value || null,
      description: $('tourDesc').value.trim() || null,
      mode,
      format: $('tourFormat').value,
      team_min: mode === 'solo' ? 1 : teamMin,
      team_max: mode === 'solo' ? 1 : teamMax,
      max_participants: parseInt($('tourMax').value, 10) || null,
      prize: $('tourPrize').value.trim() || null,
      starts_at: $('tourStart').value ? new Date($('tourStart').value).toISOString() : null,
      registration_closes_at: $('tourClose').value ? new Date($('tourClose').value).toISOString() : null,
      status: $('tourStatus').value,
      published: $('tourPublished').checked
    }).select('id').single();
    if (error) throw new Error(error.message);
    $('tourName').value = '';
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
  const { error } = await supabaseClient.from('nvg_tournament_registrations').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { notify('Erreur : ' + error.message, true); return; }
  notify('Inscription mise à jour.');
  await loadAdmin();
}

// --- Compte ---

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
  await Promise.all([checkAdmin(), loadMember()]);
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
  if (join) {
    pendingJoinCode = join.toLowerCase();
    window.history.replaceState({}, document.title, window.location.pathname);
    if (currentUser) {
      applyPendingJoin();
    } else {
      notify('Connecte-toi avec ton compte NVG, puis rejoins l’équipe avec le code reçu.', false);
      openTab('account');
    }
  } else {
    openTab('home');
  }
}

function applyPendingJoin() {
  if (!pendingJoinCode || !currentUser) return false;
  openTab('account');
  const input = $('joinCode');
  if (input) input.value = pendingJoinCode;
  pendingJoinCode = null;
  notify('Code d’invitation prêt : clique sur « Rejoindre ».');
  return true;
}

async function showProfile() {
  $('accountName').textContent = currentUser.email || '';
  try {
    const { data } = await supabaseClient.from('nvg_users').select('name,rank').eq('id', currentUser.id).maybeSingle();
    if (data?.name) $('accountName').textContent = data.name;
    if (data?.rank) $('memberSubtitle').textContent = `${data.name || ''} · ${data.rank}`;
  } catch (_) { /* profil facultatif */ }
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
    errorEl.textContent = 'Connexion impossible : ' + error.message;
    errorEl.classList.remove('hidden');
    return;
  }
  currentUser = data.user;
  await showProfile();
  await checkAdmin();
  await loadMember();
  showAccountUi();
  if (!applyPendingJoin()) openTab('account');
});

document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => openTab(btn.dataset.tab)));

init();
