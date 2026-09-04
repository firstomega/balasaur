// Share text builders, one per game, Wordle-convention like shareText in
// src/lib/daily.ts: a result line, an emoji grid line, then the game's URL.
// Balasaurdle's own builder stays in daily.ts; it is not duplicated here.

import { GAMES } from "./games";
import type { GameSlug } from "./types";

function urlLine(slug: GameSlug): string {
  return `balasaur.com${GAMES[slug].path}`;
}

/** Green square per hit, red per miss, in a fixed-size board. */
function boardSquares(hits: number, total: number): string {
  return "🟩".repeat(hits) + "🟥".repeat(total - hits);
}

/** Green square per result in order. */
function orderedSquares(results: boolean[]): string {
  return results.map((r) => (r ? "🟩" : "🟥")).join("");
}

/** Open-ended runs: up to ten squares, then a plain count. Zero is one red. */
function streakSquares(n: number): string {
  if (n <= 0) return "🟥";
  return "🟩".repeat(Math.min(n, 10)) + (n > 10 ? ` +${n - 10}` : "");
}

export function shareTaglines(o: { matches: number; clean: boolean }): string {
  const cleanTag = o.matches === 5 && o.clean ? " clean" : "";
  return `Tagline Roulette ${o.matches}/5${cleanTag}\n${boardSquares(o.matches, 5)}\n${urlLine("taglines")}`;
}

export function shareQuoteMatch(o: { matches: number; clean: boolean }): string {
  const cleanTag = o.matches === 5 && o.clean ? " clean" : "";
  return `Quote Match ${o.matches}/5${cleanTag}\n${boardSquares(o.matches, 5)}\n${urlLine("quote-match")}`;
}

export function shareCastingCall(o: { streak: number }): string {
  return `Casting Call ${o.streak} right\n${streakSquares(o.streak)}\n${urlLine("casting-call")}`;
}

export function shareLinkUp(o: { solved: boolean; steps: number; par: number }): string {
  if (!o.solved) {
    return `Link Up X, par ${o.par}\n🟥\n${urlLine("link-up")}`;
  }
  const grid = "🟩".repeat(Math.min(o.steps, o.par)) + "🟨".repeat(Math.max(0, o.steps - o.par));
  return `Link Up: done in ${o.steps}, par ${o.par}\n${grid}\n${urlLine("link-up")}`;
}

export function shareTimeline(o: { slots: boolean[] }): string {
  const correct = o.slots.filter(Boolean).length;
  return `Timeline ${correct}/5\n${orderedSquares(o.slots)}\n${urlLine("timeline")}`;
}

export function shareScreening(o: { day: number; answers: boolean[] }): string {
  const correct = o.answers.filter(Boolean).length;
  return `The 8PM Screening #${o.day} ${correct}/10\n${orderedSquares(o.answers)}\n${urlLine("screening")}`;
}

export function shareEmoji(o: { results: boolean[] }): string {
  const solved = o.results.filter(Boolean).length;
  return `Emoji Plots ${solved}/${o.results.length}\n${orderedSquares(o.results)}\n${urlLine("emoji")}`;
}

export function shareSpeedSort(o: { day: number; sorted: number; missed: number }): string {
  const missTag = o.missed > 0 ? `, ${o.missed} missed` : "";
  return `Speed Sort #${o.day} ${o.sorted} in 60s${missTag}\n${streakSquares(o.sorted)}\n${urlLine("speed-sort")}`;
}

export function shareSequelOrFake(o: { streak: number }): string {
  return `Sequel or Fake ${o.streak} straight\n${streakSquares(o.streak)}\n${urlLine("sequel-or-fake")}`;
}

export function sharePosterReveal(o: { day: number; guesses: number; won: boolean }): string {
  const squares = o.won ? "🟥".repeat(o.guesses - 1) + "🟩" : "🟥".repeat(6);
  const score = o.won ? `${o.guesses}/6` : "X/6";
  return `Poster Reveal #${o.day} ${score}\n${squares}\n${urlLine("poster-reveal")}`;
}
