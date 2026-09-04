// PosterBoard: the Poster Reveal board. The daily poster starts heavily
// blurred and sharpens one step per wrong guess; the guess input (GuessBox)
// is passed in as a child so this board stays a pure display. The title must
// never appear in the DOM here, alt text included: the image is the whole
// puzzle.

import type { ReactNode } from "react";
import { tmdbImage } from "@/lib/tmdbImage";

// One entry per wrong guess, ending at the barely-blurred last chance.
// Literal class names so Tailwind sees them.
const BLUR_STEPS = ["blur-[24px]", "blur-[16px]", "blur-[10px]", "blur-[6px]", "blur-[2px]"];

interface PosterBoardProps {
  posterUrl: string;
  /** Wrong guesses so far; each one sharpens the poster a step. */
  wrongGuesses: number;
  /** True once the run is over: the poster shows sharp. */
  revealed?: boolean;
  /** The guess input, rendered under the poster. */
  children?: ReactNode;
}

export function PosterBoard({
  posterUrl,
  wrongGuesses,
  revealed = false,
  children,
}: PosterBoardProps) {
  const step = Math.min(Math.max(wrongGuesses, 0), BLUR_STEPS.length - 1);
  const blur = revealed ? "blur-0" : BLUR_STEPS[step];

  return (
    <div>
      <div className="relative mx-auto w-[210px] overflow-hidden rounded-[5px] border border-border sm:w-[250px]">
        <img
          src={tmdbImage(posterUrl, "w342")}
          // Never the title: the poster is the puzzle.
          alt=""
          draggable={false}
          className={`pointer-events-none aspect-[2/3] w-full scale-110 select-none object-cover transition-[filter] duration-500 ${blur}`}
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
