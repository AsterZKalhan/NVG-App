// --- INITIALISATION DE L'APPLICATION PWA NVG ---

console.log("⚡ Initialisation de la PWA Normandy Viking Gaming...");

// Objet global partagé pour stocker les données de l'application
window.db = {
  events: [],
  catalog: [],
  games: [],
  notifications: [],
  users: []
};

// Variable globale pour l'utilisateur connecté
window.currentUser = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Vérification de la session Supabase existante au démarrage
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    await handleSuccessfulAuth(session.user);
  } else {
    showAuthModal();
  }
  
  // Enregistrement du Service Worker pour les notifications Push
	if ('serviceWorker' in navigator && 'PushManager' in window) {
	navigator.serviceWorker.register('./sw.js')
		.then((reg) => {
		console.log('✅ Service Worker enregistré avec succès :', reg.scope);
		})
		.catch((err) => {
		console.error('❌ Échec d\'enregistrement du Service Worker :', err);
		});
	}

  // Afficher l'onglet par défaut au démarrage
  refreshLiveStatus();
  setInterval(() => { if (!document.hidden) refreshLiveStatus(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLiveStatus(); });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) || (/android/i.test(navigator.userAgent) && /firefox/i.test(navigator.userAgent))) showInstallBanner(false);

  history.replaceState({ tab: 'calendar' }, '');
  showTab('calendar');
});

let navDepth = 0;
let suppressHistory = false;

window.addEventListener('popstate', (e) => {
  navDepth = Math.max(0, navDepth - 1);
  if (e.state && e.state.tab) {
    suppressHistory = true;
    showTab(e.state.tab);
    suppressHistory = false;
  }
});

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner(true);
});

function showInstallBanner(canInstall) {
  if (document.getElementById('installBanner')) return;
  if (window.innerWidth >= 768) return;
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) return;
  const reportee = localStorage.getItem('nvg_install_reporte');
  if (reportee && Date.now() - Number(reportee) < 7 * 24 * 3600 * 1000) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isFirefoxAndroid = /android/i.test(navigator.userAgent) && /firefox/i.test(navigator.userAgent);
  if (!canInstall && !isIOS && !isFirefoxAndroid) return;

  const manualSteps = isIOS
    ? 'Touche le bouton Partager <span class="font-bold">⬆️</span> de Safari, puis « Sur l\'écran d\'accueil ».'
    : 'Ouvre le menu <span class="font-bold">⋮</span> de Firefox, puis « Installer ».';

  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.className = 'fixed top-3 left-3 right-3 z-40 bg-[#121722] border border-red-600/50 rounded-2xl p-4 shadow-2xl flex flex-col gap-3';
  banner.innerHTML = `
    <div class="flex items-start gap-3">
      <img src="./Logos/icon-192.png" alt="" class="w-10 h-10 rounded-lg shrink-0">
      <div class="text-xs text-gray-300">
        <p class="font-bold text-white">Installer NVG Companion</p>
        ${canInstall
          ? '<p>Accède à l\'application directement depuis ton écran d\'accueil.</p>'
          : `<p>${manualSteps}</p>`}
      </div>
    </div>
    <div class="flex justify-end gap-2">
      <button id="installLater" class="px-3 py-2 text-xs text-gray-400 hover:text-white transition">Plus tard</button>
      ${canInstall ? '<button id="installYes" class="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition">Installer</button>' : ''}
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('installLater').onclick = () => {
    localStorage.setItem('nvg_install_reporte', String(Date.now()));
    banner.remove();
  };
  const yes = document.getElementById('installYes');
  if (yes) {
    yes.onclick = async () => {
      banner.remove();
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
      }
    };
  }
}

function toggleMobileMenu() {
  document.getElementById('mainNav').classList.toggle('hidden');
}

function goBack() {
  if (navDepth > 0) {
    history.back();
  } else {
    showTab('calendar');
  }
}

// Fonction globale pour basculer d'un onglet à un autre
function showTab(tabId) {
  // --- SÉCURITÉ : Bloquer l'accès selon le GRADE VIKING ---
  if (currentUser) {
    const rank = currentUser.rank;
    const role = currentUser.role; // Gardé par sécurité de rétrocompatibilité
    
    // Définition des accès selon le grade
    const isStaffOrAdmin = (rank === 'Viking' || rank === 'Grand Jarl' || rank === 'Divinité' || role === 'admin' || role === 'staff');
    const isAdminOnly = (rank === 'Grand Jarl' || rank === 'Divinité' || role === 'admin');

    // Sécurité pour l'onglet Jeux (Viking / Grand Jarl / Divinité)
    if (tabId === 'games' && !isStaffOrAdmin) {
      alert("🛡️ Accès refusé : Cette zone est réservée aux Vikings confirmés (Staff) et Jarls.");
      return; 
    }

    // Sécurité pour l'Admin et Logistique (Grand Jarl / Divinité uniquement)
    if ((tabId === 'admin' || tabId === 'logistics') && !isAdminOnly) {
      alert("🛡️ Accès refusé : Cette zone est strictement réservée aux Grand Jarls et Divinités.");
      return; 
    }
	
	// Sécurité pour l'affichage de l'onglet Live
	if (tabId === 'live') {
    loadTwitchLive();
	}
  }

  if (window.innerWidth < 768) {
    document.getElementById('mainNav').classList.add('hidden');
  }

  if (!suppressHistory && history.state?.tab !== tabId) {
    history.pushState({ tab: tabId }, '');
    navDepth++;
  }

  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => {
    tab.classList.add('hidden');
  });

  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.remove('hidden');
  }

  // Mettre en valeur le bouton actif dans la navigation
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    btn.classList.remove('bg-white/10', 'text-white', 'bg-red-600');
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId)) {
      btn.classList.add('bg-white/10', 'text-white');
    }
  });

  // Charger dynamiquement les données si l'onglet est sélectionné
  if (tabId === 'account' && typeof loadAccountTab === 'function') {
    loadAccountTab();
  }
  
  // Forcer le chargement de la liste des utilisateurs à l'ouverture de l'onglet admin
  if (tabId === 'admin' && typeof loadUsers === 'function') {
    loadUsers();
  }
}

// Gestion de l'authentification réussie
async function handleSuccessfulAuth(authUser) {
  const email = authUser.email ? authUser.email.toLowerCase() : '';
  
  const isEmailConfirmed = !!authUser.email_confirmed_at;
  
  let { data: userProfile, error } = await supabaseClient
    .from('nvg_users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  let pseudo = userProfile ? userProfile.name : (authUser.user_metadata?.pseudo || email.split('@')[0] || 'Viking');
  let role = userProfile ? userProfile.role : 'Membre';
  let rank = userProfile ? userProfile.rank : 'Petit Viking';
  let avatarUrl = userProfile ? userProfile.avatar_url : '';
  
  let isVerifiedInDb = userProfile ? (userProfile.verified ?? false) : false;

  // SYNCHRONISATION AUTOMATIQUE
  if (isEmailConfirmed && !isVerifiedInDb) {
    isVerifiedInDb = true; 
    if (userProfile) {
      await supabaseClient.from('nvg_users').update({ verified: true }).eq('id', authUser.id);
    }
  }

  const pseudoLower = pseudo.toLowerCase();

  // Attribution automatique des privilèges Divinité pour l'admin principal
  if (pseudoLower === 'asterz' || email === 'asterz@virtual-lan.fr') {
    role = 'admin';
    rank = 'Divinité';
    isVerifiedInDb = true;
  }

  currentUser = {
    id: authUser.id,
    name: pseudo,
    email: authUser.email,
    role: role,
    rank: rank,
    verified: isVerifiedInDb,
    avatar_url: avatarUrl,
    notif_baseline: userProfile ? userProfile.notif_baseline : null,
    twitch_channel: userProfile ? userProfile.twitch_channel : ''
  };

  if (!userProfile) {
    await supabaseClient.from('nvg_users').upsert([{
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      rank: currentUser.rank,
      role: currentUser.role,
      verified: currentUser.verified,
      avatar_url: currentUser.avatar_url
    }]);
  }

  loadNotifications();
  showNotifPrompt();

  const authModal = document.getElementById('authModal');
  if (authModal) authModal.classList.add('hidden');

  const profileBadge = document.getElementById('userProfileBadge');
  const userNameEl = document.getElementById('sidebarUserName');
  const userRankEl = document.getElementById('sidebarUserRank');
  const userAvatarEl = document.getElementById('sidebarUserAvatar');
  
  if (profileBadge && userNameEl && userRankEl && userAvatarEl) {
    userNameEl.textContent = currentUser.name;
    userRankEl.textContent = currentUser.rank;
    
    if (currentUser.avatar_url && currentUser.avatar_url !== 'EMPTY') {
      userAvatarEl.innerHTML = `<img src="${currentUser.avatar_url}" class="w-full h-full object-cover rounded-xl">`;
    } else {
      userAvatarEl.innerHTML = `<span class="text-xs">👤</span>`;
    }
    
    profileBadge.classList.remove('hidden');
  }

  // --- GESTION DES DROITS D'AFFICHAGE DES BOUTONS SELON LE GRADE ---
  const logisticsNavBtn = document.getElementById('navLogisticsBtn');
  const adminNavBtn = document.getElementById('navAdminBtn');
  const gamesNavBtn = document.getElementById('navGamesBtn');

  const currentRank = currentUser.rank;
  const currentRole = currentUser.role;
  const hasAdminRights = (currentRank === 'Grand Jarl' || currentRank === 'Divinité' || currentRole === 'admin');
  const hasStaffRights = (hasAdminRights || currentRank === 'Viking' || currentRole === 'staff');

  if (logisticsNavBtn) {
    if (hasAdminRights) logisticsNavBtn.classList.remove('hidden');
    else logisticsNavBtn.classList.add('hidden');
  }

  if (adminNavBtn) {
    if (hasAdminRights) adminNavBtn.classList.remove('hidden');
    else adminNavBtn.classList.add('hidden');
  }

  if (gamesNavBtn) {
    if (hasStaffRights) gamesNavBtn.classList.remove('hidden');
    else gamesNavBtn.classList.add('hidden');
  }

  await renderAll();
  showTab('calendar');
}

async function renderAll() {
  try { if (typeof loadEvents === 'function') await loadEvents(); } catch(e) { console.error("Erreur loadEvents", e); }
  try { if (typeof loadCatalog === 'function') await loadCatalog(); } catch(e) { console.error("Erreur loadCatalog", e); }
  try { if (typeof loadGames === 'function') await loadGames(); } catch(e) { console.error("Erreur loadGames", e); }
  try { if (typeof loadNotifications === 'function') await loadNotifications(); } catch(e) { console.error("Erreur loadNotifications", e); }
  try { if (typeof loadUsers === 'function') await loadUsers(); } catch(e) { console.error("Erreur loadUsers", e); }
}

function showAuthModal() {
  const authModal = document.getElementById('authModal');
  if (authModal) authModal.classList.remove('hidden');
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  window.location.reload();
}

// Remplace 'ton_nom_de_chaine_twitch' par ton vrai nom de chaîne Twitch NVG
const TWITCH_CHANNEL = 'nvgamingtv'; // Ton nom de chaîne Twitch

function loadTwitchLive() {
  const liveContainer = document.getElementById('liveContainer');
  const liveIndicator = document.getElementById('liveIndicator');

  if (!liveContainer) return;

  // Structure de la page Live
  liveContainer.innerHTML = `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f293d] pb-3">
        <h2 class="text-xl font-black text-white uppercase flex items-center gap-2">
          <span>Live NVG ⚔️</span>
        </h2>
        <div id="twitchViewerCount" class="text-xs font-bold text-gray-400 bg-[#07090e] border border-[#1f293d] px-3 py-1.5 rounded-xl w-fit flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-gray-500 inline-block"></span> <span>Vérification du direct...</span>
        </div>
      </div>

      <div class="flex flex-col gap-6">
        <!-- Lecteur Vidéo -->
        <div class="space-y-3">
          <div class="aspect-video w-full rounded-xl overflow-hidden border border-[#1f293d]">
            <iframe 
              src="https://player.twitch.tv/?channel=${TWITCH_CHANNEL}&parent=app.nvg-tv.com&parent=localhost" 
              height="100%" 
              width="100%" 
              allow="autoplay; fullscreen"
              allowfullscreen>
            </iframe>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-gray-400 px-1">
            <span>Si le lecteur indique "Hors ligne", le direct n'a pas encore commencé. Si rien ne s'affiche, ton navigateur bloque peut-être les contenus Twitch (Brave, Firefox : désactive la protection renforcée pour ce site).</span>
            <a href="https://twitch.tv/${TWITCH_CHANNEL}" target="_blank" class="text-red-500 hover:underline font-bold whitespace-nowrap">Ouvrir sur Twitch ↗</a>
          </div>
        </div>

        <!-- Chat Twitch -->
        <div class="h-[500px] w-full rounded-xl overflow-hidden border border-[#1f293d] bg-[#07090e]">
          <iframe 
            src="https://www.twitch.tv/embed/${TWITCH_CHANNEL}/chat?parent=app.nvg-tv.com&parent=localhost&darkpopout" 
            height="100%" 
            width="100%">
          </iframe>
        </div>
      </div>
    </div>
  `;

  refreshLiveStatus();
}

async function refreshLiveStatus() {
  const viewerBadge = document.getElementById('twitchViewerCount');
  const navBtn = document.getElementById('navLiveBtn');
  const navDot = document.getElementById('liveIndicator');
  const navViewers = document.getElementById('liveViewers');

  let isLive;
  let viewers = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/twitch-live?login=${TWITCH_CHANNEL}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    isLive = !!data.live;
    viewers = isLive ? data.viewers : null;
  } catch (err) {
    console.error("Erreur vérification statut Twitch", err);
    return;
  }
  if (navDot) {
    navDot.classList.toggle('bg-emerald-500', isLive);
    navDot.classList.toggle('bg-red-500', !isLive);
  }
  if (navBtn) {
    navBtn.classList.toggle('text-emerald-400', isLive);
    navBtn.classList.toggle('text-red-500', !isLive);
  }
  if (navViewers) {
    navViewers.textContent = isLive && viewers !== null ? `👁 ${viewers}` : '';
  }

  if (viewerBadge) {
    if (!isLive) {
      viewerBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500 inline-block"></span> <span>Chaîne hors ligne</span>`;
    } else {
      const label = viewers !== null ? `${viewers} spectateurs en direct` : 'En direct';
      viewerBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span> <span class="text-white font-bold">${label}</span>`;
    }
  }
}
