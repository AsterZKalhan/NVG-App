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
const discordGuildsOpen = new Set();
const DISCORD_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
let discordPublishImage = null;
let discordPublishImageUrl = '';

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

async function leaveDiscordGuild(guildId) {
  const guild = discordGuilds.find(g => g.id === guildId);
  const guildName = guild ? guild.name : 'ce serveur';
  if (!confirm(`Faire quitter le bot du serveur « ${guildName} » ? Ses annonces configurées seront supprimées.`)) return;
  try {
    await callDiscordBot({ action: 'leave_guild', guild_id: guildId });
    alert(`✅ Le bot a quitté « ${guildName} ».`);
    loadDiscordBotAdmin();
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
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

    const open = discordGuildsOpen.has(guild.id);
    const activeCount = discordRoutes.filter(r => r.guild_id === guild.id).length;

    return `
      <div class="bg-[#121722] border border-[#1f293d] rounded-xl p-5 space-y-3" data-guild="${guild.id}">
        <div class="flex items-center justify-between gap-3 cursor-pointer select-none" role="button" tabindex="0" aria-expanded="${open}" onclick="toggleDiscordGuildCard(event, '${guild.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">
          <div class="flex items-center gap-3 min-w-0">
            ${guild.icon
              ? `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64" alt="" class="w-9 h-9 rounded-full shrink-0">`
              : `<div class="w-9 h-9 rounded-full bg-[#07090e] border border-[#1f293d] shrink-0 flex items-center justify-center text-xs font-black text-gray-400">${escapeHtmlSafe(guild.name.charAt(0).toUpperCase())}</div>`}
            <h4 class="text-sm font-black text-white truncate">${escapeHtmlSafe(guild.name)}</h4>
            ${activeCount ? `<span class="text-[10px] font-bold text-gray-400 bg-white/5 border border-[#1f293d] rounded-full px-2 py-0.5 shrink-0">${activeCount} annonce${activeCount > 1 ? 's' : ''}</span>` : ''}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button onclick="saveDiscordGuild('${guild.id}')" class="px-4 py-2 bg-amber-500 text-black font-bold text-xs rounded-lg hover:bg-amber-400 transition">Enregistrer</button>
            <button onclick="leaveDiscordGuild('${guild.id}')" class="px-4 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white font-bold text-xs rounded-lg border border-red-600/40 transition">Quitter le serveur</button>
            <span class="guild-chevron text-gray-400 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}" aria-hidden="true">▼</span>
          </div>
        </div>
        <div class="guild-body space-y-3 ${open ? '' : 'hidden'}">${rows}</div>
      </div>`;
  }).join('');

  discordGuilds.forEach(fillDiscordChannelSelects);
}

function toggleDiscordGuildCard(event, guildId) {
  if (event && event.target.closest('button, a, select, input, label')) return;
  const card = document.querySelector(`[data-guild="${guildId}"]`);
  if (!card) return;
  const body = card.querySelector('.guild-body');
  const chevron = card.querySelector('.guild-chevron');
  const header = card.querySelector('[role="button"]');
  if (!body) return;
  const open = body.classList.toggle('hidden') === false;
  if (open) discordGuildsOpen.add(guildId);
  else discordGuildsOpen.delete(guildId);
  if (chevron) chevron.classList.toggle('rotate-180', open);
  if (header) header.setAttribute('aria-expanded', String(open));
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
  const guildId = document.getElementById('discordPublishGuild').value;
  const channelId = document.getElementById('discordPublishChannel').value;
  const title = document.getElementById('discordPublishTitle').value.trim();
  const message = document.getElementById('discordPublishMessage').value.trim();
  if (!guildId || !channelId || !title) {
    alert('Choisis un serveur, un salon et saisis un titre.');
    return;
  }
  const btn = document.getElementById('discordPublishBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Publication…'; }
  try {
    const imageUrl = await uploadDiscordAnnouncementImage(guildId);
    await callDiscordBot({ action: 'publish', guild_id: guildId, channel_id: channelId, title, message, image_url: imageUrl });
    alert('✅ Annonce publiée.');
    document.getElementById('discordPublishTitle').value = '';
    document.getElementById('discordPublishMessage').value = '';
    clearDiscordPublishImage();
  } catch (err) {
    alert('Erreur : ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Publier sur Discord'; }
  }
}

function onDiscordPublishImageSelected(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Choisis un fichier image.');
    input.value = '';
    return;
  }
  if (file.size > DISCORD_IMAGE_MAX_BYTES) {
    alert('Image trop lourde : 8 Mo maximum.');
    input.value = '';
    return;
  }
  discordPublishImage = file;
  if (discordPublishImageUrl) URL.revokeObjectURL(discordPublishImageUrl);
  discordPublishImageUrl = URL.createObjectURL(file);
  document.getElementById('discordPublishPreview').src = discordPublishImageUrl;
  document.getElementById('discordPublishPreviewWrap').classList.remove('hidden');
  document.getElementById('discordPublishImageName').textContent = file.name;
  document.getElementById('discordPublishImageClear').classList.remove('hidden');
}

function clearDiscordPublishImage() {
  discordPublishImage = null;
  if (discordPublishImageUrl) {
    URL.revokeObjectURL(discordPublishImageUrl);
    discordPublishImageUrl = '';
  }
  const input = document.getElementById('discordPublishImageInput');
  if (input) input.value = '';
  const img = document.getElementById('discordPublishPreview');
  if (img) img.removeAttribute('src');
  document.getElementById('discordPublishPreviewWrap').classList.add('hidden');
  document.getElementById('discordPublishImageName').textContent = '';
  document.getElementById('discordPublishImageClear').classList.add('hidden');
}

// Dépose l'image dans le bucket public notifs, dossier discord/<serveur>/.
// L'URL publique est ensuite envoyée à Discord comme image de l'embed.
async function uploadDiscordAnnouncementImage(guildId) {
  if (!discordPublishImage) return '';
  const file = discordPublishImage;
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `discord/${guildId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await supabaseClient.storage
    .from('notifs')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`image non envoyée (${error.message})`);
  const { data } = supabaseClient.storage.from('notifs').getPublicUrl(path);
  return data.publicUrl;
}

// Appelée après la création d'un événement ou d'une proposition de jeu.
// Non bloquante : l'enregistrement est déjà fait. Le résultat (ou l'erreur) est affiché.
async function announceOnDiscord(kind, id) {
  const label = kind === 'event_created' ? "l'événement" : 'la proposition de jeu';
  try {
    const res = await callDiscordBot({ action: 'announce', kind, id });
    console.log(`Annonce Discord (${label}) : ${res.sent} salon(s)`);
  } catch (err) {
    alert(`⚠️ Annonce Discord non envoyée pour ${label} : ${err.message}`);
  }
}
