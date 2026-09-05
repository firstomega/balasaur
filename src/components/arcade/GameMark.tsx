import type { GameSlug } from "@/lib/arcade/types";
import { MARK_PATHS, MARK_VIEWBOX } from "./markPaths";

// One mark per game, drawn from the game's own board shape. The path data
// lives in markPaths.ts so the share card (canvas, Path2D) and this SVG draw
// the same picture. House style like DinoMark and CometMark: 24-unit viewBox,
// rounded 2-unit strokes in currentColor, no fills except the lit elements,
// and a path's `ink` dims it so a mark can carry two weights.
// The parent sets the color (usually var(--game)) and the size; the mark
// never picks a hue. A 2-unit stroke is 1.7px at 20px and 8px at 96px, so
// every hollow shape keeps at least 2 units of daylight inside it.

interface GameMarkProps {
  slug: GameSlug;
  /** Rendered width and height in px. Defaults to 24. */
  size?: number;
  className?: string;
  /** Accessible name. Omitted, the mark is decorative (aria-hidden). */
  title?: string;
}

export function GameMark({ slug, size = 24, className, title }: GameMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {MARK_PATHS[slug].map((p, i) =>
        p.fill ? (
          <path key={i} d={p.d} fill="currentColor" stroke="none" opacity={p.ink} />
        ) : (
          <path key={i} d={p.d} opacity={p.ink} />
        ),
      )}
    </svg>
  );
}
