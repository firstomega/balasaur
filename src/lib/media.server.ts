import type { MediaItem, MediaPerson, MediaSeason } from "@/types/media";
import { unifyGenres } from "./genres";

const TMDB_BASE = "https://api.themoviedb.org/3";
const OMDB_BASE = "https://www.omdbapi.com";
const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const SEASON_POSTER_BASE = "https://image.tmdb.org/t/p/w342";

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

async function fetchDetails(item: MediaItem, key: string): Promise<TmdbDetails | null> {
  const [type, rawId] = item.id.split("-");
  try {
    return await tmdb<TmdbDetails>(`/${type}/${rawId}`, key, {
      append_to_response: "external_ids,credits,watch/providers",
    });
  } catch {
    return null;
  }
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
}

function parsePct(v: string): number | undefined {
  const n = parseInt(v.replace("%", ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

async function enrichWithOmdb(item: MediaItem, imdbId: string, key: string): Promise<void> {
  try {
    const url = `${OMDB_BASE}/?i=${imdbId}&apikey=${key}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = (await res.json()) as OmdbResponse;
    if (data.Response !== "True") return;
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
  } catch {
    // leave undefined
  }
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

export async function fetchTrendingMedia(): Promise<MediaItem[]> {
  const tmdbKey = process.env.TMDB_API_KEY;
  const omdbKey = process.env.OMDB_API_KEY;
  if (!tmdbKey) throw new Error("TMDB_API_KEY is not configured");

  const genres = await loadGenres(tmdbKey);
  const [movies, tv] = await Promise.all([
    tmdb<{ results: TmdbTrendingItem[] }>("/trending/movie/week", tmdbKey),
    tmdb<{ results: TmdbTrendingItem[] }>("/trending/tv/week", tmdbKey),
  ]);

  const items: MediaItem[] = [
    ...movies.results.map((r) => mapItem(r, "movie", genres.movie)),
    ...tv.results.map((r) => mapItem(r, "tv", genres.tv)),
  ].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

  // Enrich all items with TMDB details (credits, providers, seasons).
  await mapWithLimit(items, 8, async (item) => {
    const details = await fetchDetails(item, tmdbKey);
    if (!details) return;
    const imdbId = enrichFromDetails(item, details);
    if (omdbKey && imdbId) await enrichWithOmdb(item, imdbId, omdbKey);
  });

  return items;
}