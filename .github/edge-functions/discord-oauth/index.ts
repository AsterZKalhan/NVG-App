// Connexion Discord de l'espace « Bot Discord NVG » (bot-discord.nvg-tv.com).
// Échange le code OAuth2 contre un jeton temporaire, lit les serveurs où le membre
// a le droit « Gérer le serveur », puis met à jour nvg_discord_managers.
// Le jeton Discord n'est jamais stocké. Le secret OAuth reste dans Supabase
// (DISCORD_OAUTH_SECRET) et n'est jamais renvoyé au navigateur.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CLIENT_ID = "1569625316601757747";
// Doit correspondre exactement à la redirection enregistrée dans le portail Discord.
const REDIRECT_URI = "https://bot-discord.nvg-tv.com/";
const DISCORD_API = "https://discord.com/api/v10";
const MANAGE_GUILD = 0x20n;

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

function canManage(guild: any): boolean {
  if (guild?.owner === true) return true;
  try {
    return (BigInt(String(guild?.permissions ?? "0")) & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "connexion NVG requise" }, 401);

  // Compte NVG : la session Supabase de la page bot-discord.
  const me = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: authHeader },
  });
  if (!me.ok) return json({ error: "session NVG expirée, reconnecte-toi" }, 401);
  const user = await me.json();

  const profile = await sb(`nvg_users?select=id,name,rank&id=eq.${encodeURIComponent(user.id)}`);
  const rows = profile.ok ? await profile.json() : [];
  if (!rows[0]) return json({ error: "compte NVG introuvable" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "requête invalide" }, 400);
  }

  const code = String(body.code ?? "").trim();
  if (!code) return json({ error: "code Discord manquant" }, 400);

  const secret = Deno.env.get("DISCORD_OAUTH_SECRET") ?? "";
  if (!secret || secret === "A_REMPLACER") {
    console.error("DISCORD_OAUTH_SECRET absent");
    return json({ error: "connexion Discord non configurée" }, 500);
  }

  // 1. Échange du code OAuth2.
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: secret,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!tokenRes.ok) {
    console.error("Discord OAuth token :", tokenRes.status, await tokenRes.text());
    return json({ error: "connexion Discord refusée, réessaie" }, 400);
  }
  const token = await tokenRes.json();
  const accessToken = String(token.access_token ?? "");
  if (!accessToken) return json({ error: "réponse Discord invalide" }, 502);

  // 2. Serveurs du membre, filtrés sur « Gérer le serveur » ou propriétaire.
  const guildRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!guildRes.ok) {
    console.error("Discord guilds :", guildRes.status, await guildRes.text());
    return json({ error: "impossible de lire tes serveurs Discord" }, 502);
  }
  const all: any[] = await guildRes.json();
  const managed = (Array.isArray(all) ? all : []).filter(canManage);
  const updatedAt = new Date().toISOString();

  // 3. Remplacement des droits enregistrés pour ce compte.
  const del = await sb(`nvg_discord_managers?user_id=eq.${encodeURIComponent(user.id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  if (!del.ok) throw new Error(`suppression des droits : ${del.status}`);

  if (managed.length > 0) {
    const ins = await sb("nvg_discord_managers", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(
        managed.map((g) => ({
          user_id: user.id,
          guild_id: String(g.id),
          guild_name: String(g.name ?? "").slice(0, 200),
          guild_icon: g.icon ? String(g.icon) : null,
          updated_at: updatedAt,
        })),
      ),
    });
    if (!ins.ok) throw new Error(`enregistrement des droits : ${ins.status}`);
  }

  return json({
    ok: true,
    member: { name: rows[0].name, rank: rows[0].rank },
    guilds: managed.map((g) => ({
      id: String(g.id),
      name: String(g.name ?? ""),
      icon: g.icon ? String(g.icon) : null,
    })),
  });
});
