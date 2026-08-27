import type {
  MediaDetail,
  MediaItem,
  MediaPerson,
  MediaSeason,
  PersonCreditGroup,
  PersonDetail,
  WatchProvidersAllRegions,
} from "@/types/media";
import { unifyGenres } from "./genres";
import { deriveOrigins } from "./origins";
import { deriveFacets } from "./taxonomy";
import { computeBalasaurScore } from "./score";
import { computeQualityScore, computeRankScore } from "./rank";
import { deriveSensitive } from "./contentSafety";
import { mediaSlug } from "./slug";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json, TablesInsert } from "@/integrations/supabase/types";

type MediaRow = TablesInsert<"media">;

/**
 * How many title URLs the sitemap asks Google to index. Deliberately small.
 * Googlebot crawls this site at roughly 100 pages a day, so a focused list
 * indexes faster than an aspirational one, and a mass of thin pages drags the
 * whole domain's quality assessment down with it.
 */
export const SITEMAP_TITLE_BUDGET = 2500;

const TMDB_BASE = "https://api.themoviedb.org/3";
const OMDB_BASE = "https://www.omdbapi.com";
const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/original";
const SEASON_POSTER_BASE = "https://image.tmdb.org/t/p/w342";
const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DETAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TRENDING_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CATALOG_LIMIT = 10000;
const POSTGREST_PAGE = 1000;
const DISCOVER_PAGES = 500; // TMDB max: ~10,000 of each type — enough headroom to keep adding new titles
const TOP_RATED_PAGES = 25; // ~500 of each type — classics
const TRENDING_PAGES = 5; // ~100 of each type — currently hot
// Provider-targeted discovery: pull the most-popular titles actually streaming on a
// major service in each market, so the streaming/region filters fill out (general
// popularity discovery barely tags providers). Each request sweeps ONE
// (region × provider) combo to full TMDB depth; `providerBucket` rotates through all
// combos so the loop walks every service in every market over time.
const STREAMING_REGIONS = ["US", "GB", "CA", "AU", "DE", "FR", "JP", "KR", "IN"] as const;
// TMDB watch-provider ids for the majors, queried INDIVIDUALLY (not OR'd) so each
// service's full catalog is captured, not just the headliners shared across all.
const PROVIDER_IDS = [8, 9, 337, 1899, 15, 350, 531, 386, 73]; // Netflix, Prime, Disney+, Max, Hulu, Apple TV+, Paramount+, Peacock, Tubi
const PROVIDER_DISCOVER_PAGES = 500; // TMDB's hard page cap — go as deep as the API allows per combo
const OMDB_BUDGET_PER_RUN = 1500; // patron tier ~100k/day; ≥ MAX_ENRICH so every enriched title also gets OMDb ratings
// Keep each request SHORT. Enriching hundreds of titles in one HTTP call holds the
// request open for many minutes, and the host kills any request that runs that
// long — the gateway then returns a 502 and (since we only save at the end) the
// whole batch is lost. So we enrich a small batch per call and lean on the GitHub
// Actions loop to call this endpoint repeatedly — that's how the catalog fills.
const MAX_ENRICH_PER_RUN = 300; // titles enriched per request; the loop calls this many times
const ENRICH_HARD_CEILING = 500; // absolute per-request cap even if a caller asks for more (memory guard)
const ENRICH_TIME_BUDGET_MS = 120_000; // stop starting new enrichments past this so the request returns long before any host timeout
const TMDB_APPEND =
  "external_ids,credits,watch/providers,keywords,release_dates,content_ratings,images,videos,recommendations,similar";

let genreCache: { movie: Map<number, string>; tv: Map<number, string> } | null = null;

/** fetch with a hard timeout. A bare fetch() has no upper bound, so one hung TMDB/OMDb
 *  request can stall an enrichment pass past the host gateway limit — the classic
 *  "HTTP 000 / 0 bytes received" failure. AbortController caps every request. */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tmdb<T>(path: string, key: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetchWithTimeout(url.toString(), 12_000);
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function loadGenres(key: string) {
  if (genreCache) return genreCache;
  const [movie, tv] = await Promise.all([
    tmdb<{ genres: { id: number; name: string }[] }>("/genre/movie/list", key),
    tmdb<{ genres: { id: number; name: string }[] }>("/genre/tv/list", key),
  ]);
  genreCache = {
    movie: new Map(movie.genres.map((g) => [g.id, g.name])),
    tv: new Map(tv.genres.map((g) => [g.id, g.name])),
  };
  return genreCache;
}

interface TmdbTrendingItem {
  id: number;
  media_type?: "movie" | "tv";
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  popularity: number;
  genre_ids: number[];
}

function yearOf(d?: string): string {
  return d && d.length >= 4 ? d.slice(0, 4) : "";
}

function mapItem(
  raw: TmdbTrendingItem,
  type: "movie" | "tv",
  genreMap: Map<number, string>,
): MediaItem {
  const title = (type === "movie" ? raw.title : raw.name) ?? "Untitled";
  const date = type === "movie" ? raw.release_date : raw.first_air_date;
  const rawGenres = (raw.genre_ids ?? [])
    .map((id) => genreMap.get(id))
    .filter((x): x is string => !!x);
  return {
    id: `${type}-${raw.id}`,
    mediaType: type,
    title,
    year: yearOf(date),
    overview: raw.overview ?? "",
    posterUrl: raw.poster_path ? `${POSTER_BASE}${raw.poster_path}` : "",
    ratings: { tmdb: raw.vote_average ? Number(raw.vote_average.toFixed(1)) : undefined },
    genres: unifyGenres(rawGenres),
    streaming: [],
    lengthLabel: "",
    people: [],
    popularity: raw.popularity,
    releaseDate: date,
  };
}

// Build a card-level MediaItem from FULL TMDB details (not a discover row). Used by
// the long-tail refresh, which re-fetches stale titles by id. Mirrors mapItem but
// reads genres from the details `genres` objects, and falls back to the stored row's
// values so a sparse re-fetch can never blank an existing field.
function cardItemFromDetails(
  id: string,
  type: "movie" | "tv",
  d: TmdbDetails & Record<string, unknown>,
  existing: {
    title?: string | null;
    year?: string | null;
    poster_url?: string | null;
    genres?: string[] | null;
  },
): MediaItem {
  const dd = d as {
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string | null;
    overview?: string | null;
    vote_average?: number;
    popularity?: number;
    genres?: { name?: string }[];
  };
  const date = type === "movie" ? dd.release_date : dd.first_air_date;
  const genreNames = (dd.genres ?? []).map((g) => g?.name).filter((n): n is string => !!n);
  return {
    id,
    mediaType: type,
    title: (type === "movie" ? dd.title : dd.name) ?? existing.title ?? "Untitled",
    year: yearOf(date) || existing.year || "",
    overview: dd.overview ?? "",
    posterUrl: dd.poster_path ? `${POSTER_BASE}${dd.poster_path}` : (existing.poster_url ?? ""),
    ratings: { tmdb: dd.vote_average ? Number(dd.vote_average.toFixed(1)) : undefined },
    genres: genreNames.length ? unifyGenres(genreNames) : (existing.genres ?? []),
    streaming: [],
    lengthLabel: "",
    people: [],
    popularity: dd.popularity,
    releaseDate: date,
  };
}

const PROVIDER_NAME_MAP: Record<string, string> = {
  Netflix: "Netflix",
  Max: "Max",
  "HBO Max": "Max",
  "Amazon Prime Video": "Prime",
  "Amazon Prime Video with Ads": "Prime",
  "Apple TV+": "Apple TV+",
  "Apple TV Plus": "Apple TV+",
  // Apple rebranded the "Apple TV+" service to just "Apple TV" (2024); TMDB now
  // reports the subscription under this name. Safe to alias because we only read the
  // `flatrate` (subscription) block — the rent/buy "Apple TV" store lives elsewhere.
  "Apple TV": "Apple TV+",
  Hulu: "Hulu",
  "Disney Plus": "Disney+",
  "Disney+": "Disney+",
};

// B-tier services ship under many channel-variant names ("Paramount Plus
// Premium", "Paramount+ Roku Premium Channel", one even has a trailing space),
// so they normalize by prefix instead of exact name.
const PROVIDER_PREFIX_RULES: [RegExp, string][] = [
  [/^Paramount/i, "Paramount+"],
  [/^Peacock/i, "Peacock"],
  [/^Tubi/i, "Tubi"],
];

/** TMDB provider_name → our normalized service name (or null if untracked). */
function normalizeProviderName(raw: string | undefined): string | null {
  const name = (raw ?? "").trim();
  if (!name) return null;
  const exact = PROVIDER_NAME_MAP[name];
  if (exact) return exact;
  for (const [re, ours] of PROVIDER_PREFIX_RULES) if (re.test(name)) return ours;
  return null;
}

/**
 * Map a TMDB US `watch/providers` block to our normalized streaming-service set
 * (flatrate / subscription only). Shared by live enrichment and the raw backfill
 * so both produce identical `streaming` values.
 */
type ProviderBlock = {
  flatrate?: { provider_name: string }[];
  free?: { provider_name: string }[];
  ads?: { provider_name: string }[];
};

/** Subscription + free-with-ads entries for one region (AVOD services like
 *  Tubi report under free/ads, never flatrate). */
function regionProviders(block: ProviderBlock | undefined): { provider_name: string }[] {
  return [...(block?.flatrate ?? []), ...(block?.free ?? []), ...(block?.ads ?? [])];
}

function deriveStreaming(
  watchProviders: { results?: Record<string, ProviderBlock> } | undefined,
): string[] {
  const mapped = new Set<string>();
  for (const p of regionProviders(watchProviders?.results?.US)) {
    const name = normalizeProviderName(p.provider_name);
    if (name) mapped.add(name);
  }
  return Array.from(mapped);
}

/**
 * Region-aware streaming availability. Scans the flatrate block for EVERY region in
 * the TMDB watch/providers payload (not just US) and emits "Provider:REGION" tokens
 * (e.g. "Netflix:GB"). Lets the homepage filter streaming by the viewer's account
 * region. Shared by live enrichment and the raw backfill so both produce identical
 * values. Region codes are upper-cased to match TMDB's ISO-3166-1 keys.
 */
function deriveStreamingRegions(
  watchProviders: { results?: Record<string, ProviderBlock> } | undefined,
): string[] {
  const results = watchProviders?.results;
  if (!results) return [];
  const tokens = new Set<string>();
  for (const [region, block] of Object.entries(results)) {
    for (const p of regionProviders(block)) {
      const name = normalizeProviderName(p.provider_name);
      if (name) tokens.add(`${name}:${region.toUpperCase()}`);
    }
  }
  return Array.from(tokens);
}

const PROVIDER_LOGO_BASE = "https://image.tmdb.org/t/p/original";
let providerLogoCache: { at: number; map: Record<string, string> } | null = null;
const PROVIDER_LOGO_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Official logos for the featured streaming services, from TMDB's master provider
 * list (square branded marks). Returns { ourKey: logoUrl } for the providers in
 * PROVIDER_NAME_MAP. Cached in-process for a day; returns {} on any failure so the
 * UI falls back to the built-in glyphs (never breaks).
 */
export async function fetchProviderLogos(): Promise<Record<string, string>> {
  if (providerLogoCache && Date.now() - providerLogoCache.at < PROVIDER_LOGO_TTL_MS) {
    return providerLogoCache.map;
  }
  const key = process.env.TMDB_API_KEY;
  if (!key) return {};
  try {
    const data = await tmdb<{ results?: { provider_name: string; logo_path?: string | null }[] }>(
      "/watch/providers/movie",
      key,
      { watch_region: "US" },
    );
    const map: Record<string, string> = {};
    for (const p of data.results ?? []) {
      const ourKey = normalizeProviderName(p.provider_name);
      if (ourKey && p.logo_path && !map[ourKey]) {
        map[ourKey] = `${PROVIDER_LOGO_BASE}${p.logo_path}`;
      }
    }
    providerLogoCache = { at: Date.now(), map };
    return map;
  } catch (e) {
    console.error("[providers] logo fetch failed:", e);
    return {};
  }
}

interface TmdbDetails {
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  original_language?: string;
  origin_country?: string[];
  production_countries?: { iso_3166_1?: string; name?: string }[];
  credits?: {
    cast?: { name: string; character?: string }[];
    crew?: { name: string; job?: string; department?: string }[];
  };
  "watch/providers"?: {
    results?: Record<string, { flatrate?: { provider_name: string }[] }>;
  };
  seasons?: {
    season_number: number;
    name: string;
    episode_count: number;
    air_date: string | null;
    poster_path: string | null;
    overview: string | null;
  }[];
}

function enrichFromDetails(item: MediaItem, d: TmdbDetails): string | undefined {
  // People: director(s) + top cast
  const people: MediaPerson[] = [];
  const crew = d.credits?.crew ?? [];
  for (const c of crew) {
    if (c.job === "Director" || c.job === "Creator") {
      people.push({ name: c.name, role: c.job });
    }
  }
  // Show creators for TV from created_by-style crew already; cap directors at 2
  const cast = d.credits?.cast ?? [];
  for (const c of cast.slice(0, 6)) {
    people.push({ name: c.name, role: c.character || "Cast" });
  }
  // Dedupe by name
  const seen = new Set<string>();
  item.people = people.filter((p) => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  // Streaming providers (US, flatrate only)
  item.streaming = deriveStreaming(d["watch/providers"]);

  // Length
  if (item.mediaType === "movie" && d.runtime) {
    item.lengthLabel = `${d.runtime}m`;
  } else if (item.mediaType === "tv") {
    if (d.number_of_seasons) {
      item.lengthLabel = `${d.number_of_seasons} season${d.number_of_seasons === 1 ? "" : "s"}`;
    }
    if (d.seasons) {
      const seasons: MediaSeason[] = d.seasons
        .filter((s) => s.season_number > 0)
        .map((s) => ({
          seasonNumber: s.season_number,
          name: s.name,
          episodeCount: s.episode_count,
          airDate: s.air_date ?? "",
          posterUrl: s.poster_path ? `${SEASON_POSTER_BASE}${s.poster_path}` : undefined,
          overview: s.overview ?? undefined,
        }));
      item.seasons = seasons;
    }
  }

  // Origin facet: from original language + production / origin countries.
  const countries = [
    ...(d.origin_country ?? []),
    ...(d.production_countries ?? []).map((c) => c.iso_3166_1 ?? "").filter(Boolean),
  ];
  item.origins = deriveOrigins(d.original_language, countries);

  return d.imdb_id ?? d.external_ids?.imdb_id ?? undefined;
}

interface OmdbResponse {
  Response: "True" | "False";
  imdbRating?: string;
  Metascore?: string;
  Ratings?: { Source: string; Value: string }[];
  Awards?: string;
}

function parsePct(v: string): number | undefined {
  const n = parseInt(v.replace("%", ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

export interface AwardInfo {
  winner: boolean;
  nominee: boolean;
  wins?: number;
  nominations?: number;
}

/**
 * Parse OMDB "Awards" free-text into structured flags/counts.
 * Examples: "Won 7 Oscars. 145 wins & 220 nominations total."
 *           "Nominated for 3 BAFTA. 12 wins & 30 nominations total."
 */
export function parseAwards(text: string | undefined | null): AwardInfo {
  const info: AwardInfo = { winner: false, nominee: false };
  if (!text || text === "N/A") return info;
  const lower = text.toLowerCase();

  const winsMatch = lower.match(/(\d+)\s+wins?/);
  const nomsMatch = lower.match(/(\d+)\s+nominations?/);
  if (winsMatch) info.wins = parseInt(winsMatch[1], 10);
  if (nomsMatch) info.nominations = parseInt(nomsMatch[1], 10);

  if (/\bwon\b/.test(lower) || (info.wins ?? 0) > 0) info.winner = true;
  if (/\bnominated\b/.test(lower) || (info.nominations ?? 0) > 0) info.nominee = true;

  return info;
}

// The big-four awards we can reliably pull from OMDb's text, with the name patterns
// OMDb uses ("Won N Oscars", "Nominated for N BAFTA", etc.).
const AWARD_KEYS: { key: string; pattern: string }[] = [
  { key: "oscar", pattern: "Oscars?" },
  { key: "globe", pattern: "Golden Globes?" },
  { key: "bafta", pattern: "BAFTA" },
  { key: "emmy", pattern: "(?:Primetime )?Emmys?" },
];

/**
 * Per-award won/nominated lists for the big four, parsed from OMDb's "Awards" text.
 * `nominated` is a superset of `won` (a winner was, by definition, nominated).
 */
export function parseAwardDetail(text: string | undefined | null): {
  won: string[];
  nominated: string[];
} {
  const won = new Set<string>();
  const nominated = new Set<string>();
  if (text && text !== "N/A") {
    for (const a of AWARD_KEYS) {
      if (new RegExp(`won\\s+\\d+\\s+${a.pattern}`, "i").test(text)) {
        won.add(a.key);
        nominated.add(a.key);
      } else if (new RegExp(`nominated for\\s+\\d+\\s+${a.pattern}`, "i").test(text)) {
        nominated.add(a.key);
      }
    }
  }
  return { won: [...won], nominated: [...nominated] };
}

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Lightweight list of catalogued titles for the sitemap. Reads only the
 * columns needed to build a URL + lastmod. NO upstream API calls. Capped well
 * under the 50k sitemap limit, most-popular first.
 */
export async function listSitemapEntries(
  limit = SITEMAP_TITLE_BUDGET,
): Promise<{ path: string; lastmod?: string }[]> {
  // Reads the indexable_media view, which encodes the same rule as
  // isCorroborated() in indexability.ts and is also what ping_indexnow() reads.
  // One definition, three callers: a URL can never be submitted whose page
  // renders noindex. The thin tail stays reachable (linked, crawlable) but
  // carries noindex until it earns its way in.
  //
  // Ordered by RATING COUNT, not TMDB popularity. Popularity measures what is
  // trending on TMDB this week, which is uncorrelated with what people search
  // for: under it, 896 of the 2,500 submitted URLs went to titles with under
  // 50 ratings, while 4,749 titles with 1,000+ ratings were left out of the
  // sitemap entirely, Guardians of the Galaxy and John Wick among them. Rating
  // count is a direct proxy for how many people have seen a title, so it
  // approximates search demand. Under it every one of the 2,500 slots goes to
  // a title with 1,000+ ratings and the weakest submitted has 2,426. Measured
  // against production 2026-08-27.
  //
  // The order clause below is the single decision this whole function exists
  // to get right. Do not change it without re-running those counts.
  //
  // Paged in 1,000-row chunks: PostgREST clamps any single request to its
  // max-rows setting (default 1000), which silently capped the old
  // `.limit(20000)` at ~1,000 URLs — Search Console's "1,005 discovered
  // pages" was this bug.
  const PAGE = 1000;
  const rows: {
    media_id: string;
    media_type: string;
    title: string | null;
    updated_at: string | null;
  }[] = [];
  for (let offset = 0; offset < limit; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("indexable_media")
      .select("media_id, media_type, title, updated_at")
      // Ordered by RATING COUNT. This was briefly reverted to popularity on the
      // grounds that "vote_count desc nulls last sorted all 23,436 titles with
      // no vote data behind every measured one". That count is from the media
      // table, not from this view: indexable_media requires corroboration, so
      // only 43 of its 61,673 rows have a null vote_count and 1,347 have none
      // or zero. The objection does not apply here and the revert cost more
      // than it saved. Measured 2026-08-27.
      .order("vote_count", { ascending: false, nullsFirst: false })
      .order("media_id", { ascending: true }) // stable tiebreak across pages
      .range(offset, Math.min(offset + PAGE, limit) - 1);

    if (error) {
      console.error("[sitemap] media query failed:", error.message);
      break; // serve what we have — a partial sitemap beats a 500
    }
    // A view reports every column as nullable, so drop any row missing the two
    // fields a URL cannot be built without rather than emitting "/movie/null".
    for (const r of data ?? []) {
      if (r.media_id && r.media_type) {
        rows.push({
          media_id: r.media_id,
          media_type: r.media_type,
          title: r.title,
          updated_at: r.updated_at,
        });
      }
    }
    if (!data || data.length < PAGE) break;
  }

  return rows.map((r) => {
    const rawId = r.media_id.replace(/^(movie|tv)-/, "");
    const seg = r.media_type === "tv" ? "tv" : "movie";
    // Emit the canonical slugged URL so crawlers index it directly (no 301 hop).
    return {
      path: `/${seg}/${mediaSlug(rawId, r.title)}`,
      lastmod: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : undefined,
    };
  });
}

/**
 * Read the catalog out of our database. NO upstream API calls.
 * This is what visitor page loads hit.
 */
export async function loadCatalogFromDb(limit = CATALOG_LIMIT): Promise<MediaItem[]> {
  // PostgREST caps a single response at 1000 rows regardless of .limit(),
  // so page with .range() until we hit `limit` or run out of rows.
  // IMPORTANT: this is the HOMEPAGE catalog payload — every byte we ship here
  // ends up in the SSR HTML and the client hydration JSON. Project only the
  // fields used by MediaCard + filterMedia + FilterRail. Heavy fields like
  // `overview` (300+ chars/row) and `seasons` (JSON array, can be 4KB+ on
  // long-running shows) are intentionally excluded — they're fetched on the
  // detail page where they're actually rendered. `lastAirYear` replaces
  // `seasons` for the card's year-range display.
  type Row = {
    media_id: string;
    media_type: string;
    title: string;
    year: string | null;
    poster_url: string | null;
    popularity: number | null;
    release_date: string | null;
    rating_imdb: number | null;
    rating_rotten_tomatoes: number | null;
    rating_metacritic: number | null;
    rating_tmdb: number | null;
    genres: string[] | null;
    origins: string[] | null;
    streaming: string[] | null;
    people: unknown;
    seasons: unknown;
    award_winner: boolean | null;
    award_nominee: boolean | null;
  };
  const rows: Row[] = [];
  for (let offset = 0; offset < limit; offset += POSTGREST_PAGE) {
    const end = Math.min(offset + POSTGREST_PAGE, limit) - 1;
    const { data, error } = await supabaseAdmin
      .from("media")
      .select(
        "media_id,media_type,title,year,poster_url,popularity,release_date,rating_imdb,rating_rotten_tomatoes,rating_metacritic,rating_tmdb,genres,origins,streaming,people,seasons,award_winner,award_nominee",
      )
      .order("popularity", { ascending: false, nullsFirst: false })
      .range(offset, end);

    if (error) {
      console.error("[catalog] load failed:", error.message);
      return [];
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < end - offset + 1) break; // exhausted
  }

  return rows.map((r): MediaItem => {
    const seasons = r.seasons as MediaSeason[] | null;
    // Precompute the latest season air year so we can drop the seasons array
    // entirely from the wire payload. MediaCard reads `lastAirYear` instead
    // of iterating seasons.
    let lastAirYear: string | undefined;
    let seasonCount: number | undefined;
    if (r.media_type === "tv" && seasons) {
      for (const s of seasons) {
        const y = s?.airDate ? s.airDate.slice(0, 4) : "";
        if (y && (!lastAirYear || y > lastAirYear)) lastAirYear = y;
      }
      seasonCount = seasons.length;
    }
    return {
      id: r.media_id,
      mediaType: r.media_type as MediaItem["mediaType"],
      title: r.title,
      year: r.year ?? "",
      overview: "", // intentionally omitted — fetched on detail page
      posterUrl: r.poster_url ?? "",
      ratings: {
        imdb: r.rating_imdb ?? undefined,
        rottenTomatoes: r.rating_rotten_tomatoes ?? undefined,
        metacritic: r.rating_metacritic ?? undefined,
        tmdb: r.rating_tmdb ?? undefined,
        balasaur: computeBalasaurScore({
          imdb: r.rating_imdb,
          rottenTomatoes: r.rating_rotten_tomatoes,
          metacritic: r.rating_metacritic,
          tmdb: r.rating_tmdb,
        }),
      },
      genres: r.genres ?? [],
      origins: r.origins ?? [],
      streaming: r.streaming ?? [],
      lengthLabel: "", // intentionally omitted — fetched on detail page
      people: (r.people as unknown as MediaPerson[]) ?? [],
      popularity: r.popularity ?? undefined,
      lastAirYear,
      seasonCount,
      releaseDate: r.release_date ?? undefined,
      awardWinner: r.award_winner ?? false,
      awardNominee: r.award_nominee ?? false,
    };
  });
}

/**
 * Last-known-good catalog, read from media_cache. Schema-independent: it returns
 * the stored summary_payload JSON, so it keeps working even when the live `media`
 * read is broken — e.g. the deployed code selects a column that a not-yet-applied
 * migration was meant to add (the failure that blanked the homepage when
 * `media.origins` was missing). Used only as a fail-soft fallback.
 */
async function loadCatalogFromCache(limit = CATALOG_LIMIT): Promise<MediaItem[]> {
  try {
    const rows: Array<{ summary_payload: Json | null }> = [];
    for (let offset = 0; offset < limit; offset += POSTGREST_PAGE) {
      const end = Math.min(offset + POSTGREST_PAGE, limit) - 1;
      const { data, error } = await supabaseAdmin
        .from("media_cache")
        .select("summary_payload")
        .order("popularity", { ascending: false, nullsFirst: false })
        .range(offset, end);
      if (error || !data) {
        if (error) console.error("[cache] last-known-good read failed:", error.message);
        return [];
      }
      const page = data as unknown as Array<{ summary_payload: Json | null }>;
      rows.push(...page);
      if (page.length < end - offset + 1) break;
    }
    return rows
      .filter((r) => r.summary_payload)
      .map((r) => {
        // Cached payloads were written before the slimmed-catalog change and
        // may still contain `overview` / `seasons`. Strip them on the way out
        // so the fail-soft path is just as lean as the live read.
        const item = r.summary_payload as unknown as MediaItem;
        return slimCatalogItem(item);
      });
  } catch (e) {
    console.error("[cache] last-known-good read threw:", e);
    return [];
  }
}

/**
 * Strip detail-page fields from a cached MediaItem so the wire payload stays
 * small even when reading historical summary_payload rows. Precomputes
 * `lastAirYear` from `seasons` before dropping the array, matching what
 * `loadCatalogFromDb` returns now.
 */
function slimCatalogItem(item: MediaItem): MediaItem {
  let lastAirYear = item.lastAirYear;
  let seasonCount = item.seasonCount;
  if (!lastAirYear && item.mediaType === "tv" && item.seasons) {
    for (const s of item.seasons) {
      const y = s?.airDate ? s.airDate.slice(0, 4) : "";
      if (y && (!lastAirYear || y > lastAirYear)) lastAirYear = y;
    }
  }
  if (seasonCount === undefined && item.mediaType === "tv" && item.seasons) {
    seasonCount = item.seasons.length;
  }
  return {
    ...item,
    overview: "",
    lengthLabel: "",
    seasons: undefined,
    lastAirYear,
    seasonCount,
  };
}

interface DiscoverResult {
  id: number;
  popularity?: number;
  genre_ids?: number[];
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  poster_path?: string | null;
  title?: string;
  name?: string;
  overview?: string;
}

async function discoverIds(
  type: "movie" | "tv",
  key: string,
  pages: number,
): Promise<DiscoverResult[]> {
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1);
  const pageResults = await mapWithLimit(pageNumbers, 12, async (page) => {
    try {
      const r = await tmdb<{ results: DiscoverResult[] }>(`/discover/${type}`, key, {
        sort_by: "popularity.desc",
        include_adult: "false",
        page: String(page),
        language: "en-US",
      });
      return r.results;
    } catch (e) {
      console.error(`[sync] discover ${type} page ${page} failed:`, e);
      return [];
    }
  });
  return pageResults.flat();
}

// Like discoverIds, but constrained to titles available on a major streaming service
// in a given region (popularity-sorted). This is what actually fills the provider
// filters — plain discover/movie barely overlaps any one service's catalog.
async function discoverByProvider(
  type: "movie" | "tv",
  key: string,
  region: string,
  providerId: number,
  maxPages: number,
): Promise<DiscoverResult[]> {
  const params = {
    sort_by: "popularity.desc",
    include_adult: "false",
    watch_region: region,
    with_watch_providers: String(providerId),
    language: "en-US",
  };
  // Page 1 reports how many pages actually exist, so we only fetch what's there
  // (TMDB caps at 500) instead of blasting empty requests at a small catalog.
  let first: { results: DiscoverResult[]; total_pages?: number };
  try {
    first = await tmdb<{ results: DiscoverResult[]; total_pages?: number }>(
      `/discover/${type}`,
      key,
      {
        ...params,
        page: "1",
      },
    );
  } catch (e) {
    console.error(`[sync] provider discover ${type} ${region}/${providerId} page 1 failed:`, e);
    return [];
  }
  const total = Math.min(first.total_pages ?? 1, maxPages, 500);
  if (total <= 1) return first.results;
  const rest = await mapWithLimit(
    Array.from({ length: total - 1 }, (_, i) => i + 2),
    12,
    async (page) => {
      try {
        const r = await tmdb<{ results: DiscoverResult[] }>(`/discover/${type}`, key, {
          ...params,
          page: String(page),
        });
        return r.results;
      } catch (e) {
        console.error(
          `[sync] provider discover ${type} ${region}/${providerId} page ${page} failed:`,
          e,
        );
        return [];
      }
    },
  );
  return [...first.results, ...rest.flat()];
}

async function listFromPath(path: string, key: string, pages: number): Promise<DiscoverResult[]> {
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1);
  const pageResults = await mapWithLimit(pageNumbers, 12, async (page) => {
    try {
      const r = await tmdb<{ results: DiscoverResult[] }>(path, key, {
        page: String(page),
        language: "en-US",
      });
      return r.results;
    } catch (e) {
      console.error(`[sync] ${path} page ${page} failed:`, e);
      return [];
    }
  });
  return pageResults.flat();
}

function dedupeById(items: DiscoverResult[]): DiscoverResult[] {
  const seen = new Set<number>();
  const out: DiscoverResult[] = [];
  for (const it of items) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

function extractVoteCount(rawTmdb: unknown): number | null {
  const v = (rawTmdb as { vote_count?: unknown } | null)?.vote_count;
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

/** TMDB franchise membership (movies only) — feeds the similarity engine. */
function extractCollectionId(rawTmdb: unknown): number | null {
  const c = (rawTmdb as { belongs_to_collection?: { id?: unknown } | null } | null)
    ?.belongs_to_collection;
  return c && typeof c.id === "number" && Number.isFinite(c.id) ? c.id : null;
}

function rowFromEnrichedItem(item: MediaItem, rawTmdb: unknown, rawOmdb: unknown): MediaRow {
  const awards = parseAwards((rawOmdb as OmdbResponse | null)?.Awards);
  const awardDetail = parseAwardDetail((rawOmdb as OmdbResponse | null)?.Awards);
  const wp = (
    rawTmdb as {
      "watch/providers"?: {
        results?: Record<string, { flatrate?: { provider_name: string }[] }>;
      };
    } | null
  )?.["watch/providers"];
  const facets = deriveFacets(rawTmdb, item.mediaType, item.genres);
  const voteCount = extractVoteCount(rawTmdb);
  return {
    media_id: item.id,
    media_type: item.mediaType,
    title: item.title,
    year: item.year || null,
    poster_url: item.posterUrl || null,
    overview: item.overview || null,
    popularity: item.popularity ?? null,
    release_date: item.releaseDate ?? null,
    rating_imdb: item.ratings.imdb ?? null,
    rating_rotten_tomatoes: item.ratings.rottenTomatoes ?? null,
    rating_metacritic: item.ratings.metacritic ?? null,
    rating_tmdb: item.ratings.tmdb ?? null,
    vote_count: voteCount,
    // rank_score mirrors the DB-seeded formula (rank.ts); the balasaur input is
    // recomputed here because rating_balasaur is DB-generated and not on `item`.
    rank_score: computeRankScore({
      popularity: item.popularity,
      balasaur: computeBalasaurScore(item.ratings),
      voteCount,
      releaseDate: item.releaseDate,
    }),
    quality_score: computeQualityScore({
      balasaur: computeBalasaurScore(item.ratings),
      voteCount,
    }),
    sensitive: deriveSensitive(rawTmdb),
    suggestive: facets.suggestive,
    tmdb_collection_id: item.mediaType === "movie" ? extractCollectionId(rawTmdb) : null,
    genres: item.genres,
    origins: item.origins ?? [],
    streaming: item.streaming,
    streaming_regions: deriveStreamingRegions(wp),
    sub_genres: facets.sub_genres,
    themes: facets.themes,
    audience: facets.audience,
    film_length_minutes: facets.film_length_minutes,
    completion_status: facets.completion_status,
    length_label: item.lengthLabel || null,
    people: item.people as unknown as MediaRow["people"],
    seasons: (item.seasons ?? null) as MediaRow["seasons"],
    raw_tmdb: (rawTmdb ?? null) as MediaRow["raw_tmdb"],
    raw_omdb: (rawOmdb ?? null) as MediaRow["raw_omdb"],
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    award_winner: awards.winner,
    award_nominee: awards.nominee,
    award_wins: awards.wins ?? null,
    award_nominations: awards.nominations ?? null,
    awards_won: awardDetail.won,
    awards_nominated: awardDetail.nominated,
  };
}

// ---------- One-time backfill from already-stored raw payloads ----------

export interface BackfillResult {
  scanned: number;
  updatedGenres: number;
  updatedStreaming: number;
  updatedAwards: number;
  updatedFacets: number;
  /** Rows whose vote_count / rank_score / sensitive flag were (re)derived. */
  updatedRank: number;
  /** Rows already correct that were marked derived (incremental mode). */
  stamped: number;
  /**
   * Rows with NO stored raw_tmdb — nothing can be derived for them until the
   * nightly refresh re-fetches the title. They are deliberately NOT stamped, so
   * `done: true` with a large missingRaw is "converged except N rows awaiting
   * re-fetch", not "catalog fully derived". (2026-08: a data copy dropped raw
   * payloads for ~60k rows and the old behavior stamped them all as done.)
   */
  missingRaw: number;
  failed: number;
  durationMs: number;
  /** Last media_id processed this call — pass back as `after` to resume. */
  lastId: string | null;
  /** True once a pass reached the end of the table (nothing left to scan). */
  done: boolean;
}

interface TmdbGenreObj {
  id: number;
  name: string;
}

/**
 * Rewrite `genres`, `origins`, `streaming`, `streaming_regions`, and award columns
 * from raw_tmdb / raw_omdb already stored. Makes NO external API calls.
 *
 * Resumable: pages by a stable `media_id` cursor (keyset, not offset) and stops at a
 * wall-clock budget, returning `{ lastId, done }`. On a huge table one HTTP call can't
 * rewrite everything before the host/statement timeout, so the workflow calls this in
 * a loop, passing the previous `lastId` as `after` — each call resumes exactly where
 * the last stopped (no re-reading), and skip-unchanged keeps every pass light.
 */
export async function backfillFromRaw(opts?: {
  after?: string | null;
  timeBudgetMs?: number;
  onlyMissing?: boolean;
}): Promise<BackfillResult> {
  const start = Date.now();
  const timeBudgetMs = opts?.timeBudgetMs ?? 90_000;
  // Incremental mode: scan only rows not yet facet-stamped, and stamp each as it's
  // processed so it drops out of future runs — the whole catalog converges once, then
  // nightly runs are near-instant. Falls back to a full scan if the column is absent.
  let useMissingFilter = opts?.onlyMissing ?? false;
  const result: BackfillResult = {
    scanned: 0,
    updatedGenres: 0,
    updatedStreaming: 0,
    updatedAwards: 0,
    updatedFacets: 0,
    updatedRank: 0,
    stamped: 0,
    missingRaw: 0,
    failed: 0,
    durationMs: 0,
    lastId: opts?.after ?? null,
    done: false,
  };

  // Page through by media_id. Rows with very large raw_tmdb/raw_omdb payloads can push a
  // fixed-size page past the statement timeout, so the page size is adaptive: it shrinks
  // when a select fails (to inch through the heavy region) and recovers on success. This
  // keeps one stalled page from stranding every row past it.
  const MAX_PAGE = 200;
  const MIN_PAGE = 10;
  let pageSize = MAX_PAGE;
  let cursor = opts?.after ?? "";
  while (true) {
    let query = supabaseAdmin
      .from("media")
      .select(
        "media_id, media_type, genres, origins, streaming, streaming_regions, sub_genres, themes, audience, film_length_minutes, completion_status, award_winner, award_nominee, award_wins, award_nominations, awards_won, awards_nominated, popularity, release_date, rating_balasaur, vote_count, rank_score, quality_score, sensitive, suggestive, tmdb_collection_id, raw_tmdb, raw_omdb",
      )
      .gt("media_id", cursor);
    if (useMissingFilter) query = query.is("facets_derived_at", null);
    const { data, error } = await query.order("media_id", { ascending: true }).limit(pageSize);
    if (error) {
      // Incremental mode but the column isn't applied yet → drop the filter and full-scan,
      // so the backfill never breaks just because the optimization column is missing.
      if (useMissingFilter && error.message.includes("facets_derived_at")) {
        console.warn("[backfill] facets_derived_at absent — falling back to full scan");
        useMissingFilter = false;
        continue;
      }
      // Most likely a statement timeout on a page of fat JSONB rows. Shrink and retry so
      // the backfill can squeeze through instead of aborting (which would strand every
      // remaining row). Only once even the smallest page fails do we step the cursor past
      // a single row by id alone, so one pathological row can't wedge the whole catalog.
      if (pageSize > MIN_PAGE) {
        pageSize = Math.max(MIN_PAGE, Math.floor(pageSize / 4));
        console.warn(
          `[backfill] page select failed (${error.message}); retrying with pageSize=${pageSize}`,
        );
        continue;
      }
      const { data: step, error: stepErr } = await supabaseAdmin
        .from("media")
        .select("media_id")
        .gt("media_id", cursor)
        .order("media_id", { ascending: true })
        .limit(1);
      if (stepErr || !step || step.length === 0) {
        if (stepErr) console.error("[backfill] cursor-step select failed:", stepErr.message);
        else result.done = true;
        break;
      }
      console.error(
        `[backfill] skipping ${step[0].media_id}: select fails even at id granularity (${error.message})`,
      );
      result.failed++;
      cursor = step[0].media_id;
      result.lastId = cursor;
      if (Date.now() - start > timeBudgetMs) break;
      continue;
    }
    if (!data || data.length === 0) {
      result.done = true;
      break;
    }

    for (const row of data) {
      result.scanned++;
      try {
        // No raw payload stored → nothing to derive from. Do NOT stamp: leave the
        // row eligible so a future backfill picks it up after the nightly refresh
        // restores its raw_tmdb. Stamping here is how 51k rows once got marked
        // "derived" with empty facets.
        if (row.raw_tmdb == null) {
          result.missingRaw++;
          continue;
        }
        const raw = row.raw_tmdb as {
          genres?: TmdbGenreObj[];
          original_language?: string;
          origin_country?: string[];
          production_countries?: { iso_3166_1?: string }[];
          "watch/providers"?: {
            results?: Record<string, { flatrate?: { provider_name: string }[] }>;
          };
        } | null;
        const tmdbGenreNames = (raw?.genres ?? [])
          .map((g) => g?.name)
          .filter((n): n is string => !!n);
        const newGenres =
          tmdbGenreNames.length > 0 ? unifyGenres(tmdbGenreNames) : (row.genres ?? []);

        const awardsText = (row.raw_omdb as { Awards?: string } | null)?.Awards;
        const awards = parseAwards(awardsText);
        const awardDetail = parseAwardDetail(awardsText);

        const countries = [
          ...(raw?.origin_country ?? []),
          ...(raw?.production_countries ?? []).map((c) => c.iso_3166_1 ?? "").filter(Boolean),
        ];
        const newOrigins = deriveOrigins(raw?.original_language, countries);
        const newStreaming = deriveStreaming(raw?.["watch/providers"]);
        const newStreamingRegions = deriveStreamingRegions(raw?.["watch/providers"]);
        const facets = deriveFacets(row.raw_tmdb, row.media_type, newGenres);
        const newVoteCount = extractVoteCount(row.raw_tmdb);
        const newSensitive = deriveSensitive(row.raw_tmdb);
        // rating_balasaur is DB-generated, so it's already current on the row.
        const newRankScore = computeRankScore({
          popularity: row.popularity,
          balasaur: row.rating_balasaur,
          voteCount: newVoteCount,
          releaseDate: row.release_date,
        });
        const newQualityScore = computeQualityScore({
          balasaur: row.rating_balasaur,
          voteCount: newVoteCount,
        });

        const genresChanged = JSON.stringify(newGenres) !== JSON.stringify(row.genres ?? []);
        const originsChanged = JSON.stringify(newOrigins) !== JSON.stringify(row.origins ?? []);
        const streamingChanged =
          JSON.stringify(newStreaming) !== JSON.stringify(row.streaming ?? []) ||
          JSON.stringify(newStreamingRegions) !== JSON.stringify(row.streaming_regions ?? []);
        const awardsChanged =
          (row.award_winner ?? false) !== awards.winner ||
          (row.award_nominee ?? false) !== awards.nominee ||
          (row.award_wins ?? null) !== (awards.wins ?? null) ||
          (row.award_nominations ?? null) !== (awards.nominations ?? null);
        const awardsDetailChanged =
          JSON.stringify(awardDetail.won) !== JSON.stringify(row.awards_won ?? []) ||
          JSON.stringify(awardDetail.nominated) !== JSON.stringify(row.awards_nominated ?? []);
        const facetsChanged =
          JSON.stringify(facets.sub_genres) !== JSON.stringify(row.sub_genres ?? []) ||
          JSON.stringify(facets.themes) !== JSON.stringify(row.themes ?? []) ||
          JSON.stringify(facets.audience) !== JSON.stringify(row.audience ?? []) ||
          (facets.film_length_minutes ?? null) !== (row.film_length_minutes ?? null) ||
          (facets.completion_status ?? null) !== (row.completion_status ?? null);
        const newCollectionId =
          row.media_type === "movie" ? extractCollectionId(row.raw_tmdb) : null;
        const rankChanged =
          (row.vote_count ?? null) !== newVoteCount ||
          (row.sensitive ?? false) !== newSensitive ||
          (row.suggestive ?? false) !== facets.suggestive ||
          (row.tmdb_collection_id ?? null) !== newCollectionId ||
          (row.rank_score ?? null) !== newRankScore ||
          (row.quality_score ?? null) !== newQualityScore;

        // Skip rows that don't actually change. On a large catalog only the rows that
        // need it (co-productions, etc.) get rewritten, so the backfill stays light and
        // won't time out — and re-runs fall straight through already-fixed rows, so it
        // reliably finishes.
        const changed =
          genresChanged ||
          originsChanged ||
          streamingChanged ||
          awardsChanged ||
          awardsDetailChanged ||
          facetsChanged ||
          rankChanged;

        // Nothing to rewrite. In incremental mode still stamp the row so it drops out of
        // future scans; otherwise just skip (classic full-scan behavior).
        if (!changed) {
          if (useMissingFilter) {
            const { error: stampErr } = await supabaseAdmin
              .from("media")
              .update({ facets_derived_at: new Date().toISOString() })
              .eq("media_id", row.media_id);
            if (stampErr) {
              result.failed++;
              console.error(`[backfill] stamp ${row.media_id} failed:`, stampErr.message);
            } else {
              result.stamped++;
            }
          }
          continue;
        }

        const { error: updErr } = await supabaseAdmin
          .from("media")
          .update({
            genres: newGenres,
            origins: newOrigins,
            streaming: newStreaming,
            streaming_regions: newStreamingRegions,
            sub_genres: facets.sub_genres,
            themes: facets.themes,
            audience: facets.audience,
            film_length_minutes: facets.film_length_minutes,
            completion_status: facets.completion_status,
            vote_count: newVoteCount,
            rank_score: newRankScore,
            quality_score: newQualityScore,
            sensitive: newSensitive,
            suggestive: facets.suggestive,
            tmdb_collection_id: newCollectionId,
            award_winner: awards.winner,
            award_nominee: awards.nominee,
            award_wins: awards.wins ?? null,
            award_nominations: awards.nominations ?? null,
            awards_won: awardDetail.won,
            awards_nominated: awardDetail.nominated,
            updated_at: new Date().toISOString(),
            ...(useMissingFilter ? { facets_derived_at: new Date().toISOString() } : {}),
          })
          .eq("media_id", row.media_id);
        if (updErr) {
          result.failed++;
          console.error(`[backfill] update ${row.media_id} failed:`, updErr.message);
          continue;
        }
        if (genresChanged || originsChanged) result.updatedGenres++;
        if (streamingChanged) result.updatedStreaming++;
        if (awards.winner || awards.nominee) result.updatedAwards++;
        if (facetsChanged) result.updatedFacets++;
        if (rankChanged) result.updatedRank++;
      } catch (e) {
        result.failed++;
        console.error("[backfill] row failed:", e);
      }
    }

    cursor = data[data.length - 1].media_id;
    result.lastId = cursor;
    if (data.length < pageSize) {
      result.done = true;
      break;
    }
    // Recover the page size after clearing a heavy region so the rest of the catalog
    // isn't crawled one small page at a time.
    if (pageSize < MAX_PAGE) pageSize = Math.min(MAX_PAGE, pageSize * 2);
    // Stop on the wall-clock budget so the call returns cleanly (well under the host
    // timeout); the workflow resumes from `lastId` on the next pass.
    if (Date.now() - start > timeBudgetMs) break;
  }

  // Bust the grid cache so rewritten rows show on the next load (not after 24h).
  if (result.updatedGenres > 0 || result.updatedStreaming > 0 || result.updatedAwards > 0) {
    const { error } = await supabaseAdmin.from("trending_cache").delete().eq("key", "trending");
    if (error) console.error("[backfill] trending_cache bust failed:", error.message);
  }

  result.durationMs = Date.now() - start;
  return result;
}

/**
 * Upsert enriched media rows in chunks and REFUSE to fail silently: any chunk
 * error, or a write that reports success without persisting, throws — bubbling
 * up through the sync hooks as a non-200 so the nightly Action goes red instead
 * of green-but-frozen. (2026-07/08 incident: every upsert failed for five weeks
 * while the endpoint kept reporting `refreshed: 292` nightly.)
 */
async function upsertMediaRowsStrict(rows: MediaRow[], tag: string): Promise<void> {
  if (rows.length === 0) return;
  const CHUNK = 25;
  const totalChunks = Math.ceil(rows.length / CHUNK);
  let failedChunks = 0;
  let firstError: string | null = null;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabaseAdmin
      .from("media")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "media_id" });
    if (error) {
      failedChunks++;
      firstError ??= error.message;
      console.error(`[${tag}] upsert chunk failed:`, error.message);
    }
  }
  if (failedChunks > 0) {
    throw new Error(
      `${failedChunks}/${totalChunks} media upsert chunks failed; first error: ${firstError}`,
    );
  }
  // Belt-and-braces: a write can "succeed" without landing (wrong project in a
  // mixed-env deploy, or an RLS policy silently dropping rows under a non-service
  // key). Every row was just stamped with a fresh fetched_at, so re-read one and
  // require it to be recent.
  const probeId = rows[0].media_id;
  const { data, error } = await supabaseAdmin
    .from("media")
    .select("media_id, fetched_at")
    .eq("media_id", probeId)
    .maybeSingle();
  if (error) throw new Error(`post-write verification read failed: ${error.message}`);
  const persistedAt = data?.fetched_at ? new Date(data.fetched_at).getTime() : 0;
  if (Date.now() - persistedAt > 60 * 60_000) {
    throw new Error(
      `write did not persist: ${probeId} has fetched_at=${data?.fetched_at ?? "null"} after upsert`,
    );
  }
}

/** Newest `updated_at` in `media` — the freshness signal the nightly canary asserts on. */
async function catalogMaxUpdatedAt(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("media")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[sync] catalogMaxUpdatedAt failed:", error.message);
    return null;
  }
  return data?.updated_at ?? null;
}

export interface SyncResult {
  discovered: number;
  refreshed: number;
  skippedFresh: number;
  failed: number;
  durationMs: number;
  /** Newest media.updated_at AFTER this pass's writes (nightly freshness canary). */
  catalogMaxUpdatedAt: string | null;
}

/**
 * Pull discover/movie + discover/tv, enrich each with TMDB details +
 * OMDB ratings, then upsert into `public.media`. By default it only enriches
 * never-seen titles so top-ups grow the catalog instead of re-calling existing rows.
 */
export async function syncCatalog(opts?: {
  force?: boolean;
  refreshExisting?: boolean;
  /** Titles to enrich this request. Defaults to MAX_ENRICH_PER_RUN, hard-capped at ENRICH_HARD_CEILING. */
  limit?: number;
  /** Wall-clock budget (ms) for the enrich phase. Defaults to ENRICH_TIME_BUDGET_MS. */
  timeBudgetMs?: number;
  /** Rotates which region's major-provider catalog is pulled this call (caller's loop index). */
  providerBucket?: number;
}): Promise<SyncResult> {
  const start = Date.now();
  const enrichLimit = Math.min(Math.max(1, opts?.limit ?? MAX_ENRICH_PER_RUN), ENRICH_HARD_CEILING);
  const timeBudgetMs = opts?.timeBudgetMs ?? ENRICH_TIME_BUDGET_MS;
  const tmdbKey = process.env.TMDB_API_KEY;
  const omdbKey = process.env.OMDB_API_KEY;
  if (!tmdbKey) throw new Error("TMDB_API_KEY is not configured");

  const genres = await loadGenres(tmdbKey);

  // 1. Seed from multiple TMDB sources, then merge + dedupe.
  // Rotate through one (region × provider) combo per call and sweep it to full TMDB
  // depth, so over the caller's loop every service's whole catalog in every market is
  // pulled — not just the headliners. Combo = bucket % (regions × providers).
  const combos = STREAMING_REGIONS.length * PROVIDER_IDS.length;
  const bucket = (((opts?.providerBucket ?? 0) % combos) + combos) % combos;
  const region = STREAMING_REGIONS[bucket % STREAMING_REGIONS.length];
  const providerId = PROVIDER_IDS[Math.floor(bucket / STREAMING_REGIONS.length)];
  console.log(
    `[sync] bucket=${opts?.providerBucket ?? 0} sweeping provider ${providerId} in ${region}`,
  );

  const [
    discoverMovies,
    discoverTv,
    topMovies,
    topTv,
    trendingMovies,
    trendingTv,
    providerMovies,
    providerTv,
  ] = await Promise.all([
    discoverIds("movie", tmdbKey, DISCOVER_PAGES),
    discoverIds("tv", tmdbKey, DISCOVER_PAGES),
    listFromPath("/movie/top_rated", tmdbKey, TOP_RATED_PAGES),
    listFromPath("/tv/top_rated", tmdbKey, TOP_RATED_PAGES),
    listFromPath("/trending/movie/week", tmdbKey, TRENDING_PAGES),
    listFromPath("/trending/tv/week", tmdbKey, TRENDING_PAGES),
    discoverByProvider("movie", tmdbKey, region, providerId, PROVIDER_DISCOVER_PAGES),
    discoverByProvider("tv", tmdbKey, region, providerId, PROVIDER_DISCOVER_PAGES),
  ]);

  // Provider titles first so, among never-fetched candidates (equal by staleness),
  // the mainstream streaming catalog is enriched ahead of the long tail.
  const movies = dedupeById([
    ...providerMovies,
    ...discoverMovies,
    ...topMovies,
    ...trendingMovies,
  ]);
  const tv = dedupeById([...providerTv, ...discoverTv, ...topTv, ...trendingTv]);

  const seedItems: MediaItem[] = [
    ...movies.map((r) => mapItem(r as TmdbTrendingItem, "movie", genres.movie)),
    ...tv.map((r) => mapItem(r as TmdbTrendingItem, "tv", genres.tv)),
  ];

  // 2. Decide which ones need re-fetch (missing OR stale).
  const ids = seedItems.map((i) => i.id);
  // Supabase caps single queries at 1000 rows by default, so chunk the
  // lookup — otherwise once the catalog passes 1000 the staleness map is
  // incomplete and we re-enrich already-fresh rows on every run.
  const fetchedAt = new Map<string, number>();
  const ID_CHUNK = 500;
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("media")
      .select("media_id, fetched_at")
      .in("media_id", slice);
    if (exErr) {
      console.error("[sync] staleness lookup failed:", exErr.message);
      continue;
    }
    for (const row of existing ?? []) {
      fetchedAt.set(row.media_id, new Date(row.fetched_at).getTime());
    }
  }

  const now = Date.now();
  const candidates = opts?.force
    ? seedItems.slice()
    : seedItems.filter((i) => {
        const last = fetchedAt.get(i.id);
        if (!last) return true;
        return !!opts?.refreshExisting && now - last > STALE_MS;
      });

  // Process never-fetched items first, then stalest-first only when explicitly
  // allowed, so scheduled top-ups naturally keep growing beyond the first page.
  candidates.sort((a, b) => {
    const la = fetchedAt.get(a.id) ?? 0;
    const lb = fetchedAt.get(b.id) ?? 0;
    return la - lb;
  });

  const toRefresh = candidates.slice(0, enrichLimit);

  let refreshed = 0;
  let failed = 0;
  let omdbCalls = 0;
  let budgetHit = false;
  const rows: MediaRow[] = [];

  await mapWithLimit(toRefresh, 6, async (item) => {
    // Soft deadline: once we're past the budget, stop STARTING new enrichments
    // (in-flight ones still finish). Keeps the request short so the host won't
    // kill it and 502. The loop's next pass picks up where this one left off.
    if (Date.now() - start > timeBudgetMs) {
      budgetHit = true;
      return;
    }
    try {
      const [type, rawId] = item.id.split("-");
      const rawTmdb = await tmdb<TmdbDetails & Record<string, unknown>>(
        `/${type}/${rawId}`,
        tmdbKey,
        { append_to_response: TMDB_APPEND, language: "en-US" },
      );
      const imdbId = enrichFromDetails(item, rawTmdb);

      // OMDB quota guard: still store the TMDB row when over budget; the
      // card falls back to the TMDB score and the next run can fill in
      // IMDb/RT/Metacritic.
      let rawOmdb: unknown = null;
      if (omdbKey && imdbId && omdbCalls < OMDB_BUDGET_PER_RUN) {
        omdbCalls++;
        rawOmdb = await fetchOmdbRaw(imdbId, omdbKey);
        if (rawOmdb) applyOmdbRatings(item, rawOmdb as OmdbResponse);
      }
      rows.push(rowFromEnrichedItem(item, rawTmdb, rawOmdb));
      refreshed++;
    } catch (e) {
      failed++;
      console.error(`[sync] enrich failed for ${item.id}:`, e);
    }
  });

  // 3. Upsert in chunks (rows can be large). Throws on any failed/unpersisted
  //    write so the caller (and the nightly Action) sees red, never green-but-frozen.
  await upsertMediaRowsStrict(rows, "sync");

  // 4. Bust the grid's trending cache when the catalog actually changed, so new
  //    titles appear on the next page load instead of waiting out the 24h TTL.
  //    (fetchTrendingMedia rebuilds it from the `media` table on the next miss.)
  if (refreshed > 0) {
    const { error } = await supabaseAdmin.from("trending_cache").delete().eq("key", "trending");
    if (error) console.error("[sync] trending_cache bust failed:", error.message);
  }

  if (budgetHit) {
    console.log(
      `[sync] time budget (${timeBudgetMs}ms) reached, enriched ${refreshed} this pass; more remain for the next call`,
    );
  }

  return {
    discovered: seedItems.length,
    refreshed,
    skippedFresh: seedItems.length - candidates.length,
    failed,
    durationMs: Date.now() - start,
    catalogMaxUpdatedAt: await catalogMaxUpdatedAt(),
  };
}

export interface RefreshResult {
  scanned: number;
  refreshed: number;
  failed: number;
  /** How stale the oldest title in this batch was, in days (visibility metric). */
  oldestAgeDays: number | null;
  budgetHit: boolean;
  durationMs: number;
  /** Newest media.updated_at AFTER this pass's writes (nightly freshness canary). */
  catalogMaxUpdatedAt: string | null;
}

/**
 * Long-tail freshness: re-fetch the STALEST titles table-wide (oldest fetched_at
 * first) and re-ingest them from fresh TMDB + OMDb. Unlike syncCatalog's
 * `refreshExisting` (which only touches titles that re-appear in discovery), this
 * reaches the obscure tail discovery never re-surfaces. Every field is re-derived
 * from the fresh payload — genres fall back to the stored value so a sparse re-fetch
 * can't blank them, and a now-empty `streaming` correctly reflects a title that left
 * every service. Time-budgeted + chunked like syncCatalog so each request stays short;
 * `rowFromEnrichedItem` stamps a new `fetched_at`, so the next pass picks up the next
 * oldest batch and the whole catalog cycles over the GitHub Actions loop.
 */
export async function refreshStalest(opts?: {
  limit?: number;
  timeBudgetMs?: number;
}): Promise<RefreshResult> {
  const start = Date.now();
  const limit = Math.min(Math.max(1, opts?.limit ?? MAX_ENRICH_PER_RUN), ENRICH_HARD_CEILING);
  const timeBudgetMs = opts?.timeBudgetMs ?? ENRICH_TIME_BUDGET_MS;
  const tmdbKey = process.env.TMDB_API_KEY;
  const omdbKey = process.env.OMDB_API_KEY;
  if (!tmdbKey) throw new Error("TMDB_API_KEY is not configured");

  const { data: stale, error: selErr } = await supabaseAdmin
    .from("media")
    .select("media_id, media_type, genres, title, year, poster_url, fetched_at")
    .order("fetched_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (selErr) throw new Error(`stalest select failed: ${selErr.message}`);
  if (!stale || stale.length === 0) {
    return {
      scanned: 0,
      refreshed: 0,
      failed: 0,
      oldestAgeDays: null,
      budgetHit: false,
      durationMs: Date.now() - start,
      catalogMaxUpdatedAt: await catalogMaxUpdatedAt(),
    };
  }

  const oldestTs = stale[0]?.fetched_at ? new Date(stale[0].fetched_at as string).getTime() : null;
  const oldestAgeDays = oldestTs ? Math.round((Date.now() - oldestTs) / 86_400_000) : null;

  let refreshed = 0;
  let failed = 0;
  let omdbCalls = 0;
  let budgetHit = false;
  const rows: MediaRow[] = [];

  await mapWithLimit(stale, 6, async (r) => {
    if (Date.now() - start > timeBudgetMs) {
      budgetHit = true;
      return;
    }
    try {
      const mediaId = r.media_id as string;
      const type = (r.media_type as string) === "tv" ? "tv" : "movie";
      const rawId = mediaId.split("-")[1];
      const rawTmdb = await tmdb<TmdbDetails & Record<string, unknown>>(
        `/${type}/${rawId}`,
        tmdbKey,
        {
          append_to_response: TMDB_APPEND,
          language: "en-US",
        },
      );
      const item = cardItemFromDetails(mediaId, type, rawTmdb, {
        title: r.title as string | null,
        year: r.year as string | null,
        poster_url: r.poster_url as string | null,
        genres: r.genres as string[] | null,
      });
      const imdbId = enrichFromDetails(item, rawTmdb);
      let rawOmdb: unknown = null;
      if (omdbKey && imdbId && omdbCalls < OMDB_BUDGET_PER_RUN) {
        omdbCalls++;
        rawOmdb = await fetchOmdbRaw(imdbId, omdbKey);
        if (rawOmdb) applyOmdbRatings(item, rawOmdb as OmdbResponse);
      }
      rows.push(rowFromEnrichedItem(item, rawTmdb, rawOmdb));
      refreshed++;
    } catch (e) {
      failed++;
      console.error(`[refresh] failed for ${r.media_id}:`, e);
    }
  });

  // Throws on any failed/unpersisted write — see upsertMediaRowsStrict.
  await upsertMediaRowsStrict(rows, "refresh");
  if (refreshed > 0) {
    const { error } = await supabaseAdmin.from("trending_cache").delete().eq("key", "trending");
    if (error) console.error("[refresh] trending_cache bust failed:", error.message);
  }

  console.log(
    `[refresh] re-ingested ${refreshed}/${stale.length} stalest titles (oldest ~${oldestAgeDays}d), failed=${failed}${budgetHit ? " (budget hit)" : ""}`,
  );
  return {
    scanned: stale.length,
    refreshed,
    failed,
    oldestAgeDays,
    budgetHit,
    durationMs: Date.now() - start,
    catalogMaxUpdatedAt: await catalogMaxUpdatedAt(),
  };
}

async function fetchOmdbRaw(imdbId: string, key: string): Promise<unknown | null> {
  try {
    const res = await fetchWithTimeout(`${OMDB_BASE}/?i=${imdbId}&apikey=${key}`, 8_000);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.Response !== "True") return null;
    return data;
  } catch {
    return null;
  }
}

function applyOmdbRatings(item: MediaItem, data: OmdbResponse) {
  if (data.imdbRating && data.imdbRating !== "N/A") {
    const n = parseFloat(data.imdbRating);
    if (Number.isFinite(n)) item.ratings.imdb = n;
  }
  if (data.Metascore && data.Metascore !== "N/A") {
    const n = parseInt(data.Metascore, 10);
    if (Number.isFinite(n)) item.ratings.metacritic = n;
  }
  const rt = data.Ratings?.find((r) => r.Source === "Rotten Tomatoes");
  if (rt) item.ratings.rottenTomatoes = parsePct(rt.Value);
}

// ---------- Live detail fetch (no DB) ----------

interface TmdbCardRaw {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  poster_path?: string | null;
  vote_average?: number;
  popularity?: number;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
}

interface TmdbDetailRaw {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  tagline?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  popularity?: number;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres?: { id: number; name: string }[];
  status?: string;
  budget?: number;
  revenue?: number;
  original_language?: string;
  homepage?: string;
  production_countries?: { name: string }[];
  production_companies?: { name: string }[];
  external_ids?: { imdb_id?: string | null; wikidata_id?: string | null };
  credits?: {
    cast?: { id?: number; name: string; character?: string }[];
    crew?: { id?: number; name: string; job?: string; department?: string }[];
  };
  release_dates?: {
    results?: { iso_3166_1: string; release_dates: { certification: string }[] }[];
  };
  content_ratings?: {
    results?: { iso_3166_1: string; rating: string }[];
  };
  images?: {
    backdrops?: { file_path: string; iso_639_1?: string | null; vote_average?: number }[];
    stills?: { file_path: string; iso_639_1?: string | null; vote_average?: number }[];
  };
  videos?: {
    results?: {
      key: string;
      name: string;
      site: string;
      type: string;
      official?: boolean;
      published_at?: string;
    }[];
  };
  keywords?: {
    keywords?: { id: number; name: string }[];
    results?: { id: number; name: string }[];
  };
  recommendations?: { results?: TmdbCardRaw[] };
  similar?: { results?: TmdbCardRaw[] };
  "watch/providers"?: {
    results?: Record<
      string,
      {
        link?: string;
        flatrate?: { provider_name: string; logo_path?: string | null }[];
        rent?: { provider_name: string; logo_path?: string | null }[];
        buy?: { provider_name: string; logo_path?: string | null }[];
      }
    >;
  };
  seasons?: {
    season_number: number;
    name: string;
    episode_count: number;
    air_date: string | null;
    poster_path: string | null;
    overview: string | null;
  }[];
}

interface CrossRow {
  media_id: string;
  media_type: string;
  title: string;
  year: string | null;
  poster_url: string | null;
  popularity: number | null;
  rating_imdb: number | null;
  rating_rotten_tomatoes: number | null;
  rating_metacritic: number | null;
  rating_tmdb: number | null;
  genres: string[] | null;
  seasons: unknown;
  award_winner: boolean | null;
  award_nominee: boolean | null;
}

// Map a DB media row to a slim card item for the cross-category "more like this"
// rail (no people/overview/streaming — the card doesn't render them).
function crossRowToItem(r: CrossRow): MediaItem {
  const seasons = r.seasons as MediaSeason[] | null;
  let lastAirYear: string | undefined;
  if (r.media_type === "tv" && seasons) {
    for (const s of seasons) {
      const y = s?.airDate ? s.airDate.slice(0, 4) : "";
      if (y && (!lastAirYear || y > lastAirYear)) lastAirYear = y;
    }
  }
  return {
    id: r.media_id,
    mediaType: r.media_type as MediaItem["mediaType"],
    title: r.title,
    year: r.year ?? "",
    overview: "",
    posterUrl: r.poster_url ?? "",
    ratings: {
      imdb: r.rating_imdb ?? undefined,
      rottenTomatoes: r.rating_rotten_tomatoes ?? undefined,
      metacritic: r.rating_metacritic ?? undefined,
      tmdb: r.rating_tmdb ?? undefined,
      balasaur: computeBalasaurScore({
        imdb: r.rating_imdb,
        rottenTomatoes: r.rating_rotten_tomatoes,
        metacritic: r.rating_metacritic,
        tmdb: r.rating_tmdb,
      }),
    },
    genres: r.genres ?? [],
    streaming: [],
    lengthLabel: "",
    people: [],
    popularity: r.popularity ?? undefined,
    lastAirYear,
    awardWinner: r.award_winner ?? false,
    awardNominee: r.award_nominee ?? false,
  };
}

function mapCardRaw(c: TmdbCardRaw, type: "movie" | "tv"): MediaItem {
  const title = (type === "movie" ? c.title : c.name) ?? "Untitled";
  const date = type === "movie" ? c.release_date : c.first_air_date;
  return {
    id: `${type}-${c.id}`,
    mediaType: type,
    title,
    year: yearOf(date),
    overview: c.overview ?? "",
    posterUrl: c.poster_path ? `${POSTER_BASE}${c.poster_path}` : "",
    ratings: { tmdb: c.vote_average ? Number(c.vote_average.toFixed(1)) : undefined },
    genres: [],
    streaming: [],
    lengthLabel: "",
    people: [],
    popularity: c.popularity,
    releaseDate: date,
  };
}

function pickCertification(type: "movie" | "tv", raw: TmdbDetailRaw): string | undefined {
  if (type === "movie") {
    const us = raw.release_dates?.results?.find((r) => r.iso_3166_1 === "US");
    const cert = us?.release_dates?.find((d) => d.certification && d.certification.trim() !== "");
    return cert?.certification || undefined;
  }
  const us = raw.content_ratings?.results?.find((r) => r.iso_3166_1 === "US");
  return us?.rating || undefined;
}

/**
 * Live detail fetch — TMDB (+OMDb) over the network. Used only when we don't
 * already have the title's raw payloads stored in `media`.
 */
async function fetchMediaDetailLive(type: "movie" | "tv", id: string): Promise<MediaDetail> {
  const tmdbKey = process.env.TMDB_API_KEY;
  const omdbKey = process.env.OMDB_API_KEY;
  if (!tmdbKey) throw new Error("TMDB_API_KEY is not configured");

  const append =
    type === "movie"
      ? "external_ids,credits,release_dates,images,videos,recommendations,similar,keywords,watch/providers"
      : "external_ids,credits,content_ratings,images,videos,recommendations,similar,keywords,watch/providers";

  const raw = await tmdb<TmdbDetailRaw>(`/${type}/${id}`, tmdbKey, {
    append_to_response: append,
    language: "en-US",
    include_image_language: "en,null",
  });

  let rawOmdb: OmdbResponse | null = null;
  const liveImdbId = raw.external_ids?.imdb_id;
  if (omdbKey && liveImdbId) {
    rawOmdb = (await fetchOmdbRaw(liveImdbId, omdbKey)) as OmdbResponse | null;
  }

  return buildDetailFromRaw(type, raw, rawOmdb);
}

/**
 * Pure mapping from stored or freshly-fetched raw payloads to a MediaDetail.
 * Makes NO network calls — OMDb data must be supplied by the caller.
 */
function buildDetailFromRaw(
  type: "movie" | "tv",
  raw: TmdbDetailRaw,
  rawOmdb: OmdbResponse | null,
): MediaDetail {
  const title = (type === "movie" ? raw.title : raw.name) ?? "Untitled";
  const date = type === "movie" ? raw.release_date : raw.first_air_date;
  const genreNames = (raw.genres ?? []).map((g) => g.name);

  const cast: MediaPerson[] = (raw.credits?.cast ?? [])
    .slice(0, 12)
    .map((c) => ({ name: c.name, role: c.character || "Cast", personId: c.id }));

  const keyJobs = new Set([
    "Director",
    "Creator",
    "Writer",
    "Screenplay",
    "Original Music Composer",
  ]);
  const crewSeen = new Set<string>();
  const crew: MediaPerson[] = [];
  for (const c of raw.credits?.crew ?? []) {
    if (!c.job || !keyJobs.has(c.job)) continue;
    const key = `${c.name}|${c.job}`;
    if (crewSeen.has(key)) continue;
    crewSeen.add(key);
    crew.push({ name: c.name, role: c.job, personId: c.id });
  }

  const runtime =
    type === "movie"
      ? raw.runtime
      : raw.episode_run_time && raw.episode_run_time.length > 0
        ? raw.episode_run_time[0]
        : undefined;

  let lengthLabel = "";
  if (type === "movie" && runtime) lengthLabel = `${runtime}m`;
  else if (type === "tv" && raw.number_of_seasons) {
    lengthLabel = `${raw.number_of_seasons} season${raw.number_of_seasons === 1 ? "" : "s"}`;
  }

  const seasons: MediaSeason[] | undefined =
    type === "tv" && raw.seasons
      ? raw.seasons
          .filter((s) => s.season_number > 0)
          .map((s) => ({
            seasonNumber: s.season_number,
            name: s.name,
            episodeCount: s.episode_count,
            airDate: s.air_date ?? "",
            posterUrl: s.poster_path ? `${SEASON_POSTER_BASE}${s.poster_path}` : undefined,
            overview: s.overview ?? undefined,
          }))
      : undefined;

  const detail: MediaDetail = {
    id: `${type}-${raw.id}`,
    mediaType: type,
    title,
    year: yearOf(date),
    overview: raw.overview ?? "",
    posterUrl: raw.poster_path ? `${POSTER_BASE}${raw.poster_path}` : "",
    backdropUrl: raw.backdrop_path ? `${BACKDROP_BASE}${raw.backdrop_path}` : undefined,
    tagline: raw.tagline || undefined,
    voteCount: extractVoteCount(raw) ?? undefined,
    ratings: {
      tmdb: raw.vote_average ? Number(raw.vote_average.toFixed(1)) : undefined,
    },
    genres: unifyGenres(genreNames),
    streaming: [],
    lengthLabel,
    people: [...crew.slice(0, 2), ...cast.slice(0, 6)],
    popularity: raw.popularity,
    seasons,
    releaseDate: date,
    runtime,
    numberOfSeasons: raw.number_of_seasons,
    numberOfEpisodes: raw.number_of_episodes,
    cast,
    crew,
    certification: pickCertification(type, raw),
    facts: {
      budget: raw.budget && raw.budget > 0 ? raw.budget : undefined,
      revenue: raw.revenue && raw.revenue > 0 ? raw.revenue : undefined,
      originalLanguage: raw.original_language || undefined,
      productionCountries: raw.production_countries?.map((c) => c.name).filter(Boolean),
      productionCompanies: raw.production_companies?.map((c) => c.name).filter(Boolean),
      status: raw.status || undefined,
      releaseDate: date || undefined,
    },
    external: {
      imdbId: raw.external_ids?.imdb_id || undefined,
      homepage: raw.homepage || undefined,
      wikidataId: raw.external_ids?.wikidata_id || undefined,
    },
  };

  // Stills / backdrops gallery
  const IMG_ROW = "https://image.tmdb.org/t/p/w780";
  const IMG_FULL = "https://image.tmdb.org/t/p/original";
  const imgSources = [...(raw.images?.backdrops ?? []), ...(raw.images?.stills ?? [])];
  const seenPaths = new Set<string>();
  const picked = imgSources
    .filter((i) => {
      if (!i?.file_path || seenPaths.has(i.file_path)) return false;
      seenPaths.add(i.file_path);
      return true;
    })
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
    .slice(0, 12);
  if (picked.length > 0) {
    detail.images = picked.map((i) => `${IMG_ROW}${i.file_path}`);
    detail.imagesOriginal = picked.map((i) => `${IMG_FULL}${i.file_path}`);
  }

  // Trailer pick
  const vids = raw.videos?.results ?? [];
  const yt = vids.filter((v) => v.site === "YouTube");
  const trailer =
    yt.find((v) => v.type === "Trailer" && v.official) ||
    yt.find((v) => v.type === "Trailer") ||
    yt.find((v) => v.type === "Teaser");
  if (trailer) {
    detail.trailer = { key: trailer.key, name: trailer.name, site: "YouTube" };
  }

  // Related titles ("More like this") from recommendations + similar.
  const relatedRaw = [...(raw.recommendations?.results ?? []), ...(raw.similar?.results ?? [])];
  const relSeen = new Set<string>([detail.id]);
  const related: MediaItem[] = [];
  for (const c of relatedRaw) {
    if (!c?.id || !c.poster_path) continue; // skip art-less cards (look broken in a row)
    const cardType: "movie" | "tv" =
      c.media_type === "tv" ? "tv" : c.media_type === "movie" ? "movie" : type;
    const cid = `${cardType}-${c.id}`;
    if (relSeen.has(cid)) continue;
    relSeen.add(cid);
    related.push(mapCardRaw(c, cardType));
    if (related.length >= 12) break;
  }
  if (related.length > 0) detail.related = related;

  // Theme keywords (movie payload uses `.keywords`, tv uses `.results`).
  const kw = (raw.keywords?.keywords ?? raw.keywords?.results ?? [])
    .map((k) => k?.name)
    .filter((n): n is string => !!n)
    .slice(0, 12);
  if (kw.length > 0) detail.keywords = kw;

  // Where-to-watch providers (all regions). Region selection happens client-side.
  const wpResults = raw["watch/providers"]?.results;
  if (wpResults && Object.keys(wpResults).length > 0) {
    const PROVIDER_LOGO_BASE = "https://image.tmdb.org/t/p/original";
    const mapList = (list?: { provider_name: string; logo_path?: string | null }[]) =>
      (list ?? []).map((p) => ({
        name: p.provider_name,
        logoUrl: p.logo_path ? `${PROVIDER_LOGO_BASE}${p.logo_path}` : undefined,
      }));
    const regionEntries = Object.entries(wpResults);
    const availableRegions = regionEntries
      .filter(([, v]) => (v.flatrate?.length || v.rent?.length || v.buy?.length || 0) > 0)
      .map(([k]) => k)
      .sort();
    const byRegion: WatchProvidersAllRegions["byRegion"] = {};
    for (const [code, v] of regionEntries) {
      byRegion[code] = {
        stream: mapList(v.flatrate),
        rent: mapList(v.rent),
        buy: mapList(v.buy),
        link: v.link,
      };
    }
    const region = wpResults.US ? "US" : (availableRegions[0] ?? "US");
    const preferred = byRegion[region] ?? { stream: [], rent: [], buy: [] };
    detail.providers = {
      region,
      stream: preferred.stream,
      rent: preferred.rent,
      buy: preferred.buy,
      link: preferred.link,
      availableRegions,
    };
    detail.providersAll = { byRegion, availableRegions };
  }

  // OMDb enrichment from the supplied payload (no network call here).
  if (rawOmdb) applyOmdbRatings(detail, rawOmdb);

  return detail;
}

// ---------- Read-through cache (media_cache + trending_cache) ----------

// ---------- Related rails (the similarity engine) ----------
//
// Both "more like this" rails come from the `related_titles` Postgres function:
// franchise membership and shared people count most, then sub-genres, themes,
// genres, with a small same-era bonus; the Balasaur Score is a quality floor.
// Audience compatibility is a hard wall and the fan-service tier (`suggestive`)
// never appears. Each returned row carries WHICH facets it shares, so every
// card can say why it is here — and a rail with fewer than 6 real matches is
// refused outright rather than padded with filler.

interface RelatedRow extends CrossRow {
  rating_balasaur: number | null;
  match_score: number;
  same_franchise: boolean | null;
  shared_people: string[] | null;
  shared_sub_genres: string[] | null;
  shared_themes: string[] | null;
  shared_genres: string[] | null;
  era_match: boolean | null;
}

/** Bump when the rail logic changes shape — cached payloads below this version
 *  get their rails rebuilt once on read, then persisted.
 *  v3: also attaches title_context (cohort percentile + franchise standing). */
const RELATED_ENGINE_VERSION = 3;
const MIN_RELATED_MATCHES = 6;

/** A candidate that only shares one broad genre is not a match, it is a
 *  coincidence. Strong = franchise, a person, a sub-genre, a theme, or at
 *  least two shared genres. */
function isStrongMatch(r: RelatedRow): boolean {
  return (
    r.same_franchise === true ||
    (r.shared_people?.length ?? 0) > 0 ||
    (r.shared_sub_genres?.length ?? 0) > 0 ||
    (r.shared_themes?.length ?? 0) > 0 ||
    (r.shared_genres?.length ?? 0) >= 2
  );
}

/** Up to three reason chips, most specific first. Skips a label already
 *  covered by a stronger one ("Spy / Espionage" already says "Espionage"). */
function matchReasons(r: RelatedRow): string[] {
  const out: string[] = [];
  const add = (label: string) => {
    if (!out.some((x) => x.includes(label) || label.includes(x))) out.push(label);
  };
  if (r.same_franchise) out.push("Same series");
  for (const p of r.shared_people ?? []) add(p);
  for (const s of r.shared_sub_genres ?? []) add(s);
  for (const t of r.shared_themes ?? []) add(t);
  if (out.length < 3) for (const g of r.shared_genres ?? []) add(g);
  if (out.length < 3 && r.era_match && r.year && /^\d{4}/.test(r.year)) {
    out.push(`${r.year.slice(0, 3)}0s`);
  }
  return out.slice(0, 3);
}

async function fetchRelatedRail(
  anchorId: string,
  targetType: "movie" | "tv",
): Promise<MediaItem[] | undefined> {
  const { data, error } = await supabaseAdmin.rpc("related_titles", {
    p_media_id: anchorId,
    p_target_type: targetType,
  });
  if (error) {
    console.error("[detail] related_titles failed:", error.message);
    return undefined;
  }
  const rows = ((data ?? []) as unknown as RelatedRow[]).filter(isStrongMatch);
  if (rows.length < MIN_RELATED_MATCHES) return undefined;
  return rows.slice(0, 12).map((r) => {
    const item = crossRowToItem(r);
    // The DB-generated score is canonical when present.
    if (typeof r.rating_balasaur === "number") item.ratings.balasaur = r.rating_balasaur;
    item.matchReasons = matchReasons(r);
    return item;
  });
}

async function attachRelatedRails(detail: MediaDetail): Promise<void> {
  if (detail.mediaType !== "movie" && detail.mediaType !== "tv") return;
  const other = detail.mediaType === "tv" ? "movie" : "tv";
  const [own, cross, ctx] = await Promise.all([
    fetchRelatedRail(detail.id, detail.mediaType),
    fetchRelatedRail(detail.id, other),
    supabaseAdmin.rpc("title_context", { p_media_id: detail.id }).then(
      (r) => (r.error ? null : (r.data?.[0] ?? null)),
      () => null,
    ),
  ]);
  // No weak rail: fewer than 6 real matches means no rail at all. This also
  // drops TMDB's raw recommendation list, which had no content filters.
  detail.related = own;
  detail.relatedCross = cross;
  // Cohort percentile + franchise standing for the data-prose layer.
  if (ctx) {
    const cohort =
      ctx.cohort_label &&
      typeof ctx.percentile === "number" &&
      typeof ctx.cohort_size === "number" &&
      ctx.cohort_size > 0
        ? { label: ctx.cohort_label, size: ctx.cohort_size, percentile: ctx.percentile }
        : undefined;
    const franchise =
      typeof ctx.franchise_rank === "number" &&
      typeof ctx.franchise_size === "number" &&
      ctx.franchise_size >= 2
        ? { size: ctx.franchise_size, rank: ctx.franchise_rank }
        : undefined;
    detail.context = cohort || franchise ? { cohort, franchise } : undefined;
  }
  detail.relatedVersion = RELATED_ENGINE_VERSION;
}

export async function fetchMediaDetail(
  type: "movie" | "tv",
  id: string,
  opts?: { fresh?: boolean },
): Promise<MediaDetail> {
  const cacheId = `${type}-${id}`;

  if (!opts?.fresh) {
    try {
      const { data, error } = await supabaseAdmin
        .from("media_cache")
        .select("detail_payload, detail_fetched_at")
        .eq("id", cacheId)
        .maybeSingle();
      if (!error && data?.detail_payload && data.detail_fetched_at) {
        const age = Date.now() - new Date(data.detail_fetched_at).getTime();
        if (age < DETAIL_TTL_MS) {
          const cached = data.detail_payload as unknown as MediaDetail;
          // Cache-shape healing. Three fields the catalog row holds and the
          // cached detail payload does not, each one silently costing something
          // that is invisible from the code alone:
          //
          //   voteCount  drops AggregateRating.ratingCount, which is what made
          //              Search Console call the rating markup invalid.
          //   balasaur   is computed at render time on the page but never
          //              written to the payload, so the head() that builds the
          //              title tag and meta description could not see it.
          //              Inception shipped as "Inception (2010) | Balasaur"
          //              with no rating, and its description opened on the
          //              second sentence.
          //   streaming  is derived only on a fresh TMDB fetch, so cached
          //              payloads carry an empty array while the catalog row
          //              says Disney+. Every title page lost both the "where
          //              to watch" half of its title tag and the streaming
          //              line, which is the one sentence exempt from the
          //              length cap because it is why most visitors arrived.
          //
          // Healed from the catalog row rather than by purging ~190k cached
          // details, which would also stampede TMDB with rebuild fetches.
          //   the per-source ratings are healed for the same reason. The
          //              rating markup counts how many of the four sources the
          //              score averaged, so a stale payload holding only
          //              {tmdb} while the catalog row holds three sources
          //              silently drops the block off pages like Seinfeld and
          //              The Simpsons. Healing the sources keeps the count
          //              describing the same population the score does.
          const sourceCount = (r?: MediaDetail["ratings"]) =>
            [r?.imdb, r?.rottenTomatoes, r?.metacritic, r?.tmdb].filter(
              (v) => typeof v === "number",
            ).length;
          const needsVotes = cached.voteCount === undefined;
          const needsScore = cached.ratings?.balasaur === undefined;
          const needsStreaming = (cached.streaming ?? []).length === 0;
          const needsSources = sourceCount(cached.ratings) < 2;
          if (needsVotes || needsScore || needsStreaming || needsSources) {
            try {
              const { data: row } = await supabaseAdmin
                .from("media")
                .select(
                  "vote_count, rating_balasaur, streaming, rating_imdb, rating_rotten_tomatoes, rating_metacritic, rating_tmdb",
                )
                .eq("media_id", cacheId)
                .maybeSingle();
              if (needsVotes && typeof row?.vote_count === "number") {
                cached.voteCount = row.vote_count;
              }
              if (needsScore && typeof row?.rating_balasaur === "number") {
                cached.ratings = { ...(cached.ratings ?? {}), balasaur: row.rating_balasaur };
              }
              if (needsStreaming && Array.isArray(row?.streaming) && row.streaming.length > 0) {
                cached.streaming = row.streaming;
              }
              if (needsSources && row) {
                const healed = {
                  imdb: cached.ratings?.imdb ?? row.rating_imdb ?? undefined,
                  rottenTomatoes:
                    cached.ratings?.rottenTomatoes ?? row.rating_rotten_tomatoes ?? undefined,
                  metacritic: cached.ratings?.metacritic ?? row.rating_metacritic ?? undefined,
                  tmdb: cached.ratings?.tmdb ?? row.rating_tmdb ?? undefined,
                };
                // Only adopt the healed set if it actually adds a source, so a
                // catalog row that is itself thin never overwrites good data.
                if (sourceCount(healed) > sourceCount(cached.ratings)) {
                  cached.ratings = { ...(cached.ratings ?? {}), ...healed };
                }
              }
            } catch {
              // best-effort — the page still renders without these
            }
          }
          // Payloads written before the similarity engine carry a rail with
          // no reasons (or TMDB's unfiltered list). Rebuild both rails once
          // and persist, so the hot path pays the engine cost a single time
          // per cached payload instead of on every read.
          if (cached.relatedVersion !== RELATED_ENGINE_VERSION) {
            await attachRelatedRails(cached);
            await writeDetailCache(cacheId, type, id, cached);
          }
          return cached;
        }
      }
    } catch (e) {
      console.error("[cache] media_cache read failed:", e);
    }
  }

  // Build from already-synced raw payloads if we have them — no API calls.
  // syncCatalog stores the full TMDB detail (+OMDb) in `media`, so for any
  // title in the catalog this serves the detail page without touching TMDB/OMDb.
  if (!opts?.fresh) {
    try {
      const { data, error } = await supabaseAdmin
        .from("media")
        .select("raw_tmdb, raw_omdb")
        .eq("media_id", cacheId)
        .maybeSingle();
      if (!error && data?.raw_tmdb) {
        const built = buildDetailFromRaw(
          type,
          data.raw_tmdb as unknown as TmdbDetailRaw,
          (data.raw_omdb as unknown as OmdbResponse | null) ?? null,
        );
        await attachRelatedRails(built);
        await writeDetailCache(cacheId, type, id, built);
        return built;
      }
    } catch (e) {
      console.error("[cache] media raw build failed:", e);
    }
  }

  const detail = await fetchMediaDetailLive(type, id);
  await attachRelatedRails(detail);
  await writeDetailCache(cacheId, type, id, detail);
  return detail;
}

async function writeDetailCache(
  cacheId: string,
  type: "movie" | "tv",
  id: string,
  detail: MediaDetail,
): Promise<void> {
  try {
    const tmdbIdNum = Number.parseInt(id, 10);
    await supabaseAdmin.from("media_cache").upsert(
      {
        id: cacheId,
        media_type: type,
        tmdb_id: Number.isFinite(tmdbIdNum) ? tmdbIdNum : 0,
        title: detail.title,
        year: detail.year || null,
        popularity: detail.popularity ?? null,
        detail_payload: detail as unknown as Json,
        detail_fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch (e) {
    console.error("[cache] media_cache write failed:", e);
  }
}

/**
 * Trending list with read-through cache. Falls back to the existing
 * `loadCatalogFromDb()` live source on any Supabase error.
 */
export async function fetchTrendingMedia(opts?: { fresh?: boolean }): Promise<MediaItem[]> {
  if (!opts?.fresh) {
    try {
      const { data: trend, error: tErr } = await supabaseAdmin
        .from("trending_cache")
        .select("ids, fetched_at")
        .eq("key", "trending")
        .maybeSingle();
      if (!tErr && trend?.ids && trend.fetched_at) {
        const age = Date.now() - new Date(trend.fetched_at).getTime();
        if (age < TRENDING_TTL_MS && trend.ids.length > 0) {
          const order = new Map(trend.ids.map((id: string, i: number) => [id, i]));
          const rows: Array<{ id: string; summary_payload: Json | null }> = [];
          for (let offset = 0; offset < trend.ids.length; offset += POSTGREST_PAGE) {
            const idPage = trend.ids.slice(offset, offset + POSTGREST_PAGE);
            const { data: pageRows, error: rErr } = await supabaseAdmin
              .from("media_cache")
              .select("id, summary_payload")
              .in("id", idPage);
            if (rErr) {
              console.error("[cache] media_cache trending read failed:", rErr.message);
              rows.length = 0;
              break;
            }
            rows.push(...((pageRows ?? []) as Array<{ id: string; summary_payload: Json | null }>));
          }
          if (rows.length > 0) {
            const items = rows
              .filter((r) => r.summary_payload)
              .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
              .map((r) => slimCatalogItem(r.summary_payload as unknown as MediaItem));
            if (items.length > 0) return items;
          }
        }
      }
    } catch (e) {
      console.error("[cache] trending_cache read failed:", e);
    }
  }

  const items = await loadCatalogFromDb();

  // Fail-soft: a non-empty catalog is expected here. If the live read came back
  // empty — e.g. the deployed code references a column that a not-yet-applied
  // migration was meant to add (exactly what blanked the homepage when
  // `media.origins` was missing) — serve the last-known-good rows from media_cache
  // rather than a blank site. Self-heals: once the schema catches up,
  // loadCatalogFromDb succeeds again and the cache is refreshed below.
  if (items.length === 0) {
    const lastKnownGood = await loadCatalogFromCache();
    if (lastKnownGood.length > 0) {
      console.error(
        `[catalog] live read empty, serving ${lastKnownGood.length} last-known-good items from media_cache`,
      );
      return lastKnownGood;
    }
  }

  try {
    if (items.length > 0) {
      const now = new Date().toISOString();
      const rows = items.map((item) => {
        const [type, rawId] = item.id.split("-");
        const tmdbIdNum = Number.parseInt(rawId ?? "", 10);
        return {
          id: item.id,
          media_type: type,
          tmdb_id: Number.isFinite(tmdbIdNum) ? tmdbIdNum : 0,
          title: item.title,
          year: item.year || null,
          popularity: item.popularity ?? null,
          summary_payload: item as unknown as Json,
          summary_fetched_at: now,
          updated_at: now,
        };
      });
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await supabaseAdmin
          .from("media_cache")
          .upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
      }
      await supabaseAdmin.from("trending_cache").upsert(
        {
          key: "trending",
          ids: items.map((i) => i.id),
          fetched_at: now,
        },
        { onConflict: "key" },
      );
    }
  } catch (e) {
    console.error("[cache] trending_cache write failed:", e);
  }

  return items;
}

// ---------- Person detail (read-through person_cache) ----------

const PERSON_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — bios/filmographies rarely change
const PROFILE_BASE = "https://image.tmdb.org/t/p/w300";

interface TmdbPersonCredit {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  poster_path?: string | null;
  vote_average?: number;
  popularity?: number;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  department?: string;
  job?: string;
}

interface TmdbPersonRaw {
  id: number;
  name: string;
  biography?: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  known_for_department?: string;
  profile_path?: string | null;
  imdb_id?: string | null;
  combined_credits?: { cast?: TmdbPersonCredit[]; crew?: TmdbPersonCredit[] };
}

function buildPersonFromRaw(raw: TmdbPersonRaw): PersonDetail {
  // Group every credited title under a department bucket, newest first,
  // deduping the same title within a group. Acting first, then the rest by size.
  const buckets = new Map<string, Map<string, MediaItem>>();

  const add = (dept: string, c: TmdbPersonCredit) => {
    const t = c.media_type === "tv" ? "tv" : c.media_type === "movie" ? "movie" : null;
    if (!t || !c.poster_path) return; // only catalogued media types, skip art-less
    // Drop the synopsis. A person page renders MediaCards, which never show
    // it, so every credit's overview was being serialized into the HTML for
    // nothing: prolific filmographies measured 1.1MB of document, the heaviest
    // pages on the site, and person pages are the ones that rank best.
    const item = { ...mapCardRaw(c as TmdbCardRaw, t), overview: "" };
    let g = buckets.get(dept);
    if (!g) {
      g = new Map<string, MediaItem>();
      buckets.set(dept, g);
    }
    if (!g.has(item.id)) g.set(item.id, item);
  };

  for (const c of raw.combined_credits?.cast ?? []) add("Acting", c);
  for (const c of raw.combined_credits?.crew ?? []) {
    add(c.department || c.job || "Other", c);
  }

  const sortByDate = (a: MediaItem, b: MediaItem) =>
    (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");

  const groups: PersonCreditGroup[] = Array.from(buckets.entries())
    .map(([department, items]) => ({
      department,
      items: Array.from(items.values()).sort(sortByDate),
    }))
    .sort((a, b) => {
      if (a.department === "Acting") return -1;
      if (b.department === "Acting") return 1;
      return b.items.length - a.items.length;
    });

  return {
    id: String(raw.id),
    name: raw.name,
    biography: raw.biography || undefined,
    birthday: raw.birthday || undefined,
    deathday: raw.deathday || undefined,
    placeOfBirth: raw.place_of_birth || undefined,
    knownForDepartment: raw.known_for_department || undefined,
    profileUrl: raw.profile_path ? `${PROFILE_BASE}${raw.profile_path}` : undefined,
    imdbId: raw.imdb_id || undefined,
    groups,
  };
}

/** Catalog statistics for the person page's data-prose line. Additive and
 *  fail-soft: the page renders without them. Attached on every read (the
 *  person_stats scan rides the people GIN index) so they track the nightly
 *  catalog instead of the cached payload's age. */
async function attachPersonStats(detail: PersonDetail): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin.rpc("person_stats", { p_name: detail.name });
    const s = data?.[0];
    if (error || !s || (s.titles ?? 0) < 3) return;
    detail.stats = {
      titles: s.titles,
      scored: s.scored,
      medianScore: s.median_score ?? undefined,
      bestDecade: s.best_decade ?? undefined,
      bestDecadeMedian: s.best_decade_median ?? undefined,
      bestDecadeTitles: s.best_decade_titles ?? undefined,
      collaborators: Array.isArray(s.collaborators)
        ? (s.collaborators as { name: string; together: number }[])
        : [],
    };
  } catch {
    // stats are additive; the page stands without them
  }
}

export async function fetchPersonDetail(
  id: string,
  opts?: { fresh?: boolean },
): Promise<PersonDetail> {
  const personIdNum = Number.parseInt(id, 10);

  if (!opts?.fresh && Number.isFinite(personIdNum)) {
    try {
      const { data, error } = await supabaseAdmin
        .from("person_cache")
        .select("payload, fetched_at")
        .eq("id", personIdNum)
        .maybeSingle();
      if (!error && data?.payload && data.fetched_at) {
        const age = Date.now() - new Date(data.fetched_at).getTime();
        if (age < PERSON_TTL_MS) {
          const cached = data.payload as unknown as PersonDetail;
          await attachPersonStats(cached);
          return cached;
        }
      }
    } catch (e) {
      console.error("[cache] person_cache read failed:", e);
    }
  }

  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) throw new Error("TMDB_API_KEY is not configured");

  const raw = await tmdb<TmdbPersonRaw>(`/person/${id}`, tmdbKey, {
    append_to_response: "combined_credits,external_ids",
    language: "en-US",
  });
  const detail = buildPersonFromRaw(raw);
  await attachPersonStats(detail);

  try {
    if (Number.isFinite(personIdNum)) {
      await supabaseAdmin.from("person_cache").upsert(
        {
          id: personIdNum,
          name: detail.name,
          payload: detail as unknown as Json,
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    }
  } catch (e) {
    console.error("[cache] person_cache write failed:", e);
  }

  return detail;
}
