import { cn } from "@/lib/utils";
import {
  ARCADE_TIMER_LOW,
  useArcadeTimerPaint,
  type ArcadeTimer,
} from "@/lib/arcade/useArcadeGame";

// The countdown as a ring. Kept for boards that want a compact clock beside
// a card; the shell header no longer renders one (TimerBar sits with the
// thing being timed). Display only: the deadline lives in useArcadeGame.
// The sweep is in the game hue, the warn token under 20%, and the number
// ticks once a second under 5 seconds. Reduced motion hides the sweep and
// the number alone counts down.
//
// The sweep moves at display rate off --arcade-timer-frac and
// --arcade-timer-ink, which the engine writes onto the root below. The timer
// prop is the fallback for the first paint and for the numeral, which only
// needs to change once a second.

const R = 20.5; // 44px box, stroke 3
const CIRC = 2 * Math.PI * R;

export function TimerRing({ timer, className }: { timer: ArcadeTimer | null; className?: string }) {
  const paintRef = useArcadeTimerPaint<HTMLDivElement>();
  if (!timer) return null;
  const frac = timer.total > 0 ? Math.max(0, Math.min(1, timer.remaining / timer.total)) : 0;
  const low = frac < ARCADE_TIMER_LOW;
  const seconds = Math.ceil(timer.remaining);
  const last = seconds <= 5;
  const color = low ? "var(--warn, #fb923c)" : "var(--game, var(--primary))";

  return (
    <div
      ref={paintRef}
      role="timer"
      aria-label={`${seconds} seconds left`}
      className={cn("relative h-11 w-11 shrink-0", className)}
    >
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
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          style={{
            stroke: `var(--arcade-timer-ink, ${color})`,
            // px inside a viewBox is one user unit, and a length keeps the
            // calc unambiguous where a bare number would not be.
            strokeDashoffset: `calc(${CIRC}px * (1 - var(--arcade-timer-frac, ${frac.toFixed(4)})))`,
          }}
          className="motion-reduce:hidden"
        />
      </svg>
      <span
        key={last ? seconds : "steady"}
        className={cn(
          "absolute inset-0 flex items-center justify-center font-mono text-[13px] font-semibold tabular-nums",
          last && "arcade-pop",
        )}
        style={{ color: `var(--arcade-timer-ink, ${low ? color : "var(--text-bright)"})` }}
      >
        {seconds}
      </span>
    </div>
  );
}
