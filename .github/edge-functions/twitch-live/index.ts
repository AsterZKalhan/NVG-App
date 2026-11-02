const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

let cachedToken: { value: string; expires: number } | null = null;
const cache: Record<string, { at: number; data: unknown }> = {};

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.value;
  const params = new URLSearchParams({
    client_id: Deno.env.get("TWITCH_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("TWITCH_CLIENT_SECRET") ?? "",
    grant_type: "client_credentials",
  });
  const res = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body: params });
  const data = await res.json();
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const params = new URL(req.url).searchParams;
  const logins = (params.get("logins") ?? params.get("login") ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9_]{3,25}$/.test(s))
    .slice(0, 50);
  if (logins.length === 0) return json({ error: "login invalide" }, 400);

  const cacheKey = [...logins].sort().join(",");
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.at < 15000) return json(cached.data);

  const token = await getToken();
  const headers = { "Client-Id": Deno.env.get("TWITCH_CLIENT_ID") ?? "", Authorization: `Bearer ${token}` };
  const [streamsRes, usersRes] = await Promise.all([
    fetch(`https://api.twitch.tv/helix/streams?${logins.map((l) => `user_login=${l}`).join("&")}`, { headers }),
    fetch(`https://api.twitch.tv/helix/users?${logins.map((l) => `login=${l}`).join("&")}`, { headers }),
  ]);
  if (!streamsRes.ok || !usersRes.ok) return json({ error: "twitch indisponible" }, 502);

  const streams = (await streamsRes.json()).data || [];
  const users = (await usersRes.json()).data || [];

  const result: Record<string, unknown> = {};
  for (const login of logins) {
    const stream = streams.find((s: any) => s.user_login === login);
    const user = users.find((u: any) => u.login === login);
    result[login] = {
      live: !!stream,
      viewers: stream ? stream.viewer_count : 0,
      title: stream ? stream.title : "",
      game: stream ? stream.game_name : "",
      avatar: user ? user.profile_image_url : "",
    };
  }

  const first = result[logins[0]] as { live: boolean; viewers: number };
  const data = { live: first.live, viewers: first.viewers, streams: result };
  cache[cacheKey] = { at: Date.now(), data };
  return json(data);
});
