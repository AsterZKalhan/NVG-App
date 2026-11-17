// Tournoi des 9 Mondes dans l'application : poules, classements et arbre, en lecture seule.
// Les données sont publiques (mêmes lectures que le site du tournoi).

const T9_SITE_URL = 'https://letournoides9mondes.nvg-tv.com/';
const T9_STATUS = { draft: 'Brouillon', open: 'Inscriptions ouvertes', closed: 'Inscriptions fermées', running: 'En cours', finished: 'Terminé', cancelled: 'Annulé' };
const T9_MATCH_COLUMNS = 'id,tournament_id,phase,round,position,group_name,label,team_a,team_b,status,points_a,points_b,winner_team,created_at';
let t9Tournaments = [];
let t9Matches = [];
let t9Teams = new Map();
let t9Games = new Map();
let t9SelectedId = null;

function t9Esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function t9Num(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function t9Day(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function t9DateRange(t) {
  const start = t9Day(t.starts_at);
  const end = t9Day(t.ends_at);
  if (start && end) return `Début : ${start} · Fin : ${end}`;
  if (start) return `Début : ${start}`;
  if (end) return `Fin : ${end}`;
  return 'Dates à confirmer';
}

function t9TeamName(id) {
  if (!id) return 'À déterminer';
  const team = t9Teams.get(id);
  return team ? `${team.name}${team.tag ? ` [${team.tag}]` : ''}` : 'Équipe';
}

// Logo de l'équipe, affiché juste avant son nom (logo par défaut sinon).
function t9TeamLogo(id, sizeClass = 'h-4 w-4') {
  if (!id) return '';
  const logo = t9Teams.get(id)?.logo_url;
  const safe = logo && /^https?:\/\//.test(logo) ? logo : './Logos/no-logo.jpeg';
  return `<img src="${t9Esc(safe)}" alt="" onerror="this.onerror=null;this.src='./Logos/no-logo.jpeg'" class="${sizeClass} shrink-0 rounded object-cover">`;
}

async function loadTournoi9() {
  const box = document.getElementById('t9Body');
  if (!box || !supabaseClient) return;
  box.innerHTML = '<p class="text-xs text-gray-400">Chargement du tournoi…</p>';
  const [tournaments, teams, games] = await Promise.all([
    supabaseClient.from('nvg_tournaments').select('id,name,status,starts_at,ends_at,format_config').eq('published', true).neq('status', 'draft').order('starts_at', { ascending: true, nullsFirst: false }),
    supabaseClient.from('nvg_tournament_teams_public').select('id,tournament_id,name,tag,logo_url'),
    supabaseClient.from('nvg_tournament_games').select('id,name,logo_url')
  ]);
  const ids = (tournaments.data || []).map((t) => t.id);
  const matches = ids.length
    ? await supabaseClient.from('nvg_tournament_matches').select(T9_MATCH_COLUMNS).in('tournament_id', ids).order('created_at', { ascending: true })
    : { data: [], error: null };
  if (tournaments.error || matches.error) {
    box.innerHTML = '<p class="text-xs text-red-400">Impossible de charger le tournoi pour le moment.</p>';
    return;
  }
  t9Tournaments = tournaments.data || [];
  t9Matches = matches.data || [];
  t9Teams = new Map((teams.data || []).map((team) => [team.id, team]));
  t9Games = new Map((games.data || []).map((game) => [game.id, game]));
  if (!t9Tournaments.some((t) => t.id === t9SelectedId)) {
    const withMatches = t9Tournaments.find((t) => t9Matches.some((m) => m.tournament_id === t.id));
    t9SelectedId = (withMatches || t9Tournaments[0] || {}).id || null;
  }
  renderTournoi9();
}

function t9Standings(matches, tiebreaks = {}) {
  const rows = new Map();
  const ensure = (id) => {
    if (!id) return null;
    if (!rows.has(id)) rows.set(id, { id, played: 0, wins: 0, draws: 0, losses: 0, points: 0, scored: 0, conceded: 0 });
    return rows.get(id);
  };
  matches.forEach((m) => { ensure(m.team_a); ensure(m.team_b); });
  matches.filter((m) => m.status === 'finished').forEach((m) => {
    const a = ensure(m.team_a);
    if (a && !m.team_b) { a.played += 1; a.wins += 1; a.points += 3; return; }
    const b = ensure(m.team_b);
    if (!a || !b) return;
    const pa = Number(m.points_a) || 0;
    const pb = Number(m.points_b) || 0;
    a.played += 1; b.played += 1;
    a.scored += pa; a.conceded += pb;
    b.scored += pb; b.conceded += pa;
    if (pa > pb) { a.wins += 1; a.points += 3; b.losses += 1; }
    else if (pb > pa) { b.wins += 1; b.points += 3; a.losses += 1; }
    else { a.draws += 1; b.draws += 1; a.points += 1; b.points += 1; }
  });
  // Point de départage attribué par l'organisation : il compte dans le classement.
  rows.forEach((r) => { r.bonus = Number(tiebreaks?.[r.id]) || 0; r.points += r.bonus; });
  return [...rows.values()].sort((x, y) => y.points - x.points
    || (y.scored - y.conceded) - (x.scored - x.conceded) || y.scored - x.scored);
}

// Nombre de matchs de poule prévus pour chaque équipe (ses rounds de poule).
function t9ExpectedRounds(poolMatches) {
  const expected = new Map();
  poolMatches.forEach((m) => {
    [m.team_a, m.team_b].forEach((id) => {
      if (id) expected.set(id, (expected.get(id) || 0) + 1);
    });
  });
  return expected;
}

// Classement d'une poule. Points verts pour les qualifiés, rouges pour les autres ;
// le nombre de rounds passe en bleu dès que l'équipe a joué tous ses matchs de poule.
function t9Table(matches, t) {
  const rows = t9Standings(matches, t?.format_config?.tiebreaks);
  const qualifiers = Number(t?.format_config?.qualifiers_per_pool) || 2;
  const expected = t9ExpectedRounds(matches);
  return `<div class="overflow-x-auto rounded-xl border border-[#1f293d] bg-[#07090e]">
    <table class="text-[11px]" style="width:100%;table-layout:fixed">
      <colgroup><col><col style="width:64px"><col style="width:36px"><col style="width:36px"><col style="width:36px"><col style="width:52px"><col style="width:60px"></colgroup>
      <thead class="bg-white/5 text-gray-400">
        <tr><th class="px-2 py-1 text-left font-black">Équipe</th><th class="px-2 py-1 text-center font-black">Round</th><th class="px-1 py-1 text-center font-black">V</th><th class="px-1 py-1 text-center font-black">N</th><th class="px-1 py-1 text-center font-black">D</th><th class="px-2 py-1 text-center font-black">Pts</th><th class="px-2 py-1 text-right font-black">Diff.</th></tr>
      </thead>
      <tbody>${rows.map((r, i) => `<tr class="border-t border-[#1f293d]">
        <td class="truncate px-2 py-1 font-bold text-gray-200">${t9Esc(t9TeamName(r.id))}</td>
        <td class="px-1 py-1 text-center ${expected.get(r.id) > 0 && r.played >= expected.get(r.id) ? 'font-black text-blue-400' : 'text-gray-400'}">${r.played}</td>
        <td class="px-1 py-1 text-center text-gray-400">${r.wins}</td>
        <td class="px-1 py-1 text-center text-gray-400">${r.draws}</td>
        <td class="px-1 py-1 text-center text-gray-400">${r.losses}</td>
        <td class="px-2 py-1 text-center font-black ${i < qualifiers ? 'text-emerald-400' : 'text-red-400'}">${r.points}${r.bonus ? ` <span class="text-[9px] text-amber-300" title="Point de départage">+${r.bonus}⚖️</span>` : ''}</td>
        <td class="px-2 py-1 text-right ${r.scored - r.conceded >= 0 ? 'text-emerald-400' : 'text-red-400'}">${r.scored - r.conceded > 0 ? '+' : ''}${t9Num(r.scored - r.conceded)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

function t9MatchLine(m, label = '', t = null) {
  const finished = m.status === 'finished';
  const score = finished ? `${t9Num(m.points_a)} — ${t9Num(m.points_b)}` : '—';
  const aWin = finished && m.winner_team && m.winner_team === m.team_a;
  const bWin = finished && m.winner_team && m.winner_team === m.team_b;
  return `<div class="rounded-lg border border-[#1f293d] bg-[#07090e] p-2.5">
    ${label ? `<p class="text-[9px] font-black uppercase tracking-wider text-gray-500">${t9Esc(label)}</p>` : ''}
    ${t ? t9GameTag(m, t) : ''}
    <div class="mt-0.5 flex items-center justify-between gap-2">
      <div class="min-w-0 space-y-0.5">
        <p class="flex min-w-0 items-center gap-1.5 text-[11px] font-bold ${aWin ? 'text-emerald-300' : 'text-gray-200'}">${t9TeamLogo(m.team_a)}<span class="truncate">${t9Esc(t9TeamName(m.team_a))}</span></p>
        <p class="flex min-w-0 items-center gap-1.5 text-[11px] font-bold ${bWin ? 'text-emerald-300' : 'text-gray-200'}">${t9TeamLogo(m.team_b)}<span class="truncate">${t9Esc(t9TeamName(m.team_b))}</span></p>
      </div>
      <p class="shrink-0 text-sm font-black ${finished ? 'text-white' : 'text-gray-500'}">${score}</p>
    </div>
  </div>`;
}

function t9TreeSize(t) {
  // Taille réelle du tableau (puissance de 2, exemptions comprises), comme sur le site.
  const qualified = (Number(t.format_config?.pool_count) || 2) * (Number(t.format_config?.qualifiers_per_pool) || 2);
  let size = 2;
  while (size < qualified) size *= 2;
  return size;
}

// Finale BO3 : arbre simple (dernier tour) ou grande finale (arbre double).
function t9IsBo3(m, t) {
  if (t.format_config?.format !== 'groups_playoffs') return false;
  const rounds = Math.log2(t9TreeSize(t));
  return m.phase === 'grand' || (m.phase === 'bracket' && m.round === rounds);
}

// Clé du tour, comme sur le site (B1, W2, WF, L1, P1, T).
function t9RoundKey(m, t) {
  if (m.phase === 'pool') return `P${m.round}`;
  if (m.phase === 'third') return 'T';
  if (t9IsBo3(m, t)) return null;
  if (m.phase === 'bracket') return `B${m.round}`;
  if (m.phase === 'winners') return m.round === Math.log2(t9TreeSize(t)) ? 'WF' : `W${m.round}`;
  if (m.phase === 'losers') return `L${m.round}`;
  return null;
}

// Jeu du tour (ou jeux de la BO3), affiché sous le titre de la phase.
function t9GameTag(m, t, centered = false) {
  if (!m || !t) return '';
  const rg = t.format_config?.round_games || {};
  const name = (id) => t9Games.get(id)?.name || 'Jeu libre';
  const cls = `mt-0.5 ${centered ? 'text-center' : ''} text-[9px] font-bold text-violet-300`;
  if (t9IsBo3(m, t)) {
    const lines = [1, 2, 3].filter((n) => rg[`F${n}`]).map((n) => `<p class="truncate">Jeu ${n} · ${t9Esc(name(rg[`F${n}`]))}</p>`);
    return lines.length ? `<div class="${cls}">${lines.join('')}</div>` : '';
  }
  const gameId = rg[t9RoundKey(m, t)];
  if (!gameId) return '';
  const logo = t9Games.get(gameId)?.logo_url;
  const safeLogo = logo && /^https?:\/\//.test(logo) ? logo : '';
  return `<p class="${cls} flex items-center ${centered ? 'justify-center' : ''} gap-1">${safeLogo ? `<img src="${t9Esc(safeLogo)}" alt="" onerror="this.remove()" class="inline-block h-[1em] w-[1em] shrink-0 object-contain">` : ''}<span class="truncate">${t9Esc(name(gameId))}</span></p>`;
}

// Classement final : 1er et 2e (finale), 3e (petite finale).
function t9Podium(matches) {
  const lastRound = Math.max(0, ...matches.filter((m) => m.phase === 'bracket' || m.phase === 'winners').map((m) => m.round));
  const final = matches.find((m) => m.phase === 'grand') || matches.find((m) => (m.phase === 'bracket' || m.phase === 'winners') && m.round === lastRound);
  const third = matches.find((m) => m.phase === 'third');
  const winner = (m) => (m && m.status === 'finished' && m.winner_team ? m.winner_team : null);
  const loser = (m) => {
    const w = winner(m);
    if (!w || !m.team_a || !m.team_b) return null;
    return w === m.team_a ? m.team_b : m.team_a;
  };
  const rows = [['1er', winner(final)], ['2e', loser(final)], ['3e', winner(third)]];
  if (!rows.some(([, id]) => id)) return '';
  return `<div class="space-y-1.5">
    <h4 class="text-[10px] font-black uppercase tracking-wider text-amber-300">Classement final</h4>
    ${rows.map(([place, id]) => `<div class="flex items-center justify-between gap-2 rounded-lg border border-[#1f293d] bg-[#07090e] px-2.5 py-1.5">
      <span class="text-[10px] font-black text-amber-300">${place}</span>
      <span class="truncate text-[11px] font-bold ${id ? 'text-gray-200' : 'text-gray-500'}">${id ? t9Esc(t9TeamName(id)) : 'À déterminer'}</span>
    </div>`).join('')}
  </div>`;
}

// Arbre : une colonne par tour, chaque match centré entre ses deux qualifiés.
function t9Tree(list, t) {
  const TREE_ROW = 36;
  const CARD = 64;
  const rounds = [...new Set(list.map((m) => m.round))].sort((a, b) => a - b);
  const count = rounds.length;
  const first = list.filter((m) => m.round === rounds[0]).length;
  const labels = rounds.map((round, ri) => `<div style="grid-column:${ri + 1};grid-row:1" class="text-center">
      <p class="text-[10px] font-black uppercase tracking-wider text-gray-400">${count - ri === 1 ? 'Finale' : count - ri === 2 ? 'Demi-finale' : count - ri === 3 ? 'Quart de finale' : `Tour ${round}`}</p>
      ${t9GameTag(list.find((m) => m.round === round), t, true)}
    </div>`);
  const cards = rounds.flatMap((round, ri) => {
    const span = 2 ** (ri + 1);
    return list.filter((m) => m.round === round).sort((a, b) => a.position - b.position).map((m, p) => {
      const finished = m.status === 'finished';
      const row = (team, score, winner) => `<div class="flex items-center justify-between gap-2 px-2 ${winner ? 'font-black text-emerald-300' : 'text-gray-300'}" style="height:${CARD / 2 - 1}px">
        <span class="flex min-w-0 items-center gap-1.5 text-[10px]">${team ? t9TeamLogo(team, 'h-3.5 w-3.5') : ''}<span class="truncate">${t9Esc(team ? t9TeamName(team) : 'À déterminer')}</span></span>
        <span class="shrink-0 text-[10px] font-black">${finished && team ? t9Num(score) : ''}</span>
      </div>`;
      const connectors = ri < count - 1 ? `
        <span class="absolute" style="right:-12px;top:50%;width:12px;border-top:1px solid #334155"></span>
        ${p % 2 === 0 ? `<span class="absolute" style="right:-12px;top:50%;height:${span * TREE_ROW}px;border-right:1px solid #334155"></span>` : ''}` : '';
      return `<div class="relative self-center" style="grid-column:${ri + 1};grid-row:${p * span + 2} / span ${span}">
        <div class="rounded-lg border border-[#1f293d] bg-[#0f141f] overflow-hidden" style="height:${CARD}px">
          ${row(m.team_a, m.points_a, finished && m.winner_team && m.winner_team === m.team_a)}
          <div class="border-t border-[#1f293d]"></div>
          ${row(m.team_b, m.points_b, finished && m.winner_team && m.winner_team === m.team_b)}
        </div>
        ${connectors}
      </div>`;
    });
  });
  return `<div class="overflow-x-auto pb-2">
    <div class="grid" style="grid-template-columns:repeat(${count},minmax(170px,1fr));column-gap:24px;grid-template-rows:auto repeat(${first * 2},${TREE_ROW}px);min-width:${count * 200}px">
      ${labels.join('')}${cards.join('')}
    </div>
  </div>`;
}

function renderTournoi9() {
  const box = document.getElementById('t9Body');
  if (!box) return;
  if (!t9Tournaments.length) {
    box.innerHTML = '<p class="text-xs text-gray-400">Aucun tournoi publié pour le moment.</p>';
    return;
  }
  const t = t9Tournaments.find((x) => x.id === t9SelectedId) || t9Tournaments[0];
  const matches = t9Matches.filter((m) => m.tournament_id === t.id);
  const pools = matches.filter((m) => m.phase === 'pool');
  const groups = [...new Set(pools.map((m) => m.group_name).filter(Boolean))].sort();
  const bracket = matches.filter((m) => m.phase !== 'pool');
  const bracketTree = bracket.filter((m) => m.phase === 'bracket' || m.phase === 'winners');
  const others = bracket.filter((m) => m.phase === 'losers' || m.phase === 'grand' || m.phase === 'third');
  const phaseTitle = { bracket: 'Tableau', winners: 'Tableau des gagnants' };

  box.innerHTML = `
    <div class="flex flex-wrap items-center gap-2">
      <select onchange="t9Select(this.value)" class="min-w-0 flex-1 rounded-lg border border-[#1f293d] bg-[#07090e] px-3 py-2 text-xs font-bold text-white">
        ${t9Tournaments.map((x) => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${t9Esc(x.name)} — ${t9Esc(T9_STATUS[x.status] || x.status)}</option>`).join('')}
      </select>
      <a href="${T9_SITE_URL}" target="_blank" rel="noopener" class="rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-black text-black transition hover:bg-amber-400">Voir le site du tournoi</a>
    </div>
    <p class="text-[11px] text-gray-400">📅 ${t9Esc(t9DateRange(t))}</p>
    ${!matches.length ? '<p class="text-xs text-gray-400">Les matchs ne sont pas encore publiés pour ce tournoi.</p>' : ''}
    ${groups.length ? `<div class="space-y-3">
      <h3 class="text-xs font-black uppercase tracking-wider text-white">🏟️ Classements</h3>
      <div class="grid gap-3 md:grid-cols-2">
        ${groups.map((g) => `<div class="space-y-1.5"><p class="text-[10px] font-black uppercase tracking-wider text-gray-400">Poule ${t9Esc(g)}</p>${t9Table(pools.filter((m) => m.group_name === g), t)}</div>`).join('')}
      </div>
      <h3 class="text-xs font-black uppercase tracking-wider text-white">Matchs de poule</h3>
      <div class="grid gap-2 md:grid-cols-2">
        ${pools.sort((a, b) => a.round - b.round || a.position - b.position).map((m) => t9MatchLine(m, `${m.group_name ? `Poule ${m.group_name} · ` : ''}Round ${m.round}`, t)).join('')}
      </div>
    </div>` : ''}
    ${bracket.length ? `<div class="space-y-3">
      <h3 class="text-xs font-black uppercase tracking-wider text-white">🏆 Arbre</h3>
      ${bracketTree.length ? `<div class="space-y-2">
        <h4 class="text-[10px] font-black uppercase tracking-wider text-amber-300">${phaseTitle[bracketTree.some((m) => m.phase === 'winners') ? 'winners' : 'bracket']}</h4>
        ${t9Tree(bracketTree.filter((m) => m.phase === (bracketTree.some((x) => x.phase === 'winners') ? 'winners' : 'bracket')), t)}
      </div>` : ''}
      ${others.length ? `<div class="grid gap-2 md:grid-cols-2">${others.map((m) => `<div class="space-y-1">
        <p class="text-[10px] font-black uppercase tracking-wider text-gray-400">${m.phase === 'third' ? 'Petite finale' : m.phase === 'grand' ? 'Grande finale' : `Repêchage · tour ${m.round}`}</p>
        ${t9MatchLine(m, '', t)}
      </div>`).join('')}</div>` : ''}
      ${t9Podium(bracket)}
    </div>` : ''}
  `;
}

function t9Select(id) {
  t9SelectedId = id;
  renderTournoi9();
}
