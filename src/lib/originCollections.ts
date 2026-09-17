import { loose } from "@/lib/supabaseLoose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CARD_COLS, rowToCardItem, type CardRow } from "./catalog.functions";
import type { CollectionRow } from "./collectionsProse";
import type { CollectionDetail, CollectionSummary } from "./collections.functions";

// Country-of-origin collections ("The Best Japanese Movies"), computed at
// request time from the media table instead of materialized by the nightly
// rebuild_collections() run.
//
// Why request-time: the materialized matrix lives in the owner's database,
// which this repo's tooling cannot run DDL against. The read path, the gate,
// and the ranking below are a deliberate port of the origin x genre block in
// rebuild_collections() (see the v10 collections migration), so a dynamic
// shelf and a materialized one answer to the same standard. If the matrix
// ever grows a plain-origin kind in SQL, the DB row wins: getCollection
// checks the table first and only falls through to this module on a miss.
//
// Why these pages exist: they are the demand the matrix cannot reach.
// "best japanese movies" and "best korean shows" carry real search volume
// (Semrush, 2026-09: 2,400/mo and 3,600/mo, low-to-moderate difficulty) and
// the incumbents have no dedicated page for the cross. The genre crosses
// (best-japanese-horror-movies) already exist; the plain country shelf did
// not.

export interface OriginDef {
  /** The value stored in media.origins, e.g. "Korean". */
  label: string;
  /** The slug piece, e.g. "korean" in best-korean-movies. */
  slug: string;
}

// The same seven origins the materialized origin x genre matrix covers. An
// origin not in this list 404s, which keeps the long tail of two-film
// countries from minting thin pages.
export const ORIGIN_DEFS: OriginDef[] = [
  { label: "Korean", slug: "korean" },
  { label: "Japanese", slug: "japanese" },
  { label: "Chinese", slug: "chinese" },
  { label: "Indian", slug: "indian" },
  { label: "French", slug: "french" },
  { label: "Spanish", slug: "spanish" },
  { label: "British", slug: "british" },
];

/** A country shelf needs at least this many eligible titles to exist. */
const MIN_ITEMS = 20;

export interface ParsedOriginSlug {
  def: OriginDef;
  mediaType: "movie" | "tv";
}

/** best-japanese-movies -> { Japanese, movie }. Anything else -> null. */
export function parseOriginSlug(slug: string): ParsedOriginSlug | null {
  const m = /^best-([a-z]+)-(movies|shows)$/.exec(slug);
  if (!m) return null;
  const def = ORIGIN_DEFS.find((d) => d.slug === m[1]);
  if (!def) return null;
  return { def, mediaType: m[2] === "movies" ? "movie" : "tv" };
}

export function originSlugFor(def: OriginDef, mediaType: "movie" | "tv"): string {
  return `best-${def.slug}-${mediaType === "movie" ? "movies" : "shows"}`;
}

export function originTitleFor(def: OriginDef, mediaType: "movie" | "tv"): string {
  return `The Best ${def.label} ${mediaType === "movie" ? "Movies" : "Shows"}`;
}

interface OriginCandidate extends CardRow {
  overview: string | null;
  rating_balasaur: number | null;
  quality_score: number | null;
}

/**
 * Fetch the eligible pool for one country shelf. The filter is the _elig gate
 * from rebuild_collections() translated to PostgREST: not suggestive, poster
 * and overview present, scored and quality-ranked, and corroborated, meaning
 * real TMDB vote volume OR an IMDb score backed by a critic source or real
 * popularity. Rows are cut to 60 by quality_score (the selection order), then
 * re-sorted for display by the number printed on the card, the same
 * selection-vs-display split the SQL uses.
 */
async function fetchOriginPool(
  def: OriginDef,
  mediaType: "movie" | "tv",
): Promise<{ rows: OriginCandidate[]; total: number } | null> {
  const { data, error, count } = await loose(supabaseAdmin)
    .from("media")
    .select(`${CARD_COLS},overview,rating_balasaur,quality_score`, { count: "exact" })
    .eq("media_type", mediaType)
    .contains("origins", [def.label])
    .eq("suggestive", false)
    .not("poster_url", "is", null)
    .not("overview", "is", null)
    .neq("overview", "")
    .not("rating_balasaur", "is", null)
    .not("quality_score", "is", null)
    .or(
      "vote_count.gte.25," +
        "and(rating_imdb.not.is.null," +
        "or(rating_rotten_tomatoes.not.is.null,rating_metacritic.not.is.null,popularity.gte.20))",
    )
    .order("quality_score", { ascending: false })
    .limit(60);
  if (error) {
    console.error(`[origin-collections] pool failed for ${def.slug}:`, error.message);
    return null;
  }
  return { rows: (data ?? []) as unknown as OriginCandidate[], total: count ?? 0 };
}

/** Display order: the score on the card, then quality, then a stable key. */
function displaySort(rows: OriginCandidate[]): OriginCandidate[] {
  return [...rows].sort(
    (a, b) =>
      (b.rating_balasaur ?? 0) - (a.rating_balasaur ?? 0) ||
      (b.quality_score ?? 0) - (a.quality_score ?? 0) ||
      a.media_id.localeCompare(b.media_id),
  );
}

function buildRow(
  def: OriginDef,
  mediaType: "movie" | "tv",
  ranked: OriginCandidate[],
  total: number,
): CollectionRow {
  const scores = ranked
    .map((r) => r.rating_balasaur)
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b);
  const median = scores.length > 0 ? scores[Math.floor(scores.length / 2)] : null;
  const dated = ranked
    .filter((r) => r.release_date && /^\d{4}-\d{2}-\d{2}/.test(r.release_date))
    .sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));
  const newest = dated[0] ?? null;
  return {
    slug: originSlugFor(def, mediaType),
    kind: "origin",
    title: originTitleFor(def, mediaType),
    item_count: total,
    top_score: scores.length > 0 ? Math.round(scores[scores.length - 1]) : null,
    median_score: median !== null ? Math.round(median) : null,
    newest_title: newest?.title ?? null,
    newest_date: newest?.release_date?.slice(0, 10) ?? null,
    // Not materialized by the nightly rebuild, so there is no rebuild stamp
    // to show. The page omits the chip when this is null.
    updated_at: null,
  };
}

/**
 * The collection for a country slug, or null when the slug is not a country
 * shelf or the gate refuses it. The gate refusing is the feature: a country
 * with fewer than MIN_ITEMS eligible titles gets a 404, not a thin page.
 */
export async function buildOriginCollection(slug: string): Promise<CollectionDetail | null> {
  const parsed = parseOriginSlug(slug);
  if (!parsed) return null;
  const pool = await fetchOriginPool(parsed.def, parsed.mediaType);
  if (!pool || pool.total < MIN_ITEMS) return null;
  const ranked = displaySort(pool.rows);
  return {
    row: buildRow(parsed.def, parsed.mediaType, ranked, pool.total),
    items: ranked.map((r) => rowToCardItem(r)),
  };
}

/**
 * Every country shelf that passes the gate, for the hub and the sitemap.
 * Runs the fourteen pools concurrently; each is one indexed read. Shelves
 * that fail or fall under the gate simply do not appear, which is the same
 * "the gate is the curator" posture as the materialized matrix.
 */
export async function listOriginCollections(): Promise<CollectionSummary[]> {
  const combos = ORIGIN_DEFS.flatMap(
    (def) =>
      [
        { def, mediaType: "movie" as const },
        { def, mediaType: "tv" as const },
      ] as const,
  );
  const built = await Promise.all(
    combos.map(async ({ def, mediaType }): Promise<CollectionSummary | null> => {
      const pool = await fetchOriginPool(def, mediaType);
      if (!pool || pool.total < MIN_ITEMS) return null;
      const ranked = displaySort(pool.rows);
      const row = buildRow(def, mediaType, ranked, pool.total);
      return {
        ...row,
        posters: ranked
          .slice(0, 5)
          .map((r) => r.poster_url)
          .filter((p): p is string => !!p),
        top_titles: ranked.slice(0, 3).map((r) => ({
          title: r.title,
          score: r.rating_balasaur !== null ? Math.round(r.rating_balasaur) : null,
        })),
        season_months: null,
        media_type: mediaType,
      };
    }),
  );
  return built
    .filter((b): b is CollectionSummary => b !== null)
    .sort((a, b) => b.item_count - a.item_count);
}
