// « Vérifier mon paiement » : relance la synchronisation Weezevent à la demande d'un joueur connecté.
// Limitée à une exécution par minute (toutes les demandes partagent la même limite), pour ne pas
// solliciter Weezevent à chaque clic. La synchronisation reste la seule à écrire le paiement.
// Déploiement : Supabase, fonction « weezevent-check », vérification JWT activée.

const COOLDOWN_MS = 60_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const rest = (path: string, init: RequestInit = {}) => fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: service, authorization: `Bearer ${service}`, "content-type": "application/json", ...(init.headers || {}) },
  });

  // Qui demande : l'identifiant vient du jeton de l'appelant, jamais du corps de la requête.
  const me = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${jwt}` } }).then((r) => r.json()).catch(() => ({}));
  if (!me?.id) return json({ error: "unauthorized" }, 401);

  // Limite partagée : une synchronisation au plus toutes les 60 secondes.
  const last = await rest("nvg_payment_config?select=value&key=eq.weez_last_sync&limit=1").then((r) => r.json()).catch(() => []);
  const lastAt = Number(last?.[0]?.value || 0);
  if (Date.now() - lastAt < COOLDOWN_MS) return json({ ok: true, throttled: true });

  await rest("nvg_payment_config?on_conflict=key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ key: "weez_last_sync", value: String(Date.now()) }]),
  });

  const sync = await fetch(`${url}/functions/v1/weezevent-sync`, {
    method: "POST",
    headers: { "x-sync-secret": Deno.env.get("SYNC_SECRET") || "", "content-type": "application/json", apikey: anon },
    body: "{}",
  }).then((r) => r.json()).catch(() => ({ ok: false }));

  return json({ ok: sync?.ok === true, throttled: false });
});
