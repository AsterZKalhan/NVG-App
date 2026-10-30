const enc = new TextEncoder();
const seenMessages = new Set<string>();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function announceLive(): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const target = Deno.env.get("TWITCH_NOTIFY_TARGET") || "Divinité";
  const notif = {
    id: "notif_" + Date.now(),
    title: "NVG est en live !",
    body: "Le stream vient de commencer. Rejoins-nous sur NVG en Live.",
    target,
    time: new Date().toISOString(),
    image: "",
  };

  await fetch(`${url}/rest/v1/nvg_notifications`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(notif),
  });

  await fetch(`${url}/functions/v1/send-push`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ record: notif }),
  });
}

Deno.serve(async (req) => {
  const body = await req.text();
  const id = req.headers.get("Twitch-Eventsub-Message-Id") ?? "";
  const timestamp = req.headers.get("Twitch-Eventsub-Message-Timestamp") ?? "";
  const signature = req.headers.get("Twitch-Eventsub-Message-Signature") ?? "";
  const messageType = req.headers.get("Twitch-Eventsub-Message-Type") ?? "";

  const secret = Deno.env.get("TWITCH_EVENTSUB_SECRET") ?? "";
  const expected = "sha256=" + (await hmacHex(secret, id + timestamp + body));
  if (!secret || !safeEqual(expected, signature)) {
    return new Response("forbidden", { status: 403 });
  }

  const payload = JSON.parse(body);

  if (messageType === "webhook_callback_verification") {
    return new Response(payload.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  if (messageType === "notification" && payload.subscription?.type === "stream.online") {
    if (!seenMessages.has(id)) {
      seenMessages.add(id);
      await announceLive();
    }
  }

  return new Response("ok", { status: 200 });
});
