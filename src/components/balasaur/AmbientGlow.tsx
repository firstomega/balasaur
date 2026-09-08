import { cn } from "@/lib/utils";

const HEX = /^#[0-9a-f]{6}$/i;

function safeHex(value: string | null | undefined): string | null {
  return value && HEX.test(value) ? value : null;
}

/**
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
 * red room behind a black-and-white poster. Those return null and the page
 * keeps its flat ground, which is the honest answer.
 */
const SATURATION_FLOOR = 0.45;
const LIGHTNESS_MIN = 0.46;
const LIGHTNESS_MAX = 0.64;
/** Below this the stored color is grey, and its hue is rounding noise. */
const ACHROMATIC = 0.08;

function toLightSource(hex: string): [number, number, number] | null {
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

const GLOW_MASK =
  "radial-gradient(78% 108% at 50% 16%, #000 0%, #000 36%, rgba(0,0,0,0.42) 70%, rgba(0,0,0,0) 100%)";

function rgba([r, g, b]: [number, number, number], alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The light a title's own poster throws into the room behind it.
 *
 * It is paint, nothing else: no pointer events, no animation, no layout. It
 * renders from the two colors stored on the title during the nightly sync, so
 * it is in the first byte of HTML rather than appearing after the poster loads.
 * A title with no stored colors renders nothing at all and the page keeps its
 * flat ground.
 *
 * Mount it as the first child of a `relative isolate` container that wraps the
 * content it should sit behind. Two things matter about that container:
 *
 * - `isolate` gives the glow a stacking context to sit at the bottom of, so the
 *   negative z-index cannot drop it behind the page background and vanish.
 * - Its box is the glow's box. The default is `h-full`, so the container should
 *   be the poster/title region, not the whole page. A glow sized to the
 *   viewport ends over empty ground below the content, which is what made the
 *   first version read as a smudge floating in black.
 */
export function AmbientGlow({
  colorA,
  colorB,
  className,
}: {
  /** Dominant poster color as #rrggbb (media.color_a). */
  colorA?: string | null;
  /** Secondary poster color as #rrggbb (media.color_b). */
  colorB?: string | null;
  /** Override the default box (the full height of the container). */
  className?: string;
}) {
  // These values go straight into a CSS gradient, so anything that is not a
  // plain hex is dropped rather than trusted.
  const a = safeHex(colorA);
  const b = safeHex(colorB) ?? a;
  if (!a || !b) return null;

  // One grey color borrows the other's hue rather than turning the room red.
  // Two grey colors mean the poster has no light in it, and nothing renders.
  const liftedA = toLightSource(a);
  const liftedB = toLightSource(b);
  const lightA = liftedA ?? liftedB;
  const lightB = liftedB ?? liftedA;
  if (!lightA || !lightB) return null;

  return (
    // Two elements, because the order CSS applies them in is the whole trick.
    // The mask runs on the inner box and the blur on the outer one, so the
    // blur is applied to the already-masked paint: it smears the last few
    // levels of the mask's own edge out over 140px and lets the light spill
    // past the container instead of stopping at it. Masking after blurring,
    // which is what one element does, left a faint vertical seam down each
    // side of the content column.
    <div
      aria-hidden="true"
      className={cn(
        // Two floors on opacity, not one. At 390 the glow has a third of the
        // width to spread across and disappeared entirely at the desktop value.
        "pointer-events-none absolute inset-x-0 top-0 -z-10 h-full opacity-[0.55] sm:opacity-[0.44] lg:opacity-[0.38]",
        className,
      )}
      style={{
        // Enough blur to dissolve the eight-bit banding a gradient this large
        // shows on an OLED-dark ground, not so much that the two lamps merge
        // into one wash.
        filter: "blur(70px)",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          // Two lamps, one high left and one further right and lower, each with
          // a mid stop so the falloff is a curve rather than a ramp with a
          // shoulder. A gradient that lands its last stop well inside the box
          // draws a visible ring, which is where the banding at y=400 came from.
          backgroundImage: [
            `radial-gradient(105% 78% at 22% 6%, ${rgba(lightA, 0.66)} 0%, ${rgba(lightA, 0.32)} 30%, ${rgba(lightA, 0.1)} 56%, ${rgba(lightA, 0)} 80%)`,
            `radial-gradient(92% 72% at 80% 34%, ${rgba(lightB, 0.52)} 0%, ${rgba(lightB, 0.24)} 34%, ${rgba(lightB, 0.07)} 58%, ${rgba(lightB, 0)} 82%)`,
          ].join(", "),
          // The mask is the fix for the hard terminator. The first version
          // ended at a fixed height and its bottom edge drew a line across the
          // page, and its side edges drew the container as a lit rectangle. One
          // ellipse, falling to nothing before every edge of the box, is what
          // stops the paint from having a shape of its own.
          maskImage: GLOW_MASK,
          WebkitMaskImage: GLOW_MASK,
        }}
      />
    </div>
  );
}
