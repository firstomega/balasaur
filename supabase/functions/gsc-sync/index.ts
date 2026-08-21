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
// Actions:
//   {"action":"sites"}   list properties this service account can read
//   {"action":"sync","days":N}  pull the last N days of performance rows
//   {"action":"inspect","urls":[...]}  per-URL index status
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

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

/** The property to read. Detected once from sites.list, then remembered. */
async function resolveSite(token: string, explicit?: string): Promise<string> {
  if (explicit) return explicit;
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

Deno.serve(async (req) => {
  try {
    const raw = Deno.env.get("GSC_SERVICE_ACCOUNT_JSON");
    if (!raw) throw new Error("GSC_SERVICE_ACCOUNT_JSON is not set");
    const sa = JSON.parse(raw) as ServiceAccount;

    const params = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = (params.action ?? "sites") as string;
    const token = await getAccessToken(sa);

    if (action === "sites") {
      const sites = await gsc(token, "webmasters/v3/sites");
      return Response.json({ ok: true, sites });
    }

    const site = await resolveSite(token, params.site);
    const enc = encodeURIComponent(site);

    if (action === "inspect") {
      const urls = (params.urls ?? []) as string[];
      const out: unknown[] = [];
      for (const url of urls.slice(0, 25)) {
        try {
          const r = await gsc(token, "v1/urlInspection/index:inspect", {
            inspectionUrl: url,
            siteUrl: site,
          });
          out.push({ url, result: r });
        } catch (e) {
          out.push({ url, error: String(e) });
        }
      }
      return Response.json({ ok: true, site, inspections: out });
    }

    if (action === "sync") {
      const days = Math.min(Number(params.days ?? 480), 480);
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
        })) as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] };
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

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      let written = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase
          .from("gsc_performance")
          .upsert(chunk, { onConflict: "date,page,query" });
        if (error) throw new Error(`upsert: ${error.message}`);
        written += chunk.length;
      }
      return Response.json({ ok: true, site, start, end, rows: rows.length, written });
    }

    return Response.json({ ok: false, error: `unknown action ${action}` }, { status: 400 });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
