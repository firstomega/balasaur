import type { SwatchKey } from "./posterSwatch";

/**
 * Tailwind classes that paint a surface in a swatch: its fill and its ink.
 * Written out in full so Tailwind finds every class in the source. The pairs
 * are the ones src/lib/palette.test.ts holds to 4.5:1.
 */
const SURFACE: Record<SwatchKey, string> = {
  red: "bg-swatch-red text-swatch-red-ink",
  orange: "bg-swatch-orange text-swatch-orange-ink",
  gold: "bg-swatch-gold text-swatch-gold-ink",
  lime: "bg-swatch-lime text-swatch-lime-ink",
  green: "bg-swatch-green text-swatch-green-ink",
  teal: "bg-swatch-teal text-swatch-teal-ink",
  sky: "bg-swatch-sky text-swatch-sky-ink",
  blue: "bg-swatch-blue text-swatch-blue-ink",
  violet: "bg-swatch-violet text-swatch-violet-ink",
  pink: "bg-swatch-pink text-swatch-pink-ink",
  wine: "bg-swatch-wine text-swatch-wine-ink",
  rust: "bg-swatch-rust text-swatch-rust-ink",
  navy: "bg-swatch-navy text-swatch-navy-ink",
  noir: "bg-swatch-noir text-swatch-noir-ink",
};

/** The neutral paper tile: a title or list with no swatch yet. Same layout, the
 *  wash surface and ink text, so a missing colour never reads as broken. */
export const PAPER_SURFACE = "bg-panel text-text-bright";

export function swatchSurface(key: SwatchKey | null | undefined): string {
  return (key && SURFACE[key]) || PAPER_SURFACE;
}

/**
 * A light row in a swatch: the fill at 13% over the white ground, the strength
 * src/lib/palette.test.ts holds ink and muted ink to 4.5:1 on. Written out in
 * full so Tailwind finds every class. No swatch is the wash.
 */
const TINT: Record<SwatchKey, string> = {
  red: "bg-swatch-red/13",
  orange: "bg-swatch-orange/13",
  gold: "bg-swatch-gold/13",
  lime: "bg-swatch-lime/13",
  green: "bg-swatch-green/13",
  teal: "bg-swatch-teal/13",
  sky: "bg-swatch-sky/13",
  blue: "bg-swatch-blue/13",
  violet: "bg-swatch-violet/13",
  pink: "bg-swatch-pink/13",
  wine: "bg-swatch-wine/13",
  rust: "bg-swatch-rust/13",
  navy: "bg-swatch-navy/13",
  noir: "bg-swatch-noir/13",
};

export function swatchTint(key: SwatchKey | null | undefined): string {
  return (key && TINT[key]) || "bg-panel";
}
