import { useEffect, useRef, useState } from "react";
import { AnimatedCount } from "@/components/balasaur/AnimatedCount";
import { cn } from "@/lib/utils";
import { ArcadeMotion } from "./arcadeMotion";

// The in-run score line: score left, combo chip right. The score tweens and
// a "+N" floater rises off it on every addScore. The chip only exists from
// x2 up (a combo of one is just a correct answer) and heats as it grows: the
// game hue at x2, rating green with "on a roll" at x5, gold with "on fire"
// at x10. Breaking a combo shakes the strip once. Fixed height so the chip
// appearing does not shift the board.

interface Floater {
  id: number;
  text: string;
}

function tier(combo: number): { className: string; word: string | null } {
  if (combo >= 10) {
    return {
      className: "border-media-movie/60 bg-media-movie/15 text-media-movie",
      word: "on fire",
    };
  }
  if (combo >= 5) {
    return { className: "border-rating/60 bg-rating/10 text-rating", word: "on a roll" };
  }
  return {
    className:
      "border-[color-mix(in_oklab,var(--game,var(--primary))_50%,transparent)] bg-[color-mix(in_oklab,var(--game,var(--primary))_12%,transparent)] text-[var(--game,var(--primary))]",
    word: null,
  };
}

export function ScoreStrip({ score, combo }: { score: number; combo: number }) {
  const [pulse, setPulse] = useState(false);
  const [shake, setShake] = useState(false);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const prevCombo = useRef(combo);
  const prevScore = useRef(score);
  const nextId = useRef(1);

  useEffect(() => {
    const before = prevCombo.current;
    prevCombo.current = combo;
    if (combo > before && combo >= 2) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 150);
      return () => clearTimeout(t);
    }
    if (combo === 0 && before >= 2) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 320);
      return () => clearTimeout(t);
    }
  }, [combo]);

  useEffect(() => {
    const delta = score - prevScore.current;
    prevScore.current = score;
    if (delta <= 0) return;
    const id = nextId.current++;
    setFloaters((f) => [...f, { id, text: `+${delta}` }]);
    const t = setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 720);
    return () => clearTimeout(t);
  }, [score]);

  const heat = tier(combo);

  return (
    <div className={cn("flex h-8 items-center justify-between", shake && "arc-shake")}>
      <ArcadeMotion />
      <span className="relative font-mono text-[12px] uppercase tracking-wider text-text-muted">
        Score{" "}
        <AnimatedCount
          value={score}
          className="text-[15px] font-black tabular-nums tracking-[-0.02em] text-text-bright"
        />
        {floaters.map((f) => (
          <span
            key={f.id}
            aria-hidden="true"
            className="arc-float pointer-events-none absolute -top-1 left-full ml-1 font-mono text-[13px] font-semibold tabular-nums text-[var(--game,var(--primary))]"
          >
            {f.text}
          </span>
        ))}
      </span>
      {combo >= 2 && (
        <span
          aria-label={`${combo} in a row${heat.word ? `, ${heat.word}` : ""}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums transition-transform duration-150 motion-reduce:transform-none",
            heat.className,
            pulse ? "scale-[1.15]" : "scale-100",
          )}
        >
          x{combo}
          {heat.word && <span className="text-[10.5px] uppercase tracking-wider">{heat.word}</span>}
        </span>
      )}
    </div>
  );
}
