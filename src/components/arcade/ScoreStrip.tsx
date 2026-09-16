import { useEffect, useRef, useState } from "react";
import { AnimatedCount } from "@/components/balasaur/AnimatedCount";
import { cue } from "@/lib/feedback";
import { cn } from "@/lib/utils";

// The in-run score line: score left, combo chip right. The score tweens and
// a "+N" floater rises off it on every addScore. The chip only exists from
// x2 up (a combo of one is just a correct answer) and heats as it grows: the
// game hue at x2, rating green with "on a roll" at x5, gold with "on fire"
// at x10. Breaking a combo shakes the strip once. Fixed height so the chip
// appearing does not shift the board.
//
// This is also the one place that sees a point land for every game, so it is
// where the hit cue fires. Its pitch is the streak length, one pentatonic
// degree per hit, which makes a run audibly climb and a break audibly drop
// back to the root. Crossing into a heat tier gets its own two-note figure
// starting on the note the streak had reached, so the colour change on the
// chip and the leap in the line are the same event.

interface Tier {
  className: string;
  word: string | null;
}

/** 0 below x5, 1 at x5, 2 at x10. The chip's colour and the cue both step on
 *  this, so they can never disagree. */
function heatLevel(combo: number): 0 | 1 | 2 {
  if (combo >= 10) return 2;
  if (combo >= 5) return 1;
  return 0;
}

/** The streak's position on the scale. A combo of one is the root. */
function comboStep(combo: number): number {
  return Math.max(0, combo - 1);
}

interface Floater {
  id: number;
  text: string;
}

const TIERS: [Tier, Tier, Tier] = [
  {
    className:
      "border-[color-mix(in_oklab,var(--game,var(--primary))_50%,transparent)] bg-[color-mix(in_oklab,var(--game,var(--primary))_12%,transparent)] text-[var(--game,var(--primary))]",
    word: null,
  },
  { className: "border-rating/60 bg-rating/10 text-rating", word: "on a roll" },
  { className: "border-media-movie/60 bg-media-movie/15 text-media-movie", word: "on fire" },
];

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
      if (heatLevel(combo) > heatLevel(before)) cue("combo", comboStep(combo));
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

  // combo rides along in the deps so the pitch is the streak this point just
  // extended. It never fires on its own: a combo change alone leaves delta at
  // zero and the effect returns.
  useEffect(() => {
    const delta = score - prevScore.current;
    prevScore.current = score;
    if (delta <= 0) return;
    cue("right", comboStep(combo));
    const id = nextId.current++;
    setFloaters((f) => [...f, { id, text: `+${delta}` }]);
    const t = setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 720);
    return () => clearTimeout(t);
  }, [score, combo]);

  const heat = TIERS[heatLevel(combo)];

  return (
    <div className={cn("flex h-8 items-center justify-between", shake && "arcade-shake")}>
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
            className="arcade-rise-fade pointer-events-none absolute -top-1 left-full ml-1 font-mono text-[13px] font-semibold tabular-nums text-[var(--game,var(--primary))]"
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
