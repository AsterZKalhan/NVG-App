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
}

async function saveAccountChanges() {
  if (!currentUser) return;

  const newPseudo = document.getElementById('accPseudoInput').value.trim();
  const newAvatar = document.getElementById('accAvatarInput').value.trim();
  const newPassword = document.getElementById('accPasswordInput').value.trim();

  let updates = {};
  if (newPseudo) updates.name = newPseudo;
  if (newAvatar) updates.avatar_url = newAvatar;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabaseClient.from('nvg_users').update(updates).eq('id', currentUser.id);
    if (error) {
      alert("Erreur lors de la mise à jour du profil : " + error.message);
      return;
    }
  }

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

  const tbody = document.getElementById('adminUsersTable');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-xs text-gray-400">Aucun utilisateur trouvé.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(user => `
    <tr class="border-b border-[#1f293d] hover:bg-white/5 transition">
      <td class="p-3 flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-[#07090e] border border-[#1f293d] flex items-center justify-center overflow-hidden shrink-0">
          ${user.avatar_url && user.avatar_url !== 'EMPTY' ? `<img src="${escapeHtmlSafe(user.avatar_url)}" class="w-full h-full object-cover">` : '👤'}
        </div>
        <div>
          <div class="text-xs font-bold text-white">${escapeHtmlSafe(user.name)}</div>
          <div class="text-[10px] text-gray-400">${escapeHtmlSafe(user.email)}</div>
        </div>
      </td>
      <td class="p-3 text-xs">
        <button onclick="toggleUserVerification('${user.id}', ${user.verified})" class="px-2 py-1 rounded border ${user.verified ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-amber-500/30 text-amber-400 bg-amber-500/10'} hover:bg-white/10 transition">
          ${user.verified ? '✓ Vérifié' : '⏳ En attente'}
        </button>
      </td>
      <td class="p-3">
        <!-- LISTE DÉROULANTE UNIFIÉE (Grade + Rôle) -->
        <select onchange="updateUserRankAndRole('${user.id}', this.value)" class="bg-[#07090e] border border-[#1f293d] rounded-lg px-2 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none">
          <option value="Petit Viking" ${user.rank === 'Petit Viking' ? 'selected' : ''}>Petit Viking (Membre)</option>
          <option value="Viking" ${user.rank === 'Viking' ? 'selected' : ''}>Viking (Staff)</option>
          <option value="Grand Jarl" ${user.rank === 'Grand Jarl' || user.rank === 'Jarl' ? 'selected' : ''}>Grand Jarl (Admin)</option>
          <option value="Divinité" ${user.rank === 'Divinité' ? 'selected' : ''}>Divinité (Admin)</option>
        </select>
      </td>
      <td class="p-3">
        <button onclick="deleteUser('${user.id}')" class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-[10px] font-bold rounded-xl transition">
          Supprimer 🗑️
        </button>
      </td>
    </tr>
  `).join('');
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
    }
  }
}

async function toggleUserVerification(userId, currentStatus) {
  const { error } = await supabaseClient.from('nvg_users').update({ verified: !currentStatus }).eq('id', userId);
  if (error) alert("Erreur : " + error.message);
  else loadUsers();
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
}

// --- GESTION DE L'ABONNEMENT NOTIFICATIONS PUSH (PROFIL) ---
async function askForNotifications(silent = false) {
  if (!("Notification" in window) || !('serviceWorker' in navigator)) {
    if (!silent) alert("Ton navigateur ne supporte pas les notifications push.");
    return;
  }

  const permission = await Notification.requestPermission();
  
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