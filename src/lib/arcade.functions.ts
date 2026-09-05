import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dayNumber, dailyIndex, leaksTitle } from "@/lib/daily";
import type { MediaPerson } from "@/types/media";

// Daily round payloads for the arcade. Every game's round is deterministic
// per UTC day: the picks are PINNED in arcade_daily on first request
// (insert-then-reread, the daily_challenges pattern), because an offset into
// a live-counted pool shifts whenever the nightly sync changes membership.
// Most payloads include the answers (Wordle posture, same as Balasaurdle).
// The two games where that costs trust judge on the server instead: Link Up
// (judgeLinkPick) ships no answer id or cast, and The 8PM Screening
// (judgeScreeningPick) ships no answer index, because its night board ranks
// people.
//
// The pure helpers at the top are IO-free and tested in
// arcade.functions.test.ts. The supabase client is imported lazily inside
// handlers so importing this module (as the test does) never pulls the
// server client or its env requirements into the test runtime.

/** Popular pool floor for media-derived games (taglines 96% coverage here). */
export const ARCADE_POOL_MIN_VOTES = 2000;
const IN_CHUNK = 400; // PostgREST row cap is 1000; chunk id lookups well under it
const PAGE = 1000;

export const ARCADE_ROUND_SLUGS = [
  "balasaurdle",
  "taglines",
  "casting-call",
  "timeline",
  "speed-sort",
  "link-up",
  "poster-reveal",
  "quote-match",
  "emoji",
  "sequel-or-fake",
  "screening",
] as const;

// ---------------------------------------------------------------------------
// Pure helpers (IO-free, exported for tests)
// ---------------------------------------------------------------------------

/** Small deterministic PRNG; good enough to shuffle a day's round. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One PRNG per (day, purpose): same day, same salt, same sequence. */
export function daySeed(day: number, salt: number): () => number {
  return mulberry32((Math.imul(day, 2654435761) ^ Math.imul(salt, 40503)) >>> 0);
}

export function seededShuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** N distinct pool offsets for a day: dailyIndex per slot, advancing past
 *  collisions, exactly the scheme the backend design pins. */
export function pickDistinctIndexes(day: number, poolSize: number, n: number): number[] {
  if (poolSize <= 0) return [];
  const want = Math.min(n, poolSize);
  const chosen: number[] = [];
  const seen = new Set<number>();
  for (let k = 0; k < want; k++) {
    let idx = dailyIndex(day * 1000 + k, poolSize);
    while (seen.has(idx)) idx = (idx + 1) % poolSize;
    seen.add(idx);
    chosen.push(idx);
  }
  return chosen;
}

/** arcade_daily.item_ids is bigint[]; media ids ride in it as the TMDB id,
 *  positive for movies and negative for TV. */
export function encodeMediaPin(mediaId: string): number | null {
  const m = /^(movie|tv)-(\d{1,10})$/.exec(mediaId);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] === "movie" ? n : -n;
}

export function decodeMediaPin(pin: number): string {
  return pin >= 0 ? `movie-${pin}` : `tv-${-pin}`;
}

const wordTokens = (s: string): string[] =>
  (s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).map((w) => w.replace(/'/g, ""));

/** True when the two texts share a word of six letters or more, compared on
 *  the first six characters so "Gladiators" still matches "Gladiator".
 *  Catches near-title taglines that slip past leaksTitle. */
export function sharesLongWord(a: string, b: string): boolean {
  const stems = (s: string) =>
    wordTokens(s)
      .filter((w) => w.length >= 6)
      .map((w) => w.slice(0, 6));
  const bStems = new Set(stems(b));
  return stems(a).some((w) => bStems.has(w));
}

/** A one-to-three-letter title ("It", "Up", "300") appearing verbatim in a
 *  tagline. leaksTitle skips titles that short, but on a match board the
 *  word still points a player at the wrong card. */
export function containsShortTitle(text: string, title: string): boolean {
  const t = title.trim().toLowerCase();
  if (t.length === 0 || t.length > 3) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`).test(text.toLowerCase());
}

/** Every way one tagline can point at a title it does not belong to. */
function taglineHits(tagline: string, title: string): boolean {
  return (
    leaksTitle(tagline, title) ||
    sharesLongWord(tagline, title) ||
    containsShortTitle(tagline, title)
  );
}

/** Is this tagline usable as a puzzle line for its own title? */
export function taglineOk(tagline: string, title: string): boolean {
  const t = tagline.trim();
  if (t.length < 4 || t.length > 90) return false;
  return !taglineHits(t, title);
}

export interface TaglineCandidate {
  id: string;
  title: string;
  year: string;
  tagline: string;
}

/** Five titles whose taglines are clean against their OWN title and against
 *  every other chosen title, with no duplicate tagline text: a 5x5 board
 *  where exactly one matching is defensible. Null when the pool cannot
 *  produce five (the gate is the curator). */
export function pickTaglineSet(
  rows: TaglineCandidate[],
  day: number,
  n = 5,
): TaglineCandidate[] | null {
  const ok = rows.filter((r) => taglineOk(r.tagline, r.title));
  if (ok.length < n) return null;
  const chosen: TaglineCandidate[] = [];
  const usedText = new Set<string>();
  for (const c of seededShuffle(ok, daySeed(day, 101))) {
    const text = c.tagline.trim().toLowerCase();
    if (usedText.has(text)) continue;
    const clash = chosen.some(
      (p) => taglineHits(c.tagline, p.title) || taglineHits(p.tagline, c.title),
    );
    if (clash) continue;
    usedText.add(text);
    chosen.push(c);
    if (chosen.length === n) return chosen;
  }
  return null;
}

/** Actor names from the people jsonb. role is the character name for actors
 *  and the literal 'Director'/'Creator' for the one crew entry. */
export function actorNames(people: MediaPerson[] | null | undefined): string[] {
  return castWithRoles(people).map((p) => p.name);
}

export interface CastingActor {
  name: string;
  /** The character played, when the ingest kept it. Null for the impostor. */
  role: string | null;
}

/** Actors with the part they played, crew dropped, in billing order. */
export function castWithRoles(people: MediaPerson[] | null | undefined): CastingActor[] {
  return (people ?? [])
    .filter((p) => p?.name && p.role !== "Director" && p.role !== "Creator")
    .map((p) => ({ name: p.name, role: p.role?.trim() ? p.role.trim() : null }));
}

export interface ScreeningPayload {
  q: string;
  choices: string[];
  answer: number;
  note: string;
}

/** The authored screening question, or null when the row is malformed. One
 *  parser for the set, the judge, and yesterday's answers so the three
 *  cannot disagree on what a valid question is. */
export function parseScreeningPayload(payload: unknown): ScreeningPayload | null {
  const p = (payload ?? {}) as { q?: unknown; choices?: unknown; answer?: unknown; note?: unknown };
  if (typeof p.q !== "string" || !p.q) return null;
  if (!Array.isArray(p.choices) || p.choices.length < 2) return null;
  if (!p.choices.every((c) => typeof c === "string")) return null;
  if (typeof p.answer !== "number" || !Number.isInteger(p.answer)) return null;
  if (p.answer < 0 || p.answer >= p.choices.length) return null;
  return {
    q: p.q,
    choices: p.choices as string[],
    answer: p.answer,
    note: typeof p.note === "string" ? p.note : "",
  };
}

export function sameDecade(yearA: string, yearB: string): boolean {
  return yearA.slice(0, 3) === yearB.slice(0, 3);
}

export interface ArcadePoolRow {
  media_id: string;
  media_type: string;
  title: string;
  year: string;
  poster_url: string;
  genres?: string[] | null;
  people?: MediaPerson[] | null;
  awards_won?: string[] | null;
  award_wins?: number | null;
  tagline?: string | null;
}

export interface ImpostorPick {
  sourceId: string;
  actor: string;
}

/** An actor from a same-genre, same-decade title who is not in the movie's
 *  own cast. The actor is always the FIRST qualifying name in the source's
 *  people array, so a pinned source re-derives the same impostor later. */
export function pickImpostor(
  movie: ArcadePoolRow,
  pool: ArcadePoolRow[],
  rand: () => number,
  usedIds: Set<string>,
): ImpostorPick | null {
  const genre = movie.genres?.[0];
  if (!genre) return null;
  const candidates = pool.filter(
    (r) =>
      r.media_id !== movie.media_id &&
      !usedIds.has(r.media_id) &&
      sameDecade(r.year, movie.year) &&
      (r.genres ?? []).includes(genre),
  );
  for (const src of seededShuffle(candidates, rand)) {
    const actor = impostorFromSource(src, movie);
    if (actor) return { sourceId: src.media_id, actor };
  }
  return null;
}

/** The deterministic impostor a pinned source yields for a pinned movie. */
export function impostorFromSource(source: ArcadePoolRow, movie: ArcadePoolRow): string | null {
  const cast = new Set(actorNames(movie.people).map((n) => n.toLowerCase()));
  return actorNames(source.people).find((n) => !cast.has(n.toLowerCase())) ?? null;
}

/** Eight (movie, impostor source) pairs pinned as [8 movie ids, 8 source
 *  ids] in matching order. Null when the pool cannot fill eight rounds. */
export function buildCastingPins(pool: ArcadePoolRow[], day: number): string[] | null {
  const rand = daySeed(day, 103);
  const eligible = pool.filter(
    (r) => actorNames(r.people).length >= 3 && (r.genres ?? []).length > 0,
  );
  const movies: string[] = [];
  const sources: string[] = [];
  const used = new Set<string>();
  for (const m of seededShuffle(eligible, rand)) {
    if (movies.length === 8) break;
    if (used.has(m.media_id)) continue;
    const imp = pickImpostor(m, pool, rand, used);
    if (!imp) continue;
    used.add(m.media_id);
    used.add(imp.sourceId);
    movies.push(m.media_id);
    sources.push(imp.sourceId);
  }
  return movies.length === 8 ? [...movies, ...sources] : null;
}

/** N rows with pairwise distinct years, seeded order. Null when impossible. */
export function pickDistinctYears<T extends { year: string }>(
  rows: T[],
  n: number,
  rand: () => number,
): T[] | null {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const r of seededShuffle(rows, rand)) {
    if (seen.has(r.year)) continue;
    seen.add(r.year);
    out.push(r);
    if (out.length === n) return out;
  }
  return null;
}

export interface EraBand {
  label: string;
  start: number;
  end: number;
}

export const ERA_BANDS: EraBand[] = [
  { label: "1970 to 1989", start: 1970, end: 1989 },
  { label: "1985 to 1999", start: 1985, end: 1999 },
  { label: "1990 to 2004", start: 1990, end: 2004 },
  { label: "2000 to 2014", start: 2000, end: 2014 },
  { label: "2005 to 2019", start: 2005, end: 2019 },
  { label: "2010 and later", start: 2010, end: 9999 },
];

export function eraBandFor(day: number): EraBand {
  return ERA_BANDS[((day % ERA_BANDS.length) + ERA_BANDS.length) % ERA_BANDS.length];
}

export interface SpeedBin {
  label: string;
  test(r: ArcadePoolRow): boolean;
}

export interface SpeedSortPair {
  key: string;
  a: SpeedBin;
  b: SpeedBin;
}

const decadeBin = (label: string, prefix: string): SpeedBin => ({
  label,
  test: (r) => r.year.slice(0, 3) === prefix,
});

// The Oscar split leans on awards_won (derived from OMDb's "Won N Oscars"),
// the same signal the Balasaurdle Oscar clue already trusts. The non-winner
// bin additionally requires awards data to exist, so a title with no data
// is never claimed to have won nothing.
export const SPEED_SORT_PAIRS: SpeedSortPair[] = [
  {
    key: "movie-tv",
    a: { label: "Movie", test: (r) => r.media_type === "movie" },
    b: { label: "TV show", test: (r) => r.media_type === "tv" },
  },
  { key: "80s-90s", a: decadeBin("1980s", "198"), b: decadeBin("1990s", "199") },
  { key: "00s-10s", a: decadeBin("2000s", "200"), b: decadeBin("2010s", "201") },
  {
    key: "oscar",
    a: { label: "Won an Oscar", test: (r) => (r.awards_won ?? []).includes("oscar") },
    b: {
      label: "No Oscar win",
      test: (r) => typeof r.award_wins === "number" && !(r.awards_won ?? []).includes("oscar"),
    },
  },
  { key: "90s-00s", a: decadeBin("1990s", "199"), b: decadeBin("2000s", "200") },
  { key: "10s-20s", a: decadeBin("2010s", "201"), b: decadeBin("2020s", "202") },
  { key: "70s-80s", a: decadeBin("1970s", "197"), b: decadeBin("1980s", "198") },
];

/** Plain modulo rotation so consecutive days never repeat a pair. */
export function speedSortPairFor(day: number): SpeedSortPair {
  const n = SPEED_SORT_PAIRS.length;
  return SPEED_SORT_PAIRS[((day % n) + n) % n];
}

export interface LinkRow {
  id: string;
  mediaType: "movie" | "tv";
  title: string;
  year: string;
  posterUrl: string;
  actors: string[];
}

export interface LinkActors {
  start: string;
  links: string[];
  target: string;
}

/** The actors a pinned chain implies, re-derivable forever from the chain
 *  rows alone: links are the first shared actor of each adjacent pair, the
 *  start is the first actor unique to the first title within the chain, the
 *  target the first unique to the last. */
export function deriveLinkActors(chain: LinkRow[]): LinkActors | null {
  if (chain.length < 2) return null;
  const casts = chain.map((c) => c.actors);
  const lower = casts.map((c) => new Set(c.map((n) => n.toLowerCase())));
  const links: string[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const link = casts[i].find((n) => lower[i + 1].has(n.toLowerCase()));
    if (!link) return null;
    links.push(link);
  }
  const linkSet = new Set(links.map((n) => n.toLowerCase()));
  const inAnotherChainTitle = (name: string, skip: number) =>
    lower.some((s, j) => j !== skip && s.has(name.toLowerCase()));
  const start = casts[0].find((n) => !linkSet.has(n.toLowerCase()) && !inAnotherChainTitle(n, 0));
  const last = chain.length - 1;
  const target = casts[last].find(
    (n) =>
      !linkSet.has(n.toLowerCase()) &&
      !inAnotherChainTitle(n, last) &&
      n.toLowerCase() !== start?.toLowerCase(),
  );
  if (!start || !target) return null;
  return { start, links, target };
}

/** Titles traversed on the shortest path between two actors, capped. */
export function linkDistance(rows: LinkRow[], start: string, target: string, cap = 4): number {
  const s = start.toLowerCase();
  const t = target.toLowerCase();
  if (s === t) return 0;
  const casts = rows.map((r) => r.actors.map((n) => n.toLowerCase()));
  let frontier = new Set([s]);
  const visited = new Set([s]);
  for (let d = 1; d <= cap; d++) {
    const next = new Set<string>();
    for (const cast of casts) {
      if (!cast.some((n) => frontier.has(n))) continue;
      for (const n of cast) {
        if (!visited.has(n)) {
          visited.add(n);
          next.add(n);
        }
      }
    }
    if (next.has(t)) return d;
    frontier = next;
    if (frontier.size === 0) break;
  }
  return Infinity;
}

/** A chain of `hops` titles whose derived start and target actors are
 *  exactly `hops` titles apart in the whole pool (no shortcut exists).
 *  Seeded random walk with a bounded attempt count; null if none found. */
export function buildLinkChain(rows: LinkRow[], day: number, hops: number): LinkRow[] | null {
  if (rows.length < hops + 4) return null;
  const rand = daySeed(day, 105);
  const byActor = new Map<string, number[]>();
  rows.forEach((r, i) => {
    for (const a of r.actors) {
      const k = a.toLowerCase();
      const list = byActor.get(k);
      if (list) list.push(i);
      else byActor.set(k, [i]);
    }
  });
  for (let attempt = 0; attempt < 400; attempt++) {
    const first = Math.floor(rand() * rows.length);
    const chain = [rows[first]];
    const usedIdx = new Set([first]);
    let ok = true;
    for (let h = 1; h < hops; h++) {
      const cur = chain[h - 1];
      const shared = cur.actors.filter((a) =>
        (byActor.get(a.toLowerCase()) ?? []).some((j) => !usedIdx.has(j)),
      );
      if (shared.length === 0) {
        ok = false;
        break;
      }
      const via = shared[Math.floor(rand() * shared.length)];
      const nexts = (byActor.get(via.toLowerCase()) ?? []).filter((j) => !usedIdx.has(j));
      const j = nexts[Math.floor(rand() * nexts.length)];
      usedIdx.add(j);
      chain.push(rows[j]);
    }
    if (!ok) continue;
    const actors = deriveLinkActors(chain);
    if (!actors) continue;
    if (linkDistance(rows, actors.start, actors.target, hops) !== hops) continue;
    return chain;
  }
  return null;
}

export interface ItemMeta {
  id: number;
  difficulty: number;
  real?: boolean | null;
  media_id?: string | null;
}

/** N distinct item ids from an active pool, ordered id asc, day-picked.
 *  One item per media row: match boards key pairs by media id, so two items
 *  sharing a movie on the same day would collide. */
export function pickItemIds(
  items: { id: number; media_id?: string | null }[],
  day: number,
  n: number,
): number[] | null {
  const seen = new Set<string>();
  const pool = items.filter((it) => {
    if (!it.media_id) return true;
    if (seen.has(it.media_id)) return false;
    seen.add(it.media_id);
    return true;
  });
  if (pool.length < n) return null;
  const sorted = pool.slice().sort((a, b) => a.id - b.id);
  return pickDistinctIndexes(day, sorted.length, n).map((i) => sorted[i].id);
}

/** Five real and five fake sequels, pinned reals-first. Null when either
 *  bucket is thin. */
export function buildSequelIds(items: ItemMeta[], day: number): number[] | null {
  const real = items.filter((i) => i.real === true);
  const fake = items.filter((i) => i.real === false);
  const realIds = pickItemIds(real, day * 2, 5);
  const fakeIds = pickItemIds(fake, day * 2 + 1, 5);
  if (!realIds || !fakeIds) return null;
  return [...realIds, ...fakeIds];
}

/** A balanced quiz: counts per difficulty 1/2/3, easiest first. Null when
 *  any difficulty bucket cannot cover its share. */
export function pickBalanced(
  items: ItemMeta[],
  counts: [number, number, number],
  day: number,
): number[] | null {
  const out: number[] = [];
  for (let d = 1; d <= 3; d++) {
    const bucket = items.filter((i) => i.difficulty === d).sort((a, b) => a.id - b.id);
    const need = counts[d - 1];
    if (bucket.length < need) return null;
    for (const idx of pickDistinctIndexes(day * 10 + d, bucket.length, need)) {
      out.push(bucket[idx].id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface ArcadeMediaCard {
  id: string;
  mediaType: "movie" | "tv";
  title: string;
  year: string;
  posterUrl: string;
}

export interface TaglineRound {
  dayKey: number;
  /** Shuffled. Each tagline's id is the media id of its matching title. */
  taglines: { id: string; text: string }[];
  /** Shuffled independently of the taglines. */
  titles: ArcadeMediaCard[];
}

export interface CastingRoundItem {
  movie: ArcadeMediaCard;
  /** Four actors, shuffled: three from the cast with the part they played,
   *  plus the impostor with no role. */
  actors: CastingActor[];
  impostor: string;
}

export interface CastingRound {
  dayKey: number;
  rounds: CastingRoundItem[];
}

export interface TimelineRound {
  dayKey: number;
  era: string;
  /** Shuffled display order; year is the answer, revealed after submit. */
  titles: {
    id: string;
    mediaType: "movie" | "tv";
    title: string;
    posterUrl: string;
    year: string;
  }[];
}

export interface SpeedSortRound {
  dayKey: number;
  pairKey: string;
  bins: { a: string; b: string };
  /** 30 shuffled titles, each carrying its correct bin. */
  titles: {
    id: string;
    mediaType: "movie" | "tv";
    title: string;
    posterUrl: string;
    year: string;
    bin: "a" | "b";
  }[];
}

export interface LinkUpStep {
  /** Shuffled titles; exactly one features the actor in hand. Which one,
   *  the cast, and the actor it hands over stay on the server: the route
   *  asks judgeLinkPick. */
  options: ArcadeMediaCard[];
}

export interface LinkUpRound {
  dayKey: number;
  start: string;
  target: string;
  par: number;
  steps: LinkUpStep[];
}

/** The server's verdict on one Link Up pick. */
export interface LinkPickVerdict {
  correct: boolean;
  /** The picked title's leading cast, so a dead end teaches something. */
  cast: string[];
  /** On a right pick: the actor the title hands to the next step (the
   *  target on the last step). Null on a wrong pick. */
  nextActor: string | null;
}

export interface PosterRound {
  dayKey: number;
  media: ArcadeMediaCard;
}

export interface QuoteRoundItem {
  itemId: number;
  quote: string;
  choices: string[];
  answer: string;
  media: ArcadeMediaCard;
}

export interface QuoteRound {
  dayKey: number;
  items: QuoteRoundItem[];
}

export interface EmojiRoundItem {
  itemId: number;
  emoji: string;
  choices: string[];
  answer: string;
  media: ArcadeMediaCard;
}

export interface EmojiRound {
  dayKey: number;
  items: EmojiRoundItem[];
}

export interface SequelRoundItem {
  itemId: number;
  title: string;
  anchor: string;
  year: number | null;
  real: boolean;
  reveal: string;
}

export interface SequelRound {
  dayKey: number;
  items: SequelRoundItem[];
}

export interface ScreeningItem {
  itemId: number;
  question: string;
  choices: string[];
  difficulty: number;
}

/** The answer index, the note, and the poster never ride in the page: the
 *  route asks judgeScreeningPick, because the night's board ranks people. */
export interface ScreeningSet {
  dayKey: number;
  items: ScreeningItem[];
}

export interface ScreeningVerdict {
  correct: boolean;
  /** Index of the right choice. */
  answer: number;
  /** One fact about the answer, shown under the reveal. */
  note: string;
  /** The title the question is about, when the item names one. */
  media: ArcadeMediaCard | null;
}

export interface SolvedMedia {
  id: string;
  mediaType: "movie" | "tv";
  title: string;
  year: string;
  posterUrl: string;
}

export interface SolvedEntry {
  prompt?: string;
  answer: string;
  detail?: string;
  media?: SolvedMedia;
}

export interface ArcadeYesterday {
  dayKey: number;
  game: string;
  entries: SolvedEntry[];
}

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

/** Lazy server client. The generated Database types predate the arcade_*
 *  tables and the json-path selects below, so the client is used untyped
 *  here, in one place (the night.ts convention for its RPCs). */
async function db(): Promise<SupabaseClient> {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin as unknown as SupabaseClient;
}

const POOL_CARD_COLS = "media_id, media_type, title, year, poster_url";
const TAGLINE_COL = "tagline:raw_tmdb->>tagline";

interface PoolOpts {
  cols: string;
  taglineOnly?: boolean;
  orderVotes?: boolean;
  limit?: number;
}

/** A hand-typed slice of the PostgREST filter builder, used where the real
 *  generics blow up TypeScript's instantiation depth (TS2589) on json-path
 *  filters. Results are typed at the read site. */
interface LoosePoolQuery extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  eq(col: string, val: unknown): LoosePoolQuery;
  gte(col: string, val: unknown): LoosePoolQuery;
  neq(col: string, val: unknown): LoosePoolQuery;
  not(col: string, op: string, val: unknown): LoosePoolQuery;
  order(col: string, opts: { ascending: boolean }): LoosePoolQuery;
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** The popular pool, paged at 1000 (PostgREST clamps silently above that). */
async function fetchPool(opts: PoolOpts): Promise<ArcadePoolRow[] | null> {
  const sb = await db();
  const out: ArcadePoolRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = (sb as unknown as { from(t: string): { select(c: string): LoosePoolQuery } })
      .from("media")
      .select(opts.cols)
      .eq("suggestive", false)
      .gte("vote_count", ARCADE_POOL_MIN_VOTES)
      .not("poster_url", "is", null)
      .not("year", "is", null);
    if (opts.taglineOnly) {
      q = q.not("raw_tmdb->>tagline", "is", null).neq("raw_tmdb->>tagline", "");
    }
    q = opts.orderVotes
      ? q.order("vote_count", { ascending: false }).order("media_id", { ascending: true })
      : q.order("media_id", { ascending: true });
    const to = opts.limit ? Math.min(from + PAGE, opts.limit) - 1 : from + PAGE - 1;
    if (to < from) break;
    const { data, error } = await q.range(from, to);
    if (error) {
      console.error("[arcade] pool read failed:", error.message);
      return null;
    }
    const rows = (data ?? []) as unknown as ArcadePoolRow[];
    out.push(...rows);
    if (rows.length < to - from + 1) break;
    if (opts.limit && out.length >= opts.limit) break;
  }
  return out;
}

/** Rows by id, chunked at 400 so neither the row cap nor URL length bites. */
async function fetchMediaByIds(
  ids: string[],
  cols: string,
): Promise<Map<string, ArcadePoolRow> | null> {
  const sb = await db();
  const out = new Map<string, ArcadePoolRow>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const slice = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await sb.from("media").select(cols).in("media_id", slice);
    if (error) {
      console.error("[arcade] media lookup failed:", error.message);
      return null;
    }
    for (const r of (data ?? []) as unknown as ArcadePoolRow[]) out.set(r.media_id, r);
  }
  return out;
}

async function readPin(slug: string, day: number): Promise<number[] | null> {
  const sb = await db();
  const { data, error } = await sb
    .from("arcade_daily")
    .select("item_ids")
    .eq("game_slug", slug)
    .eq("day_key", day)
    .maybeSingle();
  if (error) {
    console.error("[arcade] pin read failed:", error.message);
    return null;
  }
  const ids = (data as { item_ids?: number[] } | null)?.item_ids;
  return Array.isArray(ids) && ids.length > 0 ? ids : null;
}

/** Insert-then-reread: two racing first requests both insert, the loser's
 *  row is dropped by the primary key, and the re-read returns the winner. */
async function writePin(slug: string, day: number, ids: number[]): Promise<number[]> {
  const sb = await db();
  await sb.from("arcade_daily").insert({ game_slug: slug, day_key: day, item_ids: ids });
  return (await readPin(slug, day)) ?? ids;
}

/** Pinned media ids for a day, building and pinning on first request. */
async function pinnedMedia(
  slug: string,
  day: number,
  build: () => Promise<string[] | null>,
): Promise<string[] | null> {
  const existing = await readPin(slug, day);
  if (existing) return existing.map(decodeMediaPin);
  const built = await build();
  if (!built || built.length === 0) return null;
  const encoded: number[] = [];
  for (const id of built) {
    const n = encodeMediaPin(id);
    if (n === null) return null;
    encoded.push(n);
  }
  return (await writePin(slug, day, encoded)).map(decodeMediaPin);
}

/** Pinned arcade_items ids for a day, building from the active pool. */
async function pinnedItems(
  slug: string,
  day: number,
  build: (items: ItemMeta[]) => number[] | null,
): Promise<number[] | null> {
  const existing = await readPin(slug, day);
  if (existing) return existing;
  const sb = await db();
  const { data, error } = await sb
    .from("arcade_items")
    .select("id, difficulty, media_id, real:payload->real")
    .eq("game_slug", slug)
    .eq("active", true)
    .order("id", { ascending: true })
    .limit(PAGE);
  if (error) {
    console.error("[arcade] item pool read failed:", error.message);
    return null;
  }
  const built = build((data ?? []) as unknown as ItemMeta[]);
  if (!built || built.length === 0) return null;
  return writePin(slug, day, built);
}

interface ItemRow {
  id: number;
  media_id: string | null;
  payload: Record<string, unknown>;
  difficulty: number;
}

/** Pinned item rows in pin order. Null when any pinned row is gone. */
async function fetchItemRows(ids: number[]): Promise<ItemRow[] | null> {
  const sb = await db();
  const { data, error } = await sb
    .from("arcade_items")
    .select("id, media_id, payload, difficulty")
    .in("id", ids);
  if (error) {
    console.error("[arcade] item read failed:", error.message);
    return null;
  }
  const byId = new Map(((data ?? []) as unknown as ItemRow[]).map((r) => [r.id, r]));
  const rows: ItemRow[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) return null;
    rows.push(r);
  }
  return rows;
}

function toCard(r: ArcadePoolRow): ArcadeMediaCard {
  return {
    id: r.media_id,
    mediaType: r.media_type === "tv" ? "tv" : "movie",
    title: r.title,
    year: r.year,
    posterUrl: r.poster_url,
  };
}

/** Cards for pinned ids, in pin order; null unless every id resolves. A pin
 *  is frozen truth, so a missing row means the round cannot be served. */
async function cardsForPins(ids: string[], cols = POOL_CARD_COLS): Promise<ArcadePoolRow[] | null> {
  const rows = await fetchMediaByIds(ids, cols);
  if (!rows) return null;
  const out: ArcadePoolRow[] = [];
  for (const id of ids) {
    const r = rows.get(id);
    if (!r) return null;
    out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Media-derived rounds
// ---------------------------------------------------------------------------

export const getTaglineRound = createServerFn({ method: "GET" }).handler(
  async (): Promise<TaglineRound | null> => {
    const day = dayNumber();
    const ids = await pinnedMedia("taglines", day, async () => {
      const pool = await fetchPool({
        cols: `${POOL_CARD_COLS}, ${TAGLINE_COL}`,
        taglineOnly: true,
      });
      if (!pool) return null;
      const set = pickTaglineSet(
        pool.map((r) => ({
          id: r.media_id,
          title: r.title,
          year: r.year,
          tagline: r.tagline ?? "",
        })),
        day,
      );
      return set ? set.map((s) => s.id) : null;
    });
    if (!ids || ids.length !== 5) return null;

    const rows = await cardsForPins(ids, `${POOL_CARD_COLS}, ${TAGLINE_COL}`);
    if (!rows || rows.some((r) => !r.tagline?.trim())) return null;

    return {
      dayKey: day,
      taglines: seededShuffle(
        rows.map((r) => ({ id: r.media_id, text: (r.tagline ?? "").trim() })),
        daySeed(day, 1),
      ),
      titles: seededShuffle(rows.map(toCard), daySeed(day, 2)),
    };
  },
);

const CASTING_COLS = `${POOL_CARD_COLS}, genres, people`;

export const getCastingRound = createServerFn({ method: "GET" }).handler(
  async (): Promise<CastingRound | null> => {
    const day = dayNumber();
    const ids = await pinnedMedia("casting-call", day, async () => {
      const pool = await fetchPool({ cols: CASTING_COLS });
      return pool ? buildCastingPins(pool, day) : null;
    });
    if (!ids || ids.length !== 16) return null;

    const rows = await cardsForPins(ids, CASTING_COLS);
    if (!rows) return null;

    const rounds: CastingRoundItem[] = [];
    for (let i = 0; i < 8; i++) {
      const movie = rows[i];
      const source = rows[i + 8];
      const cast = castWithRoles(movie.people).slice(0, 3);
      const impostor = impostorFromSource(source, movie);
      if (cast.length < 3 || !impostor) return null;
      rounds.push({
        movie: toCard(movie),
        actors: seededShuffle([...cast, { name: impostor, role: null }], daySeed(day, 200 + i)),
        impostor,
      });
    }
    return { dayKey: day, rounds };
  },
);

export const getTimelineRound = createServerFn({ method: "GET" }).handler(
  async (): Promise<TimelineRound | null> => {
    const day = dayNumber();
    const band = eraBandFor(day);
    const ids = await pinnedMedia("timeline", day, async () => {
      const pool = await fetchPool({ cols: POOL_CARD_COLS });
      if (!pool) return null;
      const inBand = pool.filter((r) => {
        const y = Number(r.year);
        return Number.isFinite(y) && y >= band.start && y <= band.end;
      });
      const picked = pickDistinctYears(inBand, 5, daySeed(day, 107));
      return picked ? picked.map((r) => r.media_id) : null;
    });
    if (!ids || ids.length !== 5) return null;

    const rows = await cardsForPins(ids);
    if (!rows) return null;

    return {
      dayKey: day,
      era: band.label,
      titles: seededShuffle(
        rows.map((r) => {
          const c = toCard(r);
          return {
            id: c.id,
            mediaType: c.mediaType,
            title: c.title,
            posterUrl: c.posterUrl,
            year: c.year,
          };
        }),
        daySeed(day, 3),
      ),
    };
  },
);

const SPEED_COLS = `${POOL_CARD_COLS}, awards_won, award_wins`;

export const getSpeedSortRound = createServerFn({ method: "GET" }).handler(
  async (): Promise<SpeedSortRound | null> => {
    const day = dayNumber();
    const pair = speedSortPairFor(day);
    const ids = await pinnedMedia("speed-sort", day, async () => {
      const pool = await fetchPool({ cols: SPEED_COLS });
      if (!pool) return null;
      const aRows = seededShuffle(pool.filter(pair.a.test), daySeed(day, 109)).slice(0, 15);
      const bRows = seededShuffle(pool.filter(pair.b.test), daySeed(day, 110)).slice(0, 15);
      if (aRows.length < 15 || bRows.length < 15) return null;
      // Pin order encodes the answer: first 15 belong to bin a, last 15 to b.
      return [...aRows, ...bRows].map((r) => r.media_id);
    });
    if (!ids || ids.length !== 30) return null;

    const rows = await cardsForPins(ids);
    if (!rows) return null;

    const titled = rows.map((r, i) => {
      const c = toCard(r);
      return {
        id: c.id,
        mediaType: c.mediaType,
        title: c.title,
        posterUrl: c.posterUrl,
        year: c.year,
        bin: (i < 15 ? "a" : "b") as "a" | "b",
      };
    });
    return {
      dayKey: day,
      pairKey: pair.key,
      bins: { a: pair.a.label, b: pair.b.label },
      titles: seededShuffle(titled, daySeed(day, 4)),
    };
  },
);

const LINK_COLS = `${POOL_CARD_COLS}, people`;
const LINK_POOL_SIZE = 400;
const LINK_DECOYS = 3;
const LINK_ACTORS_SHOWN = 6;

function toLinkRow(r: ArcadePoolRow): LinkRow {
  const c = toCard(r);
  return { ...c, actors: actorNames(r.people) };
}

export const getLinkUpRound = createServerFn({ method: "GET" }).handler(
  async (): Promise<LinkUpRound | null> => {
    const day = dayNumber();
    // The most popular titles are where the well-connected actors live, and
    // 400 rows is one request. Decoys draw from the same set.
    const pool = await fetchPool({ cols: LINK_COLS, orderVotes: true, limit: LINK_POOL_SIZE });
    if (!pool) return null;
    const rows = pool.map(toLinkRow).filter((r) => r.actors.length >= 2);

    const hops = 2 + (day % 2);
    const ids = await pinnedMedia("link-up", day, async () => {
      const chain = buildLinkChain(rows, day, hops);
      return chain ? chain.map((r) => r.id) : null;
    });
    if (!ids || ids.length < 2) return null;

    // A pinned title can drop out of the top slice later; fetch stragglers.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      const extra = await fetchMediaByIds(missing, LINK_COLS);
      if (!extra) return null;
      for (const [id, r] of extra) byId.set(id, toLinkRow(r));
    }
    const chain: LinkRow[] = [];
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) return null;
      chain.push(r);
    }
    const actors = deriveLinkActors(chain);
    if (!actors) return null;

    const chainIds = new Set(ids);
    const steps: LinkUpStep[] = [];
    for (let i = 0; i < chain.length; i++) {
      const fromActor = i === 0 ? actors.start : actors.links[i - 1];
      const from = fromActor.toLowerCase();
      const decoys = seededShuffle(
        rows.filter((r) => !chainIds.has(r.id) && !r.actors.some((n) => n.toLowerCase() === from)),
        daySeed(day, 300 + i),
      ).slice(0, LINK_DECOYS);
      if (decoys.length < LINK_DECOYS) return null;
      // Cards only. The answer id and every cast list stay here so the page
      // source cannot be read for the chain.
      const options = seededShuffle([chain[i], ...decoys], daySeed(day, 400 + i)).map((r) => ({
        id: r.id,
        mediaType: r.mediaType,
        title: r.title,
        year: r.year,
        posterUrl: r.posterUrl,
      }));
      steps.push({ options });
    }
    return {
      dayKey: day,
      start: actors.start,
      target: actors.target,
      par: chain.length,
      steps,
    };
  },
);

/** Judge one Link Up pick against the pinned chain. The pin is the truth
 *  for a day, so the verdict needs no recomputation of the round: the step's
 *  answer is the step's pinned title. A right pick also returns the actor
 *  handed to the next step; any pick returns the title's leading cast. */
export const judgeLinkPick = createServerFn({ method: "POST" })
  .inputValidator((p: { dayKey: number; step: number; optionId: string }) => p)
  .handler(async ({ data: p }): Promise<LinkPickVerdict | null> => {
    const day = Number(p.dayKey);
    const step = Number(p.step);
    const optionId = typeof p.optionId === "string" ? p.optionId : "";
    if (!Number.isInteger(day) || day < 1 || day > dayNumber()) return null;
    if (!Number.isInteger(step) || step < 0 || encodeMediaPin(optionId) === null) return null;

    const pin = await readPin("link-up", day);
    if (!pin || step >= pin.length) return null;
    const ids = pin.map(decodeMediaPin);
    const correct = ids[step] === optionId;

    const wanted = correct ? ids : [optionId];
    const rows = await fetchMediaByIds(wanted, LINK_COLS);
    if (!rows) return null;
    const picked = rows.get(optionId);
    if (!picked) return null;
    const cast = actorNames(picked.people).slice(0, LINK_ACTORS_SHOWN);
    if (!correct) return { correct: false, cast, nextActor: null };

    const chain: LinkRow[] = [];
    for (const id of ids) {
      const r = rows.get(id);
      if (!r) return null;
      chain.push(toLinkRow(r));
    }
    const actors = deriveLinkActors(chain);
    if (!actors) return null;
    const nextActor = step < chain.length - 1 ? actors.links[step] : actors.target;
    return { correct: true, cast, nextActor };
  });

/** Balasaurdle's pool floor (see POOL_MIN_VOTES in daily.functions.ts). */
const BALASAURDLE_MIN_VOTES = 1500;

async function poolCount(minVotes: number): Promise<number | null> {
  const sb = await db();
  const { count, error } = await sb
    .from("media")
    .select("media_id", { count: "exact", head: true })
    .eq("suggestive", false)
    .gte("vote_count", minVotes)
    .not("poster_url", "is", null)
    .not("year", "is", null);
  if (error || !count) {
    if (error) console.error("[arcade] pool count failed:", error.message);
    return null;
  }
  return count;
}

async function poolMediaIdAt(idx: number, minVotes: number): Promise<string | null> {
  const sb = await db();
  const { data, error } = await sb
    .from("media")
    .select("media_id")
    .eq("suggestive", false)
    .gte("vote_count", minVotes)
    .not("poster_url", "is", null)
    .not("year", "is", null)
    .order("media_id", { ascending: true })
    .range(idx, idx);
  if (error || !data || data.length === 0) {
    if (error) console.error("[arcade] pool pick failed:", error.message);
    return null;
  }
  return (data[0] as { media_id: string }).media_id;
}

export const getPosterRound = createServerFn({ method: "GET" }).handler(
  async (): Promise<PosterRound | null> => {
    const day = dayNumber();
    const ids = await pinnedMedia("poster-reveal", day, async () => {
      // Never serve the same title Balasaurdle answers with today. Read its
      // pin; if nobody has opened Balasaurdle yet, compute the same pick it
      // will make (same pool, same offset as pinnedMediaId in
      // daily.functions.ts) without writing its pin.
      const sb = await db();
      const { data: pinned } = await sb
        .from("daily_challenges")
        .select("media_id")
        .eq("day", day)
        .maybeSingle();
      let avoid = (pinned as { media_id?: string } | null)?.media_id ?? null;
      if (!avoid) {
        const bCount = await poolCount(BALASAURDLE_MIN_VOTES);
        if (bCount) avoid = await poolMediaIdAt(dailyIndex(day, bCount), BALASAURDLE_MIN_VOTES);
      }
      const count = await poolCount(ARCADE_POOL_MIN_VOTES);
      if (!count) return null;
      let idx = dailyIndex(day * 1000 + 77, count);
      let id = await poolMediaIdAt(idx, ARCADE_POOL_MIN_VOTES);
      if (id && avoid && id === avoid) {
        idx = (idx + 1) % count;
        id = await poolMediaIdAt(idx, ARCADE_POOL_MIN_VOTES);
      }
      return id ? [id] : null;
    });
    if (!ids || ids.length !== 1) return null;

    const rows = await cardsForPins(ids);
    if (!rows) return null;
    return { dayKey: day, media: toCard(rows[0]) };
  },
);

// ---------------------------------------------------------------------------
// Item-pack rounds (arcade_items)
// ---------------------------------------------------------------------------

interface ChoiceItemSpec {
  slug: "quote-match" | "emoji";
  count: number;
  textKey: "quote" | "emoji";
  wrongKey: "trap_titles" | "decoys";
}

/** Quote Match and Emoji share a shape: a prompt, the answer title from the
 *  media join, and authored wrong choices in the payload. */
async function choiceItemRound(spec: ChoiceItemSpec): Promise<{
  dayKey: number;
  items: {
    itemId: number;
    text: string;
    choices: string[];
    answer: string;
    media: ArcadeMediaCard;
  }[];
} | null> {
  const day = dayNumber();
  const ids = await pinnedItems(spec.slug, day, (items) => pickItemIds(items, day, spec.count));
  if (!ids || ids.length !== spec.count) return null;

  const rows = await fetchItemRows(ids);
  if (!rows) return null;

  const mediaIds = rows.map((r) => r.media_id).filter((m): m is string => !!m);
  if (mediaIds.length !== rows.length) return null;
  const media = await fetchMediaByIds(mediaIds, POOL_CARD_COLS);
  if (!media) return null;

  const items: {
    itemId: number;
    text: string;
    choices: string[];
    answer: string;
    media: ArcadeMediaCard;
  }[] = [];
  for (const r of rows) {
    const m = media.get(r.media_id as string);
    const text = r.payload[spec.textKey];
    const wrong = r.payload[spec.wrongKey];
    if (!m || typeof text !== "string" || !Array.isArray(wrong) || wrong.length < 1) return null;
    items.push({
      itemId: r.id,
      text,
      answer: m.title,
      choices: seededShuffle([m.title, ...(wrong as string[])], daySeed(day, 500 + r.id)),
      media: toCard(m),
    });
  }
  return { dayKey: day, items };
}

export const getQuoteRound = createServerFn({ method: "GET" }).handler(
  async (): Promise<QuoteRound | null> => {
    const round = await choiceItemRound({
      slug: "quote-match",
      count: 5,
      textKey: "quote",
      wrongKey: "trap_titles",
    });
    if (!round) return null;
    return {
      dayKey: round.dayKey,
      items: round.items.map((i) => ({
        itemId: i.itemId,
        quote: i.text,
        choices: i.choices,
        answer: i.answer,
        media: i.media,
      })),
    };
  },
);

export const getEmojiRound = createServerFn({ method: "GET" }).handler(
  async (): Promise<EmojiRound | null> => {
    const round = await choiceItemRound({
      slug: "emoji",
      count: 5,
      textKey: "emoji",
      wrongKey: "decoys",
    });
    if (!round) return null;
    return {
      dayKey: round.dayKey,
      items: round.items.map((i) => ({
        itemId: i.itemId,
        emoji: i.text,
        choices: i.choices,
        answer: i.answer,
        media: i.media,
      })),
    };
  },
);

export const getSequelRound = createServerFn({ method: "GET" }).handler(
  async (): Promise<SequelRound | null> => {
    const day = dayNumber();
    const ids = await pinnedItems("sequel-or-fake", day, (items) => buildSequelIds(items, day));
    if (!ids || ids.length !== 10) return null;

    const rows = await fetchItemRows(ids);
    if (!rows) return null;

    const items: SequelRoundItem[] = [];
    for (const r of rows) {
      const p = r.payload as {
        real?: boolean;
        title?: string;
        anchor?: string;
        year?: number | null;
        reveal?: string;
      };
      if (typeof p.real !== "boolean" || !p.title || !p.anchor || !p.reveal) return null;
      items.push({
        itemId: r.id,
        title: p.title,
        anchor: p.anchor,
        year: typeof p.year === "number" ? p.year : null,
        real: p.real,
        reveal: p.reveal,
      });
    }
    return { dayKey: day, items: seededShuffle(items, daySeed(day, 5)) };
  },
);

/** 10 questions balanced 3 easy, 4 medium, 3 hard, easiest first. */
const SCREENING_MIX: [number, number, number] = [3, 4, 3];

export const getScreeningSet = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScreeningSet | null> => {
    const day = dayNumber();
    const ids = await pinnedItems("screening", day, (items) =>
      pickBalanced(items, SCREENING_MIX, day),
    );
    if (!ids || ids.length !== 10) return null;

    const rows = await fetchItemRows(ids);
    if (!rows) return null;

    const items: ScreeningItem[] = [];
    for (const r of rows) {
      const p = parseScreeningPayload(r.payload);
      if (!p) return null;
      items.push({
        itemId: r.id,
        question: p.q,
        choices: p.choices,
        difficulty: r.difficulty,
      });
    }
    return { dayKey: day, items };
  },
);

/** Judge one screening pick. Reads the question by id, so the answer index
 *  never leaves the server before the pick is made. A null choice is the
 *  clock running out: wrong, and the answer still comes back. */
export const judgeScreeningPick = createServerFn({ method: "POST" })
  .inputValidator((p: { itemId: number; choice: number | null }) => p)
  .handler(async ({ data: p }): Promise<ScreeningVerdict | null> => {
    const itemId = Number(p.itemId);
    if (!Number.isInteger(itemId) || itemId < 1) return null;
    const choice =
      typeof p.choice === "number" && Number.isInteger(p.choice) && p.choice >= 0 ? p.choice : null;

    const sb = await db();
    const { data, error } = await sb
      .from("arcade_items")
      .select("id, media_id, payload")
      .eq("game_slug", "screening")
      .eq("id", itemId)
      .maybeSingle();
    if (error) {
      console.error("[arcade] screening judge read failed:", error.message);
      return null;
    }
    const row = data as { media_id: string | null; payload: unknown } | null;
    const q = row ? parseScreeningPayload(row.payload) : null;
    if (!row || !q) return null;

    let media: ArcadeMediaCard | null = null;
    if (row.media_id) {
      const m = await fetchMediaByIds([row.media_id], POOL_CARD_COLS);
      const r = m?.get(row.media_id);
      if (r) media = toCard(r);
    }
    return { correct: choice === q.answer, answer: q.answer, note: q.note, media };
  });

// ---------------------------------------------------------------------------
// Yesterday, solved
// ---------------------------------------------------------------------------

function toSolvedMedia(r: ArcadePoolRow): SolvedMedia {
  return toCard(r);
}

/** Yesterday's round with the answers, for the SSR block on each game page.
 *  Reads only what was pinned; a day nobody played has no pin and returns
 *  null rather than recomputing the past from today's pool. */
export const getYesterday = createServerFn({ method: "GET" })
  .inputValidator((p: { game: string }) => p)
  .handler(async ({ data: p }): Promise<ArcadeYesterday | null> => {
    const game = (p.game ?? "").toLowerCase();
    if (!(ARCADE_ROUND_SLUGS as readonly string[]).includes(game)) return null;
    const day = dayNumber() - 1;
    if (day < 1) return null;

    try {
      const entries = await solvedEntries(game, day);
      if (!entries || entries.length === 0) return null;
      return { dayKey: day, game, entries };
    } catch (e) {
      console.error("[arcade] yesterday failed:", e instanceof Error ? e.message : e);
      return null;
    }
  });

async function solvedEntries(game: string, day: number): Promise<SolvedEntry[] | null> {
  if (game === "balasaurdle") {
    const sb = await db();
    const { data } = await sb
      .from("daily_challenges")
      .select("media_id")
      .eq("day", day)
      .maybeSingle();
    const mediaId = (data as { media_id?: string } | null)?.media_id;
    if (!mediaId) return null;
    const rows = await cardsForPins([mediaId]);
    if (!rows) return null;
    return [{ answer: rows[0].title, media: toSolvedMedia(rows[0]) }];
  }

  if (game === "poster-reveal") {
    const pin = await readPin(game, day);
    if (!pin || pin.length !== 1) return null;
    const rows = await cardsForPins(pin.map(decodeMediaPin));
    if (!rows) return null;
    return [{ answer: rows[0].title, media: toSolvedMedia(rows[0]) }];
  }

  if (game === "taglines") {
    const pin = await readPin(game, day);
    if (!pin || pin.length !== 5) return null;
    const rows = await cardsForPins(pin.map(decodeMediaPin), `${POOL_CARD_COLS}, ${TAGLINE_COL}`);
    if (!rows) return null;
    return rows.map((r) => ({
      prompt: (r.tagline ?? "").trim(),
      answer: r.title,
      media: toSolvedMedia(r),
    }));
  }

  if (game === "casting-call") {
    const pin = await readPin(game, day);
    if (!pin || pin.length !== 16) return null;
    const rows = await cardsForPins(pin.map(decodeMediaPin), CASTING_COLS);
    if (!rows) return null;
    const entries: SolvedEntry[] = [];
    for (let i = 0; i < 8; i++) {
      const impostor = impostorFromSource(rows[i + 8], rows[i]);
      if (!impostor) return null;
      entries.push({
        prompt: `${rows[i].title} (${rows[i].year})`,
        answer: impostor,
        media: toSolvedMedia(rows[i]),
      });
    }
    return entries;
  }

  if (game === "timeline") {
    const pin = await readPin(game, day);
    if (!pin || pin.length !== 5) return null;
    const rows = await cardsForPins(pin.map(decodeMediaPin));
    if (!rows) return null;
    return rows
      .slice()
      .sort((a, b) => Number(a.year) - Number(b.year))
      .map((r) => ({ prompt: r.year, answer: r.title, media: toSolvedMedia(r) }));
  }

  if (game === "speed-sort") {
    const pin = await readPin(game, day);
    if (!pin || pin.length !== 30) return null;
    const pair = speedSortPairFor(day);
    const rows = await cardsForPins(pin.map(decodeMediaPin));
    if (!rows) return null;
    return rows.map((r, i) => ({
      prompt: i < 15 ? pair.a.label : pair.b.label,
      answer: r.title,
      media: toSolvedMedia(r),
    }));
  }

  if (game === "link-up") {
    const pin = await readPin(game, day);
    if (!pin || pin.length < 2) return null;
    const rows = await cardsForPins(pin.map(decodeMediaPin), LINK_COLS);
    if (!rows) return null;
    const chain = rows.map(toLinkRow);
    const actors = deriveLinkActors(chain);
    if (!actors) return null;
    return chain.map((r, i) => {
      const from = i === 0 ? actors.start : actors.links[i - 1];
      const to = i < chain.length - 1 ? actors.links[i] : actors.target;
      return {
        prompt: `${from} to ${to}`,
        answer: r.title,
        media: {
          id: r.id,
          mediaType: r.mediaType,
          title: r.title,
          year: r.year,
          posterUrl: r.posterUrl,
        },
      };
    });
  }

  // Item-pack games: the pin holds arcade_items ids.
  const pin = await readPin(game, day);
  if (!pin || pin.length === 0) return null;
  const rows = await fetchItemRows(pin);
  if (!rows) return null;

  if (game === "quote-match" || game === "emoji") {
    const mediaIds = rows.map((r) => r.media_id).filter((m): m is string => !!m);
    if (mediaIds.length !== rows.length) return null;
    const media = await fetchMediaByIds(mediaIds, POOL_CARD_COLS);
    if (!media) return null;
    const key = game === "quote-match" ? "quote" : "emoji";
    const entries: SolvedEntry[] = [];
    for (const r of rows) {
      const m = media.get(r.media_id as string);
      const text = r.payload[key];
      if (!m || typeof text !== "string") return null;
      entries.push({ prompt: text, answer: m.title, media: toSolvedMedia(m) });
    }
    return entries;
  }

  if (game === "sequel-or-fake") {
    const entries: SolvedEntry[] = [];
    for (const r of rows) {
      const p = r.payload as { real?: boolean; title?: string; reveal?: string };
      if (typeof p.real !== "boolean" || !p.title) return null;
      entries.push({ prompt: p.title, answer: p.real ? "Real" : "Fake", detail: p.reveal ?? "" });
    }
    return entries;
  }

  if (game === "screening") {
    const entries: SolvedEntry[] = [];
    for (const r of rows) {
      const p = parseScreeningPayload(r.payload);
      if (!p) return null;
      entries.push({ prompt: p.q, answer: p.choices[p.answer], detail: p.note });
    }
    return entries;
  }

  return null;
}
