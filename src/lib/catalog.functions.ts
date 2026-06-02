import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { IMDB_BOUNDS, RT_BOUNDS, META_BOUNDS } from "@/types/filters";
import { computeBalasaurScore } from "@/lib/score";
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
  /** ISO-3166-1 region for the streaming filter (viewer's account region). Default "US". */
  region?: string;
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

export const queryCatalog = createServerFn({ method: "GET" })
  .inputValidator((p: CatalogQueryParams) => p)
  .handler(async ({ data: p }): Promise<{ items: MediaItem[]; total: number }> => {
    // No media types selected → nothing matches.
    if (p.types.length === 0) return { items: [], total: 0 };

    let q = supabaseAdmin.from("media").select(CARD_COLS, { count: "exact" });

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

    // "By person": every selected name must be present in the cast (jsonb contains).
    for (const name of p.people) {
      q = q.contains("people", JSON.stringify([{ name }]));
    }

    const asc = { ascending: true, nullsFirst: false } as const;
    const desc = { ascending: false, nullsFirst: false } as const;
    let ordered;
    switch (p.sort) {
      case "newest":
        ordered = q.order("year", desc).order("popularity", desc);
        break;
      case "oldest":
        ordered = q.order("year", asc).order("popularity", desc);
        break;
      case "topRated":
        ordered = q.order("rating_imdb", desc).order("popularity", desc);
        break;
      default:
        ordered = q.order("popularity", desc);
        break;
    }

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

export interface CatalogFacets {
  total: number;
  tagged: number;
  genres: Record<string, number>;
  origins: Record<string, number>;
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
