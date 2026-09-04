import { cn } from "@/lib/utils";
import type { ArcadeTimer } from "@/lib/arcade/useArcadeGame";

// The countdown ring in the GameShell header. Display only: the deadline
// lives in useArcadeGame, this just draws remaining/total. Under 20% left
// the ring and number go orange. With prefers-reduced-motion the sweep is
// hidden and the number alone counts down.

const R = 20.5; // 44px box, stroke 3
const CIRC = 2 * Math.PI * R;

export function TimerRing({ timer, className }: { timer: ArcadeTimer | null; className?: string }) {
  if (!timer) return null;
  const frac = timer.total > 0 ? Math.max(0, Math.min(1, timer.remaining / timer.total)) : 0;
  const low = frac < 0.2;
  const seconds = Math.ceil(timer.remaining);

  return (
    <div
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
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - frac)}
          className={cn("motion-reduce:hidden", low ? "text-orange-300" : "text-primary")}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-mono text-[13px] font-semibold tabular-nums",
          low ? "text-orange-300" : "text-text-bright",
        )}
      >
        {seconds}
      </span>
    </div>
  );
}
