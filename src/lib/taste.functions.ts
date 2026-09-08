import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeBalasaurScore } from "@/lib/score";
import { MAX_FACT_IDS, type TitleFact } from "@/lib/taste";

// Catalog facts for the Taste Card, by id.
//
// The card is drawn from what the visitor already has (their statuses carry a
// title, a year and a poster), but genres, origins and scores live only in the
// catalog, and every archetype rule reads those. This is the one request the
// taste page makes.
//
// Read-only, unauthenticated, capped, and chunked: a single .in() of more than
// a thousand ids silently loses rows because the REST layer caps the response,
// which would quietly shrink the denominator every percentage on the card
// divides by.

const CHUNK = 200;

const COLS =
  "media_id, media_type, title, year, poster_url, color_a, color_b, genres, origins, rating_imdb, rating_rotten_tomatoes, rating_metacritic, rating_tmdb";

interface FactRow {
  media_id: string;
  media_type: string;
  title: string;
  year: string | null;
  poster_url: string | null;
  color_a: string | null;
  color_b: string | null;
  genres: string[] | null;
  origins: string[] | null;
  rating_imdb: number | null;
  rating_rotten_tomatoes: number | null;
  rating_metacritic: number | null;
  rating_tmdb: number | null;
}

/** Metacritic is the critic number when there is one; Rotten Tomatoes is the
 *  fallback. Both run 0 to 100, so the sentence reads the same either way. */
function criticOf(r: FactRow): Pick<TitleFact, "critic" | "criticSource"> {
  if (r.rating_metacritic != null)
    return { critic: r.rating_metacritic, criticSource: "Metacritic" };
  if (r.rating_rotten_tomatoes != null)
    return { critic: r.rating_rotten_tomatoes, criticSource: "Rotten Tomatoes" };
  return {};
}

function toFact(r: FactRow): TitleFact {
  return {
    id: r.media_id,
    title: r.title,
    year: r.year ?? undefined,
    mediaType: r.media_type,
    genres: r.genres ?? [],
    origins: r.origins ?? [],
    posterUrl: r.poster_url ?? undefined,
    colorA: r.color_a ?? undefined,
    colorB: r.color_b ?? undefined,
    score: computeBalasaurScore({
      imdb: r.rating_imdb,
      rottenTomatoes: r.rating_rotten_tomatoes,
      metacritic: r.rating_metacritic,
      tmdb: r.rating_tmdb,
    }),
    ...criticOf(r),
  };
}

export const getTasteFacts = createServerFn({ method: "POST" })
  .inputValidator((p: { ids: string[] }) => p)
  .handler(async ({ data }): Promise<TitleFact[]> => {
    const ids = [...new Set((data.ids ?? []).filter((s) => typeof s === "string" && s))].slice(
      0,
      MAX_FACT_IDS,
    );
    if (ids.length === 0) return [];

    const out: TitleFact[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data: rows, error } = await supabaseAdmin
        .from("media")
        .select(COLS)
        .in("media_id", slice)
        .limit(slice.length);
      if (error) {
        // Fail soft on the chunk. A short read draws a card from fewer titles,
        // which the page states, rather than an error page.
        console.error("[taste] fact lookup failed:", error.message);
        continue;
      }
      for (const r of (rows ?? []) as unknown as FactRow[]) out.push(toFact(r));
    }
    return out;
  });
