import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dayNumber, dailyIndex, redactTitle } from "@/lib/daily";
import type { MediaPerson } from "@/types/media";

// The daily pick. Pool: titles with 1,500+ ratings, so the answer is always
// something a person could plausibly know. Ordered by media_id so the pick
// is stable within a day even as vote counts drift; the day index walks the
// pool deterministically. The payload includes the answer (Wordle ships its
// answers in the bundle too); the game is a ritual, not a vault.

export interface DailyChallenge {
  number: number;
  id: string; // "movie-603"
  title: string;
  year: string;
  mediaType: "movie" | "tv";
  posterUrl: string;
  score: number | null;
  clues: string[]; // in reveal order, MAX_GUESSES entries
}

const POOL_MIN_VOTES = 1500;

export const getDailyChallenge = createServerFn({ method: "GET" }).handler(
  async (): Promise<DailyChallenge | null> => {
    const day = dayNumber();

    const { count, error: countErr } = await supabaseAdmin
      .from("media")
      .select("media_id", { count: "exact", head: true })
      .eq("sensitive", false)
      .gte("vote_count", POOL_MIN_VOTES)
      .not("poster_url", "is", null)
      .not("year", "is", null);
    if (countErr || !count) {
      if (countErr) console.error("[daily] pool count failed:", countErr.message);
      return null;
    }

    const idx = dailyIndex(day, count);
    const { data, error } = await supabaseAdmin
      .from("media")
      .select(
        "media_id, media_type, title, year, poster_url, rating_balasaur, genres, people, film_length_minutes, seasons, raw_tmdb",
      )
      .eq("sensitive", false)
      .gte("vote_count", POOL_MIN_VOTES)
      .not("poster_url", "is", null)
      .not("year", "is", null)
      .order("media_id", { ascending: true })
      .range(idx, idx);
    if (error || !data || data.length === 0) {
      if (error) console.error("[daily] pick failed:", error.message);
      return null;
    }

    const r = data[0] as {
      media_id: string;
      media_type: string;
      title: string;
      year: string;
      poster_url: string;
      rating_balasaur: number | null;
      genres: string[] | null;
      people: MediaPerson[] | null;
      film_length_minutes: number | null;
      seasons: unknown[] | null;
      raw_tmdb: { tagline?: string } | null;
    };

    const typeWord = r.media_type === "tv" ? "TV series" : "movie";
    const decade = `${r.year.slice(0, 3)}0s`;
    const genres = (r.genres ?? []).slice(0, 3).join(", ");
    const people = (r.people ?? []).filter((p) => p.name);
    const director = people.find((p) => p.role === "Director" || p.role === "Creator");
    const actor = people.find((p) => p !== director);
    const length =
      r.media_type === "tv"
        ? `${(r.seasons ?? []).length || "several"} ${(r.seasons ?? []).length === 1 ? "season" : "seasons"}`
        : r.film_length_minutes
          ? `${Math.floor(r.film_length_minutes / 60)}h ${r.film_length_minutes % 60}m`
          : "";
    const tagline = r.raw_tmdb?.tagline ? redactTitle(r.raw_tmdb.tagline, r.title) : "";

    // Six clues, cheapest information first. Blanks are skipped by falling
    // back to a fact that always exists, so the list is always full length.
    const clues = [
      `A ${typeWord} from the ${decade}.`,
      genres ? `Genres: ${genres}.` : `From ${r.year}.`,
      length ? `Released ${r.year}. Runs ${length}.` : `Released ${r.year}.`,
      actor ? `Features ${actor.name}.` : `Score: ${r.rating_balasaur ?? "unrated"}.`,
      director
        ? `${director.role}: ${director.name}.`
        : `Title has ${r.title.split(/\s+/).length} word(s).`,
      tagline ? `Tagline: "${tagline}"` : `The title starts with "${r.title[0].toUpperCase()}".`,
    ];

    return {
      number: day,
      id: r.media_id,
      title: r.title,
      year: r.year,
      mediaType: r.media_type === "tv" ? "tv" : "movie",
      posterUrl: r.poster_url,
      score: r.rating_balasaur,
      clues,
    };
  },
);
