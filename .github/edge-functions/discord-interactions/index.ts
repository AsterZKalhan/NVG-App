// Commandes slash du bot « NVG Vikingbot » (/nextevent, /event, /viking, /live).
// Discord envoie chaque commande en HTTP à cette fonction (Interactions Endpoint URL) :
// la signature Ed25519 est vérifiée avec la clé publique de l'application avant tout traitement.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY") ?? "";
const MAIN_TWITCH_LOGIN = "nvgamingtv";
const SITE_URL = "https://app.nvg-tv.com";
const CALENDAR_URL = `${SITE_URL}/#calendar`;
const NVG_COLOR = 0xdc2626;
const RANK_ORDER: Record<string, number> = { "Divinité": 0, "Grand Jarl": 1, "Viking": 2 };
const FOOTER = "NVG Vikingbot";

const EVENT_LOGOS: Record<string, string> = {
  "NVG Spring": "logo-nvg-spring.png",
  "NVG Summer": "logo-nvg-summer.png",
  "NVG Autumn": "logo-nvg-autumn.png",
  "NVG Winter": "logo-nvg-winter.png",
  Nieuwheim: "logo-nieuwheim.png",
};

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
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

// Carte d'événement : même mise en page que l'annonce automatique (discord-bot).
function eventCard(e: any) {
  const prefix = e.category === "Nieuwheim" ? "[Nieuwheim]" : "[NVG]";
  const title = String(e.title ?? "").replace(/^\[(NVG|Nieuwheim)\]\s*/i, "");
  const day = e.date_debut
    ? new Date(`${e.date_debut}T12:00:00`)
        .toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" })
        .replace(".", "")
        .toUpperCase()
    : "";
  const dateLine = [day, e.start_time].filter(Boolean).join(" · ");

  const fields: { name: string; value: string; inline: boolean }[] = [];
  if (e.location) fields.push({ name: "📍 Lieu", value: String(e.location).slice(0, 1024), inline: true });
  if (e.category) {
    const category = e.category === "Nieuwheim" ? "Nieuwheim" : "Event NVG";
    fields.push({ name: "🏷️ Catégorie", value: category, inline: true });
  }

  const logo = EVENT_LOGOS[e.category] ?? "logo-nvg.png";
  return {
    embeds: [
      {
        author: { name: dateLine ? `Date : ${dateLine}` : "Nouvel événement" },
        title: `${prefix} ${title}`.slice(0, 256),
        description: String(e.description || "").slice(0, 4096) || undefined,
        url: CALENDAR_URL,
        color: NVG_COLOR,
        thumbnail: { url: `${SITE_URL}/Logos/${logo}` },
        fields,
        footer: { text: FOOTER },
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "📅 Voir dans le calendrier", url: CALENDAR_URL }] }],
  };
}

async function cmdNextEvent() {
  const events = await sbGet(
    `nvg_events?select=*&date_debut=gte.${todayParis()}&order=date_debut.asc,start_time.asc&limit=1`,
  );
  if (events.length === 0) {
    return reply({
      content: "Aucun événement à venir pour le moment.",
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "📅 Voir dans le calendrier", url: CALENDAR_URL }] }],
    });
  }
  return reply({ content: "**PROCHAIN ÉVÉNEMENT**", ...eventCard(events[0]) });
}

async function cmdEvent() {
  const events = await sbGet(
    `nvg_events?select=title,category,date_debut&date_debut=gte.${todayParis()}&order=date_debut.asc&limit=40`,
  );
  if (events.length === 0) return reply({ content: "Aucun événement à venir pour le moment." });

  // Une carte par événement : le logo de la catégorie apparaît à droite, à hauteur du bloc.
  // Discord limite un message à 10 cartes.
  const shown = events.slice(0, 10);
  const embeds: any[] = shown.map((e) => {
    const prefix = e.category === "Nieuwheim" ? "[Nieuwheim]" : "[NVG]";
    const title = String(e.title ?? "").replace(/^\[(NVG|Nieuwheim)\]\s*/i, "");
    return {
      title: `${prefix} ${title}`.slice(0, 256),
      description: `📅 ${formatDay(e.date_debut)}`,
      color: NVG_COLOR,
      thumbnail: { url: `${SITE_URL}/Logos/${EVENT_LOGOS[e.category] ?? "logo-nvg.png"}` },
    };
  });
  const extra = events.length - shown.length;
  embeds[embeds.length - 1].footer = {
    text: extra > 0 ? `+ ${extra} autre(s) sur le calendrier · ${FOOTER}` : FOOTER,
  };

  return reply({
    content: "**🗓️ Prochains événements**",
    embeds,
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "📅 Voir dans le calendrier", url: CALENDAR_URL }] }],
  });
}

async function cmdViking() {
  const members = await sbGet("nvg_users?select=name,rank,twitch_channel&rank=neq.Petit%20Viking");
  if (members.length === 0) return reply({ content: "Aucun membre à afficher." });
  members.sort((a, b) => (RANK_ORDER[a.rank] ?? 9) - (RANK_ORDER[b.rank] ?? 9) || String(a.name).localeCompare(String(b.name)));

  // Pseudo cliquable vers la chaîne Twitch, quand elle est renseignée et valide.
  const lines = members.map((m) => {
    const login = String(m.twitch_channel ?? "").trim().toLowerCase();
    const name = /^[a-z0-9_]{3,25}$/.test(login) ? `[**${m.name}**](https://twitch.tv/${login})` : `**${m.name}**`;
    return `• ${name} — ${m.rank}`;
  });
  return reply({
    embeds: [
      {
        title: `👥 Membres NVG (${members.length})`,
        description: lines.join("\n").slice(0, 4096),
        url: SITE_URL,
        color: NVG_COLOR,
        footer: { text: FOOTER },
      },
    ],
  });
}

async function cmdLive() {
  const streamers = await sbGet("nvg_streamers?select=name,twitch_channel");
  const names: Record<string, string> = { [MAIN_TWITCH_LOGIN]: "NVG en Live" };
  for (const s of streamers) names[String(s.twitch_channel).toLowerCase()] = s.name;
  const logins = Object.keys(names).filter((l) => /^[a-z0-9_]{3,25}$/.test(l));
  const res = await fetch(`${SUPABASE_URL}/functions/v1/twitch-live?logins=${logins.join(",")}`);
  const streams: Record<string, any> = res.ok ? (await res.json()).streams || {} : {};
  const live = Object.entries(streams).filter(([, s]) => s && s.live);
  const button = { type: 1, components: [{ type: 2, style: 5, label: "Voir sur l'application NVG", url: `${SITE_URL}/#streams` }] };
  if (live.length === 0) {
    return reply({ content: "Aucune chaîne NVG n'est en direct pour le moment.", components: [button] });
  }
  const lines = live.map(([login, s]) => {
    const game = s.game ? ` · ${s.game}` : "";
    const label = `[**${names[login] ?? login}**](https://twitch.tv/${login})`;
    return `🔴 ${label}${game} · ${s.viewers} spectateurs\n${s.title ?? ""}`;
  });
  return reply({
    embeds: [
      {
        title: "🔴 En direct maintenant",
        description: lines.join("\n\n").slice(0, 4096),
        color: 0x9146ff,
        footer: { text: FOOTER },
      },
    ],
    components: [button],
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
        case "nextevent":
          return await cmdNextEvent();
        case "events":
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
