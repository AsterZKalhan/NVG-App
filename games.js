// --- GESTION DES PROPOSITIONS DE JEUX ---

// Charger et afficher la liste des jeux proposés
async function loadGames() {
  const { data: games, error } = await supabaseClient
    .from('nvg_games')
    .select('*')
    .order('votes', { ascending: false });

  if (error) {
    console.error("Erreur chargement jeux :", error);
    return;
  }

  const container = document.getElementById('gamesList');
  if (!container) return;

  if (!games || games.length === 0) {
    container.innerHTML = `<p class="text-xs text-gray-400 md:col-span-3">Aucun jeu proposé pour le moment.</p>`;
    return;
  }

  const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'Divinité');

  container.innerHTML = games.map(game => `
    <div class="bg-[#121722] border border-[#1f293d] rounded-2xl overflow-hidden flex flex-col justify-between shadow-lg group">
      <div>
        ${game.img && game.img.startsWith('http') ? `
          <div class="h-32 w-full overflow-hidden bg-black/40 border-b border-[#1f293d]">
            <img src="${escapeHtml(game.img)}" referrerpolicy="no-referrer" alt="Bannière" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.style.display='none'">
          </div>
        ` : ''}
        <div class="p-5 space-y-2">
          <h3 class="text-sm font-black text-white uppercase tracking-wider">${escapeHtml(game.title)}</h3>
          ${game.link && game.link !== 'NULL' ? `<a href="${game.link.startsWith('http') ? escapeHtml(game.link) : 'https://' + escapeHtml(game.link)}" target="_blank" class="text-xs text-red-400 hover:underline inline-block truncate max-w-full">🔗 Lien externe</a>` : ''}
          <p class="text-[11px] text-gray-400 pt-1">Proposé par : <span class="text-white font-bold">${escapeHtml(game.author || 'Anonyme')}</span></p>
        </div>
      </div>

      <div class="p-5 pt-0 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-amber-400">🔥 ${game.votes || 0} votes</span>
          <button onclick="voteGame('${game.id}', ${game.votes || 0})" class="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-lg transition">+1</button>
        </div>

        ${isAdmin ? `
          <div class="flex gap-2">
            <!-- Modification ici pour transmettre l'URL de l'image actuelle à la fonction d'édition -->
            <button onclick="editGamePrompt('${game.id}', '${escapeHtml(game.title).replace(/'/g, "\\'")}', '${escapeHtml(game.link || '').replace(/'/g, "\\'")}', '${escapeHtml(game.img || '').replace(/'/g, "\\'")}')" class="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-400 hover:text-black text-[11px] font-bold rounded-lg transition">Éditer ✏️</button>
            <button onclick="deleteGame('${game.id}')" class="px-2.5 py-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-[11px] font-bold rounded-lg transition">Supprimer 🗑️</button>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// Proposer un nouveau jeu
async function addGameProposal() {
  const titleInput = document.getElementById('gameTitle');
  const linkInput = document.getElementById('gameLink');
  const imgInput = document.getElementById('gameImg'); // Récupération du nouveau champ

  if (!titleInput) return;

  const title = titleInput.value.trim();
  const link = linkInput ? linkInput.value.trim() : '';
  const imgUrl = imgInput ? imgInput.value.trim() : '';

  if (!title) {
    alert("Veuillez saisir au moins le nom du jeu.");
    return;
  }

  const uniqueId = 'game_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  const gameObj = {
    id: uniqueId,
    title: title,
    link: link,
    img: imgUrl, // Enregistrement direct en base
    author: currentUser ? currentUser.name : 'Viking Anonyme',
    votes: 0
  };

  const { error } = await supabaseClient
    .from('nvg_games')
    .insert([gameObj]);

  if (error) {
    alert("Erreur lors de la proposition du jeu : " + error.message);
    return;
  }

  titleInput.value = '';
  if (linkInput) linkInput.value = '';
  if (imgInput) imgInput.value = '';
  
  alert("🎮 Jeu proposé avec succès !");
  loadGames();
}

// Voter pour un jeu (+1)
async function voteGame(gameId, currentVotes) {
  const { error } = await supabaseClient
    .from('nvg_games')
    .update({ votes: (currentVotes || 0) + 1 })
    .eq('id', gameId);

  if (error) {
    console.error("Erreur vote :", error);
    return;
  }

  loadGames();
}

// Fonction pour supprimer un jeu (Admin)
async function deleteGame(gameId) {
  if (!confirm("Es-tu sûr de vouloir supprimer cette proposition de jeu ?")) return;

  const { error } = await supabaseClient
    .from('nvg_games')
    .delete()
    .eq('id', gameId);

  if (error) {
    alert("Erreur lors de la suppression : " + error.message);
    return;
  }

  loadGames();
}

// Fonction pour éditer un jeu (Admin)
async function editGamePrompt(gameId, currentTitle, currentLink, currentImg) {
  const newTitle = prompt("Modifier le nom du jeu :", currentTitle);
  if (newTitle === null) return;

  const newLink = prompt("Modifier le lien (Steam / Web) :", currentLink);
  if (newLink === null) return;
  
  // Demande l'URL de l'image lors de l'édition
  const newImg = prompt("Modifier l'URL de l'image :", currentImg !== 'NULL' && currentImg !== 'null' ? currentImg : '');
  if (newImg === null) return;

  const { error } = await supabaseClient
    .from('nvg_games')
    .update({ 
      title: newTitle.trim(), 
      link: newLink.trim(),
      img: newImg.trim()
    })
    .eq('id', gameId);

  if (error) {
    alert("Erreur lors de la modification : " + error.message);
    return;
  }

  loadGames();
}

// Sécurité anti-XSS de base
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}