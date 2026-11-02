// Boîte de réception « Contact » du panneau d'administration.
// Les messages sont stockés dans nvg_contact_messages et lisibles uniquement
// par les admins (RLS). Aucun e-mail n'est envoyé par l'application :
// le bouton « Répondre » ouvre le logiciel de messagerie (mailto).
let contactMessages = [];
let contactLoading = false;
let contactFilter = 'all';

function contactIsAdmin() {
  const user = window.currentUser;
  if (!user) return false;
  return user.rank === 'Grand Jarl' || user.rank === 'Divinité' || user.role === 'admin';
}

function contactEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function contactDate(value, withTime) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return withTime
    ? date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : date.toLocaleDateString('fr-FR');
}

// Transforme un pseudo ou un lien saisi en URL sûre. Retourne null si
// le champ n'est pas un lien exploitable (pseudo Discord par exemple).
function contactSocialUrl(kind, value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  const handle = raw.replace(/^@/, '').replace(/^\/+/, '');

  if (kind === 'twitch') {
    if (/^(www\.)?twitch\.tv\//i.test(raw)) return `https://${raw}`;
    return `https://www.twitch.tv/${encodeURIComponent(handle)}`;
  }
  if (kind === 'instagram') {
    if (/^(www\.)?instagram\.com\//i.test(raw)) return `https://${raw}`;
    return `https://www.instagram.com/${encodeURIComponent(handle)}`;
  }
  if (kind === 'x') {
    if (/^(www\.)?(x|twitter)\.com\//i.test(raw)) return `https://${raw}`;
    return `https://x.com/${encodeURIComponent(handle)}`;
  }
  if (kind === 'youtube') {
    if (/^(www\.)?(youtube\.com|youtu\.be)\//i.test(raw)) return `https://${raw}`;
    if (raw.startsWith('@')) return `https://www.youtube.com/${encodeURIComponent(raw)}`;
    return null;
  }
  if (kind === 'discord') {
    if (/^(www\.)?discord\.(gg|com\/invite)\//i.test(raw)) return `https://${raw}`;
    return null;
  }
  return null;
}

function contactSocialLink(kind, label, value) {
  if (!value) return '';
  const url = contactSocialUrl(kind, value);
  const text = contactEscape(value);
  if (!url) {
    return `<span class="inline-flex items-center gap-1.5 min-w-0 text-gray-400">${label} : <span class="text-gray-200 break-all">${text}</span></span>`;
  }
  return `<a href="${contactEscape(url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 min-w-0 text-red-400 hover:text-red-300 hover:underline transition">${label} <span class="text-gray-300 break-all">${text}</span> ↗</a>`;
}

function updateContactSummary() {
  const summary = document.getElementById('adminContactSummary');
  if (!summary) return;
  const unread = contactMessages.filter(m => !m.is_read).length;
  summary.textContent = `${contactMessages.length} message${contactMessages.length > 1 ? 's' : ''} · ${unread} non lu${unread > 1 ? 's' : ''}`;
}

function updateContactUnreadBadge(count) {
  const badge = document.getElementById('contactUnreadBadge');
  if (!badge) return;
  const unread = typeof count === 'number' ? count : contactMessages.filter(m => !m.is_read).length;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.remove('hidden');
    badge.classList.add('inline-flex');
  } else {
    badge.textContent = '0';
    badge.classList.remove('inline-flex');
    badge.classList.add('hidden');
  }
}

// Met à jour la pastille sans recharger la liste (appelée à la connexion).
async function refreshContactUnreadBadge() {
  if (!contactIsAdmin() || typeof supabaseClient === 'undefined' || !supabaseClient) return;
  try {
    const { count, error } = await supabaseClient
      .from('nvg_contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false);
    if (!error) updateContactUnreadBadge(count || 0);
  } catch (_err) {
    // Silencieux : la pastille n'est qu'une aide visuelle.
  }
}

function setContactFilter(value) {
  contactFilter = value === 'unread' ? 'unread' : 'all';
  renderContactMessages();
}

async function loadContactMessages() {
  if (!contactIsAdmin()) return;
  const list = document.getElementById('adminContactList');
  if (!list) return;
  if (contactLoading) return;

  contactLoading = true;
  if (contactMessages.length === 0) {
    list.innerHTML = `
      <div class="flex items-center justify-center gap-3 py-10 text-xs text-gray-500 italic">
        <span class="w-6 h-6 rounded-full border-2 border-[#1f293d] border-t-red-500 animate-spin"></span>
        Chargement des messages…
      </div>
    `;
  }

  let data = null;
  let error = null;
  try {
    const result = await supabaseClient
      .from('nvg_contact_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    data = result.data;
    error = result.error;
  } catch (err) {
    error = { message: err && err.message ? err.message : 'erreur réseau' };
  }

  contactLoading = false;

  if (error) {
    list.innerHTML = `
      <div class="bg-[#121722] border border-red-600/30 rounded-xl p-4 text-xs text-red-300 space-y-3">
        <p>Impossible de charger les messages : ${contactEscape(error.message)}</p>
        <button type="button" onclick="loadContactMessages()" class="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-200 text-xs font-bold transition">Réessayer</button>
      </div>
    `;
    return;
  }

  contactMessages = data || [];
  renderContactMessages();
  updateContactUnreadBadge();
  updateContactSummary();
}

function renderContactMessages() {
  const list = document.getElementById('adminContactList');
  if (!list) return;

  const visible = contactFilter === 'unread'
    ? contactMessages.filter(m => !m.is_read)
    : contactMessages;

  if (visible.length === 0) {
    list.innerHTML = `
      <div class="bg-[#121722] border border-[#1f293d] rounded-xl p-8 text-center">
        <div class="text-3xl mb-2">📭</div>
        <p class="text-xs text-gray-400 italic">${contactFilter === 'unread' ? 'Aucun message non lu.' : 'Aucun message pour le moment.'}</p>
      </div>
    `;
    return;
  }

  list.innerHTML = visible.map(row => {
    const unread = !row.is_read;
    const pseudo = row.pseudo ? `« ${contactEscape(row.pseudo)} »` : '';
    const name = `${contactEscape(row.first_name)} ${contactEscape(row.last_name)}`;
    const subject = contactEscape(row.subject);
    const email = contactEscape(row.email);
    const replySubject = encodeURIComponent(`Re: ${row.subject || 'Contact'} — NVG`);

    const messageHtml = row.message
      ? `<div class="text-xs text-gray-200 whitespace-pre-wrap break-words bg-[#07090e] border border-[#1f293d] rounded-lg p-3 max-h-72 overflow-y-auto">${contactEscape(row.message)}</div>`
      : '';

    const socialLinks = [
      contactSocialLink('twitch', 'Twitch', row.twitch_channel),
      contactSocialLink('instagram', 'Instagram', row.instagram),
      contactSocialLink('x', 'X', row.x_account),
      contactSocialLink('discord', 'Discord', row.discord),
      contactSocialLink('youtube', 'YouTube', row.youtube)
    ].filter(Boolean).join('');

    const socialHtml = socialLinks
      ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] bg-[#07090e] border border-[#1f293d] rounded-lg p-3">${socialLinks}</div>`
      : '';

    return `
      <article class="bg-[#121722] border ${unread ? 'border-amber-500/50' : 'border-[#1f293d]'} rounded-xl overflow-hidden">
        <details class="group" data-contact-id="${contactEscape(row.id)}" data-unread="${unread ? '1' : '0'}" ontoggle="handleContactToggle(this)">
          <summary class="cursor-pointer list-none p-4 flex items-start gap-3 hover:bg-white/5 transition">
            <span data-unread-dot class="mt-1.5 w-2 h-2 rounded-full shrink-0 ${unread ? 'bg-red-500' : 'bg-[#1f293d]'}"></span>
            <span class="flex-1 min-w-0">
              <span class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-black text-white break-all">${name}</span>
                ${pseudo ? `<span class="text-[10px] text-gray-400">${pseudo}</span>` : ''}
                <span class="text-[10px] px-2 py-0.5 rounded bg-red-600/10 text-red-400 border border-red-600/20 font-bold">${subject}</span>
                ${unread ? '<span class="contact-new text-[10px] px-2 py-0.5 rounded bg-amber-500 text-black font-black uppercase">Nouveau</span>' : ''}
              </span>
              <span class="block text-[10px] text-gray-400 mt-1 truncate">${email} · ${contactDate(row.created_at, true)}</span>
            </span>
            <span class="text-gray-500 text-xs transition group-open:rotate-180">▾</span>
          </summary>
          <div class="border-t border-[#1f293d] p-4 space-y-3">
            <div class="text-[11px] text-gray-400">
              Reçu le ${contactDate(row.created_at, true)} · e-mail : <a href="mailto:${email}" class="text-red-400 hover:underline break-all">${email}</a>
            </div>
            ${messageHtml}
            ${socialHtml}
            <div class="flex flex-wrap gap-2 pt-1">
              <a href="mailto:${email}?subject=${replySubject}" class="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition">✉️ Répondre</a>
              <button type="button" onclick="contactToggleRead('${contactEscape(row.id)}')" class="contact-read-btn px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-200 text-xs font-bold transition">${unread ? '✅ Marquer lu' : '↩️ Marquer non lu'}</button>
              <button type="button" onclick="deleteContactMessage('${contactEscape(row.id)}')" class="px-3 py-2 rounded-lg bg-white/5 hover:bg-red-600/20 border border-[#1f293d] text-red-300 text-xs font-bold transition">🗑️ Supprimer</button>
            </div>
          </div>
        </details>
      </article>
    `;
  }).join('');
}

// Ouvrir un message non lu le marque comme lu (une seule requête).
async function handleContactToggle(el) {
  if (!el || !el.open || el.dataset.unread !== '1') return;
  const id = el.dataset.contactId;
  if (!id) return;

  el.dataset.unread = '0';
  const newBadge = el.querySelector('.contact-new');
  if (newBadge) newBadge.remove();
  const dot = el.querySelector('[data-unread-dot]');
  if (dot) {
    dot.classList.remove('bg-red-500');
    dot.classList.add('bg-[#1f293d]');
  }
  const readBtn = el.querySelector('.contact-read-btn');
  if (readBtn) readBtn.textContent = '↩️ Marquer non lu';

  const row = contactMessages.find(m => m.id === id);
  if (row) {
    row.is_read = true;
    row.read_at = new Date().toISOString();
  }
  updateContactUnreadBadge();
  updateContactSummary();

  const { error } = await supabaseClient
    .from('nvg_contact_messages')
    .update({ is_read: true, read_at: row ? row.read_at : new Date().toISOString() })
    .eq('id', id);

  if (error) console.error('Marquage lu impossible :', error.message);
}

async function contactToggleRead(id) {
  const row = contactMessages.find(m => m.id === id);
  if (!row) return;

  const nextRead = !row.is_read;
  const readAt = nextRead ? new Date().toISOString() : null;

  const { error } = await supabaseClient
    .from('nvg_contact_messages')
    .update({ is_read: nextRead, read_at: readAt })
    .eq('id', id);

  if (error) {
    alert('Impossible de modifier ce message : ' + error.message);
    return;
  }

  row.is_read = nextRead;
  row.read_at = readAt;
  renderContactMessages();
  updateContactUnreadBadge();
  updateContactSummary();
}

async function deleteContactMessage(id) {
  const row = contactMessages.find(m => m.id === id);
  const label = row ? `le message de ${row.first_name} ${row.last_name}` : 'ce message';
  if (!confirm(`Supprimer définitivement ${label} ?`)) return;

  const { error } = await supabaseClient
    .from('nvg_contact_messages')
    .delete()
    .eq('id', id);

  if (error) {
    alert('Impossible de supprimer ce message : ' + error.message);
    return;
  }

  contactMessages = contactMessages.filter(m => m.id !== id);
  renderContactMessages();
  updateContactUnreadBadge();
  updateContactSummary();
}
