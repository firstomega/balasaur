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

/** Kinds whose slug names one genre: best-crime-shows,
 *  best-crime-shows-on-netflix, best-korean-crime-shows. */
const GENRE_KINDS = new Set(["genre-service", "origin-genre", "genre"]);

/** The genre part of a genre list's slug ("crime-shows"), or null. */
function genreKey(p: Placement): string | null {
  if (!GENRE_KINDS.has(p.kind)) return null;
  return p.slug.replace(/^best-/, "").replace(/-on-[a-z0-9-]+$/, "");
}

/** Whether `p` names a genre a picked list already named: "#1 on Best Crime
 *  Shows on Netflix" then "#1 on Best Crime Shows" says crime twice. An origin
 *  list ends with its genre ("korean-crime-shows"), so the test is a suffix. */
function restatesGenre(p: Placement, picked: Placement[]): boolean {
  const k = genreKey(p);
  if (!k) return false;
  return picked.some((q) => {
    const j = genreKey(q);
    return !!j && (j === k || j.endsWith(`-${k}`) || k.endsWith(`-${j}`));
  });
}

/** Up to RANKS_ON_MAX placements, most specific kind first. One list per kind,
 *  and no genre named twice, before a second of any kind, so Breaking Bad
 *  reads Netflix crime, all-time drama, 2008 rather than three Netflix lists
 *  or crime on Netflix followed by crime again. */
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
    if (kinds.has(p.kind) || restatesGenre(p, picked)) continue;
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
