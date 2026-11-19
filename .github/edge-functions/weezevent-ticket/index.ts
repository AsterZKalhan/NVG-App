// Infos billet Weezevent d'un joueur, pour les admins uniquement.
// Les identifiants Weezevent sont des secrets Supabase (key_apiweez, user_apiweez,
// mdp_apiweez, mail_apiweez) : ils ne sont jamais renvoyés au navigateur.
// Déploiement : Supabase, fonction « weezevent-ticket », vérification JWT activée.

const WEEZ_EVENT_ID = "2598465"; // « Tournoi des 9 mondes » sur Weezevent

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

async function weezToken(): Promise<string> {
  const key = Deno.env.get("key_apiweez") || "";
  const pass = Deno.env.get("mdp_apiweez") || "";
  for (const username of [Deno.env.get("mail_apiweez") || "", Deno.env.get("user_apiweez") || ""]) {
    if (!username) continue;
    const res = await fetch("https://api.weezevent.com/auth/access_token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({ username, password: pass, api_key: key }).toString(),
    });
    const body = await res.json().catch(() => ({}));
    const token = body.accessToken || body.access_token || "";
    if (token) return token;
  }
  throw new Error("weezevent_auth");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Seuls les admins : le contrôle se fait avec le jeton de l'appelant.
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const isAdmin = await fetch(`${url}/rest/v1/rpc/nvg_is_admin`, {
    method: "POST",
    headers: { apikey: anon, authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: "{}",
  }).then((r) => r.json()).catch(() => false);
  if (isAdmin !== true) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const eventId = String(body.event_id || WEEZ_EVENT_ID).replace(/\D/g, "");
  if (!email || !eventId) return json({ error: "bad_request" }, 400);

  try {
    const token = await weezToken();
    const q = `api_key=${encodeURIComponent(Deno.env.get("key_apiweez") || "")}&access_token=${encodeURIComponent(token)}`;

    const tickets = await fetch(`https://api.weezevent.com/tickets?${q}&id_event[]=${eventId}`).then((r) => r.json()).catch(() => ({}));
    const names = new Map<string, string>();
    for (const ev of tickets.events || []) {
      for (const t of ev.tickets || []) names.set(String(t.id), String(t.name));
    }

    const data = await fetch(`https://api.weezevent.com/participant/list?${q}&id_event[]=${eventId}&full=1`).then((r) => r.json());
    const all = Array.isArray(data.participants) ? data.participants : [];
    const mine = all.filter((p: Record<string, any>) => {
      const owner = String(p.owner?.email || "").toLowerCase();
      const buyer = String(p.buyer?.email_acheteur || "").toLowerCase();
      return owner === email || buyer === email;
    });

    return json({
      participants: mine.map((p: Record<string, any>) => ({
        first_name: p.owner?.first_name || "",
        last_name: p.owner?.last_name || "",
        email: p.owner?.email || "",
        buyer_name: [p.buyer?.acheteur_first_name, p.buyer?.acheteur_last_name].filter(Boolean).join(" "),
        buyer_email: p.buyer?.email_acheteur || "",
        barcode: String(p.barcode || ""),
        ticket_ref: String(p.id_weez_ticket || ""),
        order_ref: String(p.transaction_reference || ""),
        ticket_id: String(p.id_ticket || ""),
        ticket_name: names.get(String(p.id_ticket)) || "",
        paid: String(p.paid) === "true",
        scanned: p.control_status?.status || "",
        scan_date: p.control_status?.scan_date || "",
        create_date: p.create_date || "",
        deleted: String(p.deleted) === "1",
      })),
    });
  } catch (error) {
    return json({ error: "weezevent_unavailable" }, 502);
  }
});
