import { useRef } from "react";
import type { MediaType } from "@/types/media";

export type MediaTypeMode = "movie" | "both" | "tv";

// leftPct = left edge of the 1/3-width thumb at each stop.
const STOPS: { mode: MediaTypeMode; label: string; leftPct: number }[] = [
  { mode: "movie", label: "Movies", leftPct: 0 },
  { mode: "both", label: "Both", leftPct: 33.333 },
  { mode: "tv", label: "TV", leftPct: 66.666 },
];

/** Derive switch position from the underlying media-type set. */
export function modeFromSet(set: Set<MediaType>): MediaTypeMode {
  const hasMovie = set.has("movie");
  const hasTv = set.has("tv");
  if (hasMovie && !hasTv) return "movie";
  if (hasTv && !hasMovie) return "tv";
  return "both"; // both, or (defensively) neither
}

/** Map a switch position back to the media-type set. */
export function setFromMode(mode: MediaTypeMode): Set<MediaType> {
  if (mode === "movie") return new Set<MediaType>(["movie"]);
  if (mode === "tv") return new Set<MediaType>(["tv"]);
  return new Set<MediaType>(["movie", "tv"]);
}

/**
 * Three-position tactile switch: Movies · Both · TV. Click a label/zone or
 * drag the thumb (snaps to the nearest stop). "Both" is the centre default, so
 * an empty selection is impossible. Keyboard: ←/→ move between stops.
 */
export function MediaTypeSwitch({
  mode,
  onChange,
}: {
  mode: MediaTypeMode;
  onChange: (m: MediaTypeMode) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const activeLeftPct = STOPS.find((s) => s.mode === mode)?.leftPct ?? 33.333;
  const activeIndex = STOPS.findIndex((s) => s.mode === mode);

  const snapFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    // Nearest of the three stops (0 / 0.5 / 1).
    const idx = Math.round(ratio * 2); // 0,1,2
    onChange(STOPS[idx].mode);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" && activeIndex > 0) {
      e.preventDefault();
      onChange(STOPS[activeIndex - 1].mode);
    } else if (e.key === "ArrowRight" && activeIndex < STOPS.length - 1) {
      e.preventDefault();
      onChange(STOPS[activeIndex + 1].mode);
    }
  };

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label="Media type"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        draggingRef.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        snapFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) snapFromClientX(e.clientX);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
      className="relative h-9 w-full cursor-pointer touch-none select-none rounded-[6px] border border-border bg-background focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
    >
      {/* Sliding thumb (~1/3 width), positioned at the active stop. */}
      <div
        className="pointer-events-none absolute top-[3px] bottom-[3px] rounded-[4px] border border-primary/50 bg-primary/15 transition-[left] duration-150 ease-out"
        style={{
          width: "calc(33.333% - 4px)",
          left: `calc(${activeLeftPct}% + 2px)`,
        }}
      />
      {/* Three clickable zones / labels. */}
      <div className="relative grid h-full grid-cols-3">
        {STOPS.map((s) => {
          const active = s.mode === mode;
          return (
            <button
              key={s.mode}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={-1}
              onClick={() => onChange(s.mode)}
              className={
                "z-10 flex items-center justify-center font-mono text-[11px] uppercase tracking-wider transition-colors " +
                (active ? "text-primary" : "text-text-muted hover:text-text-bright")
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
