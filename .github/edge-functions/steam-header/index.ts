const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const link = new URL(req.url).searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(link);
  } catch {
    return json({ error: "url invalide" }, 400);
  }
  if (target.protocol !== "https:") return json({ error: "url invalide" }, 400);

  const steam = target.hostname.endsWith("steampowered.com") ? target.pathname.match(/\/app\/(\d+)/) : null;
  if (steam) {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steam[1]}&filters=basic`);
    const data = await res.json();
    const image = data?.[steam[1]]?.success ? data[steam[1]].data?.header_image ?? null : null;
    return json({ image });
  }

  const page = await fetch(target.toString(), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NVG-App/1.0)" },
    redirect: "follow",
  });
  if (!page.ok) return json({ image: null });

  const html = (await page.text()).slice(0, 500000);
  const tag = html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*>/i)?.[0];
  const content = tag?.match(/content=["']([^"']+)["']/i)?.[1] ?? null;
  return json({ image: content ? new URL(content, target).toString() : null });
});
