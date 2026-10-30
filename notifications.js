// --- GESTION DES NOTIFICATIONS & DIFFUSION (ADMIN & CLIENT) ---

async function loadNotifications() {
  const { data: notifications, error } = await supabaseClient
    .from('nvg_notifications')
    .select('*')
    .order('time', { ascending: false });

  if (error) {
    console.error("Erreur chargement notifications :", error);
    return;
  }

  // On cible à la fois l'onglet public et l'onglet admin s'ils existent sur la page active
  const containers = [
    document.getElementById('notificationsContainer'),
    document.getElementById('adminNotificationsList')
  ].filter(Boolean); // Ignore les éléments absents

  window.notifCache = notifications || [];

  const readIds = await fetchReadNotifIds();
  updateNotifDot(window.notifCache.filter(notif => isNotifUnread(notif, readIds)).length);

  if (containers.length === 0) return;

  const htmlContent = (!notifications || notifications.length === 0)
    ? `<div class="p-4 text-center text-xs text-gray-400 bg-[#07090e] border border-[#1f293d] rounded-xl">Aucune notification pour le moment.</div>`
    : notifications.map(notif => {
      const unread = isNotifUnread(notif, readIds);
      return `
      <div onclick="openNotification('${notif.id}')" class="cursor-pointer p-4 bg-[#07090e] border ${unread ? 'border-red-600/50' : 'border-[#1f293d]'} rounded-xl flex flex-col gap-2 hover:border-red-600/50 transition">
        <div class="flex flex-col gap-2">
          ${notif.image ? `<img src="${escapeHtmlSafe(notif.image)}" alt="" class="w-full max-h-40 object-cover rounded-lg">` : ''}
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] text-gray-400">${formatDate(notif.time)}</span>
            ${unread ? '<span class="text-[10px] font-bold text-red-400 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>Non lue</span>' : ''}
          </div>
          <div class="text-center text-base md:text-lg font-black text-white">${escapeHtmlSafe(notif.title)}</div>
          <p class="text-center text-sm text-gray-300 line-clamp-2">${escapeHtmlSafe(notif.body)}</p>
        </div>
        ${isStaffUser() ? `
        <div class="flex items-center mt-1">
          <span class="text-[10px] px-2 py-0.5 rounded bg-red-600/10 text-red-400 border border-red-600/20">Cible : ${escapeHtmlSafe(notif.target || 'Tous')}</span>
        </div>` : ''}
      </div>
    `;

    }).join('');

  const htmlCompact = (!notifications || notifications.length === 0)
    ? `<div class="p-3 text-center text-xs text-gray-400">Aucune notification pour le moment.</div>`
    : notifications.map(notif => `
      <div class="flex items-center justify-between gap-3 px-3 py-2 bg-[#07090e] border border-[#1f293d] rounded-lg text-xs">
        <span class="font-bold text-white truncate">${escapeHtmlSafe(notif.title)}</span>
        <div class="flex items-center gap-3 shrink-0">
          <span class="text-[10px] text-gray-400 hidden sm:inline">${formatDate(notif.time)} · ${escapeHtmlSafe(notif.target || 'Tous')}</span>
          <button onclick="deleteNotification('${notif.id}')" class="text-[10px] text-gray-500 hover:text-red-400 transition">Supprimer</button>
        </div>
      </div>
    `).join('');

  // Mise à jour de tous les conteneurs trouvés
  containers.forEach(container => {
    container.innerHTML = container.id === 'adminNotificationsList' ? htmlCompact : htmlContent;
  });
}

// Fonction pour envoyer et diffuser la notification (Admin)
async function adminSendNotification() {
  const title = document.getElementById('adminNotifTitle').value.trim();
  const body = document.getElementById('adminNotifMessage').value.trim();
  const image = document.getElementById('adminNotifImage').value.trim();

  const checkedRoles = document.querySelectorAll('input[name="targetRole"]:checked');
  const targetsArray = Array.from(checkedRoles).map(cb => cb.value);

  if (!title || !body) {
    alert("Le titre et le message de la notification sont obligatoires.");
    return;
  }

  let target = 'Tous';
  if (targetsArray.length > 0 && !targetsArray.includes('Tous')) {
    target = targetsArray.join(', ');
  }

  const notifObj = {
    id: 'notif_' + Date.now(),
    title,
    body,
    image,
    target,
    time: new Date().toISOString()
  };

  // 1. Enregistrement dans l'historique de la base de données
  const { error } = await supabaseClient
    .from('nvg_notifications')
    .insert([notifObj]);

  if (error) {
    alert("Erreur lors de l'envoi de la notification : " + error.message);
    return;
  }

  // 2. Appel direct de l'Edge Function pour déclencher les push navigateurs
  try {
    const { error: fnError } = await supabaseClient.functions.invoke('send-push', {
      body: { record: notifObj }
    });
    if (fnError) {
      console.error("Erreur Edge Function :", fnError);
    } else {
      console.log("🚀 Edge Function de push déclenchée avec succès.");
    }
  } catch (err) {
    console.error("Erreur lors de l'appel de l'Edge Function :", err);
  }

  alert("✅ Notification diffusée et transmise aux navigateurs avec succès !");
  
  document.getElementById('adminNotifTitle').value = '';
  document.getElementById('adminNotifMessage').value = '';
  document.getElementById('adminNotifImage').value = '';
  document.querySelectorAll('input[name="targetRole"]').forEach(cb => cb.checked = false);
  
  await loadNotifications();
}

async function deleteNotification(notifId) {
  if (!confirm("Supprimer cette notification de l'historique ?")) return;
  const { error } = await supabaseClient.from('nvg_notifications').delete().eq('id', notifId);
  if (error) alert("Erreur : " + error.message);
  else loadNotifications();
}

// Upload d'une image de notification dans le stockage Supabase (bucket public « notifs », réservé aux admins).
// L'URL publique obtenue est placée dans le champ image, comme si elle avait été saisie à la main.
async function handleNotifImageUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `notif_${Date.now()}_${safeName}`;
  const { error } = await supabaseClient.storage.from('notifs').upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    alert("Erreur lors de l'upload de l'image : " + error.message);
    input.value = '';
    return;
  }

  const { data } = supabaseClient.storage.from('notifs').getPublicUrl(path);
  document.getElementById('adminNotifImage').value = data.publicUrl;
  input.value = '';
  alert("✅ Image uploadée. Elle sera jointe à la notification.");
}

async function fetchReadNotifIds() {
  if (!currentUser) return [];
  const { data, error } = await supabaseClient
    .from('nvg_notification_reads')
    .select('notification_id')
    .eq('user_id', currentUser.id);

  if (error) {
    console.error("Erreur chargement des lectures :", error);
    return [];
  }
  return data.map(row => row.notification_id);
}

async function markNotificationRead(notifId) {
  if (!currentUser) return;
  const { error } = await supabaseClient
    .from('nvg_notification_reads')
    .upsert([{ notification_id: notifId, user_id: currentUser.id }], { onConflict: 'notification_id,user_id', ignoreDuplicates: true });

  if (error) console.error("Erreur marquage lu :", error);
}

// Une notification est non lue si elle n'est pas dans les lectures de l'utilisateur ET qu'elle est postée après notif_baseline (les anciennes sont considérées comme lues).
function isNotifUnread(notif, readIds) {
  if (!currentUser || readIds.includes(notif.id)) return false;
  const baseline = currentUser.notif_baseline ? new Date(String(currentUser.notif_baseline).replace(/(\.\d{3})\d+/, '$1')) : null;
  return !baseline || new Date(notif.time) > baseline;
}

function updateNotifDot(unreadCount) {
  const dot = document.getElementById('notifDot');
  if (dot) dot.classList.toggle('hidden', unreadCount === 0);
}

async function openNotification(notifId) {
  const notif = (window.notifCache || []).find(n => n.id === notifId);
  if (!notif) return;

  await markNotificationRead(notifId);

  document.getElementById('notifModalTitle').textContent = notif.title || '';
  document.getElementById('notifModalDate').textContent = formatDate(notif.time);
  document.getElementById('notifModalTarget').textContent = 'Cible : ' + (notif.target || 'Tous');
  document.getElementById('notifModalBody').textContent = notif.body || '';
  const modalImg = document.getElementById('notifModalImage');
  if (notif.image) {
    modalImg.src = notif.image;
    modalImg.classList.remove('hidden');
  } else {
    modalImg.removeAttribute('src');
    modalImg.classList.add('hidden');
  }
  document.getElementById('notifModal').classList.remove('hidden');

  loadNotifications();
}

function closeNotification() {
  const modal = document.getElementById('notifModal');
  if (modal) modal.classList.add('hidden');
}

function isStaffUser() {
  return !!currentUser && (['Viking', 'Grand Jarl', 'Divinité'].includes(currentUser.rank) || ['admin', 'staff'].includes(currentUser.role));
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapeHtmlSafe(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, match => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[match]));
}

document.addEventListener("DOMContentLoaded", () => {
  loadNotifications();
});