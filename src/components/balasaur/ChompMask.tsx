import { useEffect, useState } from "react";

/**
 * Three scallops taken out of a poster's top-right corner: the bite that marks
 * a title Loved.
 *
 * The corner is painted over in the surface colour behind the poster rather
 * than cut with a CSS mask. A real `mask-image` here would need either an SVG
 * `<mask>` reference (unreliable on Safari for HTML elements) or two composited
 * mask layers, and on every surface that uses this the poster sits directly on
 * a flat panel, so painting and cutting land on the same pixels. Paint also
 * animates on the compositor: three transforms, no re-layout, no repaint of the
 * image.
 *
 * Overlay only. It never changes the poster's box, so nothing shifts.
 */
interface ChompMaskProps {
  /** Width and height of the corner square, in px. */
  size?: number;
  /** The colour behind the poster. Defaults to the panel token. */
  color?: string;
  /** False renders the settled bite with no animation. */
  animate?: boolean;
  className?: string;
}

const CHOMP_CSS = `
@keyframes chomp-bite {
  from { transform: scale(0.15); }
  to   { transform: scale(1); }
}
.chomp-scallop {
  transform-box: fill-box;
  transform-origin: center;
  animation: chomp-bite 80ms cubic-bezier(0.2, 0.8, 0.3, 1.1) both;
}
`;

/** Corner first, then the two nibbles either side of it. 0 + 35 + 70 + 80ms. */
const SCALLOPS: { cx: number; cy: number; r: number; delay: number }[] = [
  { cx: 46, cy: 0, r: 20, delay: 0 },
  { cx: 27, cy: 4, r: 9, delay: 35 },
  { cx: 42, cy: 23, r: 9, delay: 70 },
];

export function ChompMask({
  size = 46,
  color = "var(--panel)",
  animate = true,
  className,
}: ChompMaskProps) {
  // Under reduce, the bite is still there, it just does not arrive.
  const [still, setStill] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setStill(true);
  }, [animate]);

  const moving = animate && !still;

  return (
    <svg
      className={"pointer-events-none absolute right-0 top-0 " + (className ?? "")}
      width={size}
      height={size}
      viewBox="0 0 46 46"
      fill={color}
      aria-hidden="true"
    >
      {moving && <style>{CHOMP_CSS}</style>}
      {SCALLOPS.map((s, i) => (
        <circle
          key={i}
          className={moving ? "chomp-scallop" : undefined}
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          style={moving ? { animationDelay: `${s.delay}ms` } : undefined}
        />
      ))}
    </svg>
  );
}
