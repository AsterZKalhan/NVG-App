// --- GESTION DES ÉVÉNEMENTS & LOGISTIQUE (SUPABASE) ---

let editingEventId = null;
let currentEventFilter = 'upcoming';

function switchEventFilter(filter) {
  currentEventFilter = filter;
  const btnUpcoming = document.getElementById('filterBtnUpcoming');
  const btnPast = document.getElementById('filterBtnPast');

  if (filter === 'upcoming') {
    if (btnUpcoming) btnUpcoming.className = "px-4 py-2 rounded-xl text-xs font-bold bg-red-600 text-white shadow transition";
    if (btnPast) btnPast.className = "px-4 py-2 rounded-xl text-xs font-bold bg-[#121722] text-gray-400 border border-[#1f293d] hover:text-white transition";
  } else {
    if (btnPast) btnPast.className = "px-4 py-2 rounded-xl text-xs font-bold bg-red-600 text-white shadow transition";
    if (btnUpcoming) btnUpcoming.className = "px-4 py-2 rounded-xl text-xs font-bold bg-[#121722] text-gray-400 border border-[#1f293d] hover:text-white transition";
  }
  renderPublicEvents();
}

async function loadEvents() {
  const { data, error } = await supabaseClient.from('nvg_events').select('*');
  if (error) {
    console.error("Erreur chargement événements :", error.message);
    return;
  }
  db.events = data || [];
  renderPublicEvents();
  if (typeof renderEventsAdmin === 'function') renderEventsAdmin();
  updateAdminLogisticsSelector();
}

function updateAdminLogisticsSelector() {
  const sel = document.getElementById('adminLogisticsEventSelector');
  if (sel) {
    sel.innerHTML = db.events.map(e => `<option value="${e.id}">${e.title} (${e.date_debut || ''})</option>`).join('');
    renderAdminLogisticsDetails();
  }
}

// Fonction utilitaire pour formater l'affichage des périodes (ex: Du 31 Oct au 01 Nov 2026 ou Du 04 au 07 Nov)
function formatEventDateRange(startDateStr, endDateStr) {
  if (!startDateStr) return '';
  if (!endDateStr || startDateStr === endDateStr) {
    const d = new Date(startDateStr);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  const startDay = start.getDate();
  const startMonth = start.toLocaleDateString('fr-FR', { month: 'short' });
  const startYear = start.getFullYear();

  const endDay = end.getDate();
  const endMonth = end.toLocaleDateString('fr-FR', { month: 'short' });
  const endYear = end.getFullYear();

  const padDay = (d) => d < 10 ? '0' + d : d;

  if (startMonth === endMonth && startYear === endYear) {
    return `Du ${padDay(startDay)} au ${padDay(endDay)} ${startMonth} ${startYear}`;
  } else if (startYear === endYear) {
    return `Du ${padDay(startDay)} ${startMonth} au ${padDay(endDay)} ${endMonth} ${startYear}`;
  } else {
    return `Du ${padDay(startDay)} ${startMonth} ${startYear} au ${padDay(endDay)} ${endMonth} ${endYear}`;
  }
}

const eventLogos = {
  'NVG Spring': 'logo-nvg-spring.png',
  'NVG Summer': 'logo-nvg-summer.png',
  'NVG Autumn': 'logo-nvg-autumn.png',
  'NVG Winter': 'logo-nvg-winter.png',
  'Nieuwheim': 'logo-nieuwheim.png'
};

function renderPublicEvents() {
  const container = document.getElementById('publicEventsList');
  if (!container) return;

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredEvents = db.events.filter(ev => {
    const evDate = ev.date_debut || todayStr;
    const isUpcoming = evDate >= todayStr;
    return currentEventFilter === 'upcoming' ? isUpcoming : !isUpcoming;
  });

  filteredEvents.sort((a, b) => {
    const dateA = a.date_debut || '';
    const dateB = b.date_debut || '';
    return currentEventFilter === 'upcoming' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
  });

  if (filteredEvents.length === 0) {
    container.innerHTML = `<div class="col-span-full p-8 text-center text-gray-500 text-xs italic bg-[#121722]/90 border border-[#1f293d] rounded-xl">Aucun événement dans cette catégorie pour le moment.</div>`;
    return;
  }

  container.innerHTML = filteredEvents.map(ev => {
    const logoSrc = `./Logos/${eventLogos[ev.category] || 'logo-nvg.png'}`;
    const dateDisplay = formatEventDateRange(ev.date_debut, ev.date_fin);
    
    const attendance = ev.attendance || [];
    const userAttendance = currentUser ? attendance.find(a => a.userId === currentUser.id) : null;
    const isParticipating = !!userAttendance;

    return `
      <div class="event-card backdrop-blur-md border-2 rounded-xl p-5 flex flex-col justify-between shadow relative">
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="text-sm font-black uppercase text-red-500">${dateDisplay}</span>
            <h4 class="text-xl md:text-2xl font-black text-white mt-1">${ev.title.replace(/^\[NVG (Spring|Summer|Autumn|Winter)\]/, '[NVG]')}</h4>
            <p class="text-xs text-gray-400 mt-1">📍 ${ev.location}</p>
          </div>
          <img src="${logoSrc}" alt="${ev.category}" onerror="this.onerror=null;this.src='./Logos/logo-nvg.png'" class="w-40 h-40 object-contain shrink-0 bg-black/40 p-1 rounded-lg border border-[#1f293d]">
        </div>
        <p class="text-xs md:text-sm text-gray-300 mt-3">${ev.description}</p>
        
        <div class="mt-4 pt-3 border-t border-[#1f293d] space-y-3">
          ${isPetitViking() ? '' : `
            <button onclick="openAttendanceModal('${ev.id}')" class="w-full py-2 rounded-lg text-xs font-bold transition ${isParticipating ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600 hover:text-white' : 'bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600 hover:text-white'}">
              ${isParticipating ? '✅ Je participe à cet événement (modifier ma présence)' : '🚀 Je m\'inscris'}
            </button>
          `}
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2 text-xs text-gray-400 min-w-0">
              <span class="font-bold shrink-0">Où regarder :</span>
              ${renderWatchBlock(ev)}
            </div>
            ${isPetitViking() ? '' : `<span class="text-[11px] text-gray-400 font-bold ml-auto">Participants : ${attendance.length}</span>`}
          </div>
        </div>
      </div>
    `;
  }).join('');

  hydrateTwitchAvatars(container);
}

function isPetitViking() {
  return !currentUser || currentUser.rank === 'Petit Viking';
}

function renderWatchBlock(ev) {
  const streams = ev.streams || [];

  if (ev.watch_mode === 'chaine') {
    return `<button onclick="showTab('live')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition">📺 Rejoindre le stream</button>`;
  }

  if (ev.watch_mode === 'liste' && streams.length > 0) {
    return `
      <details class="relative">
        <summary class="list-none cursor-pointer inline-block px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition">📺 Sélectionner le stream ▾</summary>
        <div class="absolute left-0 top-full mt-1 z-20 w-64 space-y-1 bg-[#07090e] border border-[#1f293d] rounded-xl p-1 shadow-2xl">
          ${streams.map(login => `
            <a href="https://twitch.tv/${login}" target="_blank" rel="noopener" class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-xs text-white">
              <img data-twitch-avatar="${login}" alt="" class="w-6 h-6 rounded-full bg-[#121722] object-cover shrink-0">
              <span class="truncate">${login}</span>
            </a>
          `).join('')}
        </div>
      </details>
    `;
  }

  return `<span class="text-xs text-gray-400 font-mono">à venir</span>`;
}

const twitchAvatarCache = {};

async function getTwitchAvatar(login) {
  if (!(login in twitchAvatarCache)) {
    try {
      const res = await fetch(`https://decapi.me/twitch/avatar/${login}`);
      twitchAvatarCache[login] = (await res.text()).trim();
    } catch (err) {
      twitchAvatarCache[login] = '';
    }
  }
  return twitchAvatarCache[login];
}

async function hydrateTwitchAvatars(root) {
  const imgs = root.querySelectorAll('img[data-twitch-avatar]');
  for (const img of imgs) {
    const login = img.dataset.twitchAvatar;
    const url = await getTwitchAvatar(login);
    if (url.startsWith('http')) img.src = url;
  }
}

// Ouvrir la modale de présence
function openAttendanceModal(evId) {
  if (!currentUser) return;
  const ev = db.events.find(e => e.id === evId);
  if (!ev) return;

  document.getElementById('modalEventId').value = evId;

  const attendance = ev.attendance || [];
  const userAttendance = attendance.find(a => a.userId === currentUser.id) || {
    arrivalTime: '',
    soiree: 'jeu',
    gearItems: []
  };

  document.getElementById('modalArrivalTime').value = userAttendance.arrivalTime || '';
  document.getElementById('modalCarpoolStatus').value = userAttendance.soiree || 'jeu';

  const modalFooterAction = document.getElementById('modalFooterActions');
  if (modalFooterAction) {
    const isParticipating = !!attendance.find(a => a.userId === currentUser.id);
    modalFooterAction.innerHTML = `
      ${isParticipating ? `<button type="button" onclick="cancelAttendance('${evId}')" class="py-2.5 px-4 rounded-xl bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600 hover:text-white font-bold text-xs uppercase transition">Se désinscrire</button>` : ''}
      <button type="button" onclick="closeAttendanceModal()" class="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs uppercase transition">Annuler</button>
      <button type="button" onclick="saveAttendanceModal()" class="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase shadow-lg transition">Enregistrer 💾</button>
    `;
  }

  const catalogContainer = document.getElementById('modalCatalogCheckboxes');
  const catalog = [...(db.equipmentCatalog || [])].sort((a, b) => a.name.localeCompare(b.name));

  const isNieuwheim = ev.category === 'Nieuwheim';
  document.getElementById('modalGearSection').classList.toggle('hidden', isNieuwheim);

  document.getElementById('modalCableLines').innerHTML = '';

  if (isNieuwheim) {
    catalogContainer.innerHTML = '';
  } else if (catalog.length === 0) {
    catalogContainer.className = "space-y-2.5 bg-[#07090e] border border-[#1f293d] rounded-xl p-3";
    catalogContainer.innerHTML = `<p class="text-xs text-gray-500 italic">Aucun matériel de référence dans le catalogue.</p>`;
  } else {
    catalogContainer.className = "max-h-80 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-[#07090e] border border-[#1f293d] rounded-xl p-3";
    
    catalogContainer.innerHTML = renderGearCheckboxes(catalog.filter(item => item.category !== CABLE_CATEGORY), userAttendance);
    renderCableLines(catalog.filter(item => item.category === CABLE_CATEGORY), userAttendance);
  }

  document.getElementById('attendanceModal').classList.remove('hidden');
}

const CATALOG_CATEGORIES = ['Interface audio', 'Interface vidéo', 'Périphérique PC'];
const CABLE_CATEGORY = 'Câblage';
const CABLE_LENGTHS = [1, 2, 3, 5, 10, 15, 20];
const CABLE_COLORS = ['noir', 'blanc', 'rouge', 'bleu', 'jaune', 'vert', 'gris', 'rose', 'orange'];

function renderGearCheckboxes(items, userAttendance) {
  return CATALOG_CATEGORIES.map(category => {
    const group = items.filter(item => (item.category || 'Périphérique PC') === category);
    if (group.length === 0) return '';

    const cards = group.map(item => {
      const existingGear = userAttendance.gearItems ? userAttendance.gearItems.find(g => g.name === item.name && !g.length) : null;
      const isChecked = !!existingGear;
      const quantity = existingGear ? existingGear.quantity : 1;

      return `
        <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#121722] border border-[#1f293d]">
          <label class="flex items-center gap-2.5 cursor-pointer flex-1 overflow-hidden">
            <input type="checkbox" value="${item.name}" data-img="${item.img || ''}" ${isChecked ? 'checked' : ''} class="catalog-gear-checkbox rounded bg-[#07090e] border-[#1f293d] text-red-600 focus:ring-0 shrink-0">
            <div class="w-7 h-7 rounded bg-[#07090e] border border-[#1f293d] overflow-hidden flex items-center justify-center shrink-0">
              ${item.img ? `<img src="${item.img}" class="w-full h-full object-contain">` : '📦'}
            </div>
            <div class="truncate">
              <span class="font-bold text-white text-[11px] block truncate">${item.name}</span>
            </div>
          </label>
          <div class="flex items-center gap-1 shrink-0">
            <span class="text-[9px] text-gray-400 font-bold uppercase">Qté:</span>
            <input type="number" min="1" value="${quantity}" class="catalog-gear-qty w-12 bg-[#07090e] border border-[#1f293d] rounded px-1.5 py-1 text-xs text-white text-center focus:outline-none focus:border-red-600" data-name="${item.name}">
          </div>
        </div>
      `;
    }).join('');

    return `<div class="col-span-full text-[10px] text-gray-400 uppercase font-bold pt-1">${category}</div>${cards}`;
  }).join('');
}

function renderCableLines(cableItems, userAttendance) {
  document.getElementById('modalCableLines').innerHTML = '';
  (userAttendance.gearItems || []).filter(g => g.length).forEach(g => {
    const item = cableItems.find(i => i.name === g.name);
    if (item) addCableLine(item.id, g.length, g.color, g.quantity);
  });
}

function addCableLine(itemId = '', length = '', color = '', quantity = 1) {
  const cableItems = (db.equipmentCatalog || []).filter(item => item.category === CABLE_CATEGORY).sort((a, b) => a.name.localeCompare(b.name));
  if (cableItems.length === 0) {
    alert("Aucun câble dans le catalogue. Ajoute-en dans la catégorie Câblage.");
    return;
  }

  const row = document.createElement('div');
  row.className = 'cable-line flex flex-wrap items-center gap-2 p-2 rounded-lg bg-[#121722] border border-[#1f293d]';
  row.innerHTML = `
    <select class="cable-item flex-1 min-w-[140px] bg-[#07090e] border border-[#1f293d] rounded-lg px-2 py-1.5 text-xs text-white">
      ${cableItems.map(item => `<option value="${item.id}" ${item.id === itemId ? 'selected' : ''}>${item.name}</option>`).join('')}
    </select>
    <select class="cable-length bg-[#07090e] border border-[#1f293d] rounded-lg px-2 py-1.5 text-xs text-white">
      ${CABLE_LENGTHS.map(l => `<option value="${l}" ${String(l) === String(length) ? 'selected' : ''}>${l} m</option>`).join('')}
    </select>
    <select class="cable-color bg-[#07090e] border border-[#1f293d] rounded-lg px-2 py-1.5 text-xs text-white">
      ${CABLE_COLORS.map(c => `<option value="${c}" ${c === color ? 'selected' : ''}>${c}</option>`).join('')}
    </select>
    <div class="flex items-center gap-1">
      <span class="text-[9px] text-gray-400 font-bold uppercase">Qté:</span>
      <input type="number" min="1" value="${quantity}" class="cable-qty w-12 bg-[#07090e] border border-[#1f293d] rounded px-1.5 py-1 text-xs text-white text-center focus:outline-none focus:border-red-600">
    </div>
    <button type="button" onclick="this.closest('.cable-line').remove()" class="px-2 py-1 rounded text-red-400 hover:text-white hover:bg-red-600 transition text-xs font-bold">✕</button>
  `;
  document.getElementById('modalCableLines').appendChild(row);
}

function collectCableGear() {
  return Array.from(document.querySelectorAll('#modalCableLines .cable-line')).map(row => {
    const item = (db.equipmentCatalog || []).find(i => i.id === row.querySelector('.cable-item').value);
    if (!item) return null;
    return {
      name: item.name,
      img: item.img || '',
      quantity: parseInt(row.querySelector('.cable-qty').value) || 1,
      length: Number(row.querySelector('.cable-length').value),
      color: row.querySelector('.cable-color').value
    };
  }).filter(Boolean);
}

function closeAttendanceModal() {
  document.getElementById('attendanceModal').classList.add('hidden');
}

async function cancelAttendance(evId) {
  if (!confirm("Veux-tu vraiment te désinscrire de cet événement ?")) return;

  const ev = db.events.find(e => e.id === evId);
  if (!ev) return;

  let attendance = ev.attendance || [];
  attendance = attendance.filter(a => a.userId !== currentUser.id);

  const { error } = await supabaseClient
    .from('nvg_events')
    .update({ attendance: attendance })
    .eq('id', evId);

  if (error) {
    alert("Erreur lors de la désinscription : " + error.message);
    return;
  }

  alert("👋 Tu t'es désinscrit de l'événement.");
  closeAttendanceModal();
  await loadEvents();
}

async function saveAttendanceModal() {
  const evId = document.getElementById('modalEventId').value;
  const arrivalTime = document.getElementById('modalArrivalTime').value;
  const soiree = document.getElementById('modalCarpoolStatus').value;

  const checkboxes = document.querySelectorAll('.catalog-gear-checkbox:checked');
  const checkboxGear = Array.from(checkboxes).map(cb => {
    const name = cb.value;
    const img = cb.getAttribute('data-img');
    const container = cb.closest('div.flex');
    const qtyInput = container ? container.querySelector('.catalog-gear-qty') : null;
    const quantity = qtyInput ? parseInt(qtyInput.value) || 1 : 1;

    return { name, img, quantity };
  });
  const gearItems = [...checkboxGear, ...collectCableGear()];

  const ev = db.events.find(e => e.id === evId);
  if (!ev) return;

  let attendance = ev.attendance || [];
  let existingIndex = attendance.findIndex(a => a.userId === currentUser.id);

  const participationData = {
    userId: currentUser.id,
    userName: currentUser.name,
    arrivalTime,
    soiree,
    gearItems
  };

  if (existingIndex >= 0) {
    attendance[existingIndex] = participationData;
  } else {
    attendance.push(participationData);
  }

  const { error } = await supabaseClient
    .from('nvg_events')
    .update({ attendance: attendance })
    .eq('id', evId);

  if (error) {
    alert("Erreur lors de la sauvegarde de la présence : " + error.message);
    return;
  }

  alert("✅ Présence et matériel enregistrés avec succès !");
  closeAttendanceModal();
  await loadEvents();
}

function renderLogisticsSummary(attendance) {
  const groups = {};
  attendance.forEach(a => (a.gearItems || []).forEach(gear => {
    const item = (db.equipmentCatalog || []).find(i => i.name === gear.name);
    const category = item && item.category ? item.category : 'Périphérique PC';
    const label = gear.length ? `${gear.name} · ${gear.length} m${gear.color ? ' · ' + gear.color : ''}` : gear.name;
    const key = `${gear.name}|${gear.length || ''}|${gear.color || ''}`;
    groups[category] = groups[category] || {};
    const entry = groups[category][key] || { label, img: gear.img, total: 0, who: [] };
    entry.total += Number(gear.quantity) || 0;
    entry.who.push(`${a.userName} (${gear.quantity})`);
    groups[category][key] = entry;
  }));

  const order = [CABLE_CATEGORY, ...CATALOG_CATEGORIES];
  const sections = order.filter(cat => groups[cat]).map(cat => `
    <div class="space-y-2">
      <div class="text-[10px] text-gray-400 uppercase font-bold">${cat}</div>
      ${Object.values(groups[cat]).map(e => `
        <div class="flex items-center justify-between gap-3 p-2 bg-[#121722] border border-[#1f293d] rounded-lg">
          <div class="min-w-0">
            <div class="font-bold text-white text-xs truncate">${e.label}</div>
            <div class="text-[10px] text-gray-400 truncate">${e.who.join(', ')}</div>
          </div>
          <span class="text-emerald-400 font-black text-sm shrink-0">× ${e.total}</span>
        </div>
      `).join('')}
    </div>
  `).join('');

  if (!sections) return '';
  return `
    <div class="space-y-4 p-4 bg-[#07090e] border border-[#1f293d] rounded-xl">
      <h3 class="text-xs font-bold text-white uppercase tracking-wider">Matériel par catégorie</h3>
      ${sections}
    </div>
  `;
}

function renderAdminLogisticsDetails() {
  const container = document.getElementById('adminLogisticsContent');
  const sel = document.getElementById('adminLogisticsEventSelector');
  if (!container || !sel) return;

  const evId = sel.value;
  const ev = db.events.find(e => e.id === evId);

  if (!ev || !ev.attendance || ev.attendance.length === 0) {
    container.innerHTML = `<p class="text-xs text-gray-500 italic">Aucun Viking inscrit pour le moment sur cet événement.</p>`;
    return;
  }

  const soireeLabels = {
    stream: '🎥 Stream sur sa chaîne',
    jeu: '🎮 Joue uniquement'
  };

  container.innerHTML = `
    ${renderLogisticsSummary(ev.attendance)}
    <h3 class="text-xs font-bold text-white uppercase tracking-wider mb-3">Liste des inscrits, transports et matériel apporté :</h3>
    <div class="space-y-4">
      ${ev.attendance.map(a => `
        <div class="p-4 bg-[#07090e] border border-[#1f293d] rounded-xl space-y-3 text-xs">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 border-b border-[#1f293d] pb-2">
            <div>
              <div class="font-black text-white text-sm flex items-center gap-2">
                👤 ${a.userName} 
                <span class="text-[10px] text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded">Arrivée : ${a.arrivalTime || 'Non précisée'}</span>
              </div>
              <div class="text-[11px] text-amber-400 font-bold mt-1">${soireeLabels[a.soiree] || ''}</div>
            </div>
          </div>
          
          <div>
            <span class="text-[10px] text-gray-400 uppercase font-bold block mb-1.5">📦 Matériel apporté :</span>
            ${a.gearItems && a.gearItems.length > 0 ? `
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                ${a.gearItems.map(gear => `
                  <div class="flex items-center gap-2.5 p-2 bg-[#121722] border border-[#1f293d] rounded-lg">
                    <div class="w-8 h-8 rounded bg-[#07090e] border border-[#1f293d] overflow-hidden flex items-center justify-center shrink-0">
                      ${gear.img ? `<img src="${gear.img}" class="w-full h-full object-contain">` : '📦'}
                    </div>
                    <div class="truncate flex-1">
                      <div class="font-bold text-white text-xs truncate">${gear.name}${gear.length ? ` · ${gear.length} m${gear.color ? ' · ' + gear.color : ''}` : ''}</div>
                      <div class="text-[10px] text-emerald-400 font-bold">Quantité : ${gear.quantity}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `<p class="text-gray-500 italic text-[11px]">Rien de particulier apporté.</p>`}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderEventsAdmin() {
  const eventsList = document.getElementById('adminEventsList');
  if (!eventsList) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const sortedEvents = [...db.events].sort((a, b) => (a.date_debut || '').localeCompare(b.date_debut || ''));

  eventsList.innerHTML = sortedEvents.map(ev => {
    const evDate = ev.date_debut || todayStr;
    const isPast = evDate < todayStr;
    const dateColorClass = isPast ? 'text-red-500' : 'text-emerald-400 font-bold';
    const dateDisplay = formatEventDateRange(ev.date_debut, ev.date_fin);

    return `
      <div class="p-3 bg-[#07090e] border border-[#1f293d] rounded-lg flex items-center justify-between text-xs">
        <div>
          <span class="${dateColorClass} mr-2">[${dateDisplay}]</span>
          <strong class="text-white">${ev.title}</strong> 
          <span class="text-gray-400 ml-2">(${ev.category})</span>
        </div>
        <div class="space-x-2">
          <button onclick="adminEditEvent('${ev.id}')" class="px-2.5 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold hover:bg-amber-500 hover:text-black transition">Modifier</button>
          <button onclick="adminDeleteEvent('${ev.id}')" class="px-2.5 py-1 rounded bg-red-600/20 text-red-400 border border-red-600/30 font-bold hover:bg-red-600 hover:text-white transition">Supprimer</button>
        </div>
      </div>
    `;
  }).join('');
}

function adminEditEvent(id) {
  const ev = db.events.find(e => e.id === id);
  if (!ev) return;

  document.getElementById('adminNewEvTitle').value = ev.title.replace(/^\[(NVG( Spring| Summer| Autumn| Winter)?|Nieuwheim)\]\s*/i, '');
  document.getElementById('adminNewEvStartDate').value = ev.date_debut || '';
  document.getElementById('adminNewEvStartTime').value = ev.start_time || '';
  document.getElementById('adminNewEvEndDate').value = ev.date_fin || '';
  document.getElementById('adminNewEvEndTime').value = ev.end_time || '';
  document.getElementById('adminNewEvCategory').value = ev.category === 'NVG' ? 'NVG Spring' : ev.category;
  document.getElementById('adminNewEvLoc').value = ev.location;
  document.getElementById('adminNewEvDropbox').value = ev.dropbox_url || '';
  document.getElementById('adminNewEvDesc').value = ev.description;
  document.getElementById('adminNewEvWatch').value = ev.watch_mode || 'none';
  adminStreams = [...(ev.streams || [])];
  adminWatchModeChanged();
  renderAdminStreams();

  editingEventId = id;

  const createBtn = document.getElementById('adminEventSubmitBtn');
  if (createBtn) {
    createBtn.innerText = "💾 Enregistrer les modifications";
    createBtn.className = "px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-lg hover:bg-emerald-500 transition md:col-span-2";
  }
}

async function adminSaveEventForm() {
  const title = document.getElementById('adminNewEvTitle').value.trim();
  const startDate = document.getElementById('adminNewEvStartDate').value.trim();
  const startTime = document.getElementById('adminNewEvStartTime').value.trim();
  const endDate = document.getElementById('adminNewEvEndDate').value.trim();
  const endTime = document.getElementById('adminNewEvEndTime').value.trim();
  const category = document.getElementById('adminNewEvCategory').value;
  const loc = document.getElementById('adminNewEvLoc').value.trim();
  const dropbox_url = document.getElementById('adminNewEvDropbox').value.trim() || 'https://drive.google.com';
  const description = document.getElementById('adminNewEvDesc').value.trim();
  const titlePrefix = category.startsWith('NVG') ? 'NVG' : category;
  const fullTitle = `[${titlePrefix}] ${title.replace(/^\[(NVG( Spring| Summer| Autumn| Winter)?|Nieuwheim)\]\s*/i, '')}`;
  const watch_mode = document.getElementById('adminNewEvWatch').value;
  const streams = watch_mode === 'liste' ? [...adminStreams] : [];
  
  if (!title || !startDate) {
    alert("Le titre et la date de début sont obligatoires.");
    return;
  }

  if (watch_mode === 'liste' && streams.length === 0) {
    alert("Ajoute au moins une chaîne Twitch à la liste, ou choisis une autre option.");
    return;
  }

  let eventObj;
  if (editingEventId) {
    const existing = db.events.find(e => e.id === editingEventId);
    eventObj = {
      id: editingEventId,
      title: fullTitle,
      date_debut: startDate,
      start_time: startTime,
      date_fin: endDate || startDate,
      end_time: endTime,
      category,
      location: loc,
      description,
      dropbox_url,
      watch_mode,
      streams,
      attendance: existing ? existing.attendance : []
    };
  } else {
    eventObj = {
      id: 'ev' + Date.now(),
      title: fullTitle,
      date_debut: startDate,
      start_time: startTime,
      date_fin: endDate || startDate,
      end_time: endTime,
      category,
      location: loc,
      description,
      dropbox_url,
      watch_mode,
      streams,
      attendance: []
    };
  }

  const { error } = await supabaseClient.from('nvg_events').upsert([eventObj]);

  if (error) {
    alert("Erreur lors de la sauvegarde : " + error.message);
    return;
  }

  if (editingEventId) {
    alert("✅ Événement mis à jour sur Supabase !");
    editingEventId = null;
    const createBtn = document.getElementById('adminEventSubmitBtn');
    if (createBtn) {
      createBtn.innerText = "Créer l'événement";
      createBtn.className = "px-4 py-2 bg-amber-500 text-black font-bold text-xs rounded-lg hover:bg-amber-400 transition md:col-span-2";
    }
  } else {
    alert("✅ Événement créé sur Supabase !");
  }
  
  document.getElementById('adminNewEvTitle').value = '';
  document.getElementById('adminNewEvStartDate').value = '';
  document.getElementById('adminNewEvStartTime').value = '';
  document.getElementById('adminNewEvEndDate').value = '';
  document.getElementById('adminNewEvEndTime').value = '';
  document.getElementById('adminNewEvLoc').value = '';
  document.getElementById('adminNewEvDropbox').value = '';
  document.getElementById('adminNewEvDesc').value = '';
  document.getElementById('adminNewEvWatch').value = 'none';
  adminStreams = [];
  adminWatchModeChanged();
  renderAdminStreams();

  await loadEvents();
}

let adminStreams = [];

function adminWatchModeChanged() {
  const box = document.getElementById('adminNewEvStreamsBox');
  if (box) box.classList.toggle('hidden', document.getElementById('adminNewEvWatch').value !== 'liste');
}

function adminAddStream() {
  const input = document.getElementById('adminNewEvStreamInput');
  const raw = input.value.trim();
  const match = raw.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})/i) || raw.match(/^([A-Za-z0-9_]{3,25})$/);
  if (!match) {
    alert("Lien ou nom de chaîne Twitch invalide.");
    return;
  }
  const login = match[1].toLowerCase();
  if (adminStreams.includes(login)) {
    alert("Cette chaîne est déjà dans la liste.");
    return;
  }
  if (adminStreams.length >= 10) {
    alert("Maximum 10 chaînes par événement.");
    return;
  }
  adminStreams.push(login);
  input.value = '';
  renderAdminStreams();
}

function adminRemoveStream(login) {
  adminStreams = adminStreams.filter(s => s !== login);
  renderAdminStreams();
}

function renderAdminStreams() {
  const list = document.getElementById('adminNewEvStreamsList');
  if (!list) return;
  list.innerHTML = adminStreams.map(s => `
    <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#121722] border border-[#1f293d] text-xs text-white">
      ${s}
      <button type="button" onclick="adminRemoveStream('${s}')" class="text-gray-400 hover:text-red-400 transition">✕</button>
    </span>
  `).join('');
}

async function adminDeleteEvent(id) {
  if (!confirm("Veux-tu vraiment supprimer cet événement ?")) return;

  const { error } = await supabaseClient.from('nvg_events').delete().eq('id', id);

  if (error) {
    alert("Erreur lors de la suppression : " + error.message);
    return;
  }

  alert("🗑️ Événement supprimé !");
  await loadEvents();
}