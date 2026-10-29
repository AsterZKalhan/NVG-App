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

  if (containers.length === 0) return;

  const htmlContent = (!notifications || notifications.length === 0)
    ? `<div class="p-4 text-center text-xs text-gray-400 bg-[#07090e] border border-[#1f293d] rounded-xl">Aucune notification pour le moment.</div>`
    : notifications.map(notif => `
      <div class="p-4 bg-[#07090e] border border-[#1f293d] rounded-xl flex flex-col gap-2 hover:border-red-600/50 transition">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-white">${escapeHtmlSafe(notif.title)}</span>
          <span class="text-[10px] text-gray-400">${formatDate(notif.time)}</span>
        </div>
        <p class="text-xs text-gray-300">${escapeHtmlSafe(notif.body)}</p>
        <div class="flex items-center justify-between mt-1">
          <span class="text-[10px] px-2 py-0.5 rounded bg-red-600/10 text-red-400 border border-red-600/20">Cible : ${escapeHtmlSafe(notif.target || 'Tous')}</span>
          ${currentUser && (currentUser.rank === 'Grand Jarl' || currentUser.rank === 'Divinité' || currentUser.role === 'admin') ? `
            <button onclick="deleteNotification('${notif.id}')" class="text-[10px] text-gray-500 hover:text-red-400 transition">Supprimer 🗑️</button>
          ` : ''}
        </div>
      </div>
    `).join('');

  // Mise à jour de tous les conteneurs trouvés
  containers.forEach(container => {
    container.innerHTML = htmlContent;
  });
}

// Fonction pour envoyer et diffuser la notification (Admin)
async function adminSendNotification() {
  const title = document.getElementById('adminNotifTitle').value.trim();
  const body = document.getElementById('adminNotifMessage').value.trim();

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
  document.querySelectorAll('input[name="targetRole"]').forEach(cb => cb.checked = false);
  
  await loadNotifications();
}

async function deleteNotification(notifId) {
  if (!confirm("Supprimer cette notification de l'historique ?")) return;
  const { error } = await supabaseClient.from('nvg_notifications').delete().eq('id', notifId);
  if (error) alert("Erreur : " + error.message);
  else loadNotifications();
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