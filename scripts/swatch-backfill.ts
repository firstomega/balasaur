/**
 * Read every poster's tile swatch and write SQL that stores it.
 *
 *   bun scripts/swatch-backfill.ts --list titles.json --out ./swatch-sql
 *   bun scripts/swatch-backfill.ts --from-db --out ./swatch-sql
 *
 * Titles come either from a JSON file of { id, poster, pop } rows (any source
 * of media_id, poster_url and popularity), or, with --from-db, straight from
 * public.media through PostgREST using APP_SUPABASE_URL and
 * APP_SUPABASE_SERVICE_ROLE_KEY. Each title's w92 poster is downloaded from
 * image.tmdb.org and run through posterSwatchFromJpeg (src/lib/posterSwatch.ts),
 * the same code the nightly pass uses. Results are cached in <out>/results.json,
 * so a second run only reads posters it has not read yet.
 *
 * WHY SQL FILES. The container this was first run from had no service key, so
 * the only way to write was the Supabase SQL tool, one statement at a time,
 * and every byte of a statement had to pass through that tool. So a batch does
 * not list its media ids. It names a slice of the catalog by popularity rank
 * (rows with a poster that are not `sensitive`, ordered by popularity desc
 * nulls last, then media_id in byte order) and carries one short token per
 * row, in rank order:
 *
 *   a..n    swatch number 1..14 (SWATCH_KEYS order), no second swatch
 *   A..N x  swatch, then its second swatch as a..n
 *   .       poster could not be read: swatch null, stamped so it is not retried
 *
 * Two guards make a mismatch write nothing: an md5 of the slice's
 * "media_id poster_url" pairs, which fails if the catalog moved (a title added,
 * a poster or popularity changed) since the list was taken, and an md5 of the
 * token string itself, which fails if the statement was damaged on the way.
 * A failed batch reports fine = false and changes no row; re-take the list and
 * run again.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { posterSwatchFromJpeg, SWATCH_KEYS, type PosterSwatch } from "../src/lib/posterSwatch";

interface Row {
  id: string;
  poster: string;
  pop: number | null;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const OUT = opt("--out", "./swatch-sql");
const BATCH = Number(opt("--batch", "8000"));
const CONCURRENCY = Number(opt("--concurrency", "24"));
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;

// ------------------------------------------------------------------ titles

async function rowsFromDb(): Promise<Row[]> {
  const url = process.env.APP_SUPABASE_URL;
  const key = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("--from-db needs APP_SUPABASE_URL and APP_SUPABASE_SERVICE_ROLE_KEY");
  const out: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const q =
      `${url}/rest/v1/media?select=media_id,poster_url,popularity` +
      `&poster_url=not.is.null&sensitive=eq.false` +
      `&order=popularity.desc.nullslast,media_id.asc`;
    const res = await fetch(q, {
      headers: { apikey: key, authorization: `Bearer ${key}`, range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`media read failed: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as {
      media_id: string;
      poster_url: string;
      popularity: number | null;
    }[];
    for (const r of page) out.push({ id: r.media_id, poster: r.poster_url, pop: r.popularity });
    if (page.length < PAGE) break;
  }
  return out;
}

async function rowsFromList(path: string): Promise<Row[]> {
  const raw = JSON.parse(await readFile(path, "utf8")) as Partial<Row>[];
  const byId = new Map<string, Row>();
  for (const r of raw) {
    if (!r.id || !r.poster) continue;
    byId.set(r.id, { id: r.id, poster: r.poster, pop: typeof r.pop === "number" ? r.pop : null });
  }
  return [...byId.values()];
}

/** The database's order: popularity desc nulls last, then media_id byte order. */
function rankOrder(a: Row, b: Row): number {
  if (a.pop !== b.pop) {
    if (a.pop === null) return 1;
    if (b.pop === null) return -1;
    return b.pop - a.pop;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ------------------------------------------------------------------ posters

function w92(url: string): string {
  return url.replace(/\/t\/p\/[^/]+\//, "/t/p/w92/");
}

/** A token, or null when the fetch itself failed and should be retried. */
async function readPoster(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(w92(url), { signal: ctrl.signal });
    if (res.status === 403 || res.status === 404) return ".";
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return ".";
    return encode(posterSwatchFromJpeg(buf));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const LOWER = "abcdefghijklmn";
const UPPER = LOWER.toUpperCase();

export function encode(s: PosterSwatch | null): string {
  if (!s) return ".";
  const i = SWATCH_KEYS.indexOf(s.swatch);
  if (!s.swatchAlt) return LOWER[i];
  return UPPER[i] + LOWER[SWATCH_KEYS.indexOf(s.swatchAlt)];
}

// ------------------------------------------------------------------ SQL

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

function batchSql(slice: Row[], lo: number, tokens: string[]): string {
  const codes = tokens.join("");
  const setHash = md5(slice.map((r) => `${r.id} ${r.poster}`).join(","));
  const keys = SWATCH_KEYS.map((k) => `'${k}'`).join(",");
  const hi = lo + slice.length;
  return `-- swatch batch: ranks ${lo + 1}..${hi}
with p as (select $c$${codes}$c$::text c),
k as (select t.n::int rn, t.m[1] tok from p, regexp_matches(p.c, '[A-N][a-n]|[a-n.]', 'g') with ordinality t(m, n)),
r as (select media_id, poster_url, row_number() over (order by popularity desc nulls last, media_id collate "C") rn from public.media where poster_url is not null and sensitive = false),
s as (select * from r where rn > ${lo} and rn <= ${hi}),
ok as (select (select md5(string_agg(media_id || ' ' || poster_url, ',' order by rn)) from s) = '${setHash}' and (select count(*) from k) = ${slice.length} and (select md5(c) from p) = '${md5(codes)}' fine),
u as (update public.media m set
  swatch = case when k.tok = '.' then null else (array[${keys}])[ascii(lower(left(k.tok, 1))) - 96] end,
  swatch_alt = case when length(k.tok) = 2 then (array[${keys}])[ascii(right(k.tok, 1)) - 96] end,
  swatch_at = now()
  from s join k on k.rn = s.rn - ${lo}
  where m.media_id = s.media_id and (select fine from ok)
  returning 1)
select (select fine from ok) fine, (select count(*) from u) updated;
`;
}

// ------------------------------------------------------------------ run

async function main() {
  await mkdir(OUT, { recursive: true });
  const rows = flag("--from-db") ? await rowsFromDb() : await rowsFromList(opt("--list", ""));
  rows.sort(rankOrder);
  console.log(`${rows.length} titles with a poster`);

  const cachePath = `${OUT}/results.json`;
  const cache: Record<string, { poster: string; tok: string }> = existsSync(cachePath)
    ? JSON.parse(await readFile(cachePath, "utf8"))
    : {};
  const todo = rows.filter((r) => cache[r.id]?.poster !== r.poster);
  console.log(`${todo.length} posters to read`);

  let done = 0;
  let failed = 0;
  let next = 0;
  const started = Date.now();
  async function worker() {
    while (next < todo.length) {
      const r = todo[next++];
      let tok: string | null = null;
      for (let attempt = 0; attempt < 3 && tok === null; attempt++)
        tok = await readPoster(r.poster);
      if (tok === null) failed++;
      else cache[r.id] = { poster: r.poster, tok };
      if (++done % 2000 === 0) {
        console.log(
          `${done}/${todo.length} read, ${failed} failed, ${Math.round((Date.now() - started) / 1000)}s`,
        );
        await writeFile(cachePath, JSON.stringify(cache));
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await writeFile(cachePath, JSON.stringify(cache));
  console.log(`read ${done}, ${failed} fetches failed and are left for the nightly queue`);

  // Batches stop at the first title with no result, because a slice must be
  // complete to match the database's ranks.
  let lo = 0;
  let n = 0;
  while (lo < rows.length) {
    const slice = rows.slice(lo, lo + BATCH);
    const tokens = slice.map((r) => cache[r.id]?.tok);
    const gap = tokens.indexOf(undefined);
    if (gap === 0) break;
    const full = gap < 0 ? slice : slice.slice(0, gap);
    const name = `${OUT}/batch-${String(++n).padStart(3, "0")}.sql`;
    await writeFile(name, batchSql(full, lo, tokens.slice(0, full.length) as string[]));
    lo += full.length;
    if (gap >= 0) break;
  }
  console.log(`${n} batch files cover ranks 1..${lo}`);
}

if (import.meta.main) await main();
