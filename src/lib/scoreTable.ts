// The per-source table on a title page: each source's own rating in its own
// units, and the share of the Balasaur Score it carries.
//
// A table, not bars. Bars put IMDb x10, a Rotten Tomatoes percentage (a share
// of positive reviews, not a rating), Metacritic and TMDB x10 on one visual
// scale, and the longest bar against the shortest is the critics-against-
// audiences comparison the site does not make. Four labelled values side by
// side answer "where does 84 come from" and nothing else.

import { computeBalasaurScore } from "./score";

/** The blend's weights, as src/lib/score.ts applies them. scoreTable.test.ts
 *  proves these reproduce computeBalasaurScore, so the two cannot drift. */
const WEIGHT = { imdb: 0.25, rottenTomatoes: 0.125, metacritic: 0.125, tmdb: 0.1 } as const;

export interface SourceRatings {
  imdb?: number;
  rottenTomatoes?: number;
  metacritic?: number;
  tmdb?: number;
}

export interface SourceRow {
  key: keyof SourceRatings;
  label: string;
  /** The rating as the source prints it: "8.8/10", "86%", "74/100". */
  shown: string;
  /** Whole-percent share of the Balasaur Score, or null when the table does
   *  not show shares. */
  share: number | null;
}

const ORDER: { key: keyof SourceRatings; label: string; shown: (n: number) => string }[] = [
  { key: "imdb", label: "IMDb", shown: (n) => `${n.toFixed(1)}/10` },
  { key: "rottenTomatoes", label: "Rotten Tomatoes", shown: (n) => `${Math.round(n)}%` },
  { key: "metacritic", label: "Metacritic", shown: (n) => `${Math.round(n)}/100` },
  { key: "tmdb", label: "TMDB", shown: (n) => `${n.toFixed(1)}/10` },
];

/** Whole percents that sum to exactly 100 (largest remainder), so the column
 *  adds up on screen. */
function wholeShares(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (w / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((e, i) => [e - Math.floor(e), i] as const)
    .sort((a, b) => b[0] - a[0]);
  for (const [, i] of byRemainder) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/**
 * One row per source the title has, in a fixed order.
 *
 * Shares are shown only when the score on the page is the blend of exactly
 * these rows: a score the trust rule hides, or one that does not match the
 * rows (a stored score from another input), gets the ratings without a share
 * column rather than a column that does not add up.
 */
export function sourceRows(r: SourceRatings, score: number | undefined): SourceRow[] {
  const present = ORDER.filter((o) => typeof r[o.key] === "number");
  const blend = computeBalasaurScore({
    imdb: r.imdb,
    rottenTomatoes: r.rottenTomatoes,
    metacritic: r.metacritic,
    tmdb: r.tmdb,
  });
  const withShares = typeof score === "number" && present.length >= 2 && blend === score;
  const shares = withShares ? wholeShares(present.map((o) => WEIGHT[o.key])) : null;
  return present.map((o, i) => ({
    key: o.key,
    label: o.label,
    shown: o.shown(r[o.key] as number),
    share: shares ? shares[i] : null,
  }));
}

/** Exposed for the test that pins WEIGHT to the blend. */
export const BLEND_WEIGHTS = WEIGHT;
