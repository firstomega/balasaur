/**
 * The tile colour of a poster: one of fourteen flat swatches, plus a second
 * swatch for when two neighbouring tiles would otherwise share a colour.
 *
 * This file is the single source of truth for the swatch table. The CSS
 * tokens, the components that paint a tile, and the database check
 * constraint on media.swatch / media.swatch_alt all list the same fourteen
 * keys, and SWATCH_KEYS below is the list they are checked against.
 *
 * HOW A POSTER BECOMES A SWATCH. The poster's pixels (or the 8x8 block
 * averages the JPEG decoder in posterColor.ts returns) are binned by hue into
 * 24 bins of 15 degrees. Each pixel votes with its HSL saturation squared,
 * damped as its lightness moves away from the middle, so a poster's one vivid
 * colour beats a large field of muddy skin tone or grey. Near-greys, near-
 * blacks and near-whites do not vote. The winning bin is the one whose weight,
 * plus half of each neighbour's, is largest, and its average colour is snapped
 * to a swatch:
 *
 * - "noir" when the poster has almost no colour (mean vote per pixel under
 *   NOIR_CHROMA) or the winning colour itself is greyish (saturation under
 *   NOIR_SATURATION). Alien, The Crown and The Godfather land here.
 * - "wine", "rust" or "navy" when the winning colour is dark (HSL lightness
 *   under DARK_RED_L for reds, DARK_L otherwise) and red, orange-brown or
 *   blue: a dark red poster is not a bright red one.
 * - otherwise the swatch whose hue is nearest.
 *
 * The second swatch is the strongest bin at least 45 degrees of hue from the
 * winner that holds at least 8% of the total vote, snapped the same way but
 * without the noir test (a poster's second colour is a colour by definition),
 * and dropped when it lands on the same swatch as the first.
 *
 * The method comes from the Colour Shelf prototype, which read 48x72 canvas
 * pixels of a 342px poster. A w92 poster decodes to a 12x18 block grid, and
 * averaging 8x8 blocks dulls and darkens small bright areas, so three
 * thresholds moved (each is marked below). Measured on the prototype's 157
 * posters, the block grid agrees with the prototype's swatch on 123 at the
 * prototype's thresholds and on 132 at these. The fixtures in
 * posterSwatch.test.ts are real TMDB w92 files, so the thresholds are checked
 * against the grid this code actually sees.
 */

import { decodeJpegBlockAverages } from "./posterColor";

export const SWATCH_KEYS = [
  "red",
  "orange",
  "gold",
  "lime",
  "green",
  "teal",
  "sky",
  "blue",
  "violet",
  "pink",
  "wine",
  "rust",
  "navy",
  "noir",
] as const;

export type SwatchKey = (typeof SWATCH_KEYS)[number];

export interface Swatch {
  key: SwatchKey;
  /** Tile fill, uppercase #RRGGBB. */
  fill: string;
  /** Text and icon colour on the fill. Every pair clears 4.5:1 (see the test). */
  ink: string;
  /** Hue the snap rule aims at, or null for the swatches it picks by rule. */
  hue: number | null;
}

const DARK_INK = "#16110C";
const WHITE = "#FFFFFF";

/**
 * Fills are the prototype's. Red, green and pink carried white ink there and
 * failed 4.5:1 (4.0, 2.7 and 3.2); they take the dark ink instead and keep
 * their fills. Lime, teal and sky keep their own tinted darks.
 * Rust failed with either ink (4.46 white, 4.21 dark), so its fill moved one
 * step darker (each channel down 2 to 3), which clears 4.6 with white.
 */
export const SWATCHES: Record<SwatchKey, Swatch> = {
  red: { key: "red", fill: "#EC3B2F", ink: DARK_INK, hue: 356 },
  orange: { key: "orange", fill: "#FF7B1C", ink: DARK_INK, hue: 24 },
  gold: { key: "gold", fill: "#FFC52E", ink: DARK_INK, hue: 43 },
  lime: { key: "lime", fill: "#BCEB3C", ink: "#121A06", hue: 78 },
  green: { key: "green", fill: "#1FB466", ink: DARK_INK, hue: 140 },
  teal: { key: "teal", fill: "#17BFAE", ink: "#06201D", hue: 176 },
  sky: { key: "sky", fill: "#43B9FF", ink: "#06192A", hue: 200 },
  blue: { key: "blue", fill: "#2F5CFF", ink: WHITE, hue: 224 },
  violet: { key: "violet", fill: "#8048F5", ink: WHITE, hue: 266 },
  pink: { key: "pink", fill: "#F4519F", ink: DARK_INK, hue: 325 },
  wine: { key: "wine", fill: "#A3173D", ink: WHITE, hue: null },
  rust: { key: "rust", fill: "#C6501C", ink: WHITE, hue: null },
  navy: { key: "navy", fill: "#1C2F86", ink: WHITE, hue: null },
  noir: { key: "noir", fill: "#1A1A1F", ink: WHITE, hue: null },
};

const SWATCH_SET: ReadonlySet<string> = new Set(SWATCH_KEYS);

/** Narrow an untrusted string (a database value) to a swatch key, or null. */
export function asSwatchKey(value: unknown): SwatchKey | null {
  return typeof value === "string" && SWATCH_SET.has(value) ? (value as SwatchKey) : null;
}

export interface PosterSwatch {
  swatch: SwatchKey;
  /** A second, different swatch from the same poster, or null when it has one colour. */
  swatchAlt: SwatchKey | null;
}

// ------------------------------------------------------------------ thresholds

const BINS = 24;
const BIN_DEG = 360 / BINS;
/** Pixels under this HSL saturation do not vote. The prototype used 0.22. */
const MIN_S = 0.18;
/** Pixels darker or lighter than this do not vote. */
const MIN_L = 0.12;
const MAX_L = 0.92;
/**
 * Mean vote per pixel under which the whole poster counts as black and white.
 * The prototype used 0.03; at 0.03 the block grid sent Scarface, King Kong,
 * Grey's Anatomy and 21 Jump Street to noir. Alien reads 0.002 and The Crown
 * 0.001, far under either.
 */
const NOIR_CHROMA = 0.02;
/** Saturation of the winning colour under which it counts as grey. */
const NOIR_SATURATION = 0.18;
/** HSL lightness under which a colour takes the dark swatch of its hue. */
const DARK_L = 0.3;
/**
 * The same test for reds, which the block grid reads darker than they look:
 * red title type on black (The Sopranos, Reacher, True Romance) averages into
 * a dark red block. The Sopranos' red reads at lightness 0.26 and comes out
 * red; Oppenheimer's fire reads at 0.18 and stays wine.
 */
const DARK_RED_L = 0.25;
/** Bins (of 15 degrees) the second colour must sit from the first. */
const ALT_MIN_BINS = 3;
/** Share of the total vote the second colour must hold. */
const ALT_MIN_SHARE = 0.08;

// ------------------------------------------------------------------ colour math

function hsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const mx = Math.max(rr, gg, bb);
  const mn = Math.min(rr, gg, bb);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === rr) h = ((gg - bb) / d) % 6;
  else if (mx === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Snap one colour to a swatch. `chroma` is the poster's mean vote per pixel;
 * pass 1 to skip the black-and-white test.
 */
export function snapToSwatch(r: number, g: number, b: number, chroma: number): SwatchKey {
  const [h, s, l] = hsl(r, g, b);
  if (chroma < NOIR_CHROMA || s < NOIR_SATURATION) return "noir";
  if ((h >= 330 || h < 14) && l < DARK_RED_L) return "wine";
  if (l < DARK_L) {
    if (h >= 14 && h < 50) return "rust";
    if (h >= 180 && h < 260) return "navy";
  }
  let best: SwatchKey = "red";
  let bestD = Infinity;
  for (const key of SWATCH_KEYS) {
    const target = SWATCHES[key].hue;
    if (target === null) continue;
    const d = hueDistance(h, target);
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
}

// ------------------------------------------------------------------ the poster

/**
 * The swatches of an RGB grid (3 bytes per cell, row-major). Deterministic:
 * the same grid always gives the same answer. Returns null only for an empty
 * grid; a poster with no colour at all is "noir", which is an answer.
 */
export function posterSwatchFromPixels(
  rgb: ArrayLike<number>,
  width: number,
  height: number,
): PosterSwatch | null {
  const count = Math.min(width * height, Math.floor(rgb.length / 3));
  if (count <= 0) return null;
  const w = new Float64Array(BINS);
  const rs = new Float64Array(BINS);
  const gs = new Float64Array(BINS);
  const bs = new Float64Array(BINS);

  for (let i = 0; i < count; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const [h, s, l] = hsl(r, g, b);
    if (s < MIN_S || l < MIN_L || l > MAX_L) continue;
    const vote = s * s * (1 - Math.abs(l - 0.5) * 1.2);
    const k = Math.min(BINS - 1, Math.floor(h / BIN_DEG));
    w[k] += vote;
    rs[k] += r * vote;
    gs[k] += g * vote;
    bs[k] += b * vote;
  }

  let total = 0;
  for (let k = 0; k < BINS; k++) total += w[k];
  const chroma = total / count;
  if (total <= 0) return { swatch: "noir", swatchAlt: null };

  // Rank bins by their weight plus half of each neighbour's. Ties go to the
  // lower bin, so the answer never depends on sort stability.
  const order = Array.from({ length: BINS }, (_, k) => k);
  const smoothed = order.map((k) => w[k] + 0.5 * (w[(k + BINS - 1) % BINS] + w[(k + 1) % BINS]));
  order.sort((a, b) => smoothed[b] - smoothed[a] || a - b);

  const first = order[0];
  const avg = (k: number): [number, number, number] => [rs[k] / w[k], gs[k] / w[k], bs[k] / w[k]];
  // The smoothed winner can be an empty bin between two full ones; take the
  // fuller neighbour's colour in that case.
  let lead = first;
  if (w[lead] <= 0) {
    const left = (first + BINS - 1) % BINS;
    const right = (first + 1) % BINS;
    lead = w[left] >= w[right] ? left : right;
  }
  const swatch = snapToSwatch(...avg(lead), chroma);

  let swatchAlt: SwatchKey | null = null;
  const second = order.find((k) => {
    if (w[k] <= 0) return false;
    const gap = Math.abs(k - first);
    return Math.min(gap, BINS - gap) >= ALT_MIN_BINS;
  });
  if (second !== undefined && w[second] > total * ALT_MIN_SHARE) {
    const alt = snapToSwatch(...avg(second), 1);
    if (alt !== swatch) swatchAlt = alt;
  }
  return { swatch, swatchAlt };
}

/** Poster bytes in, swatches out. Null whenever the bytes cannot be read. */
export function posterSwatchFromJpeg(bytes: Uint8Array): PosterSwatch | null {
  const img = decodeJpegBlockAverages(bytes);
  if (!img) return null;
  return posterSwatchFromPixels(img.rgb, img.width, img.height);
}
