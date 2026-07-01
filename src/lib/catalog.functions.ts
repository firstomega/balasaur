import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { IMDB_BOUNDS, RT_BOUNDS, META_BOUNDS, FILM_LENGTH_BUCKETS } from "@/types/filters";
import { computeBalasaurScore } from "@/lib/score";
import { originsForCountry } from "@/lib/origins";
import type { MediaItem, MediaPerson, MediaSeason } from "@/types/media";

// Server-side catalog browsing. Replaces shipping the entire catalog to the
// browser: the homepage asks for one page at a time, filtered + sorted in Postgres.

export interface CatalogQueryParams {
  types: string[]; // subset of ["movie","tv"]
  genres: string[];
  origins: string[];
  streaming: string[];
  yearMin?: number; // omitted when the year range is at its default (no constraint)
  yearMax?: number;
  imdbMin: number;
  imdbMax: number;
  imdbUnrated: boolean;
  rtMin: number;
  rtMax: number;
  rtUnrated: boolean;
  metaMin: number;
  metaMax: number;
  metaUnrated: boolean;
  people: string[];
  awardWinners: boolean;
  nominated: boolean;
  awardsWon: string[];
  awardsNominated: string[];
  subGenres: string[];
  themes: string[];
  audience: string[];
  completion: string[];
  filmLength: string[];
  /** ISO-3166-1 region for the streaming filter (viewer's account region). Default "US". */
  region?: string;
  /** ISO-3166-1 country of the viewer (IP geo / account region) used to rank
   *  home-country titles first on the default view. Empty/unbucketed → no boost. */
  boostCountry?: string;
  sort: string;
  limit: number;
  offset: number;
}

// Card-only columns — note we do NOT select people/overview here (the grid doesn't
// render them), which is most of the payload savings. `seasons` is read only to
// derive the TV year range, then dropped before it goes to the client.
const CARD_COLS =
  "media_id,media_type,title,year,poster_url,popularity,release_date,rating_imdb,rating_rotten_tomatoes,rating_metacritic,rating_tmdb,genres,origins,streaming,seasons,award_winner,award_nominee";

interface CardRow {
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
  seasons: unknown;
  award_winner: boolean | null;
  award_nominee: boolean | null;
}

function rowToCardItem(r: CardRow): MediaItem {
  const seasons = r.seasons as MediaSeason[] | null;
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
      }),
    },
    genres: r.genres ?? [],
    origins: r.origins ?? [],
    streaming: r.streaming ?? [],
    lengthLabel: "",
    people: [] as MediaPerson[],
    popularity: r.popularity ?? undefined,
    lastAirYear,
    seasonCount,
    releaseDate: r.release_date ?? undefined,
    awardWinner: r.award_winner ?? false,
    awardNominee: r.award_nominee ?? false,
  };
}

function buildBase() {
  return supabaseAdmin.from("media").select(CARD_COLS, { count: "exact" });
}
type MediaQuery = ReturnType<typeof buildBase>;

/** Apply every WHERE clause for a catalog query. Kept separate from ordering so the
 *  local-first path can build two identically-filtered queries (home-country vs. the
 *  rest) from one source of truth. `origins` is included but is a no-op on the boost
 *  path, which only runs when no Origin filter is set. */
function applyCatalogFilters(q: MediaQuery, p: CatalogQueryParams): MediaQuery {
  if (p.types.length === 1) q = q.eq("media_type", p.types[0]);
  if (p.genres.length) q = q.overlaps("genres", p.genres);
  if (p.origins.length) q = q.overlaps("origins", p.origins);
  if (p.streaming.length) {
    // Region-aware: match "Provider:REGION" tokens for the viewer's account region
    // (defaults to US). A title counts as streamable only where it actually streams.
    const region = (p.region || "US").toUpperCase();
    q = q.overlaps(
      "streaming_regions",
      p.streaming.map((s) => `${s}:${region}`),
    );
  }

  if (typeof p.yearMin === "number" && typeof p.yearMax === "number") {
    // `year` is a 4-char text column; lexical compare matches numeric order and
    // excludes null/empty (which is what we want when a year range is set).
    q = q.gte("year", String(p.yearMin)).lte("year", String(p.yearMax));
  }

  // Ratings: only constrain when it isn't "full range AND include unrated".
  // include-unrated keeps nulls; strict mode drops them.
  {
    const full = p.imdbMin <= IMDB_BOUNDS[0] && p.imdbMax >= IMDB_BOUNDS[1];
    if (!(full && p.imdbUnrated)) {
      if (p.imdbUnrated)
        q = q.or(
          `rating_imdb.is.null,and(rating_imdb.gte.${p.imdbMin},rating_imdb.lte.${p.imdbMax})`,
        );
      else q = q.gte("rating_imdb", p.imdbMin).lte("rating_imdb", p.imdbMax);
    }
  }
  {
    const full = p.rtMin <= RT_BOUNDS[0] && p.rtMax >= RT_BOUNDS[1];
    if (!(full && p.rtUnrated)) {
      if (p.rtUnrated)
        q = q.or(
          `rating_rotten_tomatoes.is.null,and(rating_rotten_tomatoes.gte.${p.rtMin},rating_rotten_tomatoes.lte.${p.rtMax})`,
        );
      else q = q.gte("rating_rotten_tomatoes", p.rtMin).lte("rating_rotten_tomatoes", p.rtMax);
    }
  }
  {
    const full = p.metaMin <= META_BOUNDS[0] && p.metaMax >= META_BOUNDS[1];
    if (!(full && p.metaUnrated)) {
      if (p.metaUnrated)
        q = q.or(
          `rating_metacritic.is.null,and(rating_metacritic.gte.${p.metaMin},rating_metacritic.lte.${p.metaMax})`,
        );
      else q = q.gte("rating_metacritic", p.metaMin).lte("rating_metacritic", p.metaMax);
    }
  }

  if (p.awardWinners) q = q.eq("award_winner", true);
  else if (p.nominated) q = q.or("award_nominee.eq.true,award_winner.eq.true");

  // Specific-award filters (OR within each status group; AND between won + nominated).
  if (p.awardsWon.length) q = q.overlaps("awards_won", p.awardsWon);
  if (p.awardsNominated.length) q = q.overlaps("awards_nominated", p.awardsNominated);

  // Advanced facets. Array facets match like genres (OR within the facet).
  if (p.subGenres.length) q = q.overlaps("sub_genres", p.subGenres);
  if (p.themes.length) q = q.overlaps("themes", p.themes);
  if (p.audience.length) q = q.overlaps("audience", p.audience);
  // Completion is TV-only; let movies pass through so it can't blank a mixed view.
  if (p.completion.length)
    q = q.or(`media_type.eq.movie,completion_status.in.(${p.completion.join(",")})`);
  // Film length is movie-only; let TV pass through in a mixed view.
  if (p.filmLength.length) {
    const ranges = FILM_LENGTH_BUCKETS.filter((b) => p.filmLength.includes(b.key)).map(
      (b) => `and(film_length_minutes.gte.${b.min},film_length_minutes.lte.${b.max})`,
    );
    if (ranges.length) q = q.or(`media_type.eq.tv,${ranges.join(",")}`);
  }

  // "By person": every selected name must be present in the cast (jsonb contains).
  for (const name of p.people) {
    q = q.contains("people", JSON.stringify([{ name }]));
  }

  return q;
}

const ASC = { ascending: true, nullsFirst: false } as const;
const DESC = { ascending: false, nullsFirst: false } as const;

function applyOrder(q: MediaQuery, sort: string) {
  switch (sort) {
    case "newest":
      return q.order("year", DESC).order("popularity", DESC);
    case "oldest":
      return q.order("year", ASC).order("popularity", DESC);
    case "topRated":
      return q.order("rating_imdb", DESC).order("popularity", DESC);
    case "az":
      return q.order("title", ASC);
    case "za":
      return q.order("title", DESC);
    default:
      return q.order("popularity", DESC);
  }
}

/** A Postgres array literal for an `ov`/`not.ov` value, e.g. ["American"] → "{American}".
 *  Bucket keys have no spaces/commas so no quoting is needed. */
function arrayLiteral(values: string[]): string {
  return `{${values.join(",")}}`;
}

export const queryCatalog = createServerFn({ method: "GET" })
  .inputValidator((p: CatalogQueryParams) => p)
  .handler(async ({ data: p }): Promise<{ items: MediaItem[]; total: number }> => {
    // No media types selected → nothing matches.
    if (p.types.length === 0) return { items: [], total: 0 };

    // Local-first: on the default popularity view with no explicit Origin filter, rank
    // the viewer's home-country titles above everyone else's — without hiding anything.
    // Any explicit sort or Origin choice turns this off (their intent wins).
    const boostBuckets =
      (p.sort === "popular" || p.sort === "trending") && p.origins.length === 0
        ? originsForCountry(p.boostCountry)
        : [];

    if (boostBuckets.length > 0) {
      const boosted = await queryLocalFirst(p, boostBuckets);
      if (boosted) return boosted;
      // else fall through to the plain query (fail-soft).
    }

    const ordered = applyOrder(applyCatalogFilters(buildBase(), p), p.sort);
    const { data, error, count } = await ordered.range(p.offset, p.offset + p.limit - 1);
    if (error) {
      // Fail-soft: never crash the homepage on a DB hiccup or a not-yet-applied
      // migration — serve an empty page and self-heal once the DB is consistent.
      console.error("[catalog] query failed:", error.message);
      return { items: [], total: 0 };
    }
    const items = ((data ?? []) as unknown as CardRow[]).map(rowToCardItem);
    return { items, total: count ?? 0 };
  });

/**
 * The local-first page: home-country titles (popularity-ordered) come first, then
 * everyone else (also popularity-ordered), as one continuous, paginated list. We run
 * two identically-filtered queries — one for titles whose origins overlap the viewer's
 * bucket(s), one for the rest — and stitch the requested page window across the seam.
 * Returns null on error so the caller can fall back to the plain query.
 */
async function queryLocalFirst(
  p: CatalogQueryParams,
  buckets: string[],
): Promise<{ items: MediaItem[]; total: number } | null> {
  const literal = arrayLiteral(buckets);
  const localQ = applyCatalogFilters(buildBase(), p)
    .overlaps("origins", buckets)
    .order("popularity", DESC);
  const globalQ = applyCatalogFilters(buildBase(), p)
    .not("origins", "ov", literal)
    .order("popularity", DESC);

  // Fetch this page's slice of the local set first.
  const localRes = await localQ.range(p.offset, p.offset + p.limit - 1);
  if (localRes.error) {
    console.error("[catalog] local-first (local) query failed:", localRes.error.message);
    return null;
  }
  const localCount = localRes.count ?? 0;
  const localRows = (localRes.data ?? []) as unknown as CardRow[];

  // The global set continues where the local set ended. Global titles already shown on
  // earlier pages = offset − localCount (clamped at 0); the rest fill this page.
  const consumedGlobal = Math.max(0, p.offset - localCount);
  const needGlobal = p.limit - localRows.length;
  const gStart = consumedGlobal;
  const gEnd = needGlobal > 0 ? consumedGlobal + needGlobal - 1 : consumedGlobal;
  const globalRes = await globalQ.range(gStart, gEnd);
  if (globalRes.error) {
    console.error("[catalog] local-first (global) query failed:", globalRes.error.message);
    return null;
  }
  const globalCount = globalRes.count ?? 0;
  const globalRows = needGlobal > 0 ? ((globalRes.data ?? []) as unknown as CardRow[]) : [];

  const items = [...localRows, ...globalRows].map(rowToCardItem);
  return { items, total: localCount + globalCount };
}

// Edge/CDN geo headers, in rough order of specificity. The value is a 2-letter
// ISO-3166-1 country code. Different hosts set different headers, so we probe several.
const GEO_HEADERS = [
  "cf-ipcountry", // Cloudflare
  "x-vercel-ip-country", // Vercel
  "x-geo-country",
  "x-country-code",
  "x-country",
  "fastly-geo-country", // Fastly
];

/**
 * Best-effort country of the current viewer, read from the edge geo header the CDN
 * stamps on the request (works for both the SSR document request and client→server-fn
 * calls, since both traverse the same edge). Returns "" when unknown — callers then
 * fall back to no location boost. Never throws.
 */
export const getViewerCountry = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    try {
      const headers = getRequest()?.headers;
      if (!headers) return "";
      for (const key of GEO_HEADERS) {
        const v = headers.get(key)?.trim().toUpperCase();
        if (v && v.length === 2 && v !== "XX") return v;
      }
      return "";
    } catch {
      return "";
    }
  },
);

export interface CatalogFacets {
  total: number;
  tagged: number;
  genres: Record<string, number>;
  origins: Record<string, number>;
  subGenres: Record<string, number>;
  themes: Record<string, number>;
  audience: Record<string, number>;
  completion: Record<string, number>;
  filmLength: Record<string, number>;
  scored: { imdb: number; rt: number; meta: number };
}

/** Filter params the facets respect (same shape as the grid, minus paging). */
export type CatalogFacetParams = Omit<CatalogQueryParams, "limit" | "offset">;

/**
 * Faceted counts for the filter rail, recomputed against the active filters — genre
 * counts apply every filter except the genre selection, origin counts every filter
 * except the origin selection (standard faceted search). Fail-soft.
 */
export const getCatalogFacets = createServerFn({ method: "GET" })
  .inputValidator((p: CatalogFacetParams) => p)
  .handler(async ({ data: p }): Promise<CatalogFacets> => {
    const empty: CatalogFacets = {
      total: 0,
      tagged: 0,
      genres: {},
      origins: {},
      subGenres: {},
      themes: {},
      audience: {},
      completion: {},
      filmLength: {},
      scored: { imdb: 0, rt: 0, meta: 0 },
    };
    const { data, error } = await supabaseAdmin.rpc("catalog_facets_filtered", {
      p: {
        types: p.types,
        genres: p.genres,
        origins: p.origins,
        streaming: p.streaming,
        region: p.region ?? "US",
        year_min: p.yearMin ?? null,
        year_max: p.yearMax ?? null,
        imdb_min: p.imdbMin,
        imdb_max: p.imdbMax,
        imdb_unrated: p.imdbUnrated,
        rt_min: p.rtMin,
        rt_max: p.rtMax,
        rt_unrated: p.rtUnrated,
        meta_min: p.metaMin,
        meta_max: p.metaMax,
        meta_unrated: p.metaUnrated,
        people: p.people,
        award_winners: p.awardWinners,
        nominated: p.nominated,
        sub_genres: p.subGenres,
        themes: p.themes,
        audience: p.audience,
        completion: p.completion,
        film_length: p.filmLength,
      },
    });
    if (error) {
      // Fail-soft: a missing function / DB hiccup shows the rail without counts
      // instead of taking down the homepage loader.
      console.error("[facets] query failed:", error.message);
      return empty;
    }
    const f = (data ?? {}) as Partial<CatalogFacets>;
    return {
      total: f.total ?? 0,
      tagged: f.tagged ?? 0,
      genres: f.genres ?? {},
      origins: f.origins ?? {},
      subGenres: f.subGenres ?? {},
      themes: f.themes ?? {},
      audience: f.audience ?? {},
      completion: f.completion ?? {},
      filmLength: f.filmLength ?? {},
      scored: f.scored ?? { imdb: 0, rt: 0, meta: 0 },
    };
  });

/** Cast/crew name typeahead for the rail's "By Person" search. */
export const searchCast = createServerFn({ method: "GET" })
  .inputValidator((input: { query: string; exclude?: string[] }) => input)
  .handler(async ({ data }): Promise<string[]> => {
    const q = (data.query ?? "").trim();
    if (!q) return [];
    const { data: rows, error } = await supabaseAdmin.rpc("search_cast", {
      p_q: q,
      p_exclude: data.exclude ?? [],
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as { name: string }[]).map((r) => r.name).filter(Boolean);
  });

export interface SearchHit {
  id: string;
  mediaType: string;
  title: string;
  year: string | null;
  posterUrl: string | null;
}

/**
 * Title search for the top-bar search box. Server-side (uses the title trigram
 * index) so the header no longer loads the whole catalog into the browser just to
 * search it. Substring match, most-popular first.
 */
export const searchTitles = createServerFn({ method: "GET" })
  .inputValidator((input: { query: string }) => input)
  .handler(async ({ data }): Promise<SearchHit[]> => {
    const q = (data.query ?? "").trim();
    if (q.length < 1) return [];
    const { data: rows, error } = await supabaseAdmin
      .from("media")
      .select("media_id, media_type, title, year, poster_url")
      .ilike("title", `%${q}%`)
      .order("popularity", { ascending: false, nullsFirst: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return (
      (rows ?? []) as Array<{
        media_id: string;
        media_type: string;
        title: string;
        year: string | null;
        poster_url: string | null;
      }>
    ).map((r) => ({
      id: r.media_id,
      mediaType: r.media_type,
      title: r.title,
      year: r.year,
      posterUrl: r.poster_url,
    }));
  });
