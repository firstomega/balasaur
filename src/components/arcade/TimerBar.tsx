import { cn } from "@/lib/utils";
import { ArcadeMotion } from "./arcadeMotion";

// The countdown as a shrinking bar in the game hue, rendered by the board
// right next to what is being timed (the question, the card). Display only:
// the deadline lives in useArcadeGame, this draws remaining/total. Under 20%
// the bar and the number turn to the warn token; under 5 seconds the number
// ticks once per second. Reduced motion: the bar still shrinks (it is a
// width, not a transform) and the tick is static.

export function TimerBar({
  remaining,
  total,
  label,
  className,
}: {
  /** Seconds left, fractional. */
  remaining: number;
  /** Seconds the countdown started from. */
  total: number;
  /** Optional mono micro-label left of the number, e.g. "Question 3". */
  label?: string;
  className?: string;
}) {
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const seconds = Math.ceil(Math.max(0, remaining));
  const low = frac < 0.2;
  const last = seconds <= 5;
  const color = low ? "var(--warn, #fb923c)" : "var(--game, var(--primary))";

  return (
    <div role="timer" aria-label={`${seconds} seconds left`} className={cn("w-full", className)}>
      <ArcadeMotion />
      <div className="flex h-7 items-end justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
          {label ?? ""}
        </span>
        <span
          // Keyed by the second so the tick animation restarts on each change.
          key={last ? seconds : "steady"}
          className={cn(
            "inline-block font-black tabular-nums leading-none tracking-[-0.02em]",
            last ? "text-[24px]" : "text-[20px]",
            last && "arc-tick",
          )}
          style={{ color: low ? color : undefined }}
        >
          {seconds}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
        <div
          className="h-full rounded-full"
          style={{ width: `${frac * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}
