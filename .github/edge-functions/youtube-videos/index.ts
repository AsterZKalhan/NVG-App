// Dernières vidéos de la chaîne YouTube NVG.
// Source : API publique de la page YouTube (Innertube), sans clé API ni secret.
// Mise en cache 10 minutes pour limiter les appels.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Réponse normale : gardée 24 h (mise à jour une fois par jour).
const cacheableJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
  });

const CHANNEL_ID = Deno.env.get("YOUTUBE_CHANNEL_ID") ?? "UC7WH5BSCYpme0_6NLBWiAiw";
const CHANNEL_URL = "https://www.youtube.com/@nvgamingtv";
const CHANNEL_HANDLE = "@nvgamingtv";
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
// Onglet « Vidéos » de la chaîne.
const VIDEOS_TAB_PARAMS = "EgZ2aWRlb3PyBgQKAjoA";
const CACHE_MS = 24 * 60 * 60 * 1000;

let cache: { key: string; at: number; data: unknown } | null = null;

type Video = {
  id: string;
  title: string;
  views: string;
  published: string;
  thumbnail: string;
  url: string;
};

function parseVideos(data: any, limit: number): Video[] {
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  const videos: Video[] = [];

  for (const tab of tabs) {
    const grid = tab?.tabRenderer?.content?.richGridRenderer?.contents;
    if (!Array.isArray(grid)) continue;

    for (const entry of grid) {
      const lockup = entry?.richItemRenderer?.content?.lockupViewModel;
      if (!lockup || !lockup.contentId) continue;
      if (lockup.contentType && !/VIDEO/i.test(String(lockup.contentType))) continue;

      const meta = lockup.metadata?.lockupMetadataViewModel;
      const title = meta?.title?.content ?? "";
      if (!title) continue;

      const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
      const parts: string[] = [];
      for (const row of rows) {
        for (const part of row?.metadataParts ?? []) {
          const text = part?.text?.content;
          if (text) parts.push(String(text));
        }
      }

      const views = parts.find((p) => /vue|view|regard/i.test(p)) ?? parts[0] ?? "";
      const published = parts.find((p) => /il y a|ago|diffus|streamed/i.test(p)) ?? parts[1] ?? "";

      videos.push({
        id: lockup.contentId,
        title,
        views,
        published,
        thumbnail: `https://i.ytimg.com/vi/${lockup.contentId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${lockup.contentId}`,
      });

      if (videos.length >= limit) return videos;
    }

    if (videos.length > 0) break;
  }

  return videos;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const params = new URL(req.url).searchParams;
  const requested = Number(params.get("limit") ?? 3);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 20) : 3;

  const cacheKey = `${CHANNEL_ID}:${limit}`;
  if (cache && cache.key === cacheKey && Date.now() - cache.at < CACHE_MS) {
    return cacheableJson(cache.data);
  }

  try {
    const body = JSON.stringify({
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240101.00.00",
          hl: "fr",
          gl: "FR",
        },
      },
      browseId: CHANNEL_ID,
      params: VIDEOS_TAB_PARAMS,
    });

    const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}&prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Youtube-Client-Name": "1",
        "X-Youtube-Client-Version": "2.20240101.00.00",
        Origin: "https://www.youtube.com",
        Referer: `https://www.youtube.com/${CHANNEL_HANDLE}/videos`,
        Cookie: "CONSENT=YES+cb.20210328-17-p0.fr+FX+655; SOCS=CAI",
      },
      body,
    });

    if (!res.ok) return json({ error: "youtube indisponible", status: res.status }, 502);

    const data = await res.json();
    const videos = parseVideos(data, limit);
    if (videos.length === 0) {
      // Diagnostic : structure réellement renvoyée par YouTube.
      const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
      const diag = tabs.map((tab: any) => ({
        title: tab?.tabRenderer?.title ?? null,
        keys: Object.keys(tab?.tabRenderer?.content ?? {}),
      }));
      return json({ error: "aucune video trouvee", diag, contentsKeys: data?.contents ? Object.keys(data.contents) : [] }, 502);
    }

    const payload = {
      channel: "Normandy Viking Gaming",
      channelUrl: CHANNEL_URL,
      updatedAt: new Date().toISOString(),
      videos,
    };

    cache = { key: cacheKey, at: Date.now(), data: payload };
    return cacheableJson(payload);
  } catch (_err) {
    return json({ error: "youtube indisponible" }, 502);
  }
});
