import { isIndexableDetail } from "./indexability";

// Which pages are offered to Google: one kept set per page family.
//
// indexability.ts asks whether a page CAN stand alone. This file asks whether
// it is one of the few thousand worth offering. A page is indexable only when
// it passes both. Everything outside the kept set stays reachable and linked,
// carries "noindex, follow", and is left out of every sitemap and every
// IndexNow ping. Nothing is deleted, so raising a constant below brings a
// page back.
//
// WHY. On 2026-10-15 the site offered Google about 70,000 near-identical
// pages on a five-month-old domain with no backlinks. Google indexed about
// 21% of a sample, stopped crawling most of the site in mid-September, and
// the impressions it did give came from positions 80 to 95. A new domain
// earns trust on a few thousand strong pages, not on volume.
//
// ONE SOURCE OF TRUTH per family, read by the page head, the sitemap and
// IndexNow alike:
//
//   titles   the rule below, mirrored in SQL by the view index_kept_media
//            (supabase/migrations/20261106230000_index_keep_by_fame.sql,
//            which replaced the 20261016010000_index_diet.sql version). The
//            constants and the pin list are copied there verbatim and
//            indexKeep.test.ts reads that file to prove it. The two IMDb
//            lines are also written into the WHERE clause of a partial index
//            each, which is what keeps the sitemap query fast; changing one
//            means rebuilding its index.
//   people   the materialized view person_index_kept. The page reads its
//            row; nothing here recomputes it. The constants below document
//            and test the SQL.
//   lists    the materialized view collection_index_kept, same arrangement.
//            Country shelves (originCollections.ts) are built at request
//            time and have no parent list in the catalog; they are kept.

/**
 * TMDB votes a movie needs to be offered. 3,000 keeps 1,946 movies of the
 * 58,832 that can stand alone (2026-10-15). Every movie Google has ever
 * reported as indexed has 3,000 or more.
 */
export const TITLE_KEEP_MIN_VOTES_MOVIE = 3000;

/**
 * TMDB votes a show needs. Lower than for movies because TV indexes best for
 * this site and draws far fewer TMDB votes: 300 keeps 1,797 shows of 23,658.
 */
export const TITLE_KEEP_MIN_VOTES_TV = 300;

/**
 * IMDb votes that keep a movie whatever its TMDB count. TMDB's voters are few
 * and recent, so the TMDB line alone turned away 869 movies with 100,000+ IMDb
 * votes (2026-11-06): 3 Idiots, The Great Escape, Gandhi, Rashomon, Ran, City
 * Lights, Paddington 2. At the line sit Good Luck Chuck and Hot Rod.
 */
export const TITLE_KEEP_MIN_IMDB_VOTES_MOVIE = 100000;

/**
 * IMDb votes that keep a show whatever its TMDB count. 20,000 adds 373 shows
 * (2026-11-06): Scrubs (288,055), Call the Midwife, QI, I Love Lucy.
 */
export const TITLE_KEEP_MIN_IMDB_VOTES_TV = 20000;

/**
 * Titles Google has already indexed that fall under the vote line. Pinned so
 * an index slot already earned is never handed back. One on 2026-10-15: El
 * cor de la ciutat (7 votes), indexed since August. Add to this list, and to
 * the SQL copy, when an indexed title would otherwise drop out.
 */
export const TITLE_KEEP_PINNED: readonly string[] = ["tv-14743"];

/** How many people are offered, ranked by fame (see below). */
export const PERSON_KEEP_COUNT = 850;

/** Fame is the summed TMDB votes of a person's best titles: this many. */
export const PERSON_FAME_TOP_TITLES = 10;

/**
 * A show's votes count this many times toward fame. TMDB voters rate shows
 * far less often than movies, so without it Bryan Cranston ranks behind
 * supporting film actors. At 3, Jenna Ortega ranks 646th; at 5, ensemble
 * casts of a handful of hit shows crowd the list (127 of the top 500).
 */
export const PERSON_FAME_TV_WEIGHT = 3;

/**
 * Titles under this many votes are skipped when summing fame. It only bounds
 * the work of the nightly refresh: a person near the cut has ten titles far
 * above it.
 */
export const PERSON_FAME_MIN_TITLE_VOTES = 500;

/** A list needs this many titles to be offered. */
export const LIST_KEEP_MIN_ITEMS = 10;

/** How much of a list's opening is compared with its parent list. */
export const LIST_OVERLAP_TOP = 10;

/**
 * A list is distinct when fewer than half of its top ten already appear on a
 * parent list's page: Horror Movies on Netflix against Movies on Netflix and
 * against Horror Movies, a year against its decade, Korean crime shows
 * against Crime Shows and against Korean Shows. Kept means shared * 2 < 10.
 */
export const LIST_MAX_PARENT_SHARE = 0.5;

/** Person lists are never offered: the person page owns "[name] movies". */
export const LIST_NEVER_KEPT_KINDS: readonly string[] = ["person"];

export interface KeepTitleInput {
  /** "movie-27205" or "tv-1396". */
  id: string;
  mediaType: string;
  /** TMDB vote count. Unknown counts as not enough. */
  voteCount?: number | null;
  /** IMDb vote count (parseImdbVotes). Unknown counts as not enough. */
  imdbVotes?: number | null;
}

/**
 * IMDb's vote count as OMDb sends it: "2,877,173", or "N/A" when IMDb has
 * none. Anything that is not digits and commas is unknown. Same reading as
 * the SQL function public.omdb_imdb_votes.
 */
export function parseImdbVotes(raw: unknown): number | undefined {
  if (typeof raw !== "string" || !/^[0-9][0-9,]*$/.test(raw)) return undefined;
  return Number(raw.replaceAll(",", ""));
}

/** Is this title in the kept set? Same rule as the SQL view. */
export function isKeptTitle(t: KeepTitleInput): boolean {
  if (TITLE_KEEP_PINNED.includes(t.id)) return true;
  const votes = t.voteCount ?? 0;
  const imdb = t.imdbVotes ?? 0;
  if (t.mediaType === "tv") {
    return votes >= TITLE_KEEP_MIN_VOTES_TV || imdb >= TITLE_KEEP_MIN_IMDB_VOTES_TV;
  }
  return votes >= TITLE_KEEP_MIN_VOTES_MOVIE || imdb >= TITLE_KEEP_MIN_IMDB_VOTES_MOVIE;
}

/** The title page's noindex decision: it can stand alone and it is kept. */
export function isIndexableTitle(
  d: Parameters<typeof isIndexableDetail>[0] & KeepTitleInput,
): boolean {
  return isIndexableDetail(d) && isKeptTitle(d);
}

/** The person page's noindex decision. Only a confirmed member of
 *  person_index_kept is offered; a failed lookup is not a yes. */
export function isIndexablePerson(d: { indexable?: boolean }): boolean {
  return d.indexable === true;
}

/** The /best page's noindex decision, read from collection_index_kept (or,
 *  for a country shelf, from the shelf's own gate). */
export function isIndexableList(d: { indexable?: boolean }): boolean {
  return d.indexable === true;
}
