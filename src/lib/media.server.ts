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
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json, TablesInsert } from "@/integrations/supabase/types";

type MediaRow = TablesInsert<"media">;

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
const OMDB_BUDGET_PER_RUN = 900; // free tier is ~1000/day, leave headroom
const MAX_ENRICH_PER_RUN = 1200; // prioritize catalog growth; OMDb enrichment stops at the budget above
const TMDB_APPEND =
  "external_ids,credits,watch/providers,keywords,release_dates,content_ratings,images,videos,recommendations,similar";

let genreCache: { movie: Map<number, string>; tv: Map<number, string> } | null = null;

async function tmdb<T>(path: string, key: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
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

const PROVIDER_NAME_MAP: Record<string, string> = {
  Netflix: "Netflix",
  Max: "Max",
  "HBO Max": "Max",
  "Amazon Prime Video": "Prime",
  "Amazon Prime Video with Ads": "Prime",
  "Apple TV+": "Apple TV+",
  "Apple TV Plus": "Apple TV+",
  Hulu: "Hulu",
  "Disney Plus": "Disney+",
  "Disney+": "Disney+",
};

/**
 * Map a TMDB US `watch/providers` block to our normalized streaming-service set
 * (flatrate / subscription only). Shared by live enrichment and the raw backfill
 * so both produce identical `streaming` values.
 */
function deriveStreaming(
  watchProviders:
    | { results?: Record<string, { flatrate?: { provider_name: string }[] }> }
    | undefined,
): string[] {
  const flatrate = watchProviders?.results?.US?.flatrate;
  if (!flatrate) return [];
  const mapped = new Set<string>();
  for (const p of flatrate) {
    const name = PROVIDER_NAME_MAP[p.provider_name];
    if (name) mapped.add(name);
  }
  return Array.from(mapped);
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
  limit = 20000,
): Promise<{ path: string; lastmod?: string }[]> {
  const { data, error } = await supabaseAdmin
    .from("media")
    .select("media_id, media_type, updated_at")
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error("[sitemap] media query failed:", error.message);
    return [];
  }

  return (data ?? []).map(
    (r: { media_id: string; media_type: string; updated_at: string | null }) => {
      const rawId = r.media_id.replace(/^(movie|tv)-/, "");
      const seg = r.media_type === "tv" ? "tv" : "movie";
      return {
        path: `/${seg}/${rawId}`,
        lastmod: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : undefined,
      };
    },
  );
}

/**
 * Read the catalog out of our database. NO upstream API calls.
 * This is what visitor page loads hit.
 */
export async function loadCatalogFromDb(limit = CATALOG_LIMIT): Promise<MediaItem[]> {
  // PostgREST caps a single response at 1000 rows regardless of .limit(),
  // so page with .range() until we hit `limit` or run out of rows.
  type Row = {
    media_id: string;
    media_type: string;
    title: string;
    year: string | null;
    poster_url: string | null;
    overview: string | null;
    popularity: number | null;
    release_date: string | null;
    rating_imdb: number | null;
    rating_rotten_tomatoes: number | null;
    rating_metacritic: number | null;
    rating_tmdb: number | null;
    genres: string[] | null;
    origins: string[] | null;
    streaming: string[] | null;
    length_label: string | null;
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
        "media_id,media_type,title,year,poster_url,overview,popularity,release_date,rating_imdb,rating_rotten_tomatoes,rating_metacritic,rating_tmdb,genres,origins,streaming,length_label,people,seasons,award_winner,award_nominee",
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

  return rows.map(
    (r): MediaItem => ({
      id: r.media_id,
      mediaType: r.media_type as MediaItem["mediaType"],
      title: r.title,
      year: r.year ?? "",
      overview: r.overview ?? "",
      posterUrl: r.poster_url ?? "",
      ratings: {
        imdb: r.rating_imdb ?? undefined,
        rottenTomatoes: r.rating_rotten_tomatoes ?? undefined,
        metacritic: r.rating_metacritic ?? undefined,
        tmdb: r.rating_tmdb ?? undefined,
      },
      genres: r.genres ?? [],
      origins: r.origins ?? [],
      streaming: r.streaming ?? [],
      lengthLabel: r.length_label ?? "",
      people: (r.people as unknown as MediaPerson[]) ?? [],
      popularity: r.popularity ?? undefined,
      seasons: (r.seasons as unknown as MediaSeason[] | null) ?? undefined,
      releaseDate: r.release_date ?? undefined,
      awardWinner: r.award_winner ?? false,
      awardNominee: r.award_nominee ?? false,
    }),
  );
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
      .map((r) => r.summary_payload as unknown as MediaItem);
  } catch (e) {
    console.error("[cache] last-known-good read threw:", e);
    return [];
  }
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

function rowFromEnrichedItem(item: MediaItem, rawTmdb: unknown, rawOmdb: unknown): MediaRow {
  const awards = parseAwards((rawOmdb as OmdbResponse | null)?.Awards);
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
    genres: item.genres,
    origins: item.origins ?? [],
    streaming: item.streaming,
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
  };
}

// ---------- One-time backfill from already-stored raw payloads ----------

export interface BackfillResult {
  scanned: number;
  updatedGenres: number;
  updatedStreaming: number;
  updatedAwards: number;
  failed: number;
  durationMs: number;
}

interface TmdbGenreObj {
  id: number;
  name: string;
}

/**
 * Rewrite `genres`, `origins`, `streaming`, `award_winner`, `award_nominee`,
 * `award_wins`, `award_nominations` columns on every existing media row, sourced
 * from raw_tmdb / raw_omdb already stored. Makes NO external API calls.
 */
export async function backfillFromRaw(): Promise<BackfillResult> {
  const start = Date.now();
  const result: BackfillResult = {
    scanned: 0,
    updatedGenres: 0,
    updatedStreaming: 0,
    updatedAwards: 0,
    failed: 0,
    durationMs: 0,
  };

  const PAGE = 200;
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("media")
      .select("media_id, genres, origins, streaming, raw_tmdb, raw_omdb")
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[backfill] select failed:", error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      result.scanned++;
      try {
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

        const countries = [
          ...(raw?.origin_country ?? []),
          ...(raw?.production_countries ?? []).map((c) => c.iso_3166_1 ?? "").filter(Boolean),
        ];
        const newOrigins = deriveOrigins(raw?.original_language, countries);
        const newStreaming = deriveStreaming(raw?.["watch/providers"]);

        const genresChanged = JSON.stringify(newGenres) !== JSON.stringify(row.genres ?? []);
        const originsChanged = JSON.stringify(newOrigins) !== JSON.stringify(row.origins ?? []);
        const streamingChanged =
          JSON.stringify(newStreaming) !== JSON.stringify(row.streaming ?? []);

        const { error: updErr } = await supabaseAdmin
          .from("media")
          .update({
            genres: newGenres,
            origins: newOrigins,
            streaming: newStreaming,
            award_winner: awards.winner,
            award_nominee: awards.nominee,
            award_wins: awards.wins ?? null,
            award_nominations: awards.nominations ?? null,
            updated_at: new Date().toISOString(),
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
      } catch (e) {
        result.failed++;
        console.error("[backfill] row failed:", e);
      }
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Bust the grid cache so rewritten rows show on the next load (not after 24h).
  if (result.updatedGenres > 0 || result.updatedStreaming > 0 || result.updatedAwards > 0) {
    const { error } = await supabaseAdmin.from("trending_cache").delete().eq("key", "trending");
    if (error) console.error("[backfill] trending_cache bust failed:", error.message);
  }

  result.durationMs = Date.now() - start;
  return result;
}

export interface SyncResult {
  discovered: number;
  refreshed: number;
  skippedFresh: number;
  failed: number;
  durationMs: number;
}

/**
 * Pull discover/movie + discover/tv, enrich each with TMDB details +
 * OMDB ratings, then upsert into `public.media`. By default it only enriches
 * never-seen titles so top-ups grow the catalog instead of re-calling existing rows.
 */
export async function syncCatalog(opts?: {
  force?: boolean;
  refreshExisting?: boolean;
}): Promise<SyncResult> {
  const start = Date.now();
  const tmdbKey = process.env.TMDB_API_KEY;
  const omdbKey = process.env.OMDB_API_KEY;
  if (!tmdbKey) throw new Error("TMDB_API_KEY is not configured");

  const genres = await loadGenres(tmdbKey);

  // 1. Seed from multiple TMDB sources, then merge + dedupe.
  const [discoverMovies, discoverTv, topMovies, topTv, trendingMovies, trendingTv] =
    await Promise.all([
      discoverIds("movie", tmdbKey, DISCOVER_PAGES),
      discoverIds("tv", tmdbKey, DISCOVER_PAGES),
      listFromPath("/movie/top_rated", tmdbKey, TOP_RATED_PAGES),
      listFromPath("/tv/top_rated", tmdbKey, TOP_RATED_PAGES),
      listFromPath("/trending/movie/week", tmdbKey, TRENDING_PAGES),
      listFromPath("/trending/tv/week", tmdbKey, TRENDING_PAGES),
    ]);

  const movies = dedupeById([...discoverMovies, ...topMovies, ...trendingMovies]);
  const tv = dedupeById([...discoverTv, ...topTv, ...trendingTv]);

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

  const toRefresh = candidates.slice(0, MAX_ENRICH_PER_RUN);

  let refreshed = 0;
  let failed = 0;
  let omdbCalls = 0;
  const rows: MediaRow[] = [];

  await mapWithLimit(toRefresh, 6, async (item) => {
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

  // 3. Upsert in chunks (rows can be large).
  const CHUNK = 25;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin.from("media").upsert(chunk, { onConflict: "media_id" });
    if (error) {
      console.error(`[sync] upsert chunk failed:`, error.message);
    }
  }

  // 4. Bust the grid's trending cache when the catalog actually changed, so new
  //    titles appear on the next page load instead of waiting out the 24h TTL.
  //    (fetchTrendingMedia rebuilds it from the `media` table on the next miss.)
  if (refreshed > 0) {
    const { error } = await supabaseAdmin.from("trending_cache").delete().eq("key", "trending");
    if (error) console.error("[sync] trending_cache bust failed:", error.message);
  }

  return {
    discovered: seedItems.length,
    refreshed,
    skippedFresh: seedItems.length - candidates.length,
    failed,
    durationMs: Date.now() - start,
  };
}

async function fetchOmdbRaw(imdbId: string, key: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${OMDB_BASE}/?i=${imdbId}&apikey=${key}`);
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
          return data.detail_payload as unknown as MediaDetail;
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
        await writeDetailCache(cacheId, type, id, built);
        return built;
      }
    } catch (e) {
      console.error("[cache] media raw build failed:", e);
    }
  }

  const detail = await fetchMediaDetailLive(type, id);
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
              .map((r) => r.summary_payload as unknown as MediaItem);
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
        `[catalog] live read empty — serving ${lastKnownGood.length} last-known-good items from media_cache`,
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
    const item = mapCardRaw(c as TmdbCardRaw, t);
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
          return data.payload as unknown as PersonDetail;
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
