import { cn } from "@/lib/utils";

/**
 * The wash of a title's own poster colors behind the top of a page.
 *
 * It is paint, nothing else: no pointer events, no animation, no layout. It
 * renders from the two colors stored on the title during the nightly sync, so
 * it is in the first byte of HTML rather than appearing after the poster loads.
 * A title with no stored colors renders nothing at all and the page keeps its
 * flat ground.
 *
 * Mount it as the first child of a `relative isolate` container. `isolate`
 * matters: it gives the glow a stacking context to sit at the bottom of, so a
 * negative z-index cannot drop it behind the page background and disappear.
 */
const HEX = /^#[0-9a-f]{6}$/i;

function safeHex(value: string | null | undefined): string | null {
  return value && HEX.test(value) ? value : null;
}

export function AmbientGlow({
  colorA,
  colorB,
  className,
}: {
  /** Dominant poster color as #rrggbb (media.color_a). */
  colorA?: string | null;
  /** Secondary poster color as #rrggbb (media.color_b). */
  colorB?: string | null;
  /** Override the default height (the top 60vh of the page). */
  className?: string;
}) {
  // These values go straight into a CSS gradient, so anything that is not a
  // plain hex is dropped rather than trusted.
  const a = safeHex(colorA);
  const b = safeHex(colorB) ?? a;
  if (!a || !b) return null;

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh]", className)}
      style={{
        backgroundImage: `radial-gradient(58% 52% at 18% 0%, ${a} 0%, transparent 68%), radial-gradient(52% 48% at 84% 14%, ${b} 0%, transparent 70%)`,
        filter: "blur(120px)",
        opacity: 0.22,
      }}
    />
  );
}
