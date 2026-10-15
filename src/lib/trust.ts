import { computeBalasaurScore } from "./score";

// One trust rule for every Balasaur Score on screen and every ranked list.
//
// Written once here, mirrored once in SQL by the functions in
// supabase/migrations/20261015120000_trust_gate.sql
// (balasaur_score_trusted, balasaur_list_excluded, balasaur_rankable). The
// constants and the two title patterns below are copied into that file
// verbatim, and trust.test.ts reads the migration to prove it. Change both in
// the same commit or a card and a list will disagree about the same title.
//
// WHY. On 2026-10-15 a "Grand Theft Auto VI: An Extended Look" trailer was #1
// on Action Movies on Netflix (TMDB only, 27 minutes, 355 votes), and titles
// with one TMDB vote of 10/10 carried a 100 badge and the tier name "Apex".
// Both were the blend doing exactly what it was told with one number.

/** A score blended from one source is that source rescaled, not a blend. */
export const SCORE_MIN_SOURCES = 2;

/**
 * The one exception: a single source backed by this many TMDB votes is a real
 * crowd average, not a rumour. On 2026-10-15 exactly four rated titles had one
 * source and 500+ votes, and all four were real: DAHMER - Monster: The Jeffrey
 * Dahmer Story (2,956 votes, no IMDb match), Monsters: The Lyle and Erik
 * Menendez Story, Monster: The Ed Gein Story, and Lady, la vendedora de rosas.
 * Strict two-source would have dropped DAHMER from Netflix's best shows. The
 * GTA VI trailer (355 votes) stays out.
 */
export const SINGLE_SOURCE_MIN_VOTES = 500;

/**
 * TMDB votes a title needs before its score is shown. Picked from the live
 * catalog on 2026-10-15, titles with two or more sources:
 *
 *   votes    share scoring 90+
 *   1-9      0.64%  (131 of 20,386)
 *   10-24    0.08%  (10 of 12,739)
 *   25-49    0.07%
 *   50-99    0.10%
 *
 * The noise ends at 10. Going to 25 would hide 12,700 more badges with no
 * further drop in implausible scores. An UNKNOWN count (null, never fetched)
 * is not treated as zero: the two-source rule still applies to it, the same
 * stance indexability.ts takes after the 2026-08-17 lesson.
 */
export const SCORE_MIN_VOTES = 10;

/**
 * Votes a title needs to hold a numbered position on a list. Lists ask more
 * of a title than a badge does, because a rank compares it with every other
 * title on the page. 25 is the floor the collections gate has used since v7,
 * and unlike the badge, an unknown count fails here: a list demands evidence.
 */
export const RANKED_MIN_VOTES = 25;

/** Below this a "movie" is a short, a promo, or a TV special. Movies only:
 *  TV runtime is per episode and is not stored. */
export const RANKED_MIN_FILM_MINUTES = 40;

/** Stored (unified) genres a ranked list never carries: talk and variety
 *  shows, reality competition. See src/lib/genres.ts for the mapping. */
export const LIST_EXCLUDED_GENRES = ["Talk", "Reality TV"] as const;

/** TMDB genres the unified list folds away (News becomes "Documentary"), so
 *  they can only be read from TMDB's own genre names. */
export const LIST_EXCLUDED_TMDB_GENRES = ["News"] as const;

/**
 * Trailers, teasers, first looks, featurettes and making-of extras. Written
 * in the subset of regex syntax JavaScript and Postgres agree on (no \b, no
 * lookbehind), matched case-insensitively on both sides.
 *
 * "trailer" alone is not enough: Trailer Park Boys and The Long, Long Trailer
 * are real titles. It needs a qualifier ("Official Trailer") or a separator
 * ("Dune - Trailer 2"). "making of" skips "The Making of an Ordinary Woman",
 * a drama.
 */
export const PROMO_TITLE_PATTERN =
  "(^|[^a-z0-9])(teaser|featurette|sneak peek|extended look|first look|behind the scenes|making[- ]of(?! an? )|(official|final|launch|announcement|reveal|story|gameplay|cinematic|extended|international|red band|super bowl|tv) trailer)([^a-z0-9]|$)|[-:(|] *trailer([^a-z0-9]|$)";

/**
 * TV specials: holiday, anniversary and reunion specials. Bare "special" and
 * "reunion" are not enough: Law & Order: Special Victims Unit, Midnight
 * Special, American Reunion.
 */
export const SPECIAL_TITLE_PATTERN =
  "(^|[^a-z0-9])((holiday|christmas|xmas|halloween|thanksgiving|easter|anniversary|reunion|live|tv|television) special|[0-9]+(st|nd|rd|th) anniversary)([^a-z0-9]|$)|: the reunion([^a-z0-9]|$)";

/** Hidden Gems: a score this high with fewer votes than the cap. */
export const HIDDEN_GEM_MIN_SCORE = 75;
/** Under 500 TMDB votes: past this a title is not hidden from anyone. */
export const HIDDEN_GEM_MAX_VOTES = 500;

const PROMO_RE = new RegExp(PROMO_TITLE_PATTERN, "i");
const SPECIAL_RE = new RegExp(SPECIAL_TITLE_PATTERN, "i");

export interface TrustRatings {
  imdb?: number | null;
  rottenTomatoes?: number | null;
  metacritic?: number | null;
  tmdb?: number | null;
  /** A precomputed blend, when the caller has one. */
  balasaur?: number | null;
}

export interface TrustInput {
  ratings: TrustRatings;
  /** TMDB vote count. Undefined or null means unknown, not zero. */
  voteCount?: number | null;
}

export interface ListInput extends TrustInput {
  mediaType: string;
  title: string;
  /** Stored, unified genres. */
  genres?: readonly string[] | null;
  /** Feature runtime in minutes, movies only. */
  filmLengthMinutes?: number | null;
  /** TMDB's own genre names, when the caller has them. */
  tmdbGenres?: readonly string[] | null;
}

export type ListExclusion = "short" | "promo" | "special" | "talk-news-reality";

/** How many of IMDb, Rotten Tomatoes, Metacritic and TMDB have a score. */
export function scoreSourceCount(r: TrustRatings): number {
  return [r.imdb, r.rottenTomatoes, r.metacritic, r.tmdb].filter((v) => typeof v === "number")
    .length;
}

/** Whether a Balasaur Score may be shown for this title at all: two sources
 *  and 10+ votes (or an unknown count), or one source with 500+ votes. */
export function isScoreTrusted(t: TrustInput): boolean {
  const sources = scoreSourceCount(t.ratings);
  if (sources >= SCORE_MIN_SOURCES) return t.voteCount == null || t.voteCount >= SCORE_MIN_VOTES;
  return sources === 1 && t.voteCount != null && t.voteCount >= SINGLE_SOURCE_MIN_VOTES;
}

/** The score to print, or undefined when there is none worth printing. */
export function trustedScore(t: TrustInput): number | undefined {
  if (!isScoreTrusted(t)) return undefined;
  const r = t.ratings;
  if (typeof r.balasaur === "number") return r.balasaur;
  return computeBalasaurScore({
    imdb: r.imdb,
    rottenTomatoes: r.rottenTomatoes,
    metacritic: r.metacritic,
    tmdb: r.tmdb,
  });
}

/** Why a title can never hold a place on a ranked list, or null. */
export function listExclusion(t: ListInput): ListExclusion | null {
  if (
    t.mediaType === "movie" &&
    typeof t.filmLengthMinutes === "number" &&
    t.filmLengthMinutes >= 1 &&
    t.filmLengthMinutes < RANKED_MIN_FILM_MINUTES
  ) {
    return "short";
  }
  if (PROMO_RE.test(t.title)) return "promo";
  if (SPECIAL_RE.test(t.title)) return "special";
  const genres = t.genres ?? [];
  if ((LIST_EXCLUDED_GENRES as readonly string[]).some((g) => genres.includes(g))) {
    return "talk-news-reality";
  }
  const tmdb = t.tmdbGenres ?? [];
  if (
    t.mediaType === "tv" &&
    (LIST_EXCLUDED_TMDB_GENRES as readonly string[]).some((g) => tmdb.includes(g))
  ) {
    return "talk-news-reality";
  }
  return null;
}

/** Whether a title may hold a numbered position on any ranked list. */
export function isRankable(t: ListInput): boolean {
  return isScoreTrusted(t) && (t.voteCount ?? 0) >= RANKED_MIN_VOTES && listExclusion(t) === null;
}

/** A high score that few people have rated yet, still on two sources. */
export function isHiddenGem(t: ListInput): boolean {
  const score = trustedScore(t);
  return (
    isRankable(t) &&
    typeof score === "number" &&
    score >= HIDDEN_GEM_MIN_SCORE &&
    (t.voteCount ?? 0) < HIDDEN_GEM_MAX_VOTES
  );
}
