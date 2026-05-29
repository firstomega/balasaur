import type { MediaItem } from "@/types/media";
import { unifyGenres } from "./genres";

const TMDB_BASE = "https://api.themoviedb.org/3";
const OMDB_BASE = "https://www.omdbapi.com";
const POSTER_BASE = "https://image.tmdb.org/t/p/w500";

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
  };
}

async function getExternalImdbId(item: MediaItem, key: string): Promise<string | undefined> {
  const [type, rawId] = item.id.split("-");
  try {
    const r = await tmdb<{ imdb_id?: string | null }>(`/${type}/${rawId}/external_ids`, key);
    return r.imdb_id ?? undefined;
  } catch {
    return undefined;
  }
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

  // OMDb enrichment for top N to keep latency bounded.
  if (omdbKey) {
    const top = items.slice(0, 40);
    await mapWithLimit(top, 6, async (item) => {
      const imdbId = await getExternalImdbId(item, tmdbKey);
      if (imdbId) await enrichWithOmdb(item, imdbId, omdbKey);
    });
  }

  return items;
}