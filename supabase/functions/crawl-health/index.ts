// Crawl health probe. Fetches a sample of every page family as Googlebot,
// records status and time to first byte, and writes the results to
// public.crawl_health so a regression is a row someone can read later rather
// than something noticed by chance.
//
// Search Console reports "Server error (5xx): 1 page" days after the fact and
// never says which URL. This is how we find out ourselves, the same day.
//
// This function is gated by verify_jwt, which sounds like authentication but is
// satisfied by the project anon key that ships inside the browser bundle. It
// used to accept a caller-supplied `urls` array and fetch it with the service
// role key, which made it a server-side request forgery relay any stranger
// could drive. The URL list now comes only from crawl_health_sample(), whose
// SQL hard-codes the https://balasaur.com prefix, so a caller can choose how
// many URLs are probed but never which ones.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function familyOf(url: string): string {
  const p = url.replace("https://balasaur.com", "");
  if (p.startsWith("/best/")) return "collection";
  if (p.startsWith("/movie/")) return "movie";
  if (p.startsWith("/tv/")) return "tv";
  if (p.startsWith("/person/")) return "person";
  if (p.endsWith(".xml") || p.endsWith(".txt")) return "machine";
  return "static";
}

async function probe(url: string) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": UA } });
    const ttfb = Math.round(performance.now() - t0);
    const body = await res.text();
    return {
      url,
      family: familyOf(url),
      status: res.status,
      ttfb_ms: ttfb,
      bytes: body.length,
      error: null as string | null,
    };
  } catch (e) {
    return {
      url,
      family: familyOf(url),
      status: null,
      ttfb_ms: Math.round(performance.now() - t0),
      bytes: null,
      error: String(e),
    };
  }
}

Deno.serve(async (req) => {
  try {
    const params = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // The sample RPC is the only source of URLs. Its SQL builds every entry from
    // the https://balasaur.com prefix, so this cannot be pointed elsewhere.
    const perFamily = Math.min(Math.max(Number(params.perFamily ?? 6) || 6, 1), 20);
    const { data, error } = await supabase.rpc("crawl_health_sample", {
      p_per_family: perFamily,
    });
    if (error) throw new Error(`sample: ${error.message}`);
    const urls = (data as string[]) ?? [];

    const results = [];
    // Sequential on purpose: this is a health check, not a load test, and
    // hammering our own origin would measure the wrong thing.
    for (const u of urls.slice(0, 80)) results.push(await probe(u));

    const { error: insErr } = await supabase.from("crawl_health").insert(results);
    if (insErr) throw new Error(`insert: ${insErr.message}`);

    const bad = results.filter((r) => r.status === null || (r.status ?? 0) >= 400);
    return Response.json({
      ok: true,
      checked: results.length,
      bad: bad.length,
      badUrls: bad.map((b) => ({ url: b.url, status: b.status, error: b.error })),
      slowest: [...results].sort((a, b) => b.ttfb_ms - a.ttfb_ms).slice(0, 5),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
