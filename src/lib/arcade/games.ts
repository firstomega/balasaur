// The arcade registry. The hub, the routes, the share builders, the sitemap,
// and the profile bests all read this one table so they cannot disagree.

import type { CSSProperties } from "react";
import type { ArcadeHue, GameDef, GameSlug } from "./types";

const LAUNCHED = "2026-09-04";

export const GAMES: Record<GameSlug, GameDef> = {
  balasaurdle: {
    slug: "balasaurdle",
    name: "Balasaurdle",
    path: "/play/balasaurdle",
    hue: "blue",
    hook: "Six clues. How few do you need?",
    rule: "One title a day. Six clues, one at a time. Guess it in as few as you can.",
    payoutRule: "Solve early for up to 12 comets. Hints cost 2 each.",
    minutes: "2 min",
    launched: LAUNCHED,
    daily: true,
    enabled: true,
  },
  "poster-reveal": {
    slug: "poster-reveal",
    name: "Poster Reveal",
    path: "/play/poster-reveal",
    hue: "ice",
    hook: "Name it before it comes into focus.",
    rule: "The poster starts blurred. Every wrong guess sharpens it. Six guesses.",
    payoutRule: "Solve early for up to 12 comets.",
    minutes: "1 min",
    launched: LAUNCHED,
    daily: true,
    enabled: true,
  },
  "quote-match": {
    slug: "quote-match",
    name: "Quote Match",
    path: "/play/quote-match",
    hue: "crimson",
    hook: "You have said these lines out loud. Prove you know where from.",
    rule: "Five lines, five posters. Tap a line, then the movie that said it.",
    payoutRule: "2 comets a match, 5 more for a clean board.",
    minutes: "2 min",
    launched: LAUNCHED,
    daily: true,
    enabled: true,
  },
  taglines: {
    slug: "taglines",
    name: "Tagline Roulette",
    path: "/play/taglines",
    hue: "magenta",
    hook: "Every poster had a tagline. Match all five.",
    rule: "Five taglines, five posters. Tap a tagline, then its poster.",
    payoutRule: "2 comets a match, 5 more for a clean board.",
    minutes: "2 min",
    launched: LAUNCHED,
    daily: true,
    enabled: true,
  },
  "casting-call": {
    slug: "casting-call",
    name: "Casting Call",
    path: "/play/casting-call",
    hue: "gold",
    hook: "Three were in it. One never was. Five seconds.",
    rule: "Four actors, one movie. Tap the one who was never in it before the clock runs out.",
    payoutRule: "2 comets for every right call.",
    minutes: "1 min",
    launched: LAUNCHED,
    daily: true,
    enabled: true,
  },
  "link-up": {
    slug: "link-up",
    name: "Link Up",
    path: "/play/link-up",
    hue: "teal",
    hook: "Two actors, three movies. Find the chain.",
    rule: "Pick the movies that connect the first actor to the second. Fewer picks, better run.",
    payoutRule: "8 comets for completing the chain.",
    minutes: "2 min",
    launched: LAUNCHED,
    daily: true,
    enabled: true,
  },
  timeline: {
    slug: "timeline",
    name: "Timeline",
    path: "/play/timeline",
    hue: "violet",
    hook: "Was Shrek before Monsters, Inc.? Everyone is sure. Everyone is wrong.",
    rule: "Drag five titles into release order, then lock it in.",
    payoutRule: "2 comets a right slot, 5 more for a perfect order.",
    minutes: "1 min",
    launched: LAUNCHED,
    daily: true,
    enabled: true,
  },
  screening: {
    slug: "screening",
    name: "The 8PM Screening",
    path: "/play/screening",
    hue: "ruby",
    hook: "Ten questions. Same ten for everyone. One board.",
    rule: "Ten questions, twenty seconds each. One set a day, the same for everyone.",
    payoutRule: "3 comets a right answer, 10 more for a perfect ten.",
    minutes: "5 min",
    launched: LAUNCHED,
    daily: true,
    enabled: true,
  },
  emoji: {
    slug: "emoji",
    name: "Emoji Plots",
    path: "/play/emoji",
    hue: "sun",
    hook: "A whole movie in four emoji. Name it.",
    rule: "Five plots told in emoji. Name each title in three guesses.",
    payoutRule: "2 comets a solved plot, 1 more when the first guess lands.",
    minutes: "2 min",
    launched: LAUNCHED,
    daily: true,
    enabled: true,
  },
  "speed-sort": {
    slug: "speed-sort",
    name: "Speed Sort",
    path: "/play/speed-sort",
    hue: "lime",
    hook: "Sixty seconds. Two bins. Your thumb versus the catalog.",
    rule: "Sixty seconds. Swipe each title into the right bin.",
    payoutRule: "1 comet a right sort, 5 more for a clean minute.",
    minutes: "1 min",
    launched: LAUNCHED,
    daily: true,
    enabled: true,
  },
  "sequel-or-fake": {
    slug: "sequel-or-fake",
    name: "Sequel or Fake",
    path: "/play/sequel-or-fake",
    hue: "orange",
    hook: "Titanic II is real. Which of these are not?",
    rule: "Ten sequel titles. Call each one real or fake.",
    payoutRule: "1 comet a right call, 5 more at a streak of ten.",
    minutes: "1 min",
    launched: LAUNCHED,
    daily: true,
    enabled: true,
  },
};

/** The hub in reading order. Tonight gets hero tiles; the rest are regular.
 *  Tiles sort unplayed-first after mount within each section. */
export const HUB_SECTIONS: { title: string; slugs: GameSlug[] }[] = [
  { title: "Tonight", slugs: ["balasaurdle", "poster-reveal", "screening"] },
  { title: "Quick rounds", slugs: ["speed-sort", "casting-call", "emoji", "sequel-or-fake"] },
  { title: "Pair and order", slugs: ["link-up", "quote-match", "taglines", "timeline"] },
];

/** The hook as it fits on a hub or rail tile: two lines at 13px in a
 *  138px column, no ellipsis. Games missing here use the registry hook
 *  unchanged; the game pages always use the registry hook. */
const TILE_HOOKS: Partial<Record<GameSlug, string>> = {
  "quote-match": "You know these lines. Prove it.",
  "casting-call": "Three were in it. One never was.",
  timeline: "Which came first? Everyone is wrong.",
  "speed-sort": "Sixty seconds. Two bins. Go.",
  "sequel-or-fake": "Titanic II is real. Which are not?",
};

export function tileHook(game: GameDef): string {
  return TILE_HOOKS[game.slug] ?? game.hook;
}

/** Flat hub order, derived from the sections so the two cannot disagree.
 *  Profiles and the leaderboard read this. */
export const HUB_ORDER: GameSlug[] = HUB_SECTIONS.flatMap((s) => s.slugs);

/** Enabled games in hub order. Drives the hub grid and the sitemap so the
 *  two can never disagree. */
export const ENABLED_SLUGS: GameSlug[] = HUB_ORDER.filter((slug) => GAMES[slug].enabled);

/** Hex per hue, mirroring src/styles.css. Only for surfaces that cannot read
 *  CSS variables: the canvas share card and the OG image script. */
export const HUE_HEX: Record<ArcadeHue, string> = {
  blue: "#3b82f6",
  ice: "#22d3ee",
  crimson: "#ef4444",
  magenta: "#e879f9",
  gold: "#f5b82e",
  teal: "#2dd4bf",
  violet: "#a78bfa",
  ruby: "#f43f5e",
  sun: "#fde047",
  lime: "#a3e635",
  orange: "#fb923c",
};

/** Readable text on the hue, mirroring --hue-<name>-ink. */
export const HUE_INK: Record<ArcadeHue, string> = {
  blue: "#ffffff",
  ice: "#0b0d10",
  crimson: "#ffffff",
  magenta: "#ffffff",
  gold: "#0b0d10",
  teal: "#ffffff",
  violet: "#ffffff",
  ruby: "#ffffff",
  sun: "#0b0d10",
  lime: "#0b0d10",
  orange: "#ffffff",
};

/** The style object a game root (or hub tile) sets so everything beneath
 *  can paint with var(--game) and var(--game-ink) and never name a hue. */
export function hueVars(slug: GameSlug): CSSProperties {
  const hue = GAMES[slug].hue;
  return {
    "--game": `var(--hue-${hue})`,
    "--game-ink": `var(--hue-${hue}-ink)`,
  } as CSSProperties;
}

export const NEW_RIBBON_DAYS = 14;

/** At most this many tiles wear the ribbon at once, in hub order. */
export const NEW_RIBBON_CAP = 3;

function withinRibbonWindow(game: GameDef, now: number): boolean {
  const launched = Date.parse(game.launched);
  if (Number.isNaN(launched)) return false;
  const age = now - launched;
  return age >= 0 && age < NEW_RIBBON_DAYS * 24 * 60 * 60 * 1000;
}

/** The games that wear the NEW ribbon right now, in hub order, capped. A
 *  ribbon on everything says nothing, so when every enabled game is inside
 *  its window (launch day, or a relaunch) nobody wears one. */
export function newGames(now: number = Date.now()): GameSlug[] {
  const inWindow = ENABLED_SLUGS.filter((slug) => withinRibbonWindow(GAMES[slug], now));
  if (inWindow.length === 0 || inWindow.length === ENABLED_SLUGS.length) return [];
  return inWindow.slice(0, NEW_RIBBON_CAP);
}

/** True while the game is one of the (at most three) games wearing the
 *  ribbon. The ribbon retires itself after 14 days. */
export function isNewGame(game: GameDef, now: number = Date.now()): boolean {
  return newGames(now).includes(game.slug);
}
