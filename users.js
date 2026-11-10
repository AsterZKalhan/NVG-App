// --- GESTION DES UTILISATEURS & AUTHENTIFICATION (SUPABASE) ---

let currentCaptchaResult = 0;

function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const btnConnexion = document.getElementById('tabConnexionBtn');
  const btnInscription = document.getElementById('tabInscriptionBtn');

  if (tab === 'connexion') {
    if (loginForm) loginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    if (btnConnexion) btnConnexion.className = "flex-1 py-2 rounded-lg text-xs font-bold text-white bg-red-600 shadow transition";
    if (btnInscription) btnInscription.className = "flex-1 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition";
  } else {
    if (registerForm) registerForm.classList.remove('hidden');
    if (loginForm) loginForm.classList.add('hidden');
    if (btnInscription) btnInscription.className = "flex-1 py-2 rounded-lg text-xs font-bold text-white bg-red-600 shadow transition";
    if (btnConnexion) btnConnexion.className = "flex-1 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition";
    generateCaptcha(); 
  }
}

function generateCaptcha() {
  const num1 = Math.floor(Math.random() * 8) + 2; 
  const num2 = Math.floor(Math.random() * 8) + 1; 
  currentCaptchaResult = num1 + num2;
  
  const questionEl = document.getElementById('captchaQuestion');
  if (questionEl) {
    questionEl.innerText = `${num1} + ${num2}`;
  }
}

async function handleLoginSubmit() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  if (!email || !password) {
    alert("Veuillez remplir tous les champs de connexion.");
    return;
  }

  await loginUserToSupabase(email, password);
}

async function handleRegisterSubmit() {
  const name = document.getElementById('registerPseudo').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  const answerInput = document.getElementById('captchaAnswer');
  const userAnswer = answerInput ? parseInt(answerInput.value.trim(), 10) : NaN;

  if (!name || !email || !password) {
    alert("Veuillez remplir tous les champs d'inscription.");
    return;
  }

  if (userAnswer !== currentCaptchaResult) {
    alert("❌ Erreur : La réponse au test anti-spam est incorrecte.");
    generateCaptcha(); 
    if (answerInput) answerInput.value = '';
    return;
  }

  await registerUserToSupabase(name, email, password);
}

async function loginUserToSupabase(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert("Erreur de connexion : " + error.message);
    return;
  }
  alert("✅ Connexion réussie ! Bienvenue Viking.");
  window.location.reload();
}

async function registerUserToSupabase(name, email, password) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { name: name } }
  });

  if (error) {
    alert("Erreur lors de l'inscription : " + error.message);
    return;
  }

  const userObj = {
    id: data.user ? data.user.id : 'usr_' + Date.now(),
    name: name,
    email: email,
    role: 'Membre',
    rank: 'Petit Viking',
    verified: false,
    avatar_url: ''
  };

  await supabaseClient.from('nvg_users').upsert([userObj]);

  alert("✅ Inscription réussie ! Tu peux maintenant te connecter.");
  switchAuthTab('connexion');
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  window.location.reload();
}

// --- GESTION DE L'ESPACE "MON COMPTE" ---
function loadAccountTab() {
  if (!currentUser) return;
  
  const pseudoInput = document.getElementById('accPseudoInput');
  const emailInput = document.getElementById('accEmailInput');
  const avatarInput = document.getElementById('accAvatarInput');
  const preview = document.getElementById('accountAvatarPreview');
  const profileName = document.getElementById('accountProfileName');
  const profileRank = document.getElementById('accountProfileRank');

  if (pseudoInput) pseudoInput.value = currentUser.name || '';
  if (emailInput) emailInput.value = currentUser.email || '';
  if (avatarInput) avatarInput.value = currentUser.avatar_url || '';
  const twitchInput = document.getElementById('accTwitchInput');
  if (twitchInput) twitchInput.value = currentUser.twitch_channel || '';
  showTwitchAvatar(currentUser.twitch_channel || '');
  
  const currentAvatar = currentUser.avatar_url;
  if (preview) {
    if (currentAvatar) {
      preview.innerHTML = `<img src="${currentAvatar}" class="w-full h-full object-cover rounded-xl">`;
    } else {
      preview.innerHTML = `👤`;
    }
  }

  if (profileName) profileName.textContent = currentUser.name || 'Pseudo';
  if (profileRank) profileRank.textContent = currentUser.rank || 'Petit Viking';
  updateNotifButton();
}

async function saveAccountChanges() {
  if (!currentUser) return;

  const newPseudo = document.getElementById('accPseudoInput').value.trim();
  const newAvatar = document.getElementById('accAvatarInput').value.trim();
  const newPassword = document.getElementById('accPasswordInput').value.trim();
  const twitchRaw = document.getElementById('accTwitchInput').value.trim();
  const twitchMatch = twitchRaw.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})/i) || twitchRaw.match(/^([A-Za-z0-9_]{3,25})$/);
  if (twitchRaw && !twitchMatch) {
    alert("Nom de chaîne Twitch invalide (3 à 25 lettres, chiffres ou _).");
    return;
  }
  const twitchChannel = twitchMatch ? twitchMatch[1].toLowerCase() : '';
  if (twitchChannel) {
    const avatarUrl = await getTwitchAvatar(twitchChannel);
    if (!avatarUrl.startsWith('http')) {
      alert("Cette chaîne Twitch est introuvable. Vérifie le nom.");
      return;
    }
    showTwitchAvatar(twitchChannel);
  } else {
    showTwitchAvatar('');
  }

  let updates = { twitch_channel: twitchChannel };
  if (newPseudo) updates.name = newPseudo;
  if (newAvatar) updates.avatar_url = newAvatar;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabaseClient.from('nvg_users').update(updates).eq('id', currentUser.id);
    if (error) {
      alert("Erreur lors de la mise à jour du profil : " + error.message);
      return;
    }
  }

  currentUser.twitch_channel = twitchChannel;

  if (newPassword) {
    const { error: pwdError } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (pwdError) {
      alert("Erreur mot de passe : " + pwdError.message);
      return;
    }
  }

  alert("✅ Modifications enregistrées avec succès !");
  window.location.reload();
}

function handleAvatarUpload(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64Img = e.target.result;
      const avatarInput = document.getElementById('accAvatarInput');
      if (avatarInput) avatarInput.value = base64Img;
      const preview = document.getElementById('accountAvatarPreview');
      if (preview) preview.innerHTML = `<img src="${base64Img}" class="w-full h-full object-cover rounded-xl">`;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// --- ADMINISTRATION DES UTILISATEURS (ONGLET ADMIN) ---
let adminUsersSort = 'rank';

const ADMIN_RANK_ORDER = {
  'Divinité': 0,
  'Grand Jarl': 1,
  'Jarl': 1,
  'Viking': 2,
  'Petit Viking': 3
};

function setAdminUserSort(value) {
  adminUsersSort = value === 'name' ? 'name' : 'rank';
  loadUsers();
}

async function loadUsers() {
  const isSuperAdmin = currentUser && (currentUser.rank === 'Grand Jarl' || currentUser.rank === 'Divinité' || currentUser.role === 'admin');
  if (!isSuperAdmin) return;

  const { data: users, error } = await supabaseClient
    .from('nvg_users')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error("Erreur chargement utilisateurs :", error);
    return;
  }

  // Tri : par rôle (admin → membre) puis par pseudo, ou uniquement par pseudo.
  if (users) {
    users.sort((a, b) => {
      if (adminUsersSort === 'rank') {
        const diff = (ADMIN_RANK_ORDER[a.rank] ?? 4) - (ADMIN_RANK_ORDER[b.rank] ?? 4);
        if (diff !== 0) return diff;
      }
      return (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' });
    });
  }

  window.adminUsersCache = users || [];
  const tbody = document.getElementById('adminUsersTable');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = `<div class="p-4 text-center text-xs text-gray-400">Aucun utilisateur trouvé.</div>`;
    return;
  }

  tbody.innerHTML = users.map(user => {
    const rank = user.rank || 'Petit Viking';
    const twitch = user.twitch_channel
      ? `<div class="flex items-center gap-2 min-w-0"><img data-twitch-avatar="${escapeHtmlSafe(user.twitch_channel)}" alt="" class="w-7 h-7 rounded-lg bg-[#07090e] border border-[#1f293d] object-cover shrink-0"><span class="font-bold text-white truncate">${escapeHtmlSafe(user.twitch_channel)}</span></div>`
      : `<span class="text-gray-500">Non renseigné</span>`;

    return `
    <div class="admin-user">
      <button type="button" id="adminUserToggle-${user.id}" aria-expanded="false" onclick="toggleAdminUserDetails('${user.id}')" class="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition">
        <div class="w-9 h-9 rounded-lg bg-[#07090e] border border-[#1f293d] flex items-center justify-center overflow-hidden shrink-0">
          ${user.avatar_url && user.avatar_url !== 'EMPTY' ? `<img src="${escapeHtmlSafe(user.avatar_url)}" class="w-full h-full object-cover">` : '👤'}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs font-bold text-white truncate">${escapeHtmlSafe(user.name)}</span>
            <span id="adminUserRankBadge-${user.id}" class="shrink-0 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide ${adminRankBadgeClass(rank)}">${adminRankShortLabel(rank)}</span>
          </div>
          <div class="text-[10px] text-gray-400 truncate">${escapeHtmlSafe(user.email)}</div>
        </div>
        <span class="shrink-0 px-2 py-1 rounded border text-[10px] font-bold ${user.verified ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-amber-500/30 text-amber-400 bg-amber-500/10'}">${user.verified ? '✓ Vérifié' : '⏳ Attente'}</span>
        <span id="adminUserChevron-${user.id}" class="shrink-0 text-gray-400 text-xs">▾</span>
      </button>

      <div id="adminUserDetails-${user.id}" class="hidden border-t border-[#1f293d] bg-[#07090e]/50 p-3 space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="block text-[10px] text-gray-400 uppercase font-bold">Rang</label>
            <select onchange="updateUserRankAndRole('${user.id}', this.value)" class="w-full bg-[#07090e] border border-[#1f293d] rounded-lg px-2 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none">
              <option value="Petit Viking" ${user.rank === 'Petit Viking' ? 'selected' : ''}>Petit Viking (Membre)</option>
              <option value="Viking" ${user.rank === 'Viking' ? 'selected' : ''}>Viking (Staff)</option>
              <option value="Grand Jarl" ${user.rank === 'Grand Jarl' || user.rank === 'Jarl' ? 'selected' : ''}>Grand Jarl (Admin)</option>
              <option value="Divinité" ${user.rank === 'Divinité' ? 'selected' : ''}>Divinité (Admin)</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="block text-[10px] text-gray-400 uppercase font-bold">Twitch</label>
            <div class="flex items-center min-h-[34px] text-xs bg-[#07090e] border border-[#1f293d] rounded-lg px-2 py-1.5">${twitch}</div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 pt-1">
          <button onclick="toggleUserVerification('${user.id}', ${user.verified})" class="px-3 py-2 bg-white/5 hover:bg-white/10 border border-[#1f293d] text-gray-200 text-[10px] font-bold rounded-xl transition">${user.verified ? 'Retirer la vérification' : 'Marquer comme vérifié'}</button>
          <button onclick="openAdminUserModal('${user.id}')" class="px-3 py-2 bg-amber-500/20 hover:bg-amber-500 text-amber-400 hover:text-black text-[10px] font-bold rounded-xl transition">Modifier ✏️</button>
          <button onclick="deleteUser('${user.id}')" class="px-3 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-[10px] font-bold rounded-xl transition">Supprimer 🗑️</button>
        </div>
      </div>
    </div>
  `;
  }).join('');
  hydrateTwitchAvatars(tbody);
}

const ADMIN_RANK_LABELS = {
  'Petit Viking': 'Petit Viking',
  'Viking': 'Viking',
  'Grand Jarl': 'Grand Jarl',
  'Jarl': 'Grand Jarl',
  'Divinité': 'Divinité'
};

function adminRankShortLabel(rank) {
  return ADMIN_RANK_LABELS[rank] || rank || 'Petit Viking';
}

function adminRankBadgeClass(rank) {
  if (rank === 'Divinité' || rank === 'Grand Jarl' || rank === 'Jarl') return 'border-amber-500/30 text-amber-400 bg-amber-500/10';
  if (rank === 'Viking') return 'border-red-500/30 text-red-400 bg-red-500/10';
  return 'border-[#1f293d] text-gray-300 bg-white/5';
}

function toggleAdminUserDetails(id) {
  const panel = document.getElementById('adminUserDetails-' + id);
  const chevron = document.getElementById('adminUserChevron-' + id);
  const toggle = document.getElementById('adminUserToggle-' + id);
  if (!panel) return;
  panel.classList.toggle('hidden');
  const open = !panel.classList.contains('hidden');
  if (chevron) chevron.textContent = open ? '▴' : '▾';
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

let editingAdminUserId = null;

function openAdminUserModal(id) {
  const user = (window.adminUsersCache || []).find(u => u.id === id);
  if (!user) return;
  editingAdminUserId = id;
  document.getElementById('admUserName').value = user.name || '';
  document.getElementById('admUserEmail').value = user.email || '';
  document.getElementById('admUserAvatar').value = user.avatar_url && user.avatar_url !== 'EMPTY' ? user.avatar_url : '';
  document.getElementById('admUserTwitch').value = user.twitch_channel || '';
  document.getElementById('adminUserModal').classList.remove('hidden');
  showAdminTwitchAvatar();
}

function closeAdminUserModal() {
  document.getElementById('adminUserModal').classList.add('hidden');
  editingAdminUserId = null;
}

async function showAdminTwitchAvatar() {
  const raw = document.getElementById('admUserTwitch').value.trim();
  const match = raw.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})/i) || raw.match(/^([A-Za-z0-9_]{3,25})$/);
  const img = document.getElementById('admUserTwitchAvatar');
  if (!match) {
    img.classList.add('hidden');
    img.removeAttribute('src');
    return;
  }
  const url = await getTwitchAvatar(match[1].toLowerCase());
  if (url.startsWith('http')) {
    img.src = url;
    img.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    img.removeAttribute('src');
  }
}

// Modification d'un membre par l'admin. Le changement d'e-mail passe par la fonction SQL nvg_admin_set_email (l'auth Supabase ne se modifie pas directement depuis le navigateur).
async function adminSaveUser() {
  const id = editingAdminUserId;
  if (!id) return;
  const user = (window.adminUsersCache || []).find(u => u.id === id);

  const name = document.getElementById('admUserName').value.trim();
  if (!name) {
    alert("Le pseudo est obligatoire.");
    return;
  }

  const email = document.getElementById('admUserEmail').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert("Adresse e-mail invalide.");
    return;
  }

  const avatar = document.getElementById('admUserAvatar').value.trim();

  const raw = document.getElementById('admUserTwitch').value.trim();
  const match = raw.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})/i) || raw.match(/^([A-Za-z0-9_]{3,25})$/);
  if (raw && !match) {
    alert("Nom de chaîne Twitch invalide (3 à 25 lettres, chiffres ou _).");
    return;
  }
  const twitch = match ? match[1].toLowerCase() : '';
  if (twitch) {
    const url = await getTwitchAvatar(twitch);
    if (!url.startsWith('http')) {
      alert("Cette chaîne Twitch est introuvable.");
      return;
    }
  }

  const { error } = await supabaseClient
    .from('nvg_users')
    .update({ name, avatar_url: avatar, twitch_channel: twitch })
    .eq('id', id);
  if (error) {
    alert("Erreur lors de la mise à jour : " + error.message);
    return;
  }

  if (email !== ((user && user.email) || '').toLowerCase()) {
    const { error: emailError } = await supabaseClient.rpc('nvg_admin_set_email', { target: id, new_email: email });
    if (emailError) {
      alert("Erreur lors du changement d'e-mail : " + emailError.message);
      return;
    }
  }

  alert("✅ Membre mis à jour.");
  closeAdminUserModal();
  await loadUsers();
}

async function adminSendPasswordReset() {
  const user = (window.adminUsersCache || []).find(u => u.id === editingAdminUserId);
  const email = (user && user.email) || document.getElementById('admUserEmail').value.trim();
  if (!email) return;
  if (!confirm(`Envoyer un e-mail de réinitialisation du mot de passe à ${email} ?`)) return;

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
  alert(error ? "Erreur : " + error.message : "✅ E-mail de réinitialisation envoyé.");
}

async function updateUserRankAndRole(userId, newRank) {
  let newRole = 'Membre';
  
  if (newRank === 'Viking') {
    newRole = 'staff';
  } else if (newRank === 'Grand Jarl' || newRank === 'Divinité') {
    newRole = 'admin';
  }

  const { error } = await supabaseClient
    .from('nvg_users')
    .update({ rank: newRank, role: newRole })
    .eq('id', userId);

  if (error) {
    alert("Erreur lors de la mise à jour : " + error.message);
  } else {
    if (currentUser && currentUser.id === userId) {
      window.location.reload();
      return;
    }
    // Recharge la liste pour respecter le tri par rôle, en laissant le panneau ouvert.
    const panel = document.getElementById('adminUserDetails-' + userId);
    const wasOpen = panel && !panel.classList.contains('hidden');
    await loadUsers();
    if (wasOpen) toggleAdminUserDetails(userId);
  }
}

async function toggleUserVerification(userId, currentStatus) {
  const { error } = await supabaseClient.from('nvg_users').update({ verified: !currentStatus }).eq('id', userId);
  if (error) {
    alert("Erreur : " + error.message);
    return;
  }
  const panel = document.getElementById('adminUserDetails-' + userId);
  const wasOpen = panel && !panel.classList.contains('hidden');
  await loadUsers();
  if (wasOpen) toggleAdminUserDetails(userId);
}

async function deleteUser(userId) {
  if (!confirm("Es-tu sûr de vouloir bannir ce Viking du Valhalla ?")) return;
  const { error } = await supabaseClient.from('nvg_users').delete().eq('id', userId);
  if (error) alert("Erreur de suppression : " + error.message);
  else loadUsers(); 
}

function showAdminPanel(name) {
  document.querySelectorAll('.admin-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== 'adminPanel-' + name);
  });
  document.querySelectorAll('.admin-subtab').forEach(btn => {
    const active = btn.dataset.adminPanel === name;
    btn.classList.toggle('bg-amber-500', active);
    btn.classList.toggle('text-black', active);
    btn.classList.toggle('bg-white/5', !active);
    btn.classList.toggle('text-gray-300', !active);
  });

  // Chargement de la boîte de réception Contact à l'ouverture du sous-onglet.
  if (name === 'contact' && typeof loadContactMessages === 'function') {
    loadContactMessages();
  }

  // Configuration du bot Discord (serveurs, salons, annonces).
  if (name === 'discord' && typeof loadDiscordBotAdmin === 'function') {
    loadDiscordBotAdmin();
  }
}

// --- GESTION DE L'ABONNEMENT NOTIFICATIONS PUSH (PROFIL) ---
async function askForNotifications(silent = false) {
  if (!("Notification" in window) || !('serviceWorker' in navigator)) {
    if (!silent) alert("Ton navigateur ne supporte pas les notifications push.");
    return;
  }

  const permission = await Notification.requestPermission();
  updateNotifButton();
  
  if (permission === "granted") {
    try {
      await navigator.serviceWorker.register('./sw.js');
      const registration = await navigator.serviceWorker.ready;

      const subscription = (await registration.pushManager.getSubscription()) || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array('BPsir4XP8frRCjKIWrnNcXKEe48Zwe5GnNoSQbJcOwe1QORyaO7Opu8xHjMOHiavPm85OFKXlFBWBqbX-KgttbI')
      });

      if (currentUser) {
        await supabaseClient.from('nvg_subscriptions').delete()
          .eq('user_id', currentUser.id)
          .filter('subscription->>endpoint', 'eq', subscription.endpoint);

        await supabaseClient.from('nvg_subscriptions').insert([{
          user_id: currentUser.id,
          subscription: subscription
        }]);
      }

      if (!silent) alert("✅ Parfait ! Les notifications push sont activées sur cet appareil.");
    } catch (err) {
      console.error("Erreur lors de l'abonnement push :", err);
      if (!silent) alert("❌ Erreur lors de l'activation des notifications : " + err.message);
    }
  } else if (permission === "denied" && !silent) {
    alert("❌ Les notifications sont bloquées par le navigateur.");
  }
}

async function showTwitchAvatar(login) {
  const img = document.getElementById('accTwitchAvatar');
  if (!img) return;
  if (!login) {
    img.classList.add('hidden');
    img.removeAttribute('src');
    return;
  }
  const url = await getTwitchAvatar(login);
  if (url.startsWith('http')) {
    img.src = url;
    img.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
  }
}

function updateNotifButton() {
  const btn = document.getElementById('notifPermBtn');
  if (!btn) return;

  const base = 'w-full py-2.5 rounded-xl font-bold text-xs uppercase transition border';
  if (!("Notification" in window) || !('serviceWorker' in navigator)) {
    btn.disabled = true;
    btn.className = `${base} bg-white/5 text-gray-400 border-[#1f293d]`;
    btn.innerHTML = 'Non supporté sur ce navigateur';
    return;
  }

  const permission = Notification.permission;
  if (permission === 'granted') {
    btn.disabled = true;
    btn.className = `${base} bg-emerald-500/15 text-emerald-400 border-emerald-500/30`;
    btn.innerHTML = '✅ Notifications autorisées';
  } else if (permission === 'denied') {
    btn.disabled = true;
    btn.className = `${base} bg-red-600/15 text-red-400 border-red-600/30`;
    btn.innerHTML = '⛔ Bloquées par le navigateur (à réactiver dans ses paramètres)';
  } else {
    btn.disabled = false;
    btn.className = `${base} bg-amber-500/20 hover:bg-amber-500 text-amber-400 hover:text-black border-amber-500/30`;
    btn.innerHTML = '🔔 Activer les notifications';
  }
}

function showNotifPrompt() {
  if (!currentUser || !("Notification" in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

  if (Notification.permission === 'granted') {
    askForNotifications(true);
    return;
  }

  if (Notification.permission !== 'default' || document.getElementById('notifPrompt')) return;

  const reportee = localStorage.getItem('nvg_notif_prompt_reporte');
  if (reportee && Date.now() - Number(reportee) < 7 * 24 * 3600 * 1000) return;

  const prompt = document.createElement('div');
  prompt.id = 'notifPrompt';
  prompt.className = 'fixed bottom-4 left-4 right-4 md:left-auto md:w-96 z-40 bg-[#121722] border border-amber-500/40 rounded-2xl p-4 shadow-2xl flex flex-col gap-3';
  prompt.innerHTML = `
    <div class="flex items-start gap-3">
      <span class="text-xl">🔔</span>
      <div class="text-xs text-gray-300">
        <p class="font-bold text-white">Activer les notifications ?</p>
        <p>Reçois les annonces de la communauté directement sur cet appareil.</p>
      </div>
    </div>
    <div class="flex justify-end gap-2">
      <button id="notifPromptLater" class="px-3 py-2 text-xs text-gray-400 hover:text-white transition">Plus tard</button>
      <button id="notifPromptYes" class="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition">Activer</button>
    </div>
  `;
  document.body.appendChild(prompt);

  document.getElementById('notifPromptLater').onclick = () => {
    localStorage.setItem('nvg_notif_prompt_reporte', String(Date.now()));
    prompt.remove();
  };
  document.getElementById('notifPromptYes').onclick = async () => {
    prompt.remove();
    await askForNotifications();
  };
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function escapeHtmlSafe(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, match => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[match]));
}