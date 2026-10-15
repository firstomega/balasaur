// The pure half of the person-page catalog join: given the catalog rows for a
// person's credits, decide what the page ranks and what it claims.
//
// Separate from media.server.ts so it can be tested without a database client.
// Everything here is a pure function of the rows passed in, which is also what
// makes the page's numbers checkable: the rows are the cards the page renders.

import type { MediaPerson, PersonCatalog } from "@/types/media";
import { isRankable, type ListInput } from "./trust";

/** The fields the ranking and the claims are computed from. The catalog row
 *  carries more than this; nothing else is consulted. */
export interface PersonCreditFacts {
  media_id: string;
  media_type: string;
  title: string;
  genres: string[] | null;
  film_length_minutes: number | null;
  vote_count: number | null;
  rating_imdb: number | null;
  rating_rotten_tomatoes: number | null;
  rating_metacritic: number | null;
  rating_tmdb: number | null;
  rating_balasaur: number | null;
  release_date: string | null;
  year: string | null;
  popularity: number | null;
  /** TMDB's franchise id. Stored for movies only. */
  tmdb_collection_id: number | null;
  people: unknown;
  /** TMDB's own genre objects (`raw_tmdb->genres`), for the trust rule's News
   *  check on shows. Fetched for TV candidates only; absent means unread. */
  tmdb_genres?: unknown;
}

/** A ranked set drawn from six titles is that person's whole filmography in a
 *  different order, which tells a reader nothing. Counted over the ranked pool
 *  after the franchise cap. Below this the page shows no ranking at all rather
 *  than a weak one. */
export const PERSON_TOP_MIN_LED = 8;
export const PERSON_TOP_SIZE = 6;

/** A decade needs this many titles before its median is worth printing. */
const PERSON_DECADE_MIN_TITLES = 3;

// ---------- Which credits are the person's own work ----------
//
// `media.people` stores the cast's character names and the crew's job. On
// 2026-10-15 Tom Hanks's six included From the Earth to the Moon (role
// "Host") and The National Parks (a documentary he narrated, role "Cast"),
// and Martin Scorsese's included Mr. Scorsese (role "Self"), a documentary
// about him. These patterns are read from the live role values, and every one
// is written in regex syntax Postgres reads the same way, so the data check
// can run them verbatim.

/** Appearing as themselves: "Self", "Himself - Host", "Self (archive footage)",
 *  "Self- Team Captain". 26,000+ rows on 2026-10-15. */
export const SELF_ROLE_PATTERN = "^\\s*(self|himself|herself|themselves|themself)([^a-z]|$)";

/** A "Self" credit that names characters is a sketch performance, not an
 *  appearance: SNL's cast is "Self - Various Characters", Bob Odenkirk and
 *  David Cross on Mr. Show are "Self - Host / Various", Sid Caesar on Your
 *  Show of Shows is "Self - Regular Performer", Jim Carrey on In Living Color
 *  and Martin Short on SCTV are "Self - Various Characters". Not applied in a
 *  documentary, where the same words describe the subject (Choi Eun-hee in
 *  The Lovers and the Despot is "Self - Actress / Various Roles"). Read from
 *  the live roles on 2026-10-15. */
export const SELF_PERFORMING_PATTERN = "various|character|regular performer";

/** Footage reused from elsewhere: "(archive footage)", "Self (archival footage)". */
export const ARCHIVE_ROLE_PATTERN = "archiv";

/** Presenting rather than performing ("Host" is Tom Hanks on From the Earth
 *  to the Moon). Exact roles only, and no leading "The": Bryan Cranston's
 *  part in Asteroid City is "The Host". */
export const HOST_ROLE_PATTERN =
  "^\\s*(host|co-host|main host|presenter|interviewee|moderator)\\s*(\\(voice\\))?\\s*$";

/** Voice-over narration as the whole role: "Narrator (voice)". A bare
 *  "Narrator" is NOT this (Edward Norton's role in Fight Club), and neither is
 *  a list of parts that ends in one (Tom Kenny on The Powerpuff Girls is
 *  "Mayor / Snake / Lil' Arturo / Narrator (voice)"). */
export const VOICE_NARRATOR_PATTERN = "^\\s*(the\\s+)?narrat[a-z]*\\s*\\(voice\\)\\s*$";

/** Inside a documentary, a narrator or an unnamed cast slot ("Cast" is what
 *  the import writes when TMDB has no character) is a voice or a talking head,
 *  not a performance. Named parts in a documentary (reenactments, the Stig)
 *  still count. */
export const DOC_NON_PERFORMING_PATTERN = "^\\s*((the\\s+)?narrat.*|cast)?\\s*$";

const SELF_RE = new RegExp(SELF_ROLE_PATTERN, "i");
const SELF_PERFORMING_RE = new RegExp(SELF_PERFORMING_PATTERN, "i");
const ARCHIVE_RE = new RegExp(ARCHIVE_ROLE_PATTERN, "i");
const HOST_RE = new RegExp(HOST_ROLE_PATTERN, "i");
const VOICE_NARRATOR_RE = new RegExp(VOICE_NARRATOR_PATTERN, "i");
const DOC_NON_PERFORMING_RE = new RegExp(DOC_NON_PERFORMING_PATTERN, "i");

/** Whether a stored role is the person performing or directing, rather than
 *  appearing as themselves, hosting, or narrating. */
export function isWorkRole(role: string | null | undefined, isDocumentary: boolean): boolean {
  const r = role ?? "";
  if (ARCHIVE_RE.test(r) || HOST_RE.test(r) || VOICE_NARRATOR_RE.test(r)) return false;
  if (SELF_RE.test(r) && (isDocumentary || !SELF_PERFORMING_RE.test(r))) return false;
  if (isDocumentary && DOC_NON_PERFORMING_RE.test(r)) return false;
  return true;
}

function peopleOn(row: Pick<PersonCreditFacts, "people">): MediaPerson[] {
  return Array.isArray(row.people) ? (row.people as MediaPerson[]) : [];
}

/**
 * Whether this person is one of the names the catalog stores for the title
 * (the directors and the top six cast) in a role that is their own work.
 *
 * It is a name match, so it errs by dropping a lead whose name is spelled
 * differently in that row. That is the safe direction: a dropped title is
 * still on the page in the filmography, where nothing is filtered.
 */
export function isWorkCredit(
  row: Pick<PersonCreditFacts, "people" | "genres">,
  name: string,
): boolean {
  const target = name.toLowerCase();
  const doc = (row.genres ?? []).includes("Documentary");
  return peopleOn(row).some(
    (p) =>
      typeof p?.name === "string" && p.name.toLowerCase() === target && isWorkRole(p.role, doc),
  );
}

/** TMDB genre names from the stored `[{id, name}]` objects. */
function tmdbGenreNames(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((g) => (g && typeof g === "object" ? (g as { name?: unknown }).name : undefined))
    .filter((n): n is string => typeof n === "string");
}

function trustInputOf(r: PersonCreditFacts): ListInput {
  return {
    mediaType: r.media_type,
    title: r.title,
    genres: r.genres,
    tmdbGenres: tmdbGenreNames(r.tmdb_genres),
    filmLengthMinutes: r.film_length_minutes,
    voteCount: r.vote_count,
    ratings: {
      imdb: r.rating_imdb,
      rottenTomatoes: r.rating_rotten_tomatoes,
      metacritic: r.rating_metacritic,
      tmdb: r.rating_tmdb,
      balasaur: r.rating_balasaur,
    },
  };
}

/** Best first: the score printed on the card, then popularity, which only
 *  breaks ties where the scores claim nothing either way. */
function byScore(a: PersonCreditFacts, b: PersonCreditFacts): number {
  return (
    (b.rating_balasaur ?? 0) - (a.rating_balasaur ?? 0) ||
    (b.popularity ?? 0) - (a.popularity ?? 0) ||
    a.media_id.localeCompare(b.media_id)
  );
}

/**
 * The titles a ranking of this person may draw from, best first: scored, held
 * to the same rule as every ranked list on the site (src/lib/trust.ts: no
 * shorts, specials, trailers, talk, news or reality, a trusted score and 25+
 * votes), and their own work rather than a walk-on, a hosting job or a
 * documentary about them.
 */
export function rankedPool<T extends PersonCreditFacts>(rows: T[], name: string): T[] {
  return rows
    .filter(
      (r) =>
        typeof r.rating_balasaur === "number" &&
        isRankable(trustInputOf(r)) &&
        isWorkCredit(r, name),
    )
    .sort(byScore);
}

/**
 * Which franchise a title belongs to, for the one-per-franchise cap. Movies
 * in a TMDB collection carry its id. Everything else (every show, and movies
 * outside a collection) falls back to the title up to the first colon, which
 * puts Adventure Time with Adventure Time: Distant Lands, and Rocko's Modern
 * Life with the Static Cling movie.
 */
export function franchiseKey(r: Pick<PersonCreditFacts, "tmdb_collection_id" | "title">): string {
  if (typeof r.tmdb_collection_id === "number") return `c:${r.tmdb_collection_id}`;
  return `t:${r.title.split(":")[0].trim().toLowerCase()}`;
}

/** Keep the best-scored title of each franchise, in the order given. */
function onePerFranchise<T extends PersonCreditFacts>(sorted: T[]): T[] {
  const seen = new Set<string>();
  return sorted.filter((r) => {
    const key = franchiseKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The rows the page ranks, best first, or an empty list when the pool is too
 * small for an order to carry a claim.
 *
 * At most one title per franchise: four Toy Story films in a six tell a
 * reader about Pixar's sequels, not about Tom Hanks. The franchise's best
 * entry holds the place, and the others stay in the filmography.
 */
export function pickTopCredits<T extends PersonCreditFacts>(rows: T[], name: string): T[] {
  const capped = onePerFranchise(rankedPool(rows, name));
  if (capped.length < PERSON_TOP_MIN_LED) return [];
  return capped.slice(0, PERSON_TOP_SIZE);
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const raw = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(raw);
}

function decadeOf(row: PersonCreditFacts): string | undefined {
  const year = Number.parseInt((row.release_date ?? row.year ?? "").slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1900) return undefined;
  return `${Math.floor(year / 10) * 10}s`;
}

/**
 * The decade whose titles rate highest, and the one it beat. Answers "what
 * was their best era", which people do ask, and carries the runner-up so the
 * claim is a comparison rather than a bare number. Computed over the ranked
 * pool, so every score behind it is one the trust rule lets the page print.
 * Nothing when fewer than two decades carry enough titles, or when the top
 * two tie.
 */
export function bestDecadeOf(rows: PersonCreditFacts[]): PersonCatalog["bestDecade"] {
  const byDecade = new Map<string, number[]>();
  for (const r of rows) {
    if (typeof r.rating_balasaur !== "number") continue;
    const d = decadeOf(r);
    if (!d) continue;
    const list = byDecade.get(d);
    if (list) list.push(r.rating_balasaur);
    else byDecade.set(d, [r.rating_balasaur]);
  }
  const ranked = [...byDecade.entries()]
    .filter(([, scores]) => scores.length >= PERSON_DECADE_MIN_TITLES)
    .map(([decade, scores]) => ({ decade, median: median(scores) ?? 0, titles: scores.length }))
    .sort((a, b) => b.median - a.median || b.titles - a.titles);
  const [best, next] = ranked;
  if (!best || !next || best.median <= next.median) return undefined;
  return { ...best, runnerUp: next };
}
