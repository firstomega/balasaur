import type { MediaDetail, MediaItem, MediaPerson, MediaSeason } from "@/types/media";
import { unifyGenres } from "./genres";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TablesInsert } from "@/integrations/supabase/types";

type MediaRow = TablesInsert<"media">;

const TMDB_BASE = "https://api.themoviedb.org/3";
const OMDB_BASE = "https://www.omdbapi.com";
const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/original";
const SEASON_POSTER_BASE = "https://image.tmdb.org/t/p/w342";
const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DISCOVER_PAGES = 38; // ~760 of each type (TMDB returns 20 per page)
const TOP_RATED_PAGES = 10; // ~200 of each type — classics
const TRENDING_PAGES = 2; // ~40 of each type — currently hot
const OMDB_BUDGET_PER_RUN = 900; // free tier is ~1000/day, leave headroom
const MAX_ENRICH_PER_RUN = 350; // keep one run under serverless time limits
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
  const rawGenres = (raw.genre_ids ?? []).map((id) => genreMap.get(id)).filter((x): x is string => !!x);
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
};

interface TmdbDetails {
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
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

  // Streaming providers (US)
  const us = d["watch/providers"]?.results?.US;
  if (us?.flatrate) {
    const mapped = new Set<string>();
    for (const p of us.flatrate) {
      const name = PROVIDER_NAME_MAP[p.provider_name];
      if (name) mapped.add(name);
    }
    item.streaming = Array.from(mapped);
  }

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


async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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
 * Read the catalog out of our database. NO upstream API calls.
 * This is what visitor page loads hit.
 */
export async function loadCatalogFromDb(limit = 1500): Promise<MediaItem[]> {
  const { data, error } = await supabaseAdmin
    .from("media")
    .select(
      "media_id,media_type,title,year,poster_url,overview,popularity,release_date,rating_imdb,rating_rotten_tomatoes,rating_metacritic,rating_tmdb,genres,streaming,length_label,people,seasons,award_winner,award_nominee",
    )
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error("[catalog] load failed:", error.message);
    return [];
  }

  return (data ?? []).map((r): MediaItem => ({
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
    streaming: r.streaming ?? [],
    lengthLabel: r.length_label ?? "",
    people: (r.people as unknown as MediaPerson[]) ?? [],
    popularity: r.popularity ?? undefined,
    seasons: (r.seasons as unknown as MediaSeason[] | null) ?? undefined,
    releaseDate: r.release_date ?? undefined,
    awardWinner: r.award_winner ?? false,
    awardNominee: r.award_nominee ?? false,
  }));
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
  const all: DiscoverResult[] = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const r = await tmdb<{ results: DiscoverResult[] }>(`/discover/${type}`, key, {
        sort_by: "popularity.desc",
        include_adult: "false",
        page: String(page),
        language: "en-US",
      });
      all.push(...r.results);
    } catch (e) {
      console.error(`[sync] discover ${type} page ${page} failed:`, e);
    }
  }
  return all;
}

async function listFromPath(
  path: string,
  key: string,
  pages: number,
): Promise<DiscoverResult[]> {
  const all: DiscoverResult[] = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const r = await tmdb<{ results: DiscoverResult[] }>(path, key, {
        page: String(page),
        language: "en-US",
      });
      all.push(...r.results);
    } catch (e) {
      console.error(`[sync] ${path} page ${page} failed:`, e);
    }
  }
  return all;
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

function rowFromEnrichedItem(
  item: MediaItem,
  rawTmdb: unknown,
  rawOmdb: unknown,
): MediaRow {
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
  updatedAwards: number;
  failed: number;
  durationMs: number;
}

interface TmdbGenreObj {
  id: number;
  name: string;
}

/**
 * Rewrite `genres`, `award_winner`, `award_nominee`, `award_wins`,
 * `award_nominations` columns on every existing media row, sourced from
 * raw_tmdb / raw_omdb already stored. Makes NO external API calls.
 */
export async function backfillFromRaw(): Promise<BackfillResult> {
  const start = Date.now();
  const result: BackfillResult = {
    scanned: 0,
    updatedGenres: 0,
    updatedAwards: 0,
    failed: 0,
    durationMs: 0,
  };

  const PAGE = 200;
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("media")
      .select("media_id, genres, raw_tmdb, raw_omdb")
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[backfill] select failed:", error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      result.scanned++;
      try {
        const raw = row.raw_tmdb as { genres?: TmdbGenreObj[] } | null;
        const tmdbGenreNames = (raw?.genres ?? [])
          .map((g) => g?.name)
          .filter((n): n is string => !!n);
        const newGenres = tmdbGenreNames.length > 0 ? unifyGenres(tmdbGenreNames) : (row.genres ?? []);

        const awardsText = (row.raw_omdb as { Awards?: string } | null)?.Awards;
        const awards = parseAwards(awardsText);

        const genresChanged =
          JSON.stringify(newGenres) !== JSON.stringify(row.genres ?? []);

        const { error: updErr } = await supabaseAdmin
          .from("media")
          .update({
            genres: newGenres,
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
        if (genresChanged) result.updatedGenres++;
        if (awards.winner || awards.nominee) result.updatedAwards++;
      } catch (e) {
        result.failed++;
        console.error("[backfill] row failed:", e);
      }
    }

    if (data.length < PAGE) break;
    offset += PAGE;
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
 * OMDB ratings, then upsert into `public.media`. Skips items already
 * fresher than STALE_MS to avoid burning API calls.
 */
export async function syncCatalog(opts?: { force?: boolean }): Promise<SyncResult> {
  const start = Date.now();
  const tmdbKey = process.env.TMDB_API_KEY;
  const omdbKey = process.env.OMDB_API_KEY;
  if (!tmdbKey) throw new Error("TMDB_API_KEY is not configured");

  const genres = await loadGenres(tmdbKey);

  // 1. Seed from multiple TMDB sources, then merge + dedupe.
  const [
    discoverMovies,
    discoverTv,
    topMovies,
    topTv,
    trendingMovies,
    trendingTv,
  ] = await Promise.all([
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
        return !last || now - last > STALE_MS;
      });

  // Process never-fetched items first, then stalest-first, so subsequent
  // scheduled runs naturally continue where this one stopped.
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
    const { error } = await supabaseAdmin
      .from("media")
      .upsert(chunk, { onConflict: "media_id" });
    if (error) {
      console.error(`[sync] upsert chunk failed:`, error.message);
    }
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