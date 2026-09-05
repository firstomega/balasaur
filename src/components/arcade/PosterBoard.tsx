// PosterBoard: the Poster Reveal board. The daily poster starts as a smear
// and sharpens one step per wrong guess, each step animating over 400ms; a
// six-chip strip above it fills as guesses are spent. The guess input is
// passed in as a child so this board stays a pure display. The title must
// never appear in the DOM here, alt text included: the image is the puzzle.
//
// On solve the route sets `revealed`: the blur snaps to zero, the frame
// lights in the hue, and the chip the run ended on lights too, so the strip
// on the end screen shows every guess the run cost. The route HOLDS the
// board for REVEAL_HOLD_MS before calling finish so the player sees what
// they were guessing come into focus.

import type { ReactNode } from "react";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";

/** How long the sharp poster stays on the board before the end screen. */
export const REVEAL_HOLD_MS = 900;
export const POSTER_MAX_GUESSES = 6;

// Blur radius per wrong guess, ending at the barely-blurred last chance.
const BLUR_PX = [28, 18, 12, 7, 4, 2];

/** Framed-style guess chips: one square per guess, numbered. Spent chips
 *  fill with the hue, the current one is outlined in it, the rest wait.
 *  Shared by Poster Reveal, Balasaurdle, and Emoji Plots. */
export function ChipStrip({
  total,
  spent,
  active,
  label,
  className,
}: {
  total: number;
  /** Chips filled from the left: guesses (or clues) already used. */
  spent: number;
  /** Index of the chip in play; omit once the run is over. */
  active?: number;
  /** Accessible name, e.g. "Guesses". */
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      role="img"
      aria-label={label ? `${label}: ${Math.min(spent, total)} of ${total} used` : undefined}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: total }, (_, i) => {
        const isSpent = i < spent;
        const isActive = !isSpent && i === active;
        return (
          <span
            key={i}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-[5px] border font-mono text-[11px] font-semibold tabular-nums transition-colors",
              isSpent &&
                "border-[var(--game,var(--primary))] bg-[var(--game,var(--primary))] text-[var(--game-ink,var(--primary-foreground))]",
              isActive &&
                "border-[var(--game,var(--primary))] bg-[color-mix(in_oklab,var(--game,var(--primary))_18%,var(--color-panel))] text-[var(--game,var(--primary))]",
              !isSpent && !isActive && "border-border text-text-dim",
            )}
          >
            {i + 1}
          </span>
        );
      })}
    </div>
  );
}

interface PosterBoardProps {
  posterUrl: string;
  /** Wrong guesses so far; each one sharpens the poster a step. */
  wrongGuesses: number;
  /** Guesses in a run. Defaults to six. */
  maxGuesses?: number;
  /** True once the run is over: the poster snaps sharp. */
  revealed?: boolean;
  /** Alt text once revealed, when the title may be said. Never before. */
  revealedAlt?: string;
  /** The guess input, rendered under the poster. */
  children?: ReactNode;
}

export function PosterBoard({
  posterUrl,
  wrongGuesses,
  maxGuesses = POSTER_MAX_GUESSES,
  revealed = false,
  revealedAlt,
  children,
}: PosterBoardProps) {
  const step = Math.min(Math.max(wrongGuesses, 0), BLUR_PX.length - 1);
  const blur = revealed ? 0 : BLUR_PX[step];
  // Once the run is over the guess it ended on counts as spent: the chip
  // lights on solve and on give-up alike.
  const spent = Math.min(revealed ? wrongGuesses + 1 : wrongGuesses, maxGuesses);

  return (
    <div>
      <ChipStrip
        total={maxGuesses}
        spent={spent}
        active={revealed ? undefined : wrongGuesses}
        label="Guesses"
        className="justify-center"
      />
      <div
        className={cn(
          "relative mx-auto mt-4 w-full max-w-[320px] overflow-hidden rounded-[6px] border transition-[border-color,box-shadow] duration-300",
          revealed
            ? "border-[var(--game,var(--primary))] shadow-[0_0_0_4px_color-mix(in_oklab,var(--game,var(--primary))_25%,transparent)]"
            : "border-[color-mix(in_oklab,var(--game,var(--primary))_35%,var(--color-border))]",
        )}
      >
        <img
          src={tmdbImage(posterUrl, "w500")}
          // Never the title while live: the poster is the puzzle.
          alt={revealed ? (revealedAlt ?? "") : ""}
          draggable={false}
          className="pointer-events-none aspect-[2/3] w-full scale-110 select-none object-cover"
          style={{
            filter: `blur(${blur}px)`,
            transition: "filter 400ms ease-out",
          }}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {revealed
          ? "The poster is shown sharp."
          : "The poster is blurred. It sharpens after each wrong guess."}
      </p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
