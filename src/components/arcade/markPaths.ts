// The eleven game marks as path data on a 24-unit viewBox. One source for
// two renderers: GameMark draws them as inline SVG, shareImage draws them on
// a canvas through Path2D. Stroke-based, 2px at 24px, round caps and joins;
// a path flagged `fill` is painted solid in the same color (the lit slot,
// the bubble dots). Each mark is the game's own board shape.

import type { GameSlug } from "@/lib/arcade/types";

export interface MarkPath {
  d: string;
  fill?: boolean;
}

export const MARK_VIEWBOX = 24;

export const MARK_PATHS: Record<GameSlug, MarkPath[]> = {
  // Six clue slots in two columns, reading order, the last one filled.
  // Six single-column rows cannot be hollow at 24 units with a 2-unit
  // stroke (each needs 4 units plus a gap), so the slots pair up.
  balasaurdle: [
    { d: "M4.5 5h5.5a1 1 0 0 1 0 2H4.5a1 1 0 0 1 0-2z" },
    { d: "M15.5 5h5.5a1 1 0 0 1 0 2h-5.5a1 1 0 0 1 0-2z" },
    { d: "M4.5 11h5.5a1 1 0 0 1 0 2H4.5a1 1 0 0 1 0-2z" },
    { d: "M15.5 11h5.5a1 1 0 0 1 0 2h-5.5a1 1 0 0 1 0-2z" },
    { d: "M4.5 17h5.5a1 1 0 0 1 0 2H4.5a1 1 0 0 1 0-2z" },
    { d: "M15.5 16h5.5a2 2 0 0 1 0 4h-5.5a2 2 0 0 1 0-4z", fill: true },
  ],
  // A 2:3 frame with a round focus ring and a sharp center dot.
  "poster-reveal": [
    {
      d: "M7 2.5h10a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 7 2.5z",
    },
    { d: "M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z" },
    { d: "M12 10.75a1.25 1.25 0 1 0 0 2.5a1.25 1.25 0 1 0 0-2.5z", fill: true },
  ],
  // Two big closing quote marks.
  "quote-match": [
    { d: "M4 11V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4z" },
    { d: "M4 13c0 3 1.2 5 3.5 6" },
    { d: "M14 11V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4z" },
    { d: "M14 13c0 3 1.2 5 3.5 6" },
  ],
  // A small poster with a speech bubble under it, tail up at the poster.
  taglines: [
    { d: "M8.5 1.5h7a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" },
    {
      d: "M5 18h3l1.5-2 1.5 2H19a2 2 0 0 1 2 2v0.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V20a2 2 0 0 1 2-2z",
    },
  ],
  // A clapperboard, flap open.
  "casting-call": [
    { d: "M3 10h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
    { d: "M3.5 9.5 5 4l15.5 2-1 3.5" },
    { d: "M8.5 4.5 10 8.5" },
    { d: "M13.5 5 15 9" },
  ],
  // Two chain links.
  "link-up": [
    { d: "M9 17H7A5 5 0 0 1 7 7h2" },
    { d: "M15 7h2a5 5 0 1 1 0 10h-2" },
    { d: "M8 12h8" },
  ],
  // A film strip: three frames with a row of sprocket holes above and below.
  timeline: [
    { d: "M3 8h18a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" },
    { d: "M8.67 8v8" },
    { d: "M15.33 8v8" },
    { d: "M3.35 4.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0z", fill: true },
    { d: "M8.35 4.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0z", fill: true },
    { d: "M13.35 4.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0z", fill: true },
    { d: "M18.35 4.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0z", fill: true },
    { d: "M3.35 19.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0z", fill: true },
    { d: "M8.35 19.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0z", fill: true },
    { d: "M13.35 19.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0z", fill: true },
    { d: "M18.35 19.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0z", fill: true },
  ],
  // A ticket stub with its tear line.
  screening: [
    {
      d: "M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4z",
    },
    { d: "M15 7.5v1.5" },
    { d: "M15 11.2v1.6" },
    { d: "M15 15v1.5" },
  ],
  // A speech bubble with three dots.
  emoji: [
    {
      d: "M4 4.5h16A1.5 1.5 0 0 1 21.5 6v9a1.5 1.5 0 0 1-1.5 1.5h-8L7.5 20.5v-4H4A1.5 1.5 0 0 1 2.5 15V6A1.5 1.5 0 0 1 4 4.5z",
    },
    { d: "M8 9.3a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 1 0 0-2.4z", fill: true },
    { d: "M12 9.3a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 1 0 0-2.4z", fill: true },
    { d: "M16 9.3a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 1 0 0-2.4z", fill: true },
  ],
  // A stopwatch.
  "speed-sort": [
    { d: "M12 7a7 7 0 1 0 0 14a7 7 0 1 0 0-14z" },
    { d: "M12 7V4" },
    { d: "M10 3h4" },
    { d: "M12 14l3-3" },
    { d: "M18.5 6.5 20 5" },
  ],
  // A card stamped with a roman two.
  "sequel-or-fake": [
    { d: "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" },
    { d: "M9.5 8v8" },
    { d: "M14.5 8v8" },
    { d: "M8 8h3" },
    { d: "M8 16h3" },
    { d: "M13 8h3" },
    { d: "M13 16h3" },
  ],
};
