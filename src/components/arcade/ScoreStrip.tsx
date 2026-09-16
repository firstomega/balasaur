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
// Where the heat buys the player something (Speed Sort trades it for clock),
// the game passes comboPays and the amount rises off the chip in the frame
// the chip changes colour, so the two read as one event instead of a colour
// change and an unexplained jump somewhere else on the board.
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

/** 0 below x5, 1 at x5, 2 at x10. The chip's colour, the cue and the payment
 *  all step on this, so they can never disagree. */
function heatLevel(combo: number): 0 | 1 | 2 {
  if (combo >= 10) return 2;
  if (combo >= 5) return 1;
  return 0;
}

/** The streak's position on the scale. A combo of one is the root. */
function comboStep(combo: number): number {
  return Math.max(0, combo - 1);
}

type Side = "score" | "combo";

interface Floater {
  id: number;
  text: string;
  side: Side;
}

const FLOAT_MS = 720;

const TIERS: [Tier, Tier, Tier] = [
  {
    className:
      "border-[color-mix(in_oklab,var(--game,var(--primary))_50%,transparent)] bg-[color-mix(in_oklab,var(--game,var(--primary))_12%,transparent)] text-[var(--game,var(--primary))]",
    word: null,
  },
  { className: "border-rating/60 bg-rating/10 text-rating", word: "on a roll" },
  { className: "border-media-movie/60 bg-media-movie/15 text-media-movie", word: "on fire" },
];

// Plain strings, never through cn: two arbitrary text-* utilities in one
// class list is exactly what tailwind-merge collapses, and the size would
// lose to the colour.
const FLOAT_BASE =
  "arcade-rise-fade pointer-events-none absolute -top-1 whitespace-nowrap font-mono text-[13px] font-semibold tabular-nums";
const SCORE_FLOAT = `${FLOAT_BASE} left-full ml-1 text-[var(--game,var(--primary))]`;
// Bright, not the game hue: the chip already carries the tier colour, this
// carries the amount.
const COMBO_FLOAT = `${FLOAT_BASE} right-0 text-text-bright`;

export function ScoreStrip({
  score,
  combo,
  comboPays,
}: {
  score: number;
  combo: number;
  /** What reaching x5 and x10 hands the player, already written the way it
   *  should read: ["+2s", "+3s"]. Left off by games where the heat is only
   *  a streak. */
  comboPays?: readonly [string, string];
}) {
  const [pulse, setPulse] = useState(false);
  const [shake, setShake] = useState(false);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const prevCombo = useRef(combo);
  const prevScore = useRef(score);
  const nextId = useRef(1);
  // Read inside the effects without putting an array literal in their deps,
  // where a new identity every render would cancel the pulse mid-animation.
  const paysRef = useRef(comboPays);
  paysRef.current = comboPays;

  // Every floater removes itself on its own timer. The timers are held here
  // rather than returned as effect cleanup, because two points landing inside
  // one beat would otherwise cancel the first one's removal and leave it in
  // the tree for the rest of the run.
  const removals = useRef<number[]>([]);
  useEffect(() => () => removals.current.forEach((t) => window.clearTimeout(t)), []);

  const float = (text: string, side: Side) => {
    const id = nextId.current++;
    setFloaters((f) => [...f, { id, text, side }]);
    const t = window.setTimeout(() => {
      setFloaters((f) => f.filter((x) => x.id !== id));
      removals.current = removals.current.filter((x) => x !== t);
    }, FLOAT_MS);
    removals.current.push(t);
  };

  useEffect(() => {
    const before = prevCombo.current;
    prevCombo.current = combo;
    if (combo > before && combo >= 2) {
      const level = heatLevel(combo);
      if (level > heatLevel(before)) {
        cue("combo", comboStep(combo));
        const paid = paysRef.current?.[level - 1];
        if (paid) float(paid, "combo");
      }
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
    float(`+${delta}`, "score");
  }, [score, combo]);

  const heat = TIERS[heatLevel(combo)];

  return (
    <div className={cn("relative flex h-8 items-center justify-between", shake && "arcade-shake")}>
      <span className="relative font-mono text-[12px] uppercase tracking-wider text-text-muted">
        Score{" "}
        <AnimatedCount
          value={score}
          className="text-[15px] font-black tabular-nums tracking-[-0.02em] text-text-bright"
        />
        {floaters
          .filter((f) => f.side === "score")
          .map((f) => (
            <span key={f.id} aria-hidden="true" className={SCORE_FLOAT}>
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
      {/* Outside the chip, which scales on every hit: a floater that rode
          that transform would grow and shrink on its way up. */}
      {floaters
        .filter((f) => f.side === "combo")
        .map((f) => (
          <span key={f.id} aria-hidden="true" className={COMBO_FLOAT}>
            {f.text}
          </span>
        ))}
    </div>
  );
}
