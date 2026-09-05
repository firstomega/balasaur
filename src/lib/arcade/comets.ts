// Comet payout tables, one pure function per game. Each returns PayoutLine[]
// whose math the end screen renders verbatim (count x per = value), so every
// visible total is reconstructable. The server recomputes payouts from the
// submitted score; these functions are the client-side mirror and the single
// source for guest credit.

import type { PayoutLine } from "./types";

export function totalComets(lines: PayoutLine[]): number {
  return lines.reduce((sum, line) => sum + line.value, 0);
}

/** Guess-count games pay 2 for the solve plus 2 per guess left unused,
 *  never below 2 on a win. When hints would pull the total under the floor,
 *  the floor is the whole story: one "Solved" line worth 2 and no
 *  correction row. A loss pays nothing. */
function guessCountLines(guesses: number, won: boolean, hints: number): PayoutLine[] {
  if (!won) return [];
  const lines: PayoutLine[] = [{ label: "Solved", value: 2 }];
  const spare = Math.max(0, 6 - guesses);
  if (spare > 0) lines.push({ label: "Guesses to spare", count: spare, per: 2, value: spare * 2 });
  if (hints > 0) lines.push({ label: "Hints", count: hints, per: -2, value: hints * -2 });
  if (totalComets(lines) < 2) return [{ label: "Solved", value: 2 }];
  return lines;
}

/** Balasaurdle: (7 - guesses) x 2, minus 2 per hint, floor 2 on a win. */
export function balasaurdlePayout(o: {
  guesses: number;
  won: boolean;
  hints?: number;
}): PayoutLine[] {
  return guessCountLines(o.guesses, o.won, o.hints ?? 0);
}

/** Poster Reveal: same guess-count table as Balasaurdle, no hints. */
export function posterRevealPayout(o: { guesses: number; won: boolean }): PayoutLine[] {
  return guessCountLines(o.guesses, o.won, 0);
}

/** Five-pair match boards: 2 a match, 5 more for a clean board (all five
 *  paired with no wrong commits). */
function matchBoardLines(matches: number, clean: boolean): PayoutLine[] {
  const lines: PayoutLine[] = [{ label: "Matches", count: matches, per: 2, value: matches * 2 }];
  if (matches === 5 && clean) lines.push({ label: "Clean board", value: 5 });
  return lines;
}

export function taglinesPayout(o: { matches: number; clean: boolean }): PayoutLine[] {
  return matchBoardLines(o.matches, o.clean);
}

export function quoteMatchPayout(o: { matches: number; clean: boolean }): PayoutLine[] {
  return matchBoardLines(o.matches, o.clean);
}

/** Casting Call: 2 comets for every right call. */
export function castingCallPayout(o: { correct: number }): PayoutLine[] {
  return [{ label: "Right calls", count: o.correct, per: 2, value: o.correct * 2 }];
}

/** Link Up: 8 flat for completing the chain, at any number of picks.
 *  Unsolved pays nothing. */
export function linkUpPayout(o: { solved: boolean; steps: number; par: number }): PayoutLine[] {
  if (!o.solved) return [];
  return [{ label: "Chain complete", value: 8 }];
}

/** Timeline: 2 a right slot, 5 more when all five land. */
export function timelinePayout(o: { correctSlots: number }): PayoutLine[] {
  const lines: PayoutLine[] = [
    { label: "Right slots", count: o.correctSlots, per: 2, value: o.correctSlots * 2 },
  ];
  if (o.correctSlots === 5) lines.push({ label: "Perfect order", value: 5 });
  return lines;
}

/** The 8PM Screening: 3 a right answer out of 10, 10 more for a perfect ten. */
export function screeningPayout(o: { correct: number }): PayoutLine[] {
  const lines: PayoutLine[] = [
    { label: "Right answers", count: o.correct, per: 3, value: o.correct * 3 },
  ];
  if (o.correct === 10) lines.push({ label: "Perfect ten", value: 10 });
  return lines;
}

/** Emoji Plots: 2 a solved plot, 1 more for each first-guess solve. */
export function emojiPayout(o: { solved: number; firstTry: number }): PayoutLine[] {
  const lines: PayoutLine[] = [
    { label: "Plots solved", count: o.solved, per: 2, value: o.solved * 2 },
  ];
  if (o.firstTry > 0)
    lines.push({ label: "First-guess solves", count: o.firstTry, per: 1, value: o.firstTry });
  return lines;
}

/** Speed Sort: 1 a right sort, 5 more for a clean minute (no misses, at
 *  least one sort). */
export function speedSortPayout(o: { sorted: number; missed: number }): PayoutLine[] {
  const lines: PayoutLine[] = [{ label: "Right sorts", count: o.sorted, per: 1, value: o.sorted }];
  if (o.sorted > 0 && o.missed === 0) lines.push({ label: "Clean minute", value: 5 });
  return lines;
}

/** Sequel or Fake: 1 a right call, 5 more once the streak reaches ten. */
export function sequelOrFakePayout(o: { correct: number; bestStreak: number }): PayoutLine[] {
  const lines: PayoutLine[] = [
    { label: "Right calls", count: o.correct, per: 1, value: o.correct },
  ];
  if (o.bestStreak >= 10) lines.push({ label: "Streak of ten", value: 5 });
  return lines;
}
