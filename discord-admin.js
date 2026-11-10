// --- BOT DISCORD NVG (espace admin) ---
// Le bot « NVG Vikingbot » est invité avec les droits administrateur, puis configuré ici :
// pour chaque serveur, on coche les annonces voulues et le salon de destination.
// Toutes les actions passent par la fonction Edge discord-bot, qui vérifie les droits admin côté serveur.

const DISCORD_BOT_CLIENT_ID = '1569625316601757747';
const DISCORD_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${DISCORD_BOT_CLIENT_ID}&scope=bot&permissions=8`;
const DISCORD_ANNOUNCE_KINDS = [
  { kind: 'live_nvg', label: '🔴 NVG en live (Twitch)' },
  { kind: 'live_member', label: '🎥 Membre Streams NVG en live' },
  { kind: 'event_created', label: '📅 Nouvel événement' },
  { kind: 'game_proposed', label: '🎮 Proposition de jeu (staff)' }
];

let discordGuilds = [];
let discordRoutes = [];
const discordChannelsCache = {};

function setDiscordStatus(message, isError = false) {
  const el = document.getElementById('discordStatus');
  if (!el) return;
  el.textContent = message;
  el.className = `text-xs italic ${isError ? 'text-red-400' : 'text-gray-400'}`;
}

async function callDiscordBot(body) {
  const { data, error } = await supabaseClient.functions.invoke('discord-bot', { body });
  if (error) {
    let message = error.message;
    try {
      const details = await error.context.json();
      if (details && details.error) message = details.error;
    } catch (e) {
      // Réponse non JSON : on garde le message générique.
    }
    throw new Error(message);
  }
  return data;
}

async function getDiscordChannels(guildId) {
  if (!discordChannelsCache[guildId]) {
    discordChannelsCache[guildId] = await callDiscordBot({ action: 'list_channels', guild_id: guildId });
  }
  return discordChannelsCache[guildId];
}

function inviteDiscordBot() {
  window.open(DISCORD_INVITE_URL, '_blank', 'noopener');
}

async function registerDiscordCommands() {
  try {
    const res = await callDiscordBot({ action: 'register_commands' });
    alert(`✅ Commandes enregistrées : ${res.commandes.map(c => '/' + c).join(', ')}. Elles peuvent prendre jusqu'à une heure à apparaître.`);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function loadDiscordBotAdmin() {
  setDiscordStatus('Chargement des serveurs…');
  try {
    const res = await callDiscordBot({ action: 'list_guilds' });
    discordGuilds = res.guilds || [];
    discordRoutes = res.routes || [];
    renderDiscordGuilds();
    renderDiscordPublishForm();
    setDiscordStatus(discordGuilds.length ? '' : "Le bot n'est sur aucun serveur pour le moment.");
  } catch (err) {
    setDiscordStatus('Erreur : ' + err.message, true);
  }
}

function renderDiscordGuilds() {
  const container = document.getElementById('discordGuilds');
  if (!container) return;
  if (discordGuilds.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = discordGuilds.map(guild => {
    const rows = DISCORD_ANNOUNCE_KINDS.map(({ kind, label }) => {
      const route = discordRoutes.find(r => r.guild_id === guild.id && r.kind === kind);
      return `
        <div class="flex flex-wrap items-center gap-3 py-2 border-b border-[#1f293d] last:border-0">
          <label class="flex items-center gap-2 text-xs font-bold text-white min-w-[220px] cursor-pointer">
            <input type="checkbox" data-discord-kind="${kind}" class="accent-red-600" ${route ? 'checked' : ''}>
            ${label}
          </label>
          <select data-discord-channel="${kind}" class="flex-1 min-w-[180px] bg-[#07090e] border border-[#1f293d] rounded-lg px-2 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none">
            <option value="">Chargement des salons…</option>
          </select>
        </div>`;
    }).join('');

    return `
      <div class="bg-[#121722] border border-[#1f293d] rounded-xl p-5 space-y-3" data-guild="${guild.id}">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            ${guild.icon
              ? `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64" alt="" class="w-9 h-9 rounded-full shrink-0">`
              : `<div class="w-9 h-9 rounded-full bg-[#07090e] border border-[#1f293d] shrink-0 flex items-center justify-center text-xs font-black text-gray-400">${escapeHtmlSafe(guild.name.charAt(0).toUpperCase())}</div>`}
            <h4 class="text-sm font-black text-white truncate">${escapeHtmlSafe(guild.name)}</h4>
          </div>
          <button onclick="saveDiscordGuild('${guild.id}')" class="px-4 py-2 bg-amber-500 text-black font-bold text-xs rounded-lg hover:bg-amber-400 transition">Enregistrer</button>
        </div>
        ${rows}
      </div>`;
  }).join('');

  discordGuilds.forEach(fillDiscordChannelSelects);
}

async function fillDiscordChannelSelects(guild) {
  let channels = [];
  try {
    channels = await getDiscordChannels(guild.id);
  } catch (err) {
    setDiscordStatus(`Salons de ${guild.name} inaccessibles : ${err.message}`, true);
    return;
  }
  const card = document.querySelector(`[data-guild="${guild.id}"]`);
  if (!card) return;

  DISCORD_ANNOUNCE_KINDS.forEach(({ kind }) => {
    const select = card.querySelector(`[data-discord-channel="${kind}"]`);
    const route = discordRoutes.find(r => r.guild_id === guild.id && r.kind === kind);
    const options = channels.map(c => `<option value="${c.id}">#${escapeHtmlSafe(c.name)}</option>`).join('');
    select.innerHTML = `<option value="">— Choisir un salon —</option>${options}`;
    if (route) select.value = route.channel_id;
  });
}

async function saveDiscordGuild(guildId) {
  const card = document.querySelector(`[data-guild="${guildId}"]`);
  if (!card) return;

  const routes = [];
  for (const { kind } of DISCORD_ANNOUNCE_KINDS) {
    const checked = card.querySelector(`[data-discord-kind="${kind}"]`).checked;
    if (!checked) continue;
    const channelId = card.querySelector(`[data-discord-channel="${kind}"]`).value;
    if (!channelId) {
      alert('Choisis un salon pour chaque annonce cochée.');
      return;
    }
    routes.push({ kind, channel_id: channelId });
  }

  try {
    await callDiscordBot({ action: 'save_routes', guild_id: guildId, routes });
    const res = await callDiscordBot({ action: 'list_guilds' });
    discordRoutes = res.routes || [];
    renderDiscordGuilds();
    alert('✅ Configuration enregistrée.');
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

function renderDiscordPublishForm() {
  const select = document.getElementById('discordPublishGuild');
  if (!select) return;
  select.innerHTML = discordGuilds.length
    ? discordGuilds.map(g => `<option value="${g.id}">${escapeHtmlSafe(g.name)}</option>`).join('')
    : '<option value="">Aucun serveur</option>';
  if (discordGuilds.length) fillDiscordPublishChannels();
}

async function fillDiscordPublishChannels() {
  const guildId = document.getElementById('discordPublishGuild').value;
  const select = document.getElementById('discordPublishChannel');
  if (!guildId || !select) return;
  select.innerHTML = '<option value="">Chargement…</option>';
  try {
    const channels = await getDiscordChannels(guildId);
    select.innerHTML = channels.map(c => `<option value="${c.id}">#${escapeHtmlSafe(c.name)}</option>`).join('');
  } catch (err) {
    select.innerHTML = '<option value="">Salons inaccessibles</option>';
  }
}

async function publishDiscordAnnouncement() {
  const channelId = document.getElementById('discordPublishChannel').value;
  const title = document.getElementById('discordPublishTitle').value.trim();
  const message = document.getElementById('discordPublishMessage').value.trim();
  if (!channelId || !title) {
    alert('Choisis un salon et saisis un titre.');
    return;
  }
  try {
    await callDiscordBot({ action: 'publish', channel_id: channelId, title, message });
    alert('✅ Annonce publiée.');
    document.getElementById('discordPublishTitle').value = '';
    document.getElementById('discordPublishMessage').value = '';
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

// Appelée après la création d'un événement ou d'une proposition de jeu.
// Non bloquante : l'enregistrement est déjà fait. Le résultat (ou l'erreur) est affiché.
async function announceOnDiscord(kind, id) {
  const label = kind === 'event_created' ? "l'événement" : 'la proposition de jeu';
  try {
    const res = await callDiscordBot({ action: 'announce', kind, id });
    if (res.sent > 0) alert(`📣 Annonce de ${label} publiée dans ${res.sent} salon(s) Discord.`);
    else alert(`📣 Aucun salon Discord configuré pour ${label}. Vérifie l'onglet Bot Discord NVG.`);
  } catch (err) {
    alert(`⚠️ Annonce Discord non envoyée pour ${label} : ${err.message}`);
  }
}
