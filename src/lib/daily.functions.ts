import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dayNumber, dailyIndex, redactTitle } from "@/lib/daily";
import type { MediaPerson } from "@/types/media";

// The daily pick. Pool: titles with 1,500+ ratings, so the answer is always
// something a person could plausibly know. The pick is PINNED in
// daily_challenges on first request of the day, because an offset into a
// live-counted pool shifts whenever the nightly sync changes membership, and
// two players sharing "Balasaurdle #N" must have played the same title. The
// payload includes the answer (Wordle ships its answers in the bundle too);
// the game is a ritual, not a vault.

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

const CHALLENGE_COLS =
  "media_id, media_type, title, year, poster_url, rating_balasaur, genres, people, film_length_minutes, seasons, raw_tmdb";

/** The pinned pick for a day, computing and pinning it on first request. */
async function pinnedMediaId(day: number): Promise<string | null> {
  const { data: pinned } = await supabaseAdmin
    .from("daily_challenges")
    .select("media_id")
    .eq("day", day)
    .maybeSingle();
  if (pinned?.media_id) return pinned.media_id;

  const { count, error: countErr } = await supabaseAdmin
    .from("media")
    .select("media_id", { count: "exact", head: true })
    // suggestive covers the whole fan-service tier (superset of sensitive);
    // past answers are pinned in daily_challenges, so pool changes only
    // affect future days.
    .eq("suggestive", false)
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
    .select("media_id")
    .eq("suggestive", false)
    .gte("vote_count", POOL_MIN_VOTES)
    .not("poster_url", "is", null)
    .not("year", "is", null)
    .order("media_id", { ascending: true })
    .range(idx, idx);
  if (error || !data || data.length === 0) {
    if (error) console.error("[daily] pick failed:", error.message);
    return null;
  }
  const mediaId = (data[0] as { media_id: string }).media_id;
  // Two racing first-requests both insert; the loser's row is dropped and a
  // re-read returns the winner, so every player gets one answer.
  await supabaseAdmin.from("daily_challenges").insert({ day, media_id: mediaId });
  const { data: confirmed } = await supabaseAdmin
    .from("daily_challenges")
    .select("media_id")
    .eq("day", day)
    .maybeSingle();
  return confirmed?.media_id ?? mediaId;
}

export const getDailyChallenge = createServerFn({ method: "GET" }).handler(
  async (): Promise<DailyChallenge | null> => {
    const day = dayNumber();
    const mediaId = await pinnedMediaId(day);
    if (!mediaId) return null;

    const { data, error } = await supabaseAdmin
      .from("media")
      .select(CHALLENGE_COLS)
      .eq("media_id", mediaId)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("[daily] challenge read failed:", error.message);
      return null;
    }

    const r = data as unknown as {
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
    const actor = people.find((p) => p.role !== "Director" && p.role !== "Creator");
    const length =
      r.media_type === "tv"
        ? `${(r.seasons ?? []).length || "several"} ${(r.seasons ?? []).length === 1 ? "season" : "seasons"}`
        : r.film_length_minutes
          ? `${Math.floor(r.film_length_minutes / 60)}h ${r.film_length_minutes % 60}m`
          : "";
    const tagline = r.raw_tmdb?.tagline ? redactTitle(r.raw_tmdb.tagline, r.title) : "";

    // Six clues, cheapest information first. Blanks are skipped by falling
    // back to a fact that always exists, so the list is always full length.
    const titleWords = r.title.split(/\s+/).length;
    const wordClue = `The title is ${titleWords} ${titleWords === 1 ? "word" : "words"} long.`;
    const clues = [
      `A ${typeWord} from the ${decade}.`,
      genres ? `Genres: ${genres}.` : wordClue,
      length ? `Released ${r.year}. Runs ${length}.` : `Released ${r.year}.`,
      actor ? `Features ${actor.name}.` : `It scores ${r.rating_balasaur ?? "no rating"} here.`,
      director ? `${director.role}: ${director.name}.` : wordClue,
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
