/**
 * Turning a stored poster color into a light source.
 *
 * Two dominant colors are extracted from every poster during the nightly sync
 * and stored on the title. This module is the one place that decides what those
 * colors are allowed to look like once they leave the database, so every
 * surface that lights itself from a poster lights itself the same way.
 *
 * A poster color as it is stored is a color to paint a poster on, not a color
 * to light a room with. Half the catalog stores something dark and desaturated,
 * and a dark desaturated color spread over 700px of near-black reads as dirt.
 *
 * So every stored color is pushed through two floors before it is used: hue is
 * kept exactly, saturation is floored so a muddy extraction still emits a
 * recognisable color, and lightness is pulled into the band where a color can
 * act as a light source without washing to white.
 *
 * A color with no hue at all is the one case the floors cannot rescue. Black,
 * white and grey all carry hue 0, so flooring their saturation would paint a
 * red room behind a black-and-white poster. Those return null and the surface
 * keeps its flat ground, which is the honest answer.
 */

/** An unpacked light color, ready for `rgba()`. */
export type Rgb = [number, number, number];

const HEX = /^#[0-9a-f]{6}$/i;

const SATURATION_FLOOR = 0.45;
const LIGHTNESS_MIN = 0.46;
const LIGHTNESS_MAX = 0.64;
/** Below this the stored color is grey, and its hue is rounding noise. */
const ACHROMATIC = 0.08;

/**
 * A stored color, or null. Every one of these values ends up inside a style
 * attribute, so anything that is not a plain six-digit hex is dropped rather
 * than trusted.
 */
export function safeHex(value: string | null | undefined): string | null {
  return value && HEX.test(value) ? value : null;
}

/**
 * One stored color as a light source, or null when the poster has no hue in it.
 * Takes a raw value: it validates before it converts.
 */
export function posterLight(value: string | null | undefined): Rgb | null {
  const hex = safeHex(value);
  if (!hex) return null;

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l0 = (max + min) / 2;
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  if (s0 < ACHROMATIC) return null;

  const s = Math.max(s0, SATURATION_FLOOR);
  const l = Math.min(Math.max(l0, LIGHTNESS_MIN), LIGHTNESS_MAX);

  // Back to rgb.
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

/**
 * Both stored colors as a pair of light sources, for a surface lit from two
 * poles. One grey color borrows the other's hue rather than turning the room
 * red. Two grey colors mean the poster has no light in it, and the caller gets
 * null so it can render nothing.
 *
 * A caller with only one color passes it alone and gets that color twice.
 */
export function posterLightPair(
  colorA: string | null | undefined,
  colorB?: string | null | undefined,
): [Rgb, Rgb] | null {
  // colorA is the required pole. A title with no dominant color stored is not
  // lit at all, even in the rare case where only the secondary color survived.
  const a = safeHex(colorA);
  if (!a) return null;
  const b = safeHex(colorB) ?? a;

  const liftedA = posterLight(a);
  const liftedB = posterLight(b);
  const lightA = liftedA ?? liftedB;
  const lightB = liftedB ?? liftedA;
  if (!lightA || !lightB) return null;
  return [lightA, lightB];
}

/** A light source at an opacity, as a CSS color. */
export function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The card recipe: the two custom properties a poster-lit card reads on hover.
 *
 * A card cannot afford what a page can. The room light behind a title is one
 * large blur filter on one element; fifty of those in a grid is a scroll that
 * drops frames on a laptop. So a card gets a box-shadow instead, which the
 * compositor draws for free, and the values are here rather than in the card so
 * every lit card in the site glows at the same strength.
 *
 * Two layers. The first is the card's own drop shadow, the same geometry it has
 * always had, now carrying the poster's color instead of black. The second is a
 * small spread all the way around, so the color reads at the sides of the card
 * and not only beneath it.
 *
 * Returns null for a missing, malformed or grey color, and the card keeps the
 * black shadow that is the fallback in its own class.
 */
export function posterLightVars(
  value: string | null | undefined,
): { "--poster-light": string; "--poster-halo": string } | null {
  const light = posterLight(value);
  if (!light) return null;
  return {
    "--poster-light": rgba(light, 0.85),
    "--poster-halo": rgba(light, 0.2),
  };
}
