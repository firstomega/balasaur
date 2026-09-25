// The pure half of the person-page catalog join: given the catalog rows for a
// person's credits, decide what the page ranks and what it claims.
//
// Separate from media.server.ts so it can be tested without a database client.
// Everything here is a pure function of the rows passed in, which is also what
// makes the page's numbers checkable: the rows are the cards the page renders.

import type { MediaPerson, PersonCatalog } from "@/types/media";

/** The fields the ranking and the claims are computed from. The catalog row
 *  carries more than this; nothing else is consulted. */
export interface PersonCreditFacts {
  rating_balasaur: number | null;
  release_date: string | null;
  year: string | null;
  popularity: number | null;
  people: unknown;
}

/** A ranked set drawn from six titles is that person's whole filmography in a
 *  different order, which tells a reader nothing. Counted over scored titles
 *  they are billed on, which is the pool the ranking is drawn from. Below this
 *  the page shows no ranking at all rather than a weak one. */
export const PERSON_TOP_MIN_LED = 8;
export const PERSON_TOP_SIZE = 6;

/** A decade needs this many titles before its median is worth printing. */
const PERSON_DECADE_MIN_TITLES = 3;

/** Two people who worked together twice are a coincidence. */
const PERSON_COLLAB_MIN = 3;
const PERSON_COLLAB_SIZE = 3;

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

function namesOn(row: PersonCreditFacts): string[] {
  const people = Array.isArray(row.people) ? (row.people as MediaPerson[]) : [];
  return people.map((p) => (typeof p?.name === "string" ? p.name : "")).filter(Boolean);
}

/**
 * Whether this person is one of the names the catalog stores for the title.
 * `media.people` holds the directors and the top six cast, so a hit means a
 * leading or directing credit rather than a walk-on.
 *
 * It is a name match, so it errs by dropping a lead whose name is spelled
 * differently in that row. That is the safe direction: a dropped title is
 * still on the page in the filmography, where nothing is filtered.
 */
export function isBilledOn(row: PersonCreditFacts, name: string): boolean {
  const target = name.toLowerCase();
  return namesOn(row).some((n) => n.toLowerCase() === target);
}

/** The decade with the highest median. Nothing when no decade carries enough
 *  titles for a median to mean anything. */
export function bestDecadeOf(
  rows: PersonCreditFacts[],
): Pick<PersonCatalog, "bestDecade" | "bestDecadeMedian" | "bestDecadeTitles"> {
  const byDecade = new Map<string, number[]>();
  for (const r of rows) {
    if (typeof r.rating_balasaur !== "number") continue;
    const d = decadeOf(r);
    if (!d) continue;
    const list = byDecade.get(d);
    if (list) list.push(r.rating_balasaur);
    else byDecade.set(d, [r.rating_balasaur]);
  }
  let best: { decade: string; med: number; titles: number } | undefined;
  for (const [decade, scores] of byDecade) {
    if (scores.length < PERSON_DECADE_MIN_TITLES) continue;
    const med = median(scores);
    if (med === undefined) continue;
    if (!best || med > best.med) best = { decade, med, titles: scores.length };
  }
  if (!best) return {};
  return { bestDecade: best.decade, bestDecadeMedian: best.med, bestDecadeTitles: best.titles };
}

/** Who this person keeps turning up with, counted across the rows given.
 *  `media.people` holds the directors and the top six cast, so this answers a
 *  question about headline collaborators, not every extra on set. */
export function collaboratorsOf(
  rows: PersonCreditFacts[],
  selfName: string,
): PersonCatalog["collaborators"] {
  const counts = new Map<string, number>();
  const self = selfName.toLowerCase();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const name of namesOn(r)) {
      if (name.toLowerCase() === self) continue;
      if (seen.has(name)) continue; // one title counts once per collaborator
      seen.add(name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, together]) => together >= PERSON_COLLAB_MIN)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, PERSON_COLLAB_SIZE)
    .map(([name, together]) => ({ name, together }));
}

/**
 * The rows the page ranks, best first, or an empty list when the pool is too
 * small for an order to carry a claim.
 *
 * Ranking every credit by score alone puts the one great film a person had two
 * minutes in above the work they carried, which reads as broken to anyone who
 * knows the filmography, so the pool is titles they are billed on. Popularity
 * only breaks ties, where the scores are equal and the order claims nothing
 * either way.
 */
export function pickTopCredits<T extends PersonCreditFacts>(rows: T[], name: string): T[] {
  const led = rows.filter((r) => typeof r.rating_balasaur === "number" && isBilledOn(r, name));
  if (led.length < PERSON_TOP_MIN_LED) return [];
  return [...led]
    .sort(
      (a, b) =>
        (b.rating_balasaur ?? 0) - (a.rating_balasaur ?? 0) ||
        (b.popularity ?? 0) - (a.popularity ?? 0),
    )
    .slice(0, PERSON_TOP_SIZE);
}
