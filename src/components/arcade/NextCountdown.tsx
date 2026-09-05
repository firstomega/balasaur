import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// The live clock to the next board. Every round flips at 00:00 UTC; this
// shows that moment as a countdown in the viewer's own clock, so nobody
// converts a timezone in their head. Personal to the viewer's clock, so it
// renders nothing on the server and on the first client paint, then ticks
// once a second. Under prefers-reduced-motion it renders once, in the short
// form, and does not tick.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds until the next 00:00 UTC. */
export function msUntilNextUtcMidnight(now: number = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(0, next - now);
}

/** "06:40:12". Hours can exceed 24 when a longer target is passed. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** "6h 40m", "12m", "under a minute". */
export function formatShort(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin === 0) return "under a minute";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

interface NextCountdownProps {
  /** The words before the time. Defaults to "Next round in". */
  label?: string;
  /** "clock" ticks hh:mm:ss; "short" shows "3h 12m" and updates each minute. */
  format?: "clock" | "short";
  className?: string;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

export function NextCountdown({
  label = "Next round in",
  format = "clock",
  className,
}: NextCountdownProps) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const short = format === "short";
    const render = () => {
      const ms = msUntilNextUtcMidnight();
      setText(short ? formatShort(ms) : formatClock(ms));
    };
    if (reducedMotion()) {
      setText(formatShort(msUntilNextUtcMidnight()));
      return;
    }
    render();
    const id = window.setInterval(render, short ? 60_000 : 1_000);
    return () => window.clearInterval(id);
  }, [format]);

  if (text === null) return null;

  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", className)}>
      <span>{label}</span>
      <span className="font-mono tabular-nums text-text-bright">{text}</span>
    </span>
  );
}
