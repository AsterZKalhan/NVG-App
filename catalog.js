// --- GESTION DU CATALOGUE DE MATÉRIEL (SUPABASE) ---

let editingCatalogId = null;

// 1. CHARGEMENT DU CATALOGUE DEPUIS SUPABASE
async function loadCatalog() {
  const { data, error } = await supabaseClient.from('nvg_equipment_catalog').select('*');
  if (error) {
    console.error("Erreur chargement catalogue :", error.message);
    return;
  }
  db.equipmentCatalog = data || [];
  renderCatalogAdmin();
}

// 2. RENDU DE LA LISTE DANS LE PANNEAU ADMIN (Trié par ordre alphabétique)
function renderCatalogAdmin() {
  const catalogList = document.getElementById('adminCatalogList');
  if (!catalogList) return;

  // Tri par ordre alphabétique du nom
  const catalog = [...(db.equipmentCatalog || [])].sort((a, b) => a.name.localeCompare(b.name));

  if (catalog.length === 0) {
    catalogList.innerHTML = `<div class="col-span-full p-4 text-center text-gray-500 text-xs italic bg-[#07090e] border border-[#1f293d] rounded-xl">Aucun matériel dans le catalogue de référence.</div>`;
    return;
  }

  catalogList.innerHTML = catalog.map(item => `
    <div class="p-3 bg-[#07090e] border border-[#1f293d] rounded-xl flex items-center justify-between gap-3 text-xs">
      <div class="flex items-center gap-3 overflow-hidden">
        <div class="w-10 h-10 rounded-lg bg-[#121722] border border-[#1f293d] overflow-hidden flex items-center justify-center shrink-0">
          ${item.img ? `<img src="${item.img}" class="w-full h-full object-contain">` : '📦'}
        </div>
        <div class="truncate">
          <strong class="text-white uppercase truncate">${item.name}</strong>
          <div class="text-[11px] text-gray-400 truncate"><span class="text-amber-400 font-bold">${item.category || ''}</span>${item.desc ? ' · ' + item.desc : ''}</div>
        </div>
      </div>
      <div class="space-x-1 shrink-0">
        <button onclick="adminEditCatalogItem('${item.id}')" class="px-2.5 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold hover:bg-amber-500 hover:text-black transition">Modifier</button>
        <button onclick="adminDeleteCatalogItem('${item.id}')" class="px-2.5 py-1 rounded bg-red-600/20 text-red-400 border border-red-600/30 font-bold hover:bg-red-600 hover:text-white transition">✕</button>
      </div>
    </div>
  `).join('');
}

// 3. PRÉPARATION DE L'ÉDITION D'UN ITEM DU CATALOGUE
function adminEditCatalogItem(id) {
  const item = db.equipmentCatalog.find(i => i.id === id);
  if (!item) return;

  document.getElementById('adminCatName').value = item.name;
  document.getElementById('adminCatDesc').value = item.desc || '';
  document.getElementById('adminCatImg').value = item.img || '';
  document.getElementById('adminCatCategory').value = item.category || 'Périphérique PC';

  editingCatalogId = id;

  const submitBtn = document.getElementById('adminCatalogSubmitBtn');
  if (submitBtn) {
    submitBtn.innerText = "💾 Enregistrer les modifications";
    submitBtn.className = "px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-lg hover:bg-emerald-500 transition md:col-span-4";
  }
}

// 4. SAUVEGARDE / CRÉATION / MODIFICATION D'UN ITEM DANS SUPABASE
// Enregistre un article du catalogue. La catégorie (Câblage, Interface audio, Interface vidéo, Périphérique PC) détermine le choix proposé aux participants.
async function adminSaveCatalogItem() {
  const name = document.getElementById('adminCatName').value.trim();
  const desc = document.getElementById('adminCatDesc').value.trim();
  const img = document.getElementById('adminCatImg').value.trim();
  const category = document.getElementById('adminCatCategory').value;

  if (!name) {
    alert("Le nom du matériel est obligatoire.");
    return;
  }

  let catalogObj;
  if (editingCatalogId) {
    catalogObj = {
      id: editingCatalogId,
      name,
      desc,
      img,
      category
    };
  } else {
    catalogObj = {
      id: 'eq_' + Date.now(),
      name,
      desc,
      img,
      category
    };
  }

  const { error } = await supabaseClient.from('nvg_equipment_catalog').upsert([catalogObj]);

  if (error) {
    alert("Erreur lors de la sauvegarde du matériel : " + error.message);
    return;
  }

  if (editingCatalogId) {
    alert("✅ Matériel mis à jour avec succès !");
    editingCatalogId = null;
    const submitBtn = document.getElementById('adminCatalogSubmitBtn');
    if (submitBtn) {
      submitBtn.innerText = "Ajouter au catalogue";
      submitBtn.className = "px-4 py-2 bg-amber-500 text-black font-bold text-xs rounded-lg hover:bg-amber-400 transition md:col-span-4";
    }
  } else {
    alert("✅ Matériel ajouté au catalogue !");
  }

  // Vider les champs du formulaire
  document.getElementById('adminCatName').value = '';
  document.getElementById('adminCatDesc').value = '';
  document.getElementById('adminCatImg').value = '';

  await loadCatalog();
}

// 5. SUPPRESSION D'UN ITEM DU CATALOGUE SUR SUPABASE
async function adminDeleteCatalogItem(id) {
  if (!confirm("Veux-tu vraiment supprimer cet élément du catalogue ?")) return;

  const { error } = await supabaseClient.from('nvg_equipment_catalog').delete().eq('id', id);

  if (error) {
    alert("Erreur lors de la suppression : " + error.message);
    return;
  }

  alert("🗑️ Élément supprimé du catalogue !");
  await loadCatalog();
}