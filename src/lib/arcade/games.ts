// The arcade registry. The hub, the routes, the share builders, the sitemap,
// and the profile bests all read this one table so they cannot disagree.

import type { GameDef, GameSlug } from "./types";

export const GAMES: Record<GameSlug, GameDef> = {
  balasaurdle: {
    slug: "balasaurdle",
    name: "Balasaurdle",
    tagline: "Six clues, one title, a new game every day.",
    payoutRule: "Solve early for up to 12 comets. Hints cost 2 each.",
    daily: true,
    enabled: true,
    path: "/play/balasaurdle",
  },
  "quote-match": {
    slug: "quote-match",
    name: "Quote Match",
    tagline: "Five lines of dialogue, five movies. Pair them.",
    payoutRule: "2 comets a match, 5 more for a clean board.",
    daily: true,
    enabled: true,
    path: "/play/quote-match",
  },
  taglines: {
    slug: "taglines",
    name: "Tagline Roulette",
    tagline: "Five taglines, five posters. Pair them.",
    payoutRule: "2 comets a match, 5 more for a clean board.",
    daily: true,
    enabled: true,
    path: "/play/taglines",
  },
  "casting-call": {
    slug: "casting-call",
    name: "Casting Call",
    tagline: "Four actors. One was never in the movie.",
    payoutRule: "2 comets for every right call.",
    daily: true,
    enabled: true,
    path: "/play/casting-call",
  },
  "link-up": {
    slug: "link-up",
    name: "Link Up",
    tagline: "Connect two actors through the movies they share.",
    payoutRule: "8 comets for completing the chain.",
    daily: true,
    enabled: true,
    path: "/play/link-up",
  },
  timeline: {
    slug: "timeline",
    name: "Timeline",
    tagline: "Five titles. Put them in release order.",
    payoutRule: "2 comets a right slot, 5 more for a perfect order.",
    daily: true,
    enabled: true,
    path: "/play/timeline",
  },
  screening: {
    slug: "screening",
    name: "The 8PM Screening",
    tagline: "Ten questions, one shared board, doors at 8PM Eastern.",
    payoutRule: "3 comets a right answer, 10 more for a perfect ten.",
    daily: true,
    enabled: true,
    path: "/play/screening",
  },
  emoji: {
    slug: "emoji",
    name: "Emoji Plots",
    tagline: "A plot told in emoji. Name the title.",
    payoutRule: "2 comets a solved plot, 1 more when the first guess lands.",
    daily: true,
    enabled: true,
    path: "/play/emoji",
  },
  "speed-sort": {
    slug: "speed-sort",
    name: "Speed Sort",
    tagline: "Sixty seconds, two bins. Sort as many titles as you can.",
    payoutRule: "1 comet a right sort, 5 more for a clean minute.",
    daily: true,
    enabled: true,
    path: "/play/speed-sort",
  },
  "sequel-or-fake": {
    slug: "sequel-or-fake",
    name: "Sequel or Fake",
    tagline: "Ten sequel titles. Half are real, half are made up.",
    payoutRule: "1 comet a right call, 5 more at a streak of ten.",
    daily: true,
    enabled: true,
    path: "/play/sequel-or-fake",
  },
  "poster-reveal": {
    slug: "poster-reveal",
    name: "Poster Reveal",
    tagline: "The daily poster starts blurred. Name it while it sharpens.",
    payoutRule: "Solve early for up to 12 comets.",
    daily: true,
    enabled: true,
    path: "/play/poster-reveal",
  },
};

/** Hub tile order: the daily games lead, the rest follow. */
export const HUB_ORDER: GameSlug[] = [
  "balasaurdle",
  "screening",
  "poster-reveal",
  "speed-sort",
  "taglines",
  "quote-match",
  "casting-call",
  "timeline",
  "link-up",
  "emoji",
  "sequel-or-fake",
];

/** Enabled games in hub order. Drives the hub grid and the sitemap so the
 *  two can never disagree. */
export const ENABLED_SLUGS: GameSlug[] = HUB_ORDER.filter((slug) => GAMES[slug].enabled);
