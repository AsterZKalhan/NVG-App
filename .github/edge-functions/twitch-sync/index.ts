// Synchronise les abonnements EventSub « stream.online » :
// une souscription par chaîne NVG (chaîne principale + membres éligibles de nvg_streamers).
// Réservé aux admins (JWT). Les notifications arrivent sur twitch-eventsub, qui relaie à discord-bot.

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
const CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET") ?? "";
const EVENTSUB_SECRET = Deno.env.get("TWITCH_EVENTSUB_SECRET") ?? "";

const MAIN_TWITCH_LOGIN = "nvgamingtv";
const HELIX = "https://api.twitch.tv/helix";
const KEEP_STATUSES = ["enabled", "webhook_callback_verification_pending"];

async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nvg_is_admin`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: authHeader, "Content-Type": "application/json" },
    body: "{}",
  });
  return res.ok && (await res.json()) === true;
}

async function appToken(): Promise<string> {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Jeton Twitch : ${res.status}`);
  return (await res.json()).access_token;
}

async function helix(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${HELIX}${path}`, {
    ...init,
    headers: { "Client-Id": CLIENT_ID, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Twitch ${res.status} ${path} : ${await res.text()}`);
  return res.json();
}

async function eligibleLogins(): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/nvg_streamers?select=twitch_channel`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Lecture de nvg_streamers : ${res.status}`);
  const rows: { twitch_channel: string }[] = await res.json();
  const logins = new Set([MAIN_TWITCH_LOGIN, ...rows.map((r) => r.twitch_channel.trim().toLowerCase())]);
  return [...logins].filter((l) => /^[a-z0-9_]{3,25}$/.test(l));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);
  if (!(await isAdmin(req.headers.get("Authorization")))) return json({ error: "réservé aux admins" }, 403);

  try {
    const token = await appToken();
    const logins = await eligibleLogins();

    // Identifiants Twitch des chaînes (l'API accepte 100 logins par appel).
    const idByLogin = new Map<string, string>();
    for (let i = 0; i < logins.length; i += 100) {
      const qs = logins.slice(i, i + 100).map((l) => `login=${encodeURIComponent(l)}`).join("&");
      const users = await helix(token, `/users?${qs}`);
      for (const u of users.data) idByLogin.set(String(u.login).toLowerCase(), String(u.id));
    }
    const wantedIds = new Set(idByLogin.values());

    // Abonnements existants (toutes les pages).
    const existing: any[] = [];
    let cursor: string | undefined;
    do {
      const page = await helix(token, `/eventsub/subscriptions?type=stream.online${cursor ? `&after=${cursor}` : ""}`);
      existing.push(...page.data);
      cursor = page.pagination?.cursor;
    } while (cursor);

    const callback = `${SUPABASE_URL}/functions/v1/twitch-eventsub`;
    const kept = new Set<string>();
    let removed = 0;
    for (const sub of existing) {
      const broadcaster = String(sub.condition?.broadcaster_user_id ?? "");
      const valid =
        wantedIds.has(broadcaster) &&
        !kept.has(broadcaster) &&
        KEEP_STATUSES.includes(sub.status) &&
        sub.transport?.callback === callback;
      if (valid) {
        kept.add(broadcaster);
      } else {
        await helix(token, `/eventsub/subscriptions?id=${encodeURIComponent(sub.id)}`, { method: "DELETE" });
        removed++;
      }
    }

    let subscribed = 0;
    for (const id of wantedIds) {
      if (kept.has(id)) continue;
      await helix(token, "/eventsub/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          type: "stream.online",
          version: "1",
          condition: { broadcaster_user_id: id },
          transport: { method: "webhook", callback, secret: EVENTSUB_SECRET },
        }),
      });
      subscribed++;
    }

    return json({ ok: true, chaines: idByLogin.size, deja_actives: kept.size, crees: subscribed, supprimes: removed });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "erreur inconnue" }, 500);
  }
});
