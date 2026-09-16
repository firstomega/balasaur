import { cn } from "@/lib/utils";
import { posterLightPair, rgba } from "@/lib/posterLight";

const GLOW_MASK =
  "radial-gradient(78% 108% at 50% 16%, #000 0%, #000 36%, rgba(0,0,0,0.42) 70%, rgba(0,0,0,0) 100%)";

/**
 * The light a title's own poster throws into the room behind it.
 *
 * It is paint, nothing else: no pointer events, no animation, no layout. It
 * renders from the two colors stored on the title during the nightly sync, so
 * it is in the first byte of HTML rather than appearing after the poster loads.
 * A title with no stored colors renders nothing at all and the page keeps its
 * flat ground.
 *
 * The colors are floored and clamped by `posterLight`, which is also what a
 * poster-lit card hover reads, so one poster lights every surface the same way.
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
  /** Secondary poster color as #rrggbb (media.color_b). Falls back to colorA,
   *  so a surface with one color is lit by one color from both poles. */
  colorB?: string | null;
  /** Override the default box (the full height of the container). */
  className?: string;
}) {
  const pair = posterLightPair(colorA, colorB);
  if (!pair) return null;
  const [lightA, lightB] = pair;

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
        // into one wash. This is the expensive one, and it is why a card uses
        // a box-shadow instead: one of these per page, never one per card.
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
