// Bot Discord « NVG Vikingbot » : publie les annonces NVG dans les serveurs configurés.
// Le token du bot est dans le secret DISCORD_BOT_TOKEN (jamais dans le code).
// Live Twitch : appelé par twitch-eventsub avec l'en-tête x-nvg-secret = DISCORD_BOT_SECRET.
// Annonces d'événements / jeux : appelées par l'application avec le JWT de l'utilisateur connecté.
// Configuration : onglet « Bot Discord NVG » (admins uniquement).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-nvg-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const INTERNAL_SECRET = Deno.env.get("DISCORD_BOT_SECRET") ?? "";

const DISCORD_API = "https://discord.com/api/v10";
const APPLICATION_ID = "1569625316601757747";
const SITE_URL = "https://app.nvg-tv.com";
const CALENDAR_URL = `${SITE_URL}/#calendar`;
const NVG_COLOR = 0xdc2626;
const TWITCH_COLOR = 0x9146ff;
const TEXT_CHANNEL_TYPES = [0, 5];
const FOOTER = "NVG Vikingbot";
const MAIN_TWITCH_LOGIN = "nvgamingtv";
const ANNOUNCE_KINDS = ["live_nvg", "live_member", "event_created", "game_proposed"];
const STAFF_RANKS = ["Viking", "Grand Jarl", "Divinité"];

const trunc = (value: unknown, max: number): string => String(value ?? "").slice(0, max);
const isSnowflake = (value: unknown): boolean => /^\d{15,25}$/.test(String(value ?? ""));

async function sb(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

async function discord(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(`Discord ${res.status} : ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nvg_is_admin`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: authHeader, "Content-Type": "application/json" },
    body: "{}",
  });
  return res.ok && (await res.json()) === true;
}

// Rang de l'utilisateur connecté (null si non connecté).
async function callerRank(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const me = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: authHeader },
  });
  if (!me.ok) return null;
  const user = await me.json();
  const res = await sb(`nvg_users?select=rank&id=eq.${encodeURIComponent(user.id)}`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.rank ?? null;
}

function formatDay(day: string, time?: string): string {
  if (!day) return "";
  const label = new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
  return time ? `${label} à ${time}` : label;
}

const EVENT_LOGOS: Record<string, string> = {
  "NVG Spring": "logo-nvg-spring.png",
  "NVG Summer": "logo-nvg-summer.png",
  "NVG Autumn": "logo-nvg-autumn.png",
  "NVG Winter": "logo-nvg-winter.png",
  Nieuwheim: "logo-nieuwheim.png",
};

// Mise en page proche de la carte du calendrier du site : date en tête, titre [NVG] / [Nieuwheim],
// logo de la saison à droite, lieu et catégorie, bouton d'inscription vers le calendrier.
function eventMessage(e: any) {
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
  if (e.location) fields.push({ name: "📍 Lieu", value: trunc(e.location, 1024), inline: true });
  if (e.category) fields.push({ name: "🏷️ Catégorie", value: trunc(e.category, 1024), inline: true });
  if (e.watch_mode) fields.push({ name: "👀 Où regarder", value: trunc(e.watch_mode, 1024), inline: true });

  const logo = EVENT_LOGOS[e.category] ?? "logo-nvg.png";
  return {
    embeds: [
      {
        author: { name: dateLine || "Nouvel événement" },
        title: trunc(`${prefix} ${title}`, 256),
        description: trunc(e.description || "", 4096) || undefined,
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

let twitchToken: { value: string; expiresAt: number } | null = null;

async function twitchAppToken(): Promise<string> {
  if (twitchToken && twitchToken.expiresAt > Date.now() + 60_000) return twitchToken.value;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("TWITCH_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("TWITCH_CLIENT_SECRET") ?? "",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Jeton Twitch : ${res.status}`);
  const data = await res.json();
  twitchToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return twitchToken.value;
}

// Informations du direct (titre, jeu, spectateurs, avatar) via l'API Helix. En cas d'échec, on annonce quand même.
async function twitchInfo(login: string) {
  const fallback = { display: login, avatar: "", title: "", game: "", viewers: 0 };
  try {
    const token = await twitchAppToken();
    const headers = { "Client-Id": Deno.env.get("TWITCH_CLIENT_ID") ?? "", Authorization: `Bearer ${token}` };
    const [usersRes, streamsRes] = await Promise.all([
      fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, { headers }),
      fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, { headers }),
    ]);
    const user = usersRes.ok ? (await usersRes.json()).data?.[0] : undefined;
    const stream = streamsRes.ok ? (await streamsRes.json()).data?.[0] : undefined;
    return {
      display: user?.display_name ?? login,
      avatar: user?.profile_image_url ?? "",
      title: stream?.title ?? "",
      game: stream?.game_name ?? "",
      viewers: stream?.viewer_count ?? 0,
    };
  } catch (err) {
    console.error("Infos Twitch :", err);
    return fallback;
  }
}

function liveMessage(login: string, info: { display: string; avatar: string; title: string; game: string; viewers: number }) {
  const name = info.display || login;
  const url = `https://twitch.tv/${login}`;
  return {
    content: `🔴 **${name}** est en live !`,
    embeds: [
      {
        author: { name: `${name} est en live sur Twitch !`, url, ...(info.avatar ? { icon_url: info.avatar } : {}) },
        title: trunc(info.title || `Retrouve ${name} sur Twitch`, 256),
        url,
        color: TWITCH_COLOR,
        fields: [
          { name: "Jeu", value: trunc(info.game || "Non renseigné", 1024), inline: true },
          { name: "Spectateurs", value: String(info.viewers), inline: true },
        ],
        image: { url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg?t=${Date.now()}` },
        footer: { text: FOOTER },
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Regarder le stream", url }] }],
  };
}

function gameMessage(g: any) {
  const target = g.target_type === "nieuwheim" ? "Nieuwheim" : g.target_type === "event" ? "Événement NVG" : "Idée";
  const fields = [
    { name: "👤 Proposé par", value: trunc(g.author || "Viking", 1024), inline: true },
    { name: "🎯 Pour", value: target, inline: true },
  ];
  const embed: any = {
    title: trunc(`🎮 Nouveau jeu proposé : ${g.title}`, 256),
    description: trunc(g.comment || "Vote pour ce jeu sur le site NVG Companion.", 4096),
    url: typeof g.link === "string" && g.link.startsWith("https://") ? g.link : SITE_URL,
    color: NVG_COLOR,
    fields,
    footer: { text: FOOTER },
  };
  if (typeof g.img === "string" && g.img.startsWith("https://")) embed.image = { url: g.img };
  return { embeds: [embed] };
}

// Publie le message sur tous les salons abonnés à ce type d'annonce.
// Le journal nvg_discord_posts évite les doublons (ex. re-livraison d'un événement Twitch).
async function dispatch(kind: string, refId: string, payload: unknown): Promise<number> {
  const res = await sb(`nvg_discord_routes?select=channel_id&kind=eq.${kind}&enabled=eq.true`);
  if (!res.ok) throw new Error(`Lecture des routes : ${res.status}`);
  const routes: { channel_id: string }[] = await res.json();

  let sent = 0;
  for (const route of routes) {
    const claim = await sb("nvg_discord_posts", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ kind, ref_id: refId, channel_id: route.channel_id }),
    });
    if (claim.status === 409) continue;
    if (!claim.ok) {
      console.error("Journal Discord :", claim.status, await claim.text());
      continue;
    }
    try {
      await discord(`/channels/${route.channel_id}/messages`, { method: "POST", body: JSON.stringify(payload) });
      sent++;
    } catch (err) {
      console.error(err);
      await sb(
        `nvg_discord_posts?kind=eq.${kind}&ref_id=eq.${encodeURIComponent(refId)}&channel_id=eq.${route.channel_id}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
    }
  }
  return sent;
}

function pollFrom(raw: any) {
  const answers = (Array.isArray(raw.answers) ? raw.answers : [])
    .map((a: unknown) => String(a).trim())
    .filter(Boolean)
    .slice(0, 10);
  if (answers.length < 2) throw new Error("Un sondage demande au moins 2 réponses.");
  const hours = Math.min(Math.max(Number(raw.hours) || 24, 1), 168);
  return {
    question: { text: trunc(raw.question, 300) },
    answers: answers.map((text: string) => ({ poll_media: { text: trunc(text, 55) } })),
    duration: hours,
    allow_multiselect: raw.multi === true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "requête invalide" }, 400);
  }

  const authHeader = req.headers.get("Authorization");

  try {
    // Live Twitch : appelé par twitch-eventsub lors d'un stream.online.
    if (body.action === "live") {
      if (!INTERNAL_SECRET || req.headers.get("x-nvg-secret") !== INTERNAL_SECRET) {
        return json({ error: "accès refusé" }, 403);
      }
      const login = String(body.login ?? "").toLowerCase();
      if (!login) return json({ error: "chaîne manquante" }, 400);
      const refId = String(body.ref_id ?? `${login}:${Date.now()}`);

      if (login === MAIN_TWITCH_LOGIN) {
        return json({ ok: true, sent: await dispatch("live_nvg", refId, liveMessage(login, await twitchInfo(login))) });
      }
      // Seuls les membres éligibles (vue nvg_streamers : Viking, Grand Jarl, Divinité) sont annoncés.
      const eligible = await sb(`nvg_streamers?select=twitch_channel&twitch_channel=ilike.${encodeURIComponent(login)}`);
      const rows = eligible.ok ? await eligible.json() : [];
      if (rows.length === 0) return json({ ok: true, sent: 0, skipped: "chaîne non éligible" });
      return json({ ok: true, sent: await dispatch("live_member", refId, liveMessage(login, await twitchInfo(login))) });
    }

    // Annonces d'événement / de jeu : appelées par l'application après création.
    if (body.action === "announce") {
      const kind = String(body.kind ?? "");
      const id = String(body.id ?? "");
      if (!id) return json({ error: "identifiant manquant" }, 400);

      if (kind === "event_created") {
        if (!(await isAdmin(authHeader))) return json({ error: "réservé aux admins" }, 403);
        const res = await sb(`nvg_events?select=*&id=eq.${encodeURIComponent(id)}`);
        const rows = res.ok ? await res.json() : [];
        if (!rows[0]) return json({ error: "événement introuvable" }, 404);
        return json({ ok: true, sent: await dispatch("event_created", id, eventMessage(rows[0])) });
      }

      if (kind === "game_proposed") {
        if (!STAFF_RANKS.includes(String(await callerRank(authHeader)))) {
          return json({ error: "réservé aux Vikings confirmés et Jarls" }, 403);
        }
        const res = await sb(`nvg_games?select=*&id=eq.${encodeURIComponent(id)}`);
        const rows = res.ok ? await res.json() : [];
        if (!rows[0]) return json({ error: "proposition introuvable" }, 404);
        return json({ ok: true, sent: await dispatch("game_proposed", id, gameMessage(rows[0])) });
      }

      return json({ error: "type d'annonce inconnu" }, 400);
    }

    // Actions admin : onglet « Bot Discord NVG ».
    if (!(await isAdmin(authHeader))) return json({ error: "réservé aux admins" }, 403);

    if (body.action === "list_guilds") {
      const guilds: any[] = await discord("/users/@me/guilds");
      if (guilds.length > 0) {
        await sb("nvg_discord_servers", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(guilds.map((g) => ({ guild_id: g.id, name: trunc(g.name, 200) }))),
        });
      }
      const routesRes = await sb("nvg_discord_routes?select=guild_id,channel_id,kind,enabled");
      return json({
        guilds: guilds.map((g) => ({ id: g.id, name: g.name, icon: g.icon ?? null })),
        routes: routesRes.ok ? await routesRes.json() : [],
      });
    }

    if (body.action === "list_channels") {
      const guildId = String(body.guild_id ?? "").trim();
      if (!isSnowflake(guildId)) return json({ error: "identifiant de serveur invalide" }, 400);
      const channels = await discord(`/guilds/${guildId}/channels`);
      return json(
        channels
          .filter((c: any) => TEXT_CHANNEL_TYPES.includes(c.type))
          .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
          .map((c: any) => ({ id: c.id, name: c.name })),
      );
    }

    if (body.action === "save_routes") {
      const guildId = String(body.guild_id ?? "").trim();
      if (!isSnowflake(guildId)) return json({ error: "identifiant de serveur invalide" }, 400);
      const wanted: { kind: string; channel_id: string }[] = (Array.isArray(body.routes) ? body.routes : []).filter(
        (r: any) => ANNOUNCE_KINDS.includes(r?.kind) && isSnowflake(r?.channel_id),
      );

      // Un salon ne peut être choisi que s'il appartient bien au serveur.
      const channels: any[] = await discord(`/guilds/${guildId}/channels`);
      const allowed = new Set(channels.map((c) => c.id));
      if (wanted.some((r) => !allowed.has(r.channel_id))) {
        return json({ error: "salon hors du serveur" }, 400);
      }

      const del = await sb(`nvg_discord_routes?guild_id=eq.${guildId}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      if (!del.ok) throw new Error(`Suppression des routes : ${del.status}`);
      if (wanted.length > 0) {
        const rows = wanted.map((r) => ({ guild_id: guildId, kind: r.kind, channel_id: r.channel_id, enabled: true }));
        const ins = await sb("nvg_discord_routes", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(rows),
        });
        if (!ins.ok) throw new Error(`Enregistrement des routes : ${ins.status}`);
      }
      return json({ ok: true, saved: wanted.length });
    }

    if (body.action === "publish") {
      const channelId = String(body.channel_id ?? "").trim();
      if (!isSnowflake(channelId)) return json({ error: "salon invalide" }, 400);
      const title = trunc(body.title, 256).trim();
      if (!title) return json({ error: "le titre est obligatoire" }, 400);

      const embed: any = {
        title,
        description: trunc(body.message, 4096) || undefined,
        url: SITE_URL,
        color: NVG_COLOR,
        footer: { text: FOOTER },
      };
      if (typeof body.image_url === "string" && body.image_url.startsWith("https://")) {
        embed.image = { url: body.image_url };
      }
      const payload: any = { embeds: [embed] };
      if (body.poll && String(body.poll.question ?? "").trim()) {
        payload.poll = pollFrom({ ...body.poll, question: String(body.poll.question).trim() });
      }

      const message = await discord(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify(payload) });
      return json({ ok: true, message_id: message.id });
    }

    if (body.action === "register_commands") {
      const commands = [
        { name: "nextevent", description: "Prochain événement NVG avec tous les détails", type: 1 },
        { name: "event", description: "Liste des prochains événements NVG", type: 1 },
        { name: "viking", description: "Membres NVG (hors Petits Vikings)", type: 1 },
        { name: "live", description: "Chaînes NVG en direct en ce moment", type: 1 },
      ];
      await discord(`/applications/${APPLICATION_ID}/commands`, { method: "PUT", body: JSON.stringify(commands) });
      return json({ ok: true, commandes: commands.map((c) => c.name) });
    }

    return json({ error: "action inconnue" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "erreur inconnue" }, 500);
  }
});
