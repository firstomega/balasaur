import { cn } from "@/lib/utils";
import type { ArcadeTimer } from "@/lib/arcade/useArcadeGame";
import { ArcadeMotion } from "./arcadeMotion";

// The countdown as a ring. Kept for boards that want a compact clock beside
// a card; the shell header no longer renders one (TimerBar sits with the
// thing being timed). Display only: the deadline lives in useArcadeGame.
// The sweep is in the game hue, the warn token under 20%, and the number
// ticks once a second under 5 seconds. Reduced motion hides the sweep and
// the number alone counts down.

const R = 20.5; // 44px box, stroke 3
const CIRC = 2 * Math.PI * R;

export function TimerRing({ timer, className }: { timer: ArcadeTimer | null; className?: string }) {
  if (!timer) return null;
  const frac = timer.total > 0 ? Math.max(0, Math.min(1, timer.remaining / timer.total)) : 0;
  const low = frac < 0.2;
  const seconds = Math.ceil(timer.remaining);
  const last = seconds <= 5;
  const color = low ? "var(--warn, #fb923c)" : "var(--game, var(--primary))";

  return (
    <div
      role="timer"
      aria-label={`${seconds} seconds left`}
      className={cn("relative h-11 w-11 shrink-0", className)}
    >
      <ArcadeMotion />
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="22"
          cy="22"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-border"
        />
        <circle
          cx="22"
          cy="22"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - frac)}
          className="motion-reduce:hidden"
        />
      </svg>
      <span
        key={last ? seconds : "steady"}
        className={cn(
          "absolute inset-0 flex items-center justify-center font-mono text-[13px] font-semibold tabular-nums",
          low ? "" : "text-text-bright",
          last && "arc-tick",
        )}
        style={{ color: low ? color : undefined }}
      >
        {seconds}
      </span>
    </div>
  );
}
