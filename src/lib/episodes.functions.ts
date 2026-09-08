import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { EpisodeRating } from "./episodes";

// Read side of the episode heatmap. The write side (TMDB season fetches, the
// upsert into `episode_ratings`) lives in media.server.ts behind the nightly
// sync endpoint; nothing here ever calls TMDB.

/**
 * `episode_ratings` postdates the generated Database types, so it is reached
 * through an untyped builder, the same way media.server.ts and
 * arcade.functions.ts reach their newer tables.
 */
interface LooseQuery extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select(cols: string): LooseQuery;
  eq(col: string, val: unknown): LooseQuery;
  order(col: string, opts: { ascending: boolean }): LooseQuery;
  range(from: number, to: number): LooseQuery;
}

function looseTable(table: string): LooseQuery {
  return (supabaseAdmin as unknown as { from: (t: string) => LooseQuery }).from(table);
}

interface EpisodeRow {
  season: number;
  episode: number;
  rating: number | string;
  votes: number | null;
  air_date: string | null;
  name: string | null;
}

/** PostgREST caps a response at 1,000 rows, and One Piece alone is past that. */
const PAGE = 500;
/** Ceiling for one show. Nothing in the catalog is close; a runaway id stops here. */
const MAX_ROWS = 4000;

const MEDIA_ID_RE = /^tv-\d{1,10}$/;

/**
 * Every stored episode rating for one show, season then episode order.
 *
 * Fail-soft, and all-or-nothing: a page that errors returns `[]` rather than
 * what arrived before it. Half a show would still pass the 60% coverage gate
 * on the short seasons and draw a grid that misstates the show.
 */
async function readEpisodeRatings(mediaId: string): Promise<EpisodeRating[]> {
  const out: EpisodeRating[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await looseTable("episode_ratings")
      .select("season, episode, rating, votes, air_date, name")
      .eq("media_id", mediaId)
      .order("season", { ascending: true })
      .order("episode", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[episodes] read failed for ${mediaId}:`, error.message);
      return [];
    }
    const rows = (data ?? []) as EpisodeRow[];
    for (const r of rows) {
      out.push({
        season: Number(r.season),
        episode: Number(r.episode),
        rating: Number(r.rating),
        votes: Number(r.votes ?? 0),
        airDate: r.air_date,
        name: r.name,
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

export const getEpisodeRatings = createServerFn({ method: "GET" })
  .inputValidator((data: { mediaId: string }) => {
    if (!data || typeof data.mediaId !== "string" || !MEDIA_ID_RE.test(data.mediaId)) {
      throw new Error("Invalid media id");
    }
    return { mediaId: data.mediaId };
  })
  .handler(({ data }) => readEpisodeRatings(data.mediaId));

/** Shared by the `/tv/$id` loader and the page, so the grid is in the SSR HTML. */
export const episodeRatingsQueryOptions = (mediaId: string) =>
  queryOptions({
    queryKey: ["episode-ratings", mediaId],
    queryFn: () => getEpisodeRatings({ data: { mediaId } }),
    // Episode ratings move once a night at most.
    staleTime: 6 * 60 * 60 * 1000,
  });
