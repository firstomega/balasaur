// Search Console collector.
//
// Google gives no read-only key for Search Console, so this signs a JWT with
// the service-account private key, trades it for an access token, and calls
// the API. The key lives only in this function's environment
// (GSC_SERVICE_ACCOUNT_JSON); it is never in the repo, the database, or a
// chat transcript.
//
// Why a copy of the data at all: Search Console keeps 16 months and the UI
// cannot be read by an agent. Storing rows in Postgres means every future
// session can ask "what is ranking, and did last month's change help" in SQL,
// and the history outlives Google's window.
//
// REACHABILITY. This function is gated by verify_jwt, which sounds like
// authentication but is satisfied by the project anon key, and that key ships
// inside the browser bundle by design. So treat every request as if it came
// from a stranger, because it can. Rather than add a shared secret, which is
// one more credential to create, store and rotate, the dangerous capabilities
// are gone and the expensive ones are bounded:
//
//   * The "sites" action is removed. It listed every Search Console property
//     this service account can read, and it used to be the DEFAULT action, so
//     an empty POST body disclosed it. Nothing in the product ever called it.
//   * The caller can no longer choose the site. resolveSite() always detects
//     the balasaur property itself; any params.site is ignored.
//   * "sync" and "totals" are capped at MAX_DAYS and refuse to run again
//     within COOLDOWN_MINUTES. Both schedulers ask for 30 days once a day, so
//     the cooldown never blocks a real run, and a stranger cannot drive
//     repeated full pulls.
//   * "inspect" cannot use a time cooldown, because index_status_snapshot()
//     fires eight calls back to back in one sweep. It is bounded by a daily
//     URL budget instead, which is what actually protects the URL Inspection
//     quota, and its URLs are restricted to this site's own origin.
//
// Actions:
//   {"action":"sync","days":N}     pull the last N days of performance rows
//   {"action":"totals","days":N}   same window at date+page grain, unfiltered
//   {"action":"inspect","urls":[...],"store":bool}  per-URL index status
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const ORIGIN = "https://balasaur.com";

/** Both schedulers ask for 30. Anything beyond this is someone else's idea. */
const MAX_DAYS = 90;
/** Under the once-a-day schedule, so a real run is never blocked. */
const COOLDOWN_MINUTES = 720;
/** Google's URL Inspection quota is 2,000/day. The sweep uses 200. */
const INSPECT_DAILY_BUDGET = 400;

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function b64url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PEM (PKCS#8) to the raw DER bytes WebCrypto wants. */
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        exp: now + 3600,
        iat: now,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${b64url(sig)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${JSON.stringify(json)}`);
  return json.access_token as string;
}

async function gsc(token: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`https://searchconsole.googleapis.com/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`gsc ${path} ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

/**
 * The property to read, always detected here. This used to accept an explicit
 * site from the caller, which let a stranger point the collector at any other
 * property the service account could read.
 */
async function resolveSite(token: string): Promise<string> {
  const list = (await gsc(token, "webmasters/v3/sites")) as {
    siteEntry?: { siteUrl: string; permissionLevel: string }[];
  };
  const entries = list.siteEntry ?? [];
  const balasaur = entries.filter((e) => e.siteUrl.includes("balasaur"));
  // A domain property covers every subdomain and protocol, so prefer it.
  const domain = balasaur.find((e) => e.siteUrl.startsWith("sc-domain:"));
  const chosen = domain ?? balasaur[0] ?? entries[0];
  if (!chosen) throw new Error("no Search Console property is readable by this service account");
  return chosen.siteUrl;
}

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Minutes since this action last completed, or null if it never has. */
async function minutesSince(
  supabase: ReturnType<typeof admin>,
  action: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("gsc_sync_log")
    .select("ran_at")
    .eq("ok", true)
    .like("detail", `edge:${action}%`)
    .order("ran_at", { ascending: false })
    .limit(1);
  const last = (data ?? [])[0]?.ran_at as string | undefined;
  if (!last) return null;
  return (Date.now() - new Date(last).getTime()) / 60_000;
}

async function note(supabase: ReturnType<typeof admin>, action: string, detail: string) {
  await supabase.from("gsc_sync_log").insert({ ok: true, detail: `edge:${action} ${detail}` });
}

/** Own-origin only. Anything else is dropped rather than inspected. */
function ownOrigin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = new URL(raw, ORIGIN);
    return parsed.origin === ORIGIN ? parsed.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const raw = Deno.env.get("GSC_SERVICE_ACCOUNT_JSON");
    if (!raw) throw new Error("GSC_SERVICE_ACCOUNT_JSON is not set");
    const sa = JSON.parse(raw) as ServiceAccount;

    const params = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = params.action as string | undefined;
    if (action !== "sync" && action !== "totals" && action !== "inspect") {
      // No default. The old default was "sites", which disclosed every property
      // this service account could read to anyone who sent an empty body.
      return Response.json(
        { ok: false, error: "action must be one of: sync, totals, inspect" },
        { status: 400 },
      );
    }

    const supabase = admin();

    if (action === "sync" || action === "totals") {
      const since = await minutesSince(supabase, action);
      if (since !== null && since < COOLDOWN_MINUTES) {
        return Response.json(
          {
            ok: false,
            error: "cooling down",
            action,
            minutesSinceLastRun: Math.round(since),
            cooldownMinutes: COOLDOWN_MINUTES,
          },
          { status: 429 },
        );
      }
    }

    const token = await getAccessToken(sa);
    const site = await resolveSite(token);
    const enc = encodeURIComponent(site);

    // {"action":"inspect","urls":[...]}               read index status, return it
    // {"action":"inspect","urls":[...],"store":true}  also write a snapshot
    //
    // Whether Google has crawled a page moves in days; impressions take weeks
    // and at this volume are mostly noise. Storing the snapshot is how a change
    // gets judged before the impression data catches up.
    if (action === "inspect") {
      // Own-origin only, and bounded by a daily budget rather than a cooldown:
      // index_status_snapshot() fires eight of these back to back, so a time
      // window would block its own sweep after the first call.
      const requested: unknown[] = Array.isArray(params.urls) ? params.urls : [];
      const urls = requested.map(ownOrigin).filter((u): u is string => u !== null);
      const rejected = requested.length - urls.length;
      if (urls.length === 0) {
        return Response.json(
          { ok: false, error: `no url on ${ORIGIN}`, rejected },
          { status: 400 },
        );
      }

      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("index_status")
        .select("url", { count: "exact", head: true })
        .gte("checked_at", dayStart.toISOString());
      const usedToday = count ?? 0;
      if (usedToday >= INSPECT_DAILY_BUDGET) {
        return Response.json(
          {
            ok: false,
            error: "daily inspection budget spent",
            usedToday,
            budget: INSPECT_DAILY_BUDGET,
          },
          { status: 429 },
        );
      }
      const allowance = Math.max(0, Math.min(25, INSPECT_DAILY_BUDGET - usedToday));

      const out: unknown[] = [];
      const rows: Record<string, unknown>[] = [];
      const checkedAt = new Date().toISOString();
      for (const url of urls.slice(0, allowance)) {
        try {
          const r = (await gsc(token, "v1/urlInspection/index:inspect", {
            inspectionUrl: url,
            siteUrl: site,
          })) as {
            inspectionResult?: {
              indexStatusResult?: Record<string, string | undefined>;
            };
          };
          out.push({ url, result: r });
          const s = r.inspectionResult?.indexStatusResult ?? {};
          rows.push({
            checked_at: checkedAt,
            url,
            family: url.includes("/best/")
              ? "collection"
              : url.includes("/person/")
                ? "person"
                : url.includes("/movie/")
                  ? "movie"
                  : url.includes("/tv/")
                    ? "tv"
                    : "page",
            verdict: s.verdict ?? null,
            coverage_state: s.coverageState ?? null,
            last_crawl: s.lastCrawlTime ?? null,
            robots_state: s.robotsTxtState ?? null,
            google_canonical: s.googleCanonical ?? null,
          });
        } catch (e) {
          out.push({ url, error: String(e) });
        }
      }

      if (params.store && rows.length > 0) {
        const { error } = await supabase.from("index_status").upsert(rows, {
          onConflict: "checked_at,url",
        });
        if (error) throw new Error(`upsert: ${error.message}`);
      }

      return Response.json({
        ok: true,
        site,
        stored: !!params.store,
        rejected,
        usedToday,
        inspections: out,
      });
    }

    if (action === "sync") {
      const days = Math.min(Number(params.days ?? 30) || 30, MAX_DAYS);
      // Search Console finalizes data on a 2 to 3 day lag; asking for today
      // returns nothing and looks like a failure.
      const end = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
      const start = new Date(Date.now() - (days + 3) * 86_400_000).toISOString().slice(0, 10);

      const rows: Record<string, unknown>[] = [];
      let startRow = 0;
      for (let page = 0; page < 20; page++) {
        const r = (await gsc(token, `webmasters/v3/sites/${enc}/searchAnalytics/query`, {
          startDate: start,
          endDate: end,
          dimensions: ["date", "page", "query"],
          rowLimit: 25000,
          startRow,
          dataState: "final",
        })) as {
          rows?: {
            keys: string[];
            clicks: number;
            impressions: number;
            ctr: number;
            position: number;
          }[];
        };
        const batch = r.rows ?? [];
        for (const row of batch) {
          rows.push({
            date: row.keys[0],
            page: row.keys[1],
            query: row.keys[2],
            clicks: Math.round(row.clicks),
            impressions: Math.round(row.impressions),
            ctr: row.ctr,
            position: row.position,
          });
        }
        if (batch.length < 25000) break;
        startRow += batch.length;
      }

      let written = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase
          .from("gsc_performance")
          .upsert(chunk, { onConflict: "date,page,query" });
        if (error) throw new Error(`upsert: ${error.message}`);
        written += chunk.length;
      }
      await note(supabase, "sync", `${written} rows ${start} to ${end}`);
      return Response.json({ ok: true, site, start, end, rows: rows.length, written });
    }

    // Same window, no query dimension. Search Console withholds query-level
    // rows for rare or personally-identifying searches, so summing the
    // date+page+query table undercounts badly: five impressions a day where
    // the page report says thirty. Trending on that number would have us
    // reading the wrong one every night. Without the query dimension nothing
    // is withheld, so this is the table to judge progress by.
    const days = Math.min(Number(params.days ?? 30) || 30, MAX_DAYS);
    // Yesterday, not three days ago: with dataState "all" there is data to
    // read that recently, and the whole point of this action is to see
    // whether a change did anything without waiting most of a week.
    const end = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const start = new Date(Date.now() - (days + 1) * 86_400_000).toISOString().slice(0, 10);

    const rows: Record<string, unknown>[] = [];
    let startRow = 0;
    for (let page = 0; page < 20; page++) {
      const r = (await gsc(token, `webmasters/v3/sites/${enc}/searchAnalytics/query`, {
        startDate: start,
        endDate: end,
        dimensions: ["date", "page"],
        rowLimit: 25000,
        startRow,
        // "all" includes the last day or two that Google has not finalized.
        // Those numbers can still move, but waiting three days to see whether
        // a change did anything is worse than reading a provisional figure
        // and knowing it is provisional.
        dataState: "all",
      })) as {
        rows?: {
          keys: string[];
          clicks: number;
          impressions: number;
          ctr: number;
          position: number;
        }[];
      };
      const batch = r.rows ?? [];
      for (const row of batch) {
        rows.push({
          date: row.keys[0],
          page: row.keys[1],
          clicks: Math.round(row.clicks),
          impressions: Math.round(row.impressions),
          ctr: row.ctr,
          position: row.position,
        });
      }
      if (batch.length < 25000) break;
      startRow += batch.length;
    }

    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase
        .from("gsc_page_daily")
        .upsert(chunk, { onConflict: "date,page" });
      if (error) throw new Error(`upsert: ${error.message}`);
      written += chunk.length;
    }
    await note(supabase, "totals", `${written} rows ${start} to ${end}`);
    return Response.json({ ok: true, site, start, end, rows: rows.length, written });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
