import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// The in-run score line: score left, combo chip right. The chip only exists
// from x2 up (a combo of one is just a correct answer) and pulses when it
// grows. Fixed height so the chip appearing does not shift the board.

export function ScoreStrip({ score, combo }: { score: number; combo: number }) {
  const [pulse, setPulse] = useState(false);
  const prevCombo = useRef(combo);

  useEffect(() => {
    const grew = combo > prevCombo.current;
    prevCombo.current = combo;
    if (!grew || combo < 2) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 150);
    return () => clearTimeout(t);
  }, [combo]);

  return (
    <div className="flex h-7 items-center justify-between">
      <span className="font-mono text-[12px] uppercase tracking-wider text-text-muted">
        Score <span className="tabular-nums text-text-bright">{score}</span>
      </span>
      {combo >= 2 && (
        <span
          aria-label={`${combo} in a row`}
          className={cn(
            "rounded-[4px] border border-primary/40 bg-primary/5 px-1.5 py-0.5 font-mono text-[12px] font-semibold tabular-nums text-primary transition-transform duration-150 motion-reduce:transform-none",
            pulse ? "scale-[1.15]" : "scale-100",
          )}
        >
          x{combo}
        </span>
      )}
    </div>
  );
}
