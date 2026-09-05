// Share text builders, one per game, Wordle-convention: a result line that
// opens with the game's glyph and the day number, a square grid, then the
// game's URL. Every game shares the same shape so two friends can tell at a
// glance that they played the same board.

import { GAMES } from "./games";
import type { GameSlug } from "./types";

/** The leading glyph per game. The emoji palette is the game's identity in
 *  a group chat, the way Framed leads with a camera. */
export const SHARE_GLYPH: Record<GameSlug, string> = {
  balasaurdle: "🎬",
  "poster-reveal": "🖼️",
  "quote-match": "💬",
  taglines: "🎞️",
  "casting-call": "🎭",
  "link-up": "🔗",
  timeline: "📅",
  screening: "🎟️",
  emoji: "🍿",
  "speed-sort": "⏱️",
  "sequel-or-fake": "🎲",
};

export const SQUARE = {
  right: "🟩",
  wrong: "🟥",
  unused: "⬛",
  over: "🟨",
} as const;

/** One square per result in order, then unused squares up to the board size. */
export function squares(results: boolean[], total: number = results.length): string {
  const row = results.map((r) => (r ? SQUARE.right : SQUARE.wrong)).join("");
  return row + SQUARE.unused.repeat(Math.max(0, total - results.length));
}

/** Green square per hit, red per miss, in a fixed-size board with no order. */
function boardSquares(hits: number, total: number): string {
  return SQUARE.right.repeat(hits) + SQUARE.wrong.repeat(total - hits);
}

/** Open-ended runs: up to ten squares, then a plain count. Zero is one red. */
function countSquares(n: number): string {
  if (n <= 0) return SQUARE.wrong;
  return SQUARE.right.repeat(Math.min(n, 10)) + (n > 10 ? ` +${n - 10}` : "");
}

/** Guess-count games: reds for the misses, one green on the solve, unused
 *  squares to six so the grid shows how much room was left. */
function guessSquares(guesses: number, won: boolean, max = 6): string {
  if (!won) return SQUARE.wrong.repeat(max);
  return SQUARE.wrong.repeat(guesses - 1) + SQUARE.right + SQUARE.unused.repeat(max - guesses);
}

function build(slug: GameSlug, day: number, result: string, grid: string): string {
  return `${SHARE_GLYPH[slug]} ${GAMES[slug].name} #${day} ${result}\n${grid}\nbalasaur.com${GAMES[slug].path}`;
}

export function shareBalasaurdle(o: {
  day: number;
  guesses: number;
  won: boolean;
  hints?: number;
}): string {
  const hints = o.hints ?? 0;
  const score = o.won ? `${o.guesses}/6` : "X/6";
  const hintTag = hints > 0 ? ` (${hints} hint${hints === 1 ? "" : "s"})` : "";
  return build("balasaurdle", o.day, `${score}${hintTag}`, guessSquares(o.guesses, o.won));
}

export function sharePosterReveal(o: { day: number; guesses: number; won: boolean }): string {
  const score = o.won ? `${o.guesses}/6` : "X/6";
  return build("poster-reveal", o.day, score, guessSquares(o.guesses, o.won));
}

export function shareQuoteMatch(o: { day: number; matches: number; clean: boolean }): string {
  const cleanTag = o.matches === 5 && o.clean ? " clean" : "";
  return build("quote-match", o.day, `${o.matches}/5${cleanTag}`, boardSquares(o.matches, 5));
}

export function shareTaglines(o: { day: number; matches: number; clean: boolean }): string {
  const cleanTag = o.matches === 5 && o.clean ? " clean" : "";
  return build("taglines", o.day, `${o.matches}/5${cleanTag}`, boardSquares(o.matches, 5));
}

/** One square per round in order, so a miss shows where it happened. */
export function shareCastingCall(o: { day: number; results: boolean[] }): string {
  const right = o.results.filter(Boolean).length;
  return build("casting-call", o.day, `${right}/${o.results.length}`, squares(o.results));
}

export function shareLinkUp(o: {
  day: number;
  solved: boolean;
  steps: number;
  par: number;
}): string {
  if (!o.solved) return build("link-up", o.day, `X, par ${o.par}`, SQUARE.wrong);
  const grid =
    SQUARE.right.repeat(Math.min(o.steps, o.par)) +
    SQUARE.over.repeat(Math.max(0, o.steps - o.par));
  return build("link-up", o.day, `done in ${o.steps}, par ${o.par}`, grid);
}

export function shareTimeline(o: { day: number; slots: boolean[] }): string {
  const right = o.slots.filter(Boolean).length;
  return build("timeline", o.day, `${right}/5`, squares(o.slots, 5));
}

export function shareScreening(o: { day: number; answers: boolean[] }): string {
  const right = o.answers.filter(Boolean).length;
  return build("screening", o.day, `${right}/10`, squares(o.answers, 10));
}

export function shareEmoji(o: { day: number; results: boolean[] }): string {
  const solved = o.results.filter(Boolean).length;
  return build("emoji", o.day, `${solved}/${o.results.length}`, squares(o.results));
}

export function shareSpeedSort(o: { day: number; sorted: number; missed: number }): string {
  const missTag = o.missed > 0 ? `, ${o.missed} missed` : "";
  return build("speed-sort", o.day, `${o.sorted} in 60s${missTag}`, countSquares(o.sorted));
}

/** One square per call in order, ten calls a day. */
export function shareSequelOrFake(o: { day: number; results: boolean[] }): string {
  const right = o.results.filter(Boolean).length;
  return build("sequel-or-fake", o.day, `${right}/${o.results.length}`, squares(o.results));
}
