// Espace de gestion du bot Discord NVG (bot-discord.nvg-tv.com).
// Connexion : compte NVG (Supabase), puis Discord OAuth2.
// Le navigateur ne décide jamais des droits : les fonctions Edge vérifient
// le serveur demandé dans nvg_discord_managers.

const SUPABASE_URL = 'https://fxewefwwpowhnacrxfdp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZXdlZnd3cG93aG5hY3J4ZmRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxOTQ5NTksImV4cCI6MjEwODc3MDk1OX0.nDlHFbpzBipH3Po61OkzNdAfPnCRaCNOwa1aN6ap8qk';

const DISCORD_CLIENT_ID = '1569625316601757747';
const DISCORD_REDIRECT_URI = 'https://bot-discord.nvg-tv.com/';
const DISCORD_INVITE_BASE = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&scope=bot&permissions=8`;
const ANNOUNCE_KINDS = [
  { kind: 'live_nvg', label: '🔴 NVG en live (Twitch)' },
  { kind: 'live_member', label: '🎥 Membre Streams NVG en live' },
  { kind: 'event_created', label: '📅 Nouvel événement' },
  { kind: 'game_proposed', label: '🎮 Proposition de jeu (staff)' }
];

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let guilds = [];
let routes = [];
const channelsCache = {};

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function notify(message, isError = false) {
  let toast = $('botToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'botToast';
    toast.className = 'fixed bottom-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl text-xs font-bold shadow-2xl border transition';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `fixed bottom-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl text-xs font-bold shadow-2xl border transition ${
    isError ? 'bg-red-950/95 border-red-600/60 text-red-200' : 'bg-[#121722] border-amber-500/50 text-amber-200'
  }`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.remove(), 4500);
}

async function callFunction(name, body) {
  const { data, error } = await supabaseClient.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const details = await error.context.json();
      if (details && details.error) message = details.error;
    } catch (_) { /* réponse non JSON */ }
    throw new Error(message);
  }
  return data;
}

const callBot = (body) => callFunction('discord-bot', body);

function setOauthMessage(message, isError = false) {
  const el = $('oauthMessage');
  el.textContent = message;
  el.className = `text-xs ${isError ? 'text-red-400' : 'text-emerald-400'}`;
  el.classList.toggle('hidden', !message);
}

function clearUrl() {
  window.history.replaceState({}, document.title, DISCORD_REDIRECT_URI);
}

function connectDiscord() {
  const state = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  sessionStorage.setItem('nvg_discord_state', state);
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', DISCORD_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('redirect_uri', DISCORD_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'consent');
  window.location.href = url.toString();
}

function inviteBot(guildId) {
  const url = guildId
    ? `${DISCORD_INVITE_BASE}&guild_id=${encodeURIComponent(guildId)}&disable_guild_select=true`
    : DISCORD_INVITE_BASE;
  window.open(url, '_blank', 'noopener');
}

async function signOut() {
  await supabaseClient.auth.signOut();
  window.location.href = DISCORD_REDIRECT_URI;
}

async function showProfile() {
  $('account').classList.remove('hidden');
  $('account').classList.add('flex');
  $('accountName').textContent = currentUser.email || '';
  try {
    const { data } = await supabaseClient
      .from('nvg_users')
      .select('name,rank')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (data) {
      $('accountName').textContent = data.name || currentUser.email || '';
      $('accountRank').textContent = data.rank || '';
    }
  } catch (_) { /* profil facultatif */ }
}

async function ensureChannels(guildId) {
  if (!channelsCache[guildId]) {
    channelsCache[guildId] = await callBot({ action: 'list_channels', guild_id: guildId });
  }
  return channelsCache[guildId];
}

function renderGuilds() {
  const container = $('guildsList');
  if (guilds.length === 0) {
    container.innerHTML = `
      <div class="bg-[#121722] border border-[#1f293d] rounded-2xl p-6 text-center space-y-3">
        <p class="text-sm font-bold text-white">Aucun serveur à configurer.</p>
        <p class="text-xs text-gray-400">Relie ton compte Discord, ou ajoute le bot à un serveur que tu administres.</p>
        <button onclick="inviteBot('')" class="px-5 py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs rounded-xl transition">➕ Inviter le bot</button>
      </div>`;
    return;
  }

  container.innerHTML = guilds.map((guild) => {
    const icon = guild.icon
      ? `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64" alt="" class="w-10 h-10 rounded-full shrink-0">`
      : `<div class="w-10 h-10 rounded-full bg-[#07090e] border border-[#1f293d] shrink-0 flex items-center justify-center text-sm font-black text-gray-400">${escapeHtml((guild.name || '?').charAt(0).toUpperCase())}</div>`;

    const header = `
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          ${icon}
          <div class="min-w-0">
            <h3 class="text-sm font-black text-white truncate">${escapeHtml(guild.name)}</h3>
            <p class="text-[10px] uppercase font-bold ${guild.bot_present ? 'text-emerald-400' : 'text-amber-400'}">${guild.bot_present ? 'Bot présent' : 'Bot non ajouté'}</p>
          </div>
        </div>
        ${guild.bot_present
          ? `<div class="flex flex-wrap items-center gap-2 shrink-0">
               <button onclick="saveGuild('${guild.id}')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition">Enregistrer</button>
               <button onclick="leaveGuild('${guild.id}')" class="px-4 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white font-bold text-xs rounded-lg border border-red-600/40 transition">Quitter le serveur</button>
             </div>`
          : `<button onclick="inviteBot('${guild.id}')" class="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs rounded-lg transition shrink-0">➕ Ajouter le bot</button>`}
      </div>`;

    if (!guild.bot_present) {
      return `<div class="guild-card bg-[#121722] border border-[#1f293d] rounded-2xl p-5 space-y-3">${header}
        <p class="text-xs text-gray-400">Le bot n'est pas encore sur ce serveur. Ajoute-le, puis clique sur « Actualiser ».</p>
      </div>`;
    }

    const rows = ANNOUNCE_KINDS.map(({ kind, label }) => {
      const route = routes.find((r) => r.guild_id === guild.id && r.kind === kind);
      const channels = channelsCache[guild.id] || [];
      const options = channels.map((c) => `<option value="${c.id}" ${route && route.channel_id === c.id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');
      return `
        <div class="flex flex-wrap items-center gap-3 py-2 border-b border-[#1f293d] last:border-0">
          <label class="flex items-center gap-2 text-xs font-bold text-white min-w-[220px] cursor-pointer">
            <input type="checkbox" data-discord-kind="${kind}" class="accent-red-600" ${route ? 'checked' : ''}>
            ${label}
          </label>
          <select data-discord-channel="${kind}" class="flex-1 min-w-[180px] bg-[#07090e] border border-[#1f293d] rounded-lg px-2 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none">
            <option value="">— Choisir un salon —</option>${options}
          </select>
        </div>`;
    }).join('');

    return `<div class="guild-card bg-[#121722] border border-[#1f293d] rounded-2xl p-5 space-y-3" data-guild="${guild.id}">${header}${rows}</div>`;
  }).join('');
}

async function loadGuilds() {
  const status = $('guildsStatus');
  status.textContent = 'Chargement des serveurs…';
  status.className = 'text-xs text-gray-400 italic';
  try {
    const res = await callBot({ action: 'list_guilds' });
    guilds = res.guilds || [];
    routes = res.routes || [];
    await Promise.all(
      guilds.filter((g) => g.bot_present).map((g) =>
        ensureChannels(g.id).catch(() => {
          notify(`Salons de ${g.name} inaccessibles.`, true);
        })
      ),
    );
    renderGuilds();
    status.textContent = guilds.length ? '' : 'Aucun serveur pour le moment.';
  } catch (err) {
    status.textContent = 'Erreur : ' + err.message;
    status.className = 'text-xs text-red-400';
  }
}

async function saveGuild(guildId) {
  const card = document.querySelector(`[data-guild="${guildId}"]`);
  if (!card) return;
  const wanted = [];
  for (const { kind } of ANNOUNCE_KINDS) {
    if (!card.querySelector(`[data-discord-kind="${kind}"]`).checked) continue;
    const channelId = card.querySelector(`[data-discord-channel="${kind}"]`).value;
    if (!channelId) {
      notify('Choisis un salon pour chaque annonce cochée.', true);
      return;
    }
    wanted.push({ kind, channel_id: channelId });
  }
  try {
    await callBot({ action: 'save_routes', guild_id: guildId, routes: wanted });
    const res = await callBot({ action: 'list_guilds' });
    routes = res.routes || [];
    renderGuilds();
    notify('Configuration enregistrée.');
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function leaveGuild(guildId) {
  const guild = guilds.find((g) => g.id === guildId);
  const name = guild ? guild.name : 'ce serveur';
  if (!confirm(`Faire quitter le bot du serveur « ${name} » ? Ses annonces configurées seront supprimées.`)) return;
  try {
    await callBot({ action: 'leave_guild', guild_id: guildId });
    notify(`Le bot a quitté « ${name} ».`);
    await loadGuilds();
  } catch (err) {
    notify('Erreur : ' + err.message, true);
  }
}

async function handleOauthReturn() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const code = params.get('code');
  const state = params.get('state');

  if (error) {
    clearUrl();
    setOauthMessage("Connexion Discord annulée. Tu peux réessayer.", true);
    await loadGuilds();
    return;
  }

  if (!code) {
    // Pas de retour OAuth : on affiche les droits déjà enregistrés.
    $('guildsSection').classList.remove('hidden');
    await loadGuilds();
    return;
  }

  const expected = sessionStorage.getItem('nvg_discord_state');
  sessionStorage.removeItem('nvg_discord_state');
  clearUrl();

  if (!state || !expected || state !== expected) {
    setOauthMessage('La connexion Discord a expiré. Clique sur « Se connecter avec Discord ».', true);
    return;
  }

  setOauthMessage('Connexion Discord en cours…');
  try {
    const res = await callFunction('discord-oauth', { code });
    setOauthMessage(`Discord relié : ${res.guilds.length} serveur(s) administré(s).`);
    $('guildsSection').classList.remove('hidden');
    await loadGuilds();
  } catch (err) {
    setOauthMessage('Erreur Discord : ' + err.message, true);
  }
}

async function enterApp() {
  $('loginSection').classList.add('hidden');
  $('appSection').classList.remove('hidden');
  await showProfile();
  await handleOauthReturn();
}

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    $('loginSection').classList.remove('hidden');
    return;
  }
  currentUser = session.user;
  await enterApp();
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const errorEl = $('loginError');
  errorEl.classList.add('hidden');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = 'Connexion impossible : ' + error.message;
    errorEl.classList.remove('hidden');
    return;
  }
  currentUser = data.user;
  await enterApp();
});

init();
