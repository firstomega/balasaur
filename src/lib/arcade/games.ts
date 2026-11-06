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
    hook: "One title a day, guessed from six clues.",
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
    hook: "A poster that sharpens with each miss.",
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
    hook: "Five quotes matched to five movies.",
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
    hook: "Five taglines matched to five posters.",
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
    hook: "Four actors, one never in the movie.",
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
    hook: "Two actors linked through shared movies.",
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
    hook: "Five titles sorted into release order.",
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
    hook: "Ten questions, twenty seconds each.",
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
    hook: "Five movie plots told in emoji.",
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
    hook: "Titles sorted into two bins in a minute.",
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
    hook: "Ten sequel titles, some real, some fake.",
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

/** The longest hook a tile shows whole: two lines at 13px in the narrowest
 *  tile. Every hook is a plain line of what the game is, and the hub tile, the
 *  More games rail and the game page all show the same one. */
export const TILE_HOOK_MAX = 40;

/** Games scored by how many guesses the solve took rather than by a
 *  fraction of a board. Their tier is the count itself. */
export const GUESS_COUNT_GAMES: ReadonlySet<GameSlug> = new Set(["balasaurdle", "poster-reveal"]);

/** One tier vocabulary for every end screen, so 8 of 10 is the same word on
 *  every game. `ratio` is right over possible, 0 to 1: matches of five,
 *  questions of ten, slots of five, right sorts of cards seen. Guess-count
 *  games pass the solve's guess count instead and get "Solved in N"; without
 *  a count they fall through to the ladder. Callers decide whether a losing
 *  run shows a tier at all. */
export function tierFor(slug: GameSlug, ratio: number, guesses?: number): string {
  if (GUESS_COUNT_GAMES.has(slug) && typeof guesses === "number" && guesses >= 1) {
    return `Solved in ${Math.round(guesses)}`;
  }
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) + 1e-9 : 0;
  if (r >= 1) return "Perfect";
  if (r >= 0.8) return "Sharp";
  if (r >= 0.6) return "Solid";
  if (r >= 0.4) return "Close";
  return "Rough";
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

/** Readable text on the hue, mirroring --hue-<name>-ink. Every hue takes the
 *  dark ink: white measured 1.86 (teal) to 3.76 (crimson) on the seven hues
 *  that used it, and src/lib/palette.test.ts holds each pair at 4.5:1. */
export const HUE_INK: Record<ArcadeHue, string> = {
  blue: "#0b0d10",
  ice: "#0b0d10",
  crimson: "#0b0d10",
  magenta: "#0b0d10",
  gold: "#0b0d10",
  teal: "#0b0d10",
  violet: "#0b0d10",
  ruby: "#0b0d10",
  sun: "#0b0d10",
  lime: "#0b0d10",
  orange: "#0b0d10",
};

/** How much of the hue survives in --game-text, the rest being ink. Most
 *  hues measure 1.3 to 3.8 against white, so a label in the raw hue is
 *  unreadable on the light ground; 40 percent keeps the hue's identity and
 *  measures at least 5.4 on paper, the wash and a 16 percent hue tint
 *  (games.test.ts holds every hue to 4.5). */
export const GAME_TEXT_HUE_PCT = 40;

/** The style object a game root (or hub tile) sets so everything beneath
 *  can paint with var(--game), var(--game-ink) and var(--game-text) and never
 *  name a hue. --game fills a surface, --game-ink is text on that fill, and
 *  --game-text is the hue as text on the page ground. */
export function hueVars(slug: GameSlug): CSSProperties {
  const hue = GAMES[slug].hue;
  return {
    "--game": `var(--hue-${hue})`,
    "--game-ink": `var(--hue-${hue}-ink)`,
    "--game-text": `color-mix(in srgb, var(--hue-${hue}) ${GAME_TEXT_HUE_PCT}%, var(--ink))`,
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
