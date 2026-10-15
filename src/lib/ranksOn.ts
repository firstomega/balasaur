// The "ranks on" line near the top of a title page: up to three /best lists
// the title holds a place on, with its position, each linked.
//
// The most specific list says the most. "#1 on Drama Shows on Netflix"
// answers "is it worth it on the service I already pay for?", which "#59 on
// the best movies of the 2020s" does not. So: service and genre first, then
// country and genre, then genre, then year, then everything else. Person
// lists are skipped: the cast and crew already link to the person, and "the
// best Tom Hardy movies" is about Tom Hardy, not this title.

export interface Placement {
  slug: string;
  title: string;
  kind: string;
  rank: number;
  item_count: number;
}

/** At most this many lists in the line. */
export const RANKS_ON_MAX = 3;

const KIND_ORDER = [
  "genre-service",
  "origin-genre",
  "genre",
  "year",
  "service",
  "decade",
  "awards",
  "discovery",
  "occasion",
];
const SKIPPED_KINDS = new Set(["person"]);

function kindOrder(kind: string): number {
  const i = KIND_ORDER.indexOf(kind);
  return i === -1 ? KIND_ORDER.length : i;
}

/** Up to RANKS_ON_MAX placements, most specific kind first. One list per kind
 *  before a second of any kind, so Breaking Bad reads Netflix drama, all-time
 *  crime, 2008 rather than three Netflix lists. */
export function pickRanksOn(placements: Placement[]): Placement[] {
  const sorted = placements
    .filter((p) => !SKIPPED_KINDS.has(p.kind) && p.rank >= 1)
    .sort(
      (a, b) =>
        kindOrder(a.kind) - kindOrder(b.kind) ||
        a.rank - b.rank ||
        b.item_count - a.item_count ||
        a.slug.localeCompare(b.slug),
    );
  const picked: Placement[] = [];
  const kinds = new Set<string>();
  for (const p of sorted) {
    if (picked.length >= RANKS_ON_MAX) break;
    if (kinds.has(p.kind)) continue;
    picked.push(p);
    kinds.add(p.kind);
  }
  for (const p of sorted) {
    if (picked.length >= RANKS_ON_MAX) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked.sort(
    (a, b) =>
      kindOrder(a.kind) - kindOrder(b.kind) || a.rank - b.rank || a.slug.localeCompare(b.slug),
  );
}

/** A list's name as it reads inside a sentence. "The Best Crime Shows of All
 *  Time" becomes "Best Crime Shows", "Drama Shows on Netflix, Ranked" becomes
 *  "Best Drama Shows on Netflix", "The Best Shows on Netflix Right Now" becomes
 *  "Best Shows on Netflix". */
export function listLabel(p: Pick<Placement, "title" | "kind">): string {
  let t = p.title
    .trim()
    .replace(/^the\s+/i, "")
    .replace(/,\s*ranked$/i, "")
    .replace(/\s+of all time$/i, "")
    .replace(/\s+right now$/i, "")
    .trim();
  if (p.kind === "genre-service" && !/^best\s/i.test(t)) t = `Best ${t}`;
  return t;
}
