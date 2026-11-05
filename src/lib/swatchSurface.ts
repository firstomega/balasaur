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
