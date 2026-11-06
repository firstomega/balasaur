import type { SwatchKey } from "./posterSwatch";

/**
 * A swatch at 13% over the white ground, for a row whose text stays ink. That
 * strength is the one src/lib/palette.test.ts holds ink and muted ink to 4.5:1
 * on. Written out in full so Tailwind finds every class.
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

/** The light tint of a swatch, or the paper wash when there is none yet. */
export function swatchTint(key: SwatchKey | null | undefined): string {
  return (key && TINT[key]) || "bg-panel";
}
