import { decodeJpegBlockAverages, posterColorsFromPixels, type PosterColors } from "./posterColor";
import { posterSwatchFromPixels, type PosterSwatch } from "./posterSwatch";

// The pure half of the nightly poster pass in media.server.ts: one decode of
// the w92 poster gives both the glow colours and the tile swatch, and one row
// patch stores both with their "we looked" stamps.

/** What one read of a poster gives: the glow colours and the tile swatch. */
export interface PosterRead {
  colors: PosterColors | null;
  swatch: PosterSwatch | null;
}

/** Both readings of one poster from a single decode. Both are null when the bytes cannot be read. */
export function readPosterBytes(bytes: Uint8Array): PosterRead {
  const img = decodeJpegBlockAverages(bytes);
  if (!img) return { colors: null, swatch: null };
  return {
    colors: posterColorsFromPixels(img.rgb, img.width, img.height),
    swatch: posterSwatchFromPixels(img.rgb, img.width, img.height),
  };
}

/** The row patch for one read poster. Both stamps are set even when nothing was found. */
export function posterReadPatch(read: PosterRead, at: string) {
  return {
    color_a: read.colors?.colorA ?? null,
    color_b: read.colors?.colorB ?? null,
    color_at: at,
    swatch: read.swatch?.swatch ?? null,
    swatch_alt: read.swatch?.swatchAlt ?? null,
    swatch_at: at,
  };
}
