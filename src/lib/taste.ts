// The Taste Card's arithmetic. Pure: a StatusMap in, catalog facts in, one
// profile out. No fetching, no DOM, no clock. Everything the card and the page
// print comes from here, so the two cannot disagree.
//
// ONE DENOMINATOR. Every share this module computes is a share of the same
// number, and that number is printed on the card next to the sentence that
// uses it. "Horror is 34% of what you Loved" sits beside "41 LOVED", so a
// stranger can check it. A rule whose denominator is some filtered subset
// (only the titles that happen to carry a critic score, say) would produce a
// percentage nobody can reconstruct, which is the failure this rule exists to
// prevent. Titles missing a fact simply never satisfy the predicate.
//
// THE BASIS. The archetype describes the Loved list when there is enough of
// one. Loving a title is a deliberate act and most people do it a handful of
// times, so below the floor we fall back to the watched list and say so in the
// sentence. The two real accounts in the database on 2026-09-08 had 4 and 5
// Loved titles against 9 and 84 watched; a card gated on Loved alone would
// have drawn for nobody.
//
// THE GATE. Under MIN_BASIS_TITLES there is no archetype and no card. A card
// naming someone from three titles is a horoscope, and the page says exactly
// how many more it needs instead of drawing a weak one.

import type { StatusMap, UserStatusRecord } from "@/hooks/useUserStatus";

/** Titles needed before an archetype can be named. */
export const MIN_BASIS_TITLES = 8;

/** Posters drawn on the card. */
export const CARD_POSTERS = 4;

/** Titles the taste page asks the catalog about in one go. Beyond this it
 *  sends the most recently rated, which is what an archetype should describe.
 *  Lives here rather than beside the query so a route can read the cap without
 *  importing anything that touches the database. */
export const MAX_FACT_IDS = 600;

/** A critic score at or under this is what makes a liked title contrarian. */
export const CONTRARIAN_CRITIC_MAX = 55;

/** Catalog facts for one title, as the taste page loads them. */
export interface TitleFact {
  id: string;
  title: string;
  /** Release year as stored, e.g. "1999". */
  year?: string;
  mediaType: string;
  /** Unified genre names, as `media.genres` stores them. */
  genres: string[];
  /** Origin bucket keys, as `media.origins` stores them. */
  origins: string[];
  posterUrl?: string;
  /** Balasaur Score, 0 to 100. */
  score?: number;
  /** Critic score, 0 to 100. Metacritic when present, else Rotten Tomatoes. */
  critic?: number;
  criticSource?: "Metacritic" | "Rotten Tomatoes";
}

export type TasteBasis = "loved" | "watched";

export interface ArchetypeDef {
  key: string;
  name: string;
  /** The rule in words, printed on the taste page so the table is public. */
  rule: string;
}

export interface Archetype {
  key: string;
  name: string;
  /** The one sentence printed under the name. Always a share of `total`. */
  evidence: string;
}

export interface GenreShare {
  genre: string;
  count: number;
  /** 0 to 1. */
  share: number;
}

export interface DecadeCount {
  /** The decade's first year, e.g. 1990. */
  decade: number;
  count: number;
}

export interface CardPoster {
  id: string;
  title: string;
  posterUrl: string;
  score?: number;
}

export interface Contrarian {
  id: string;
  title: string;
  critic: number;
  criticSource: string;
  /** "You liked Venom. Critics gave it 31." */
  line: string;
}

export interface TasteReadiness {
  liked: number;
  watched: number;
  want: number;
  /** Whether a card can be drawn at all, before catalog facts are loaded. */
  ready: boolean;
  /** Titles still needed. 0 once ready. */
  needed: number;
}

export interface TasteProfile {
  /** Which list the archetype describes. */
  basis: TasteBasis;
  /** The denominator every share below is a share of, and the number the card
   *  prints beside the archetype sentence. */
  total: number;
  counts: { liked: number; watched: number; want: number };
  archetype: Archetype | null;
  /** Titles still needed for an archetype. 0 once one is named. */
  needed: number;
  topGenres: GenreShare[];
  decades: DecadeCount[];
  /** Distinct decades in the basis set. */
  decadeCount: number;
  posters: CardPoster[];
  contrarian: Contrarian | null;
}

// ---------------------------------------------------------------------------
// Status reading
// ---------------------------------------------------------------------------

function isLiked(r: UserStatusRecord): boolean {
  return r.status === "seen" && r.sentiment === "liked";
}

function isWatched(r: UserStatusRecord): boolean {
  return r.status === "seen";
}

function isWant(r: UserStatusRecord): boolean {
  return r.status === "unseen" && r.intent === "want";
}

/**
 * What the profile page and the taste page can say before any catalog query:
 * the three counts, and whether there is enough to draw. Cheap on purpose, so
 * the teaser costs no request.
 */
export function tasteReadiness(statuses: StatusMap): TasteReadiness {
  let liked = 0;
  let watched = 0;
  let want = 0;
  for (const rec of Object.values(statuses ?? {})) {
    if (!rec || typeof rec !== "object") continue;
    if (isLiked(rec)) liked++;
    if (isWatched(rec)) watched++;
    else if (isWant(rec)) want++;
  }
  const best = Math.max(liked, watched);
  return {
    liked,
    watched,
    want,
    ready: best >= MIN_BASIS_TITLES,
    needed: Math.max(0, MIN_BASIS_TITLES - best),
  };
}

// ---------------------------------------------------------------------------
// The archetype table
// ---------------------------------------------------------------------------

interface Row {
  fact: TitleFact;
  ts: number;
}

interface Shape {
  total: number;
  basis: TasteBasis;
  /** Share of the basis matching a predicate, 0 to 1. */
  share(fn: (f: TitleFact) => boolean): number;
}

interface Rule {
  def: ArchetypeDef;
  /** How many independent conditions the rule imposes. A two-condition rule is
   *  strictly harder to satisfy than a one-condition rule, so it wins outright
   *  when it fires, and margins are only compared inside a tier. */
  tier: number;
  /** Returns the evidence sentence when the rule holds, and the margin by
   *  which it holds, normalized so thresholds of different heights compare. */
  test(s: Shape): { strength: number; evidence: string } | null;
}

const NON_ENGLISH_ORIGINS = ["Korean", "Japanese", "Chinese", "Indian", "Spanish", "French"];

function hasGenre(f: TitleFact, ...names: string[]): boolean {
  return f.genres.some((g) => names.some((n) => g.toLowerCase() === n.toLowerCase()));
}

function pct(share: number): number {
  return Math.round(share * 100);
}

/** "what you Loved" / "what you have watched" */
function phraseOf(basis: TasteBasis): string {
  return basis === "loved" ? "what you Loved" : "what you have watched";
}

/** Normalized margin: how far past its own threshold a rule cleared. */
function over(actual: number, threshold: number): number {
  return (actual - threshold) / (1 - threshold);
}

/** A share rule: fires at or above `threshold`, and its sentence is that share. */
function shareRule(
  key: string,
  name: string,
  rule: string,
  threshold: number,
  match: (f: TitleFact) => boolean,
  sentence: (p: number, phrase: string) => string,
): Rule {
  return {
    def: { key, name, rule },
    tier: 1,
    test(s) {
      const actual = s.share(match);
      if (actual < threshold) return null;
      return {
        strength: over(actual, threshold),
        evidence: sentence(pct(actual), phraseOf(s.basis)),
      };
    },
  };
}

/**
 * The table, in tiebreak order. Selection runs: the most conditions, then the
 * widest normalized margin, then position. Position is not priority: someone
 * who is 60% comedy and 31% horror is a Laugh Track, not a Gorehound, because
 * 60% clears its bar by more. Position only settles an exact tie, which is what
 * keeps the same library answering the same way every time it is drawn.
 */
const RULES: Rule[] = [
  shareRule(
    "gorehound",
    "Midnight Gorehound",
    "Horror is at least 30%.",
    0.3,
    (f) => hasGenre(f, "Horror"),
    (p, phrase) => `Horror is ${p}% of ${phrase}.`,
  ),
  {
    def: {
      key: "prestige",
      name: "Prestige Bingeer",
      rule: "TV is at least half, and at least 40% scores 80 or better.",
    },
    tier: 2,
    test(s) {
      const tv = s.share((f) => f.mediaType === "tv");
      const high = s.share((f) => (f.score ?? -1) >= 80);
      if (tv < 0.5 || high < 0.4) return null;
      return {
        strength: over(tv, 0.5),
        evidence: `TV is ${pct(tv)}% of ${phraseOf(s.basis)}, and ${pct(high)}% scores 80 or better.`,
      };
    },
  },
  shareRule(
    "archive",
    "Archive Diver",
    "At least a quarter came out before 1980.",
    0.25,
    (f) => {
      const y = Number(f.year);
      return Number.isFinite(y) && y > 0 && y < 1980;
    },
    (p, phrase) => `${p}% of ${phrase} came out before 1980.`,
  ),
  shareRule(
    "subtitles",
    "Subtitle Reader",
    "At least 30% is Korean, Japanese, Chinese, Indian, Spanish or French.",
    0.3,
    (f) => f.origins.some((o) => NON_ENGLISH_ORIGINS.includes(o)),
    (p, phrase) => `Non-English titles are ${p}% of ${phrase}.`,
  ),
  shareRule(
    "laughs",
    "Laugh Track",
    "Comedy is at least 35%.",
    0.35,
    (f) => hasGenre(f, "Comedy"),
    (p, phrase) => `Comedy is ${p}% of ${phrase}.`,
  ),
  shareRule(
    "crime",
    "Crime Desk",
    "Crime, mystery and thriller together are at least 45%.",
    0.45,
    (f) => hasGenre(f, "Crime", "Mystery", "Thriller"),
    (p, phrase) => `Crime, mystery and thriller cover ${p}% of ${phrase}.`,
  ),
  shareRule(
    "speculative",
    "Deep Field",
    "Science fiction and fantasy together are at least 45%.",
    0.45,
    (f) => hasGenre(f, "Science Fiction", "Fantasy"),
    (p, phrase) => `Science fiction and fantasy cover ${p}% of ${phrase}.`,
  ),
  shareRule(
    "popcorn",
    "Opening Weekend",
    "Action and adventure together are at least 55%.",
    0.55,
    (f) => hasGenre(f, "Action", "Adventure"),
    (p, phrase) => `Action and adventure cover ${p}% of ${phrase}.`,
  ),
  shareRule(
    "animation",
    "Animation Wing",
    "Animation is at least 25%.",
    0.25,
    (f) => hasGenre(f, "Animation"),
    (p, phrase) => `Animation is ${p}% of ${phrase}.`,
  ),
  shareRule(
    "nonfiction",
    "Nonfiction Shelf",
    "Documentary is at least 20%.",
    0.2,
    (f) => hasGenre(f, "Documentary"),
    (p, phrase) => `Documentaries are ${p}% of ${phrase}.`,
  ),
  shareRule(
    "romance",
    "Romance Desk",
    "Romance is at least 30%.",
    0.3,
    (f) => hasGenre(f, "Romance"),
    (p, phrase) => `Romance is ${p}% of ${phrase}.`,
  ),
  shareRule(
    "criticproof",
    "Critic Proof",
    "At least 30% scored under 60 with critics.",
    0.3,
    (f) => f.critic !== undefined && f.critic < 60,
    (p, phrase) => `${p}% of ${phrase} scored under 60 with critics.`,
  ),
  shareRule(
    "highbar",
    "High Bar",
    "At least 35% scores 85 or better.",
    0.35,
    (f) => (f.score ?? -1) >= 85,
    (p, phrase) => `${p}% of ${phrase} scores 85 or better.`,
  ),
];

/** The last resort, for a library with no concentration anywhere. */
const WIDE_NET: ArchetypeDef = {
  key: "widenet",
  name: "Wide Net",
  rule: "No rule above fires.",
};

/** The table as the taste page prints it, rules included. */
export const ARCHETYPES: readonly ArchetypeDef[] = [...RULES.map((r) => r.def), WIDE_NET];

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

function topGenresOf(rows: Row[], total: number): GenreShare[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const g of r.fact.genres) {
      const key = g.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([genre, count]) => ({ genre, count, share: count / total }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, 3);
}

function decadesOf(rows: Row[]): DecadeCount[] {
  const counts = new Map<number, number>();
  for (const r of rows) {
    const y = Number(r.fact.year);
    if (!Number.isFinite(y) || y < 1870) continue;
    const d = Math.floor(y / 10) * 10;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([decade, count]) => ({ decade, count }))
    .sort((a, b) => b.count - a.count || b.decade - a.decade);
}

/**
 * The four posters. Highest Balasaur Score first, and the card prints each
 * score under its poster, so the order on the card explains itself. A title
 * with no score or no poster cannot be placed on that ladder and is skipped.
 */
function postersOf(rows: Row[]): CardPoster[] {
  return rows
    .filter((r) => !!r.fact.posterUrl && r.fact.score !== undefined)
    .sort(
      (a, b) =>
        (b.fact.score ?? 0) - (a.fact.score ?? 0) ||
        a.fact.title.localeCompare(b.fact.title) ||
        a.fact.id.localeCompare(b.fact.id),
    )
    .slice(0, CARD_POSTERS)
    .map((r) => ({
      id: r.fact.id,
      title: r.fact.title,
      posterUrl: r.fact.posterUrl!,
      score: r.fact.score,
    }));
}

/**
 * The one Loved title critics disliked most. Always drawn from the Loved list
 * even when the archetype falls back to watched, because having watched
 * something is not a disagreement with anybody.
 */
function contrarianOf(likedRows: Row[]): Contrarian | null {
  const candidates = likedRows.filter(
    (r) => r.fact.critic !== undefined && r.fact.critic <= CONTRARIAN_CRITIC_MAX,
  );
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      (a.fact.critic ?? 0) - (b.fact.critic ?? 0) ||
      a.fact.title.localeCompare(b.fact.title) ||
      a.fact.id.localeCompare(b.fact.id),
  );
  const pick = candidates[0].fact;
  return {
    id: pick.id,
    title: pick.title,
    critic: pick.critic!,
    criticSource: pick.criticSource ?? "Metacritic",
    line: `You liked ${pick.title}. Critics gave it ${pick.critic}.`,
  };
}

function pickArchetype(shape: Shape): Archetype | null {
  let best: { rule: Rule; strength: number; evidence: string } | null = null;
  for (const rule of RULES) {
    const hit = rule.test(shape);
    if (!hit) continue;
    const better =
      !best ||
      rule.tier > best.rule.tier ||
      (rule.tier === best.rule.tier && hit.strength > best.strength);
    if (better) best = { rule, ...hit };
  }
  if (!best) return null;
  return { key: best.rule.def.key, name: best.rule.def.name, evidence: best.evidence };
}

/**
 * Everything the card prints, from what the visitor already has.
 *
 * `facts` are the catalog rows for the ids in `statuses`; ids with no row are
 * counted in the three totals but never in a share, because a title whose
 * genres we do not know cannot honestly be inside or outside a genre bucket.
 */
export function computeTaste(statuses: StatusMap, facts: readonly TitleFact[]): TasteProfile {
  const byId = new Map<string, TitleFact>();
  for (const f of facts) if (f && f.id) byId.set(f.id, f);

  const counts = { liked: 0, watched: 0, want: 0 };
  const likedRows: Row[] = [];
  const watchedRows: Row[] = [];

  for (const [id, rec] of Object.entries(statuses ?? {})) {
    if (!rec || typeof rec !== "object") continue;
    const liked = isLiked(rec);
    const watched = isWatched(rec);
    if (liked) counts.liked++;
    if (watched) counts.watched++;
    else if (isWant(rec)) counts.want++;
    if (!watched) continue;
    const fact = byId.get(id);
    if (!fact) continue;
    const row: Row = { fact, ts: Number.isFinite(rec.ts) ? rec.ts : 0 };
    watchedRows.push(row);
    if (liked) likedRows.push(row);
  }

  const useLoved = likedRows.length >= MIN_BASIS_TITLES;
  const basis: TasteBasis = useLoved ? "loved" : "watched";
  const rows = useLoved ? likedRows : watchedRows;
  const total = rows.length;

  const topGenres = topGenresOf(rows, Math.max(total, 1));
  const decades = decadesOf(rows);
  const shape: Shape = {
    total,
    basis,
    share: (fn) => (total === 0 ? 0 : rows.filter((r) => fn(r.fact)).length / total),
  };

  const archetype =
    total >= MIN_BASIS_TITLES ? (pickArchetype(shape) ?? wideNet(shape, topGenres)) : null;

  return {
    basis,
    total,
    counts,
    archetype,
    needed: archetype ? 0 : Math.max(1, MIN_BASIS_TITLES - total),
    topGenres,
    decades,
    decadeCount: decades.length,
    posters: postersOf(rows),
    contrarian: contrarianOf(likedRows),
  };
}

/** The fallback's sentence needs the top genre, which the caller already has. */
function wideNet(shape: Shape, topGenres: GenreShare[]): Archetype {
  const top = topGenres[0];
  const evidence = top
    ? `No genre is more than ${pct(top.share)}% of ${phraseOf(shape.basis)}.`
    : `${shape.total} titles, and no genre on any of them.`;
  return { key: WIDE_NET.key, name: WIDE_NET.name, evidence };
}
