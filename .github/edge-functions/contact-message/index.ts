// Formulaire de contact NVG : stocke le message dans la table nvg_contact_messages
// (lisible uniquement par les admins) et envoie une notification push aux admins.
// Aucun e-mail n'est envoyé : les admins répondent depuis l'application (mailto).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUBJECTS = [
  "Demande d'information",
  "Recrutement streameur",
  "Prise de contact",
  "Suggestion",
];
const RECRUIT_SUBJECT = "Recrutement streameur";
// Cible des push : les admins (Grand Jarl et Divinité).
const ADMIN_TARGET = "Grand Jarl, Divinité";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_PER_IP = 5; // par 10 minutes
const MAX_PER_EMAIL = 3; // par heure

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized + "===".slice((normalized.length + 3) % 4));
};

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`nvg-contact:${SERVICE_KEY}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makeChallenge() {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 1;
  const payload = b64url(enc.encode(JSON.stringify({ a, b, exp: Date.now() + CHALLENGE_TTL_MS })));
  const token = `${payload}.${await hmacHex(payload)}`;
  return { question: `Combien font ${a} + ${b} ?`, token };
}

async function checkChallenge(token: unknown, answer: unknown): Promise<boolean> {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  const expected = await hmacHex(payload);
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return false;

  let data: { a: number; b: number; exp: number };
  try {
    data = JSON.parse(fromB64url(payload));
  } catch {
    return false;
  }
  if (!Number.isFinite(data.exp) || Date.now() > data.exp) return false;
  return Number(answer) === data.a + data.b;
}

const clean = (value: unknown, max: number): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > max ? `__TOO_LONG__${max}` : text;
};

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

// Limitation simple en mémoire, par isolate (protection de base contre le spam).
const ipHits = new Map<string, number[]>();
function ipAllowed(ip: string): boolean {
  const now = Date.now();
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= MAX_PER_IP) {
    ipHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  ipHits.set(ip, recent);
  return true;
}

async function recentCountForEmail(email: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/nvg_contact_messages?select=id&email=eq.${encodeURIComponent(email)}&created_at=gte.${since}`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    },
  );
  const range = res.headers.get("content-range") ?? "";
  const total = Number(range.split("/")[1] ?? 0);
  return Number.isFinite(total) ? total : 0;
}

async function notifyAdmins(title: string, body: string): Promise<void> {
  const notif = {
    id: "notif_" + Date.now(),
    title,
    body,
    image: "",
    target: ADMIN_TARGET,
    time: new Date().toISOString(),
  };
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ record: notif }),
    });
  } catch (_err) {
    // La notification est un bonus : le message reste consultable dans l'onglet admin.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // 1. Le formulaire demande un défi anti-robot.
  if (req.method === "GET") {
    return json(await makeChallenge());
  }

  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "requête invalide" }, 400);
  }

  // 2. Piège à robots : un humain ne remplit jamais ce champ caché.
  if (clean(payload.website, 200)) return json({ ok: true });

  const ip = (req.headers.get("x-forwarded-for") ?? "inconnu").split(",")[0].trim();
  if (!ipAllowed(ip)) {
    return json({ error: "Trop de messages envoyés. Réessaie dans quelques minutes." }, 429);
  }

  // 3. Anti-robot (défi signé côté serveur).
  const captchaOk = await checkChallenge(payload.captcha_token, payload.captcha_answer);
  if (!captchaOk) {
    return json({ error: "La vérification anti-robot a échoué. Merci de réessayer." }, 400);
  }

  // 4. Champs obligatoires et validation.
  const firstName = clean(payload.first_name, 80);
  const lastName = clean(payload.last_name, 80);
  const pseudo = clean(payload.pseudo, 60);
  const email = (clean(payload.email, 254) ?? "").toLowerCase();
  const subject = clean(payload.subject, 60);
  const message = clean(payload.message, 50000);
  const twitch = clean(payload.twitch_channel, 100);
  const instagram = clean(payload.instagram, 300);
  const xAccount = clean(payload.x_account, 300);
  const discord = clean(payload.discord, 300);
  const youtube = clean(payload.youtube, 300);

  for (const [label, value] of [
    ["prénom", firstName],
    ["nom", lastName],
    ["e-mail", email],
    ["objet", subject],
  ] as const) {
    if (!value) return json({ error: `Le champ ${label} est obligatoire.` }, 400);
    if (value.startsWith("__TOO_LONG__")) return json({ error: `Le champ ${label} est trop long.` }, 400);
  }

  if (!isEmail(email)) return json({ error: "L'adresse e-mail n'est pas valide." }, 400);
  if (!subject || !SUBJECTS.includes(subject)) return json({ error: "Objet de contact inconnu." }, 400);

  if (subject === RECRUIT_SUBJECT) {
    if (!twitch) return json({ error: "Le nom de la chaîne Twitch est obligatoire." }, 400);
    if (twitch.startsWith("__TOO_LONG__")) return json({ error: "Le nom de la chaîne Twitch est trop long." }, 400);
  } else if (!message) {
    return json({ error: "Le message est obligatoire." }, 400);
  }

  if (message && message.startsWith("__TOO_LONG__")) return json({ error: "Le message est trop long." }, 400);
  for (const value of [instagram, xAccount, discord, youtube]) {
    if (value && value.startsWith("__TOO_LONG__")) return json({ error: "Un lien de réseau social est trop long." }, 400);
  }

  // 5. Limitation par adresse e-mail.
  try {
    if ((await recentCountForEmail(email)) >= MAX_PER_EMAIL) {
      return json({ error: "Trop de messages envoyés avec cette adresse. Réessaie plus tard." }, 429);
    }
  } catch (_err) {
    // En cas de doute on continue : le message reste utile.
  }

  // 6. Enregistrement du message.
  const row = {
    first_name: firstName,
    last_name: lastName,
    pseudo: pseudo && !pseudo.startsWith("__TOO_LONG__") ? pseudo : null,
    email,
    subject,
    message: message && !message.startsWith("__TOO_LONG__") ? message : null,
    twitch_channel: twitch && !twitch.startsWith("__TOO_LONG__") ? twitch : null,
    instagram: instagram && !instagram.startsWith("__TOO_LONG__") ? instagram : null,
    x_account: xAccount && !xAccount.startsWith("__TOO_LONG__") ? xAccount : null,
    discord: discord && !discord.startsWith("__TOO_LONG__") ? discord : null,
    youtube: youtube && !youtube.startsWith("__TOO_LONG__") ? youtube : null,
  };

  const insert = await fetch(`${SUPABASE_URL}/rest/v1/nvg_contact_messages`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!insert.ok) {
    console.error("Insert contact:", insert.status, await insert.text());
    return json({ error: "Impossible d'enregistrer le message. Réessaie plus tard." }, 500);
  }

  // 7. Notification push aux admins uniquement (pas d'historique public).
  const nameLabel = row.pseudo ? `${firstName} "${row.pseudo}" ${lastName}` : `${firstName} ${lastName}`;
  const notifTitle = `Nouveau contact app NVG - ${nameLabel} - ${subject}`;
  const notifBody = (row.message || (row.twitch_channel ? `Chaîne Twitch : ${row.twitch_channel}` : "Nouveau message reçu"))
    .replace(/\s+/g, " ")
    .slice(0, 180);

  await notifyAdmins(notifTitle, notifBody);

  return json({ ok: true });
});
