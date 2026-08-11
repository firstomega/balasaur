import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BALASAUR_BOUNDS,
  IMDB_BOUNDS,
  RT_BOUNDS,
  META_BOUNDS,
  FILM_LENGTH_BUCKETS,
  STREAMING_OPTIONS,
} from "@/types/filters";
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
  /** Unified Balasaur Score range (0–100). Optional so older cached callers
   *  (and saved param shapes) keep working — absent means unconstrained. */
  balasaurMin?: number;
  balasaurMax?: number;
  balasaurUnrated?: boolean;
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
        tmdb: r.rating_tmdb,
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

// Rows-only base: NO count. During the 2026-07-02/03 recovery, page rows (index-backed,
// LIMIT'd) answered instantly while count(*) over the bloated table blew every timeout —
// and because both rode one request, a slow count blanked the whole grid. Rows and counts
// are now separate requests with separate fates.
function buildBase() {
  return supabaseAdmin.from("media").select(CARD_COLS);
}
// Exact-counted variant — used only by the local-first stitch, which needs true set
// sizes for its pagination seam (it falls back to the plain path if this is slow).
function buildCounted() {
  return supabaseAdmin.from("media").select(CARD_COLS, { count: "exact" });
}
// Head-only "estimated" count for the results total: exact while the set is small,
// planner-estimate when large — fast either way, never drags the rows down.
function buildCountHead() {
  return supabaseAdmin.from("media").select("media_id", { count: "estimated", head: true });
}
type MediaQuery = ReturnType<typeof buildBase>;

/** Apply every WHERE clause for a catalog query. Kept separate from ordering so the
 *  local-first path can build two identically-filtered queries (home-country vs. the
 *  rest) from one source of truth. `origins` is included but is a no-op on the boost
 *  path, which only runs when no Origin filter is set. */
function applyCatalogFilters(q: MediaQuery, p: CatalogQueryParams): MediaQuery {
  // Content safety: erotica-adjacent titles (see contentSafety.ts) never surface
  // in the browse grid, facet counts, or rails. Deliberately NOT applied to
  // searchTitles below — flagged titles stay findable by name and by direct link.
  q = q.eq("sensitive", false);
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
    const min = p.balasaurMin ?? BALASAUR_BOUNDS[0];
    const max = p.balasaurMax ?? BALASAUR_BOUNDS[1];
    const unrated = p.balasaurUnrated ?? true;
    const full = min <= BALASAUR_BOUNDS[0] && max >= BALASAUR_BOUNDS[1];
    if (!(full && unrated)) {
      if (unrated)
        q = q.or(
          `rating_balasaur.is.null,and(rating_balasaur.gte.${min},rating_balasaur.lte.${max})`,
        );
      else q = q.gte("rating_balasaur", min).lte("rating_balasaur", max);
    }
  }
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
      // Bayesian-weighted: the Balasaur Score shrunk by vote confidence
      // (rank.ts computeQualityScore), so a 100-from-3-votes doesn't outrank a
      // 92-from-400k. No vote threshold — uncertainty just discounts the claim.
      return q.order("quality_score", DESC).order("popularity", DESC);
    case "az":
      return q.order("title", ASC);
    case "za":
      return q.order("title", DESC);
    default:
      // "popular": the blended rank (buzz + quality + recency, see rank.ts),
      // not raw TMDB popularity — raw popularity surfaced high-churn obscurities
      // above universally loved titles. Popularity remains the tiebreaker.
      return q.order("rank_score", DESC).order("popularity", DESC);
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

    // Rows and total run as SEPARATE, parallel requests. Rows are index-backed and fast;
    // counting can be slow on a cold/bloated table — a slow count must never blank the
    // grid, and a failed count degrades to a scroll-friendly floor instead.
    const rowsQ = applyOrder(applyCatalogFilters(buildBase(), p), p.sort).range(
      p.offset,
      p.offset + p.limit - 1,
    );
    const countQ = applyCatalogFilters(buildCountHead() as unknown as MediaQuery, p);
    const [rowsRes, countRes] = await Promise.all([
      rowsQ,
      // A count failure is absorbed here; only the rows result decides success.
      countQ.then(
        (r) => r,
        () => null,
      ),
    ]);

    if (rowsRes.error) {
      // Throw (rather than serving a cached-able empty page): React Query retries the
      // request, and the route loaders are already shielded (allSettled + ssrBudget).
      console.error("[catalog] rows query failed:", rowsRes.error.message);
      throw new Error("catalog query failed");
    }
    const items = ((rowsRes.data ?? []) as unknown as CardRow[]).map(rowToCardItem);

    // A short page proves we've hit the end — that total is exact. Otherwise take the
    // estimated count, clamped so it can never undercut what's already on screen (a
    // low estimate would freeze infinite scroll / show "13 results" under 60 cards).
    const loaded = p.offset + items.length;
    let total: number;
    if (items.length < p.limit) {
      total = loaded;
    } else {
      const estimated =
        countRes && !countRes.error && typeof countRes.count === "number" ? countRes.count : 0;
      total = Math.max(estimated, loaded + 1);
    }
    return { items, total };
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
  // buildCounted (exact counts): the seam math below needs true set sizes. On a cold or
  // struggling DB the counts are the slow part — then this whole path errors, returns
  // null, and the caller serves the plain rows-first view instead. Self-healing: the
  // boost turns back on as soon as counts are fast again.
  const literal = arrayLiteral(buckets);
  // Same blended rank as applyOrder's default — this path only runs on the
  // default "popular" view, and the two must agree or the boosted and plain
  // views would interleave differently.
  const localQ = applyCatalogFilters(buildCounted() as MediaQuery, p)
    .overlaps("origins", buckets)
    .order("rank_score", DESC)
    .order("popularity", DESC);
  const globalQ = applyCatalogFilters(buildCounted() as MediaQuery, p)
    .not("origins", "ov", literal)
    .order("rank_score", DESC)
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
  scored: { imdb: number; rt: number; meta: number; balasaur: number };
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
      scored: { imdb: 0, rt: 0, meta: 0, balasaur: 0 },
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
        balasaur_min: p.balasaurMin ?? BALASAUR_BOUNDS[0],
        balasaur_max: p.balasaurMax ?? BALASAUR_BOUNDS[1],
        balasaur_unrated: p.balasaurUnrated ?? true,
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
      scored: { imdb: 0, rt: 0, meta: 0, balasaur: 0, ...(f.scored ?? {}) },
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

export interface HomeRails {
  trending: MediaItem[];
  newAndNoteworthy: MediaItem[];
  comingSoon: MediaItem[];
  hiddenGems: MediaItem[];
}

const RAIL_SIZE = 24;
const NOTEWORTHY_WINDOW_DAYS = 75;
const COMING_SOON_WINDOW_DAYS = 120;
/** TMDB votes at which a foreign title counts as a mainstream crossover
 *  (Squid Game-class) and appears in geo-scoped rails everywhere. */
const CROSSOVER_VOTES = 2000;

/**
 * Curated homepage rails, shown above the grid on the unfiltered view:
 *  - Trending This Week: the blended-rank top (buzz + quality + recency),
 *    released titles only — hype for the unreleased belongs in Coming Soon.
 *  - New & Noteworthy: released in the last ~2.5 months with real traction,
 *    minus anything already in Trending.
 *  - Coming Soon: unreleased titles with real pre-release buzz, soonest first.
 *  - Hidden Gems: little buzz, external-critic-validated high scores (an IMDb
 *    rating is required so a handful of TMDB self-votes can't mint a "gem").
 *
 * Geo scoping: when the viewer's country maps to an origin bucket, each rail
 * keeps home-country titles plus PROVEN global crossovers (vote_count ≥
 * CROSSOVER_VOTES) — so a US visitor sees American titles and Squid Game, not
 * every regionally-hyped release worldwide. Unknown geo → global rails,
 * unchanged. Rails are discovery, not inventory: the full catalog is always one
 * scroll away in the grid, so scoping here hides nothing permanently.
 *
 * All rails respect the content-safety flag and need a poster (a rail of "No
 * art" cards sells nothing). Fail-soft per rail: a failed query renders as an
 * absent rail, never an error page.
 */
export const getHomeRails = createServerFn({ method: "GET" })
  .inputValidator((p: { boostCountry?: string }) => p)
  .handler(async ({ data: p }): Promise<HomeRails> => {
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - NOTEWORTHY_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const horizon = new Date(Date.now() + COMING_SOON_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const buckets = originsForCountry(p.boostCountry);
    const base = () => {
      let q = buildBase().eq("sensitive", false).not("poster_url", "is", null);
      if (buckets.length > 0) {
        q = q.or(`origins.ov.${arrayLiteral(buckets)},vote_count.gte.${CROSSOVER_VOTES}`);
      }
      return q;
    };

    const [trendingRes, newRes, soonRes, gemsRes] = await Promise.all([
      base()
        .lte("release_date", today)
        .order("rank_score", DESC)
        .order("popularity", DESC)
        .limit(RAIL_SIZE)
        .then(
          (r) => r,
          () => null,
        ),
      base()
        .gte("release_date", since)
        .lte("release_date", today)
        .gte("popularity", 3)
        .order("rank_score", DESC)
        .limit(RAIL_SIZE * 2) // over-fetch: some of these are also in Trending
        .then(
          (r) => r,
          () => null,
        ),
      base()
        .gt("release_date", today)
        .lte("release_date", horizon)
        .gte("popularity", 5)
        .order("release_date", ASC)
        .order("rank_score", DESC)
        .limit(RAIL_SIZE)
        .then(
          (r) => r,
          () => null,
        ),
      base()
        .not("rating_imdb", "is", null)
        .gte("rating_balasaur", 75)
        .lt("popularity", 15)
        .order("rating_balasaur", DESC)
        .order("popularity", DESC)
        .limit(RAIL_SIZE)
        .then(
          (r) => r,
          () => null,
        ),
    ]);

    const toItems = (res: { data: unknown; error: unknown } | null): MediaItem[] => {
      if (!res || res.error || !res.data) {
        if (res?.error) console.error("[rails] query failed:", (res.error as Error).message);
        return [];
      }
      return (res.data as unknown as CardRow[]).map(rowToCardItem);
    };

    const trending = toItems(trendingRes);
    const trendingIds = new Set(trending.map((i) => i.id));
    const newAndNoteworthy = toItems(newRes)
      .filter((i) => !trendingIds.has(i.id))
      .slice(0, RAIL_SIZE);
    const shownIds = new Set([...trendingIds, ...newAndNoteworthy.map((i) => i.id)]);
    const hiddenGems = toItems(gemsRes).filter((i) => !shownIds.has(i.id));

    return { trending, newAndNoteworthy, comingSoon: toItems(soonRes), hiddenGems };
  });

export interface WatchlistAvailability {
  /** How many of the submitted watchlist ids stream on a major service in the
   *  viewer's region right now. */
  total: number;
  /** A few example titles for the banner copy, with their providers. */
  items: { id: string; title: string; providers: string[] }[];
}

/**
 * "N titles on your watchlist are streaming now" — joins the caller's watchlist
 * ids against streaming_regions for their region. Read-only, capped, fail-soft
 * (an empty result renders as no banner, never an error).
 */
export const getWatchlistAvailability = createServerFn({ method: "POST" })
  .inputValidator((p: { ids: string[]; region?: string }) => p)
  .handler(async ({ data: p }): Promise<WatchlistAvailability> => {
    const ids = (p.ids ?? []).slice(0, 200);
    if (ids.length === 0) return { total: 0, items: [] };
    const region = /^[A-Za-z]{2}$/.test(p.region ?? "") ? p.region!.toUpperCase() : "US";
    const tokens = STREAMING_OPTIONS.map((s) => `${s}:${region}`);

    const { data, error, count } = await supabaseAdmin
      .from("media")
      .select("media_id, title, streaming_regions", { count: "exact" })
      .in("media_id", ids)
      .overlaps("streaming_regions", tokens)
      .limit(5);
    if (error) {
      console.error("[watchlist-nudge] query failed:", error.message);
      return { total: 0, items: [] };
    }
    const rows = (data ?? []) as { media_id: string; title: string; streaming_regions: string[] }[];
    const suffix = `:${region}`;
    return {
      total: count ?? rows.length,
      items: rows.map((r) => ({
        id: r.media_id,
        title: r.title,
        providers: (r.streaming_regions ?? [])
          .filter((t) => t.endsWith(suffix))
          .map((t) => t.slice(0, -suffix.length)),
      })),
    };
  });

export interface SearchHit {
  id: string;
  mediaType: string;
  title: string;
  year: string | null;
  posterUrl: string | null;
  /** Unified Balasaur Score for the dropdown badge (absent → no data). */
  balasaur?: number;
}

interface SearchRow {
  media_id: string;
  media_type: string;
  title: string;
  year: string | null;
  poster_url: string | null;
  rating_imdb: number | null;
  rating_rotten_tomatoes: number | null;
  rating_metacritic: number | null;
  rating_tmdb: number | null;
}

function searchRowToHit(r: SearchRow): SearchHit {
  return {
    id: r.media_id,
    mediaType: r.media_type,
    title: r.title,
    year: r.year,
    posterUrl: r.poster_url,
    balasaur: computeBalasaurScore({
      imdb: r.rating_imdb,
      rottenTomatoes: r.rating_rotten_tomatoes,
      metacritic: r.rating_metacritic,
      tmdb: r.rating_tmdb,
    }),
  };
}

/**
 * Title search for the top-bar search box. Server-side, via the search_titles
 * RPC: trigram similarity gives typo tolerance ("Severence" finds Severance),
 * substring matches rank first, `sensitive` titles are DEMOTED below clean ones
 * (never hidden — search is the deliberate lookup path), and ties break on the
 * blended rank rather than raw popularity. Falls back to the plain ilike query
 * if the RPC isn't applied yet (same fail-soft pattern as the facets RPC).
 */
export const searchTitles = createServerFn({ method: "GET" })
  .inputValidator((input: { query: string }) => input)
  .handler(async ({ data }): Promise<SearchHit[]> => {
    const q = (data.query ?? "").trim();
    if (q.length < 1) return [];

    const rpc = await supabaseAdmin.rpc("search_titles", { p_q: q });
    if (!rpc.error) return ((rpc.data ?? []) as SearchRow[]).map(searchRowToHit);
    console.error("[search] search_titles RPC failed, using ilike fallback:", rpc.error.message);

    const { data: rows, error } = await supabaseAdmin
      .from("media")
      .select(
        "media_id, media_type, title, year, poster_url, rating_imdb, rating_rotten_tomatoes, rating_metacritic, rating_tmdb",
      )
      .ilike("title", `%${q}%`)
      .order("rank_score", { ascending: false, nullsFirst: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as SearchRow[]).map(searchRowToHit);
  });
