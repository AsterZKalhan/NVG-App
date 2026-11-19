// Synchronisation des billets Weezevent vers la base (appelée toutes les 5 minutes par pg_cron).
// Pour chaque tournoi non terminé qui a un événement Weezevent :
//  1. lit les participants (billets) sur Weezevent ;
//  2. range chaque billet dans nvg_tournament_tickets ;
//  3. rattache les joueurs NVG (par e-mail, puis par pseudo) et passe leur inscription en « payé »
//     quand le billet est payé et non supprimé (un billet équipe couvre ses 5 joueurs).
// Aucune donnée n'est supprimée : à la fin du tournoi, la synchronisation s'arrête (archive).
// Protégée par le secret x-sync-secret (secret Supabase SYNC_SECRET).

const CORS_JSON = { "content-type": "application/json" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_JSON });
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

// Membres déclarés dans le formulaire : « Identifiant NVG » / « E-mail NVG » (billet personnel)
// ou « Pseudo NVG joueur N » / « Mail NVG joueur N » (billet équipe).
function membersFrom(answers: Array<{ label: string; value: string }>, ownerEmail: string) {
  const members: Array<{ pseudo: string; email: string }> = [];
  const byIndex = new Map<string, { pseudo: string; email: string }>();
  let pseudo = "";
  let email = "";
  for (const a of answers) {
    const label = String(a.label || "").trim();
    const value = String(a.value || "").trim();
    let m: RegExpMatchArray | null;
    if (/^identifiant nvg$/i.test(label)) pseudo = value;
    else if (/^e-?mail nvg$/i.test(label)) email = value;
    else if ((m = label.match(/^pseudo nvg joueur (\d+)$/i))) byIndex.set(m[1], { pseudo: value, email: byIndex.get(m[1])?.email || "" });
    else if ((m = label.match(/^mail nvg joueur (\d+)$/i))) byIndex.set(m[1], { pseudo: byIndex.get(m[1])?.pseudo || "", email: value });
  }
  if (byIndex.size) {
    for (const v of byIndex.values()) if (v.pseudo || v.email) members.push(v);
  } else if (pseudo || email || ownerEmail) {
    members.push({ pseudo, email: (email || ownerEmail).toLowerCase() });
  }
  return members.map((m) => ({ pseudo: m.pseudo, email: m.email.toLowerCase() }));
}

Deno.serve(async (req) => {
  if (req.headers.get("x-sync-secret") !== (Deno.env.get("SYNC_SECRET") || "__none__")) {
    return new Response("forbidden", { status: 403 });
  }
  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const rest = (path: string, init: RequestInit = {}) => fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: service, authorization: `Bearer ${service}`, "content-type": "application/json", ...(init.headers || {}) },
  });

  const tournaments = await rest("nvg_tournaments?select=id,weez_event_id,status&weez_event_id=not.is.null&status=not.in.(finished,cancelled)")
    .then((r) => r.json());
  const stats = { tournaments: 0, tickets: 0, matched_players: 0, paid: 0, unpaid: 0 };

  try {
    const token = await weezToken();
    const q = `api_key=${encodeURIComponent(Deno.env.get("key_apiweez") || "")}&access_token=${encodeURIComponent(token)}`;

    for (const t of tournaments as Array<{ id: string; weez_event_id: string }>) {
      stats.tournaments += 1;
      const data = await fetch(`https://api.weezevent.com/participant/list?${q}&id_event[]=${encodeURIComponent(t.weez_event_id)}&full=1`).then((r) => r.json());
      const list = Array.isArray(data.participants) ? data.participants : [];
      const catalog = await fetch(`https://api.weezevent.com/tickets?${q}&id_event[]=${encodeURIComponent(t.weez_event_id)}`).then((r) => r.json()).catch(() => ({}));
      const ticketNames = new Map<string, string>();
      for (const ev of catalog.events || []) for (const tk of ev.tickets || []) ticketNames.set(String(tk.id), String(tk.name));

      for (const p of list) {
        const answers = Array.isArray(p.answers) ? p.answers : [];
        const ownerEmail = String(p.owner?.email || "").toLowerCase();
        const members = membersFrom(answers, ownerEmail);
        const paid = String(p.paid) === "true";
        const deleted = String(p.deleted) === "1";
        const orderRef = String(p.transaction_reference || "");

        // Rattachement : e-mail d'abord, puis pseudo.
        const linked: Array<{ pseudo: string; email: string; user_id: string | null; source: string | null }> = [];
        for (const m of members) {
          let user: { id: string } | null = null;
          let source: string | null = null;
          if (m.email) {
            const rows = await rest(`nvg_users?select=id&email=ilike.${encodeURIComponent(m.email)}&limit=1`).then((r) => r.json());
            if (rows[0]) { user = rows[0]; source = "email"; }
          }
          if (!user && m.pseudo) {
            const rows = await rest(`nvg_users?select=id&name=ilike.${encodeURIComponent(m.pseudo)}&limit=1`).then((r) => r.json());
            if (rows[0]) { user = rows[0]; source = "pseudo"; }
          }
          linked.push({ ...m, user_id: user?.id || null, source });
        }
        const primary = linked[0];
        await rest("nvg_tournament_tickets?on_conflict=weez_event_id,barcode", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates" },
          body: JSON.stringify([{
            tournament_id: t.id,
            weez_event_id: t.weez_event_id,
            barcode: String(p.barcode || ""),
            ticket_ref: String(p.id_weez_ticket || ""),
            order_ref: orderRef,
            ticket_id: String(p.id_ticket || ""),
            ticket_name: ticketNames.get(String(p.id_ticket)) || "",
            first_name: p.owner?.first_name || "",
            last_name: p.owner?.last_name || "",
            email: ownerEmail,
            pseudo: primary?.pseudo || "",
            buyer_name: [p.buyer?.acheteur_first_name, p.buyer?.acheteur_last_name].filter(Boolean).join(" "),
            buyer_email: String(p.buyer?.email_acheteur || "").toLowerCase(),
            paid,
            deleted,
            scanned: p.control_status?.status || "",
            scan_date: p.control_status?.scan_date || "",
            create_date: p.create_date || "",
            user_id: primary?.user_id || null,
            match_source: primary?.source || null,
            members: linked,
            synced_at: new Date().toISOString(),
          }]),
        });
        stats.tickets += 1;

        // Paiement : seulement pour les joueurs rattachés qui ont une inscription dans le tournoi.
        for (const m of linked) {
          if (!m.user_id) continue;
          const player = await rest(`nvg_tournament_players?select=payment_status,payment_source&tournament_id=eq.${t.id}&user_id=eq.${encodeURIComponent(m.user_id)}&limit=1`).then((r) => r.json());
          if (!player[0]) continue;
          stats.matched_players += 1;
          if (paid && !deleted && player[0].payment_status !== "paid") {
            await rest(`nvg_tournament_players?tournament_id=eq.${t.id}&user_id=eq.${encodeURIComponent(m.user_id)}`, {
              method: "PATCH",
              body: JSON.stringify({ payment_status: "paid", paid_at: new Date().toISOString(), payment_reference: orderRef, payment_source: "weezevent" }),
            });
            stats.paid += 1;
          } else if ((!paid || deleted) && player[0].payment_source === "weezevent" && player[0].payment_status === "paid") {
            // Billet retiré côté Weezevent : on ne repasse en attente que ce que la synchronisation avait posé.
            await rest(`nvg_tournament_players?tournament_id=eq.${t.id}&user_id=eq.${encodeURIComponent(m.user_id)}`, {
              method: "PATCH",
              body: JSON.stringify({ payment_status: "awaiting", paid_at: null, payment_source: null }),
            });
            stats.unpaid += 1;
          }
        }
      }
    }
    return json({ ok: true, ...stats });
  } catch (_error) {
    return json({ ok: false, error: "weezevent_unavailable" }, 502);
  }
});
