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
  // Vérifier la session utilisateur au démarrage
  if (typeof checkUserSession === 'function') {
    await checkUserSession();
  }

  // Charger les données initiales si les fonctions existent
  if (typeof loadEvents === 'function') loadEvents();
  if (typeof loadCatalog === 'function') loadCatalog();
  if (typeof loadGames === 'function') loadGames();
  if (typeof loadNotifications === 'function') loadNotifications();

  // Afficher l'onglet par défaut au démarrage (ex: calendrier)
  showTab('calendar');
});

// Fonction globale pour basculer d'un onglet à un autre
function showTab(tabId) {
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
    btn.classList.remove('bg-white/10', 'text-white');
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId)) {
      btn.classList.add('bg-white/10', 'text-white');
    }
  });
}