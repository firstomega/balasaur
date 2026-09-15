// Crawl-cost probe: how expensive is this site for Googlebot to fetch?
//
// Crawl budget is allocated partly on how fast a site answers. Time to first
// byte is the number that matters, not the fully-rendered paint: Googlebot
// counts the wait for HTML. Each URL is fetched twice so a cold miss and a
// warm CDN hit can be told apart, since a six-hour cache means most real
// crawls should be hits.
//
// This function is gated by verify_jwt, which sounds like authentication but is
// satisfied by the project anon key that ships inside the browser bundle. It
// used to fetch whatever URLs the caller passed, which made it a server-side
// request forgery relay any stranger could drive. Targets are now restricted to
// this site's own origin, so it still answers the question it exists to answer
// and cannot be pointed at anything else.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGIN = "https://balasaur.com";

/** Only this site's own pages. Anything else is dropped rather than fetched. */
function ownOrigin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let u: URL;
  try {
    u = new URL(raw, ORIGIN);
  } catch {
    return null;
  }
  return u.origin === ORIGIN ? u.toString() : null;
}

async function probe(url: string): Promise<Record<string, unknown>> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        // Ask as Googlebot does, so any UA-specific path is exercised.
        "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        accept: "text/html",
      },
    });
    const ttfb = Math.round(performance.now() - t0);
    const body = await res.text();
    const total = Math.round(performance.now() - t0);
    const h = res.headers;
    return {
      url,
      status: res.status,
      ttfb_ms: ttfb,
      total_ms: total,
      bytes: body.length,
      cache_control: h.get("cache-control"),
      cdn_cache:
        h.get("cf-cache-status") ?? h.get("x-vercel-cache") ?? h.get("x-cache") ?? h.get("age"),
      server: h.get("server"),
      // A page whose HTML carries no title never had server rendering.
      has_title: /<title[^>]*>/i.test(body),
      link_count: (body.match(/<a\s[^>]*href="\//gi) ?? []).length,
    };
  } catch (e) {
    return { url, error: String(e), ttfb_ms: Math.round(performance.now() - t0) };
  }
}

Deno.serve(async (req) => {
  const params = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const requested: unknown[] = Array.isArray(params.urls) ? params.urls : [`${ORIGIN}/`];
  const urls = requested.map(ownOrigin).filter((u): u is string => u !== null);
  const rejected = requested.length - urls.length;
  if (urls.length === 0) {
    return Response.json({ ok: false, error: `no target on ${ORIGIN}`, rejected }, { status: 400 });
  }
  const passes = Math.min(Number(params.passes ?? 2), 3);
  const out: Record<string, unknown>[] = [];
  for (let p = 1; p <= passes; p++) {
    for (const u of urls.slice(0, 12)) {
      const r = await probe(u);
      out.push({ pass: p, ...r });
    }
  }
  return Response.json({ ok: true, rejected, results: out });
});
