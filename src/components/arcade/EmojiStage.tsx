// EmojiStage: the Emoji Plots board. The emoji are the hero, large and
// centered on a hue card, sized so the whole plot sits on one row at 390
// (clamp(44px, 12vw, 80px), shrunk further only when a plot has more glyphs
// than that row can hold); a progress row above counts the five plots; the
// guess chips and the GuessBox (passed in as children) sit beneath. On solve
// the answer's poster flips in beside the emoji. The "one of these" chips
// render only when the route passes `lifelines`, which it does on the third
// guess alone, so the puzzle stays a puzzle after one miss.

import type { ReactNode } from "react";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";
import { ChipStrip } from "./PosterBoard";

// A poster turning in on its vertical axis. styles.css owns the shared
// arcade keyframes; this one is local to the two boards that flip a poster
// (Emoji Plots, Balasaurdle) and safe to render more than once.
const FLIP_CSS = `
@keyframes arc-flip-y{from{opacity:0;transform:perspective(800px) rotateY(-90deg)}to{opacity:1;transform:perspective(800px) rotateY(0deg)}}
.arc-flip-y{animation:arc-flip-y 480ms cubic-bezier(.2,.8,.3,1) both;backface-visibility:hidden}
@media (prefers-reduced-motion:reduce){.arc-flip-y{animation:none;transform:none;opacity:1}}
`;

/** The answer's poster flipping in. `title` is the alt text, so only render
 *  this once the title may be said. */
export function PosterFlip({
  posterUrl,
  title,
  className,
}: {
  posterUrl: string;
  title: string;
  className?: string;
}) {
  return (
    <>
      <style>{FLIP_CSS}</style>
      <img
        src={tmdbImage(posterUrl, "w342")}
        alt={`Poster for ${title}`}
        draggable={false}
        className={cn(
          "arc-flip-y aspect-[2/3] select-none rounded-[5px] border border-[var(--game,var(--primary))] object-cover shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
          className,
        )}
      />
    </>
  );
}

interface EmojiStageProps {
  emoji: string;
  /** 1-based index of the plot in play. */
  plot: number;
  /** Plots in the round, usually five. */
  total: number;
  /** Outcome of each finished plot, in order. */
  results: boolean[];
  /** 1-based number of the guess in play. */
  guess: number;
  /** Guesses per plot, usually three. */
  maxGuesses: number;
  /** Set once the plot is over: the poster flips in beside the emoji. */
  revealed?: { posterUrl: string; title: string; solved: boolean } | null;
  /** The third-guess lifeline. The route passes it on the last guess only. */
  lifelines?: { choices: string[]; spent: string[]; onPick: (title: string) => void } | null;
  /** The GuessBox while guessing, the reveal box after. */
  children?: ReactNode;
}

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** How many glyphs a plot has, so the row can size to fit them. Grapheme
 *  segmentation where the runtime has it; code points otherwise, which only
 *  ever over-counts (a joined sequence becomes two) and so shrinks, never
 *  overflows. Same answer on the server and in the browser. */
function glyphCount(s: string): number {
  try {
    const Seg = (
      Intl as unknown as { Segmenter?: new () => { segment: (s: string) => Iterable<unknown> } }
    ).Segmenter;
    if (Seg) return Math.max(1, Array.from(new Seg().segment(s)).length);
  } catch {
    /* fall through */
  }
  return Math.max(1, Array.from(s.replace(/\s+/g, "")).length);
}

export function EmojiStage({
  emoji,
  plot,
  total,
  results,
  guess,
  maxGuesses,
  revealed = null,
  lifelines = null,
  children,
}: EmojiStageProps) {
  const over = !!revealed;
  // An emoji glyph draws about 1.3em wide with the tracking; the stage's
  // inline size minus its padding (and the poster once it has flipped in)
  // divided by that is the largest size that keeps one row. Container units
  // need the stage to be a container; browsers without them drop this
  // declaration and keep the class clamp.
  const glyphs = glyphCount(emoji);
  const fit = `min(clamp(44px, 12vw, 80px), calc((100cqw - 2rem${over ? " - 116px" : ""}) / ${
    glyphs * 1.3
  }))`;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
          Plot {plot} of {total}
        </span>
        <div
          className="flex items-center gap-1.5"
          role="img"
          aria-label={`${results.filter(Boolean).length} of ${results.length} solved so far`}
        >
          {Array.from({ length: total }, (_, i) => {
            const done = results[i];
            const current = i === results.length && !over;
            return (
              <span
                key={i}
                className={cn(
                  "h-2.5 w-6 rounded-full transition-colors",
                  done === true && "bg-rating",
                  done === false && "bg-destructive",
                  done === undefined && current && "bg-[var(--game,var(--primary))]",
                  done === undefined && !current && "bg-border-strong",
                )}
              />
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "mt-3 flex min-h-[180px] items-center justify-center gap-5 rounded-[6px] px-4 py-6 [container-type:inline-size] sm:min-h-[240px] sm:gap-8 sm:py-8",
          "[background:linear-gradient(160deg,color-mix(in_oklch,var(--game,var(--primary))_70%,#0b0d10),color-mix(in_oklch,var(--game,var(--primary))_30%,#0b0d10))]",
        )}
      >
        <p
          className="text-center text-[clamp(44px,12vw,80px)] leading-[1.15] tracking-[0.04em]"
          style={{ fontSize: fit }}
          aria-label="The plot in emoji"
        >
          {emoji}
        </p>
        {revealed && (
          <PosterFlip
            posterUrl={revealed.posterUrl}
            title={revealed.title}
            className="w-[96px] shrink-0 sm:w-[128px]"
          />
        )}
      </div>

      <ChipStrip
        total={maxGuesses}
        spent={Math.min(guess - 1, maxGuesses)}
        active={over ? undefined : guess - 1}
        label="Guesses"
        className="mt-3"
      />

      {children && <div className="mt-3">{children}</div>}

      {!over && lifelines && lifelines.choices.length > 0 && (
        <div className="mt-3" aria-label="Last guess: one of these">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--game,var(--primary))]">
            Last guess. One of these.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {lifelines.choices.map((c) => {
              const spent = lifelines.spent.some((w) => eq(w, c));
              return (
                <button
                  key={c}
                  type="button"
                  disabled={spent}
                  onClick={() => lifelines.onPick(c)}
                  className={cn(
                    "min-h-[36px] rounded-[5px] border px-3 py-1.5 text-[14px] transition-colors",
                    spent
                      ? "border-border text-text-dim line-through opacity-60"
                      : "border-border-strong bg-panel text-text-bright hover:border-[var(--game,var(--primary))] hover:text-[var(--game,var(--primary))]",
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
