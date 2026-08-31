import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dayNumber, dailyIndex, redactTitle, leaksTitle } from "@/lib/daily";
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

/** "$322,740,140" to "$322 million". Anything unparseable yields "", which
 *  makes the clue slot fall through rather than print a broken number. */
function boxOfficeWords(raw?: string): string {
  if (!raw || raw === "N/A") return "";
  const n = Number(raw.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(n) || n < 1_000_000) return "";
  return n >= 1_000_000_000
    ? `$${(n / 1_000_000_000).toFixed(1)} billion`
    : `$${Math.round(n / 1_000_000)} million`;
}

const CHALLENGE_COLS =
  "media_id, media_type, title, year, poster_url, rating_balasaur, rating_imdb, rating_rotten_tomatoes, genres, people, seasons, awards_won, raw_tmdb, raw_omdb";

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
      rating_imdb: number | null;
      rating_rotten_tomatoes: number | null;
      seasons: { episode_count?: number }[] | null;
      awards_won: string[] | null;
      raw_tmdb: { tagline?: string; networks?: { name?: string }[] } | null;
      raw_omdb: { BoxOffice?: string } | null;
    };

    const typeWord = r.media_type === "tv" ? "TV series" : "movie";
    const decade = `${r.year.slice(0, 3)}0s`;
    const genres = (r.genres ?? []).slice(0, 3).join(", ");
    const people = (r.people ?? []).filter((p) => p.name);
    const director = people.find((p) => p.role === "Director" || p.role === "Creator");
    const actor = people.find((p) => p.role !== "Director" && p.role !== "Creator");
    const network = (r.raw_tmdb?.networks ?? []).find((n) => n?.name)?.name ?? "";
    const seasonCount = (r.seasons ?? []).length;
    const episodes = (r.seasons ?? []).reduce(
      (n, sn) => n + (typeof sn?.episode_count === "number" ? sn.episode_count : 0),
      0,
    );
    const box = boxOfficeWords(r.raw_omdb?.BoxOffice);
    const wonBig = (r.awards_won ?? []).find((a) => a === "oscar" || a === "emmy");
    const tagline = r.raw_tmdb?.tagline ? redactTitle(r.raw_tmdb.tagline, r.title) : "";

    // Six clues, hardest first. Each slot proposes candidates in order and
    // takes the first that is present, does not repeat an earlier line, and
    // does not name the answer.
    //
    // Runtime is gone: nobody guesses a film from "2h 50m", and inside a
    // decade band it separates almost nothing. Two slots were also failing
    // silently. Clue 5 asked for a director, which only 24 of the 354 TV
    // titles in the pool carry, so nearly every TV day printed filler; the
    // network is on all 354. And the old scale slot restated the year that
    // clue 1 already gave. Box office covers 89% of the pool's movies.
    const used = new Set<string>();
    const pick = (...candidates: (string | "")[]): string => {
      for (const c of candidates) {
        if (!c || used.has(c) || leaksTitle(c, r.title)) continue;
        used.add(c);
        return c;
      }
      return "";
    };
    const scoreLine =
      typeof r.rating_balasaur === "number" ? `Balasaur Score: ${r.rating_balasaur}.` : "";
    const imdbLine =
      typeof r.rating_imdb === "number" ? `IMDb users give it ${r.rating_imdb}.` : "";
    const rtLine =
      typeof r.rating_rotten_tomatoes === "number"
        ? `Rotten Tomatoes: ${r.rating_rotten_tomatoes}%.`
        : "";

    const clues = [
      pick(`A ${typeWord} from the ${decade}.`),
      pick(genres ? `Genres: ${genres}.` : "", scoreLine, imdbLine),
      pick(
        r.media_type === "tv" && seasonCount > 0
          ? `${seasonCount} ${seasonCount === 1 ? "season" : "seasons"}${episodes > 0 ? `, ${episodes} episodes` : ""}.`
          : box
            ? `It took ${box} at the box office.`
            : "",
        imdbLine,
        scoreLine,
      ),
      pick(
        wonBig ? `It won an ${wonBig === "oscar" ? "Oscar" : "Emmy"}.` : "",
        rtLine,
        imdbLine,
        scoreLine,
      ),
      pick(
        r.media_type === "tv" && network ? `It aired on ${network}.` : "",
        director ? `${director.role}: ${director.name}.` : "",
        scoreLine,
        rtLine,
      ),
      pick(
        actor ? `Features ${actor.name}.` : "",
        tagline ? `Tagline: "${tagline}"` : "",
        `The title starts with "${r.title[0].toUpperCase()}".`,
      ),
    ].filter(Boolean);

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
