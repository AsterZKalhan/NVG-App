// Commandes slash du bot « NVG Vikingbot » (/event, /viking, /live).
// Discord envoie chaque commande en HTTP à cette fonction (Interactions Endpoint URL) :
// la signature Ed25519 est vérifiée avec la clé publique de l'application avant tout traitement.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY") ?? "";
const MAIN_TWITCH_LOGIN = "nvgamingtv";
const SITE_URL = "https://app.nvg-tv.com";
const NVG_COLOR = 0xdc2626;
const RANK_ORDER: Record<string, number> = { "Divinité": 0, "Grand Jarl": 1, "Viking": 2 };

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
};

async function verifySignature(req: Request, body: string): Promise<boolean> {
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  if (!signature || !timestamp || !PUBLIC_KEY) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(signature), new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

const reply = (data: unknown) => new Response(JSON.stringify({ type: 4, data }), { headers: { "Content-Type": "application/json" } });

async function sbGet(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Lecture ${path} : ${res.status}`);
  return res.json();
}

function todayParis(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

function formatDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
}

// Le titre est toujours préfixé par [NVG] ou [Nieuwheim] : on le recalcule à partir de la catégorie.
function eventLabel(e: any): string {
  const prefix = e.category === "Nieuwheim" ? "[Nieuwheim]" : "[NVG]";
  const title = String(e.title ?? "").replace(/^\[(NVG|Nieuwheim)\]\s*/i, "");
  return `**${prefix} ${title}**`;
}

async function cmdEvent() {
  const events = await sbGet(
    `nvg_events?select=title,category,date_debut&date_debut=gte.${todayParis()}&order=date_debut.asc&limit=40`,
  );
  if (events.length === 0) return reply({ content: "Aucun événement à venir pour le moment." });
  const lines = events.map((e) => `${eventLabel(e)}\n📅 ${formatDay(e.date_debut)}`);
  return reply({
    embeds: [
      {
        title: "🗓️ Prochains événements",
        description: lines.join("\n\n").slice(0, 4096),
        url: `${SITE_URL}`,
        color: NVG_COLOR,
        footer: { text: "NVG Vikingbot" },
      },
    ],
  });
}

async function cmdViking() {
  const members = await sbGet("nvg_users?select=name,rank&rank=neq.Petit%20Viking");
  if (members.length === 0) return reply({ content: "Aucun membre à afficher." });
  members.sort((a, b) => (RANK_ORDER[a.rank] ?? 9) - (RANK_ORDER[b.rank] ?? 9) || String(a.name).localeCompare(String(b.name)));
  const lines = members.map((m) => `• **${m.name}** — ${m.rank}`);
  return reply({
    embeds: [
      {
        title: `👥 Membres NVG (${members.length})`,
        description: lines.join("\n").slice(0, 4096),
        url: SITE_URL,
        color: NVG_COLOR,
        footer: { text: "NVG Vikingbot" },
      },
    ],
  });
}

async function cmdLive() {
  const streamers = await sbGet("nvg_streamers?select=twitch_channel");
  const logins = [MAIN_TWITCH_LOGIN, ...streamers.map((s) => String(s.twitch_channel).toLowerCase())];
  const unique = [...new Set(logins)].filter((l) => /^[a-z0-9_]{3,25}$/.test(l));
  const res = await fetch(`${SUPABASE_URL}/functions/v1/twitch-live?logins=${unique.join(",")}`);
  const streams: Record<string, any> = res.ok ? (await res.json()).streams || {} : {};
  const live = Object.entries(streams).filter(([, s]) => s && s.live);
  if (live.length === 0) return reply({ content: "Aucune chaîne NVG n'est en direct pour le moment." });
  const lines = live.map(([login, s]) => {
    const game = s.game ? ` · ${s.game}` : "";
    return `🔴 **${login}**${game} · ${s.viewers} spectateurs\n${s.title ?? ""}\nhttps://twitch.tv/${login}`;
  });
  return reply({
    embeds: [
      {
        title: "🔴 En direct maintenant",
        description: lines.join("\n\n").slice(0, 4096),
        color: 0x9146ff,
        footer: { text: "NVG Vikingbot" },
      },
    ],
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("méthode non autorisée", { status: 405 });

  const body = await req.text();
  if (!(await verifySignature(req, body))) return new Response("signature invalide", { status: 401 });

  const interaction = JSON.parse(body);

  // Vérification de l'Interactions Endpoint par Discord.
  if (interaction.type === 1) return new Response(JSON.stringify({ type: 1 }), { headers: { "Content-Type": "application/json" } });

  if (interaction.type === 2) {
    try {
      switch (interaction.data?.name) {
        case "event":
          return await cmdEvent();
        case "viking":
          return await cmdViking();
        case "live":
          return await cmdLive();
      }
      return reply({ content: "Commande inconnue." });
    } catch (err) {
      console.error(err);
      return reply({ content: "Erreur temporaire, réessaie dans un instant." });
    }
  }

  return new Response("type non géré", { status: 400 });
});
