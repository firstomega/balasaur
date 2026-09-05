import { cn } from "@/lib/utils";

// The per-game record: Played, Win %, Streak, Best as four big tabular
// numerals, and for guess-count games a distribution of past results with
// today's bar in the game hue. Every bar carries its count so the chart is
// reconstructable. Personal state: the caller renders this after mount.

export interface StatsNumbers {
  played: number;
  wins: number;
  streak: number;
  best: number;
}

export interface Distribution {
  /** Counts per bucket, in display order. */
  buckets: number[];
  /** Index of today's bucket, highlighted in the hue. */
  today?: number;
  /** Labels per bucket; defaults to 1..n. */
  labels?: string[];
}

export function winPct(s: StatsNumbers): number {
  if (s.played <= 0) return 0;
  return Math.round((s.wins / s.played) * 100);
}

export function StatsBlock({
  stats,
  distribution,
  className,
}: {
  stats: StatsNumbers;
  distribution?: Distribution;
  className?: string;
}) {
  const cells: { label: string; value: string }[] = [
    { label: "Played", value: String(stats.played) },
    { label: "Win %", value: String(winPct(stats)) },
    { label: "Streak", value: String(stats.streak) },
    { label: "Best", value: String(stats.best) },
  ];
  const max = distribution ? Math.max(1, ...distribution.buckets) : 1;

  return (
    <div className={className}>
      <div className="grid grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0">
            <div className="text-[28px] font-black leading-none tabular-nums tracking-[-0.02em] text-text-bright">
              {c.value}
            </div>
            <div className="mt-1 font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {distribution && distribution.buckets.length > 0 && (
        <div className="mt-4 space-y-1">
          {distribution.buckets.map((count, i) => {
            const today = distribution.today === i;
            const label = distribution.labels?.[i] ?? String(i + 1);
            const pct = Math.max(count > 0 ? 8 : 0, Math.round((count / max) * 100));
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-text-dim">
                  {label}
                </span>
                <div className="relative h-5 flex-1">
                  <div
                    className={cn(
                      "flex h-full items-center justify-end rounded-[4px] px-1.5 font-mono text-[11px] font-semibold tabular-nums",
                      today
                        ? "bg-[var(--game,var(--primary))] text-[var(--game-ink,var(--primary-foreground))]"
                        : "bg-border-strong text-text",
                    )}
                    style={{ width: count > 0 ? `${pct}%` : "0%" }}
                  >
                    {count > 0 ? count : ""}
                  </div>
                  {count === 0 && (
                    <span className="absolute left-0 top-0 flex h-full items-center px-1 font-mono text-[11px] tabular-nums text-text-dim">
                      0
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
