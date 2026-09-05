// QuizBoard: one question on a hue stage, the countdown as a bar under it,
// four large answer cards in four tints with the text centered, and a row
// of pips that fills in as the night goes. Built for The 8PM Screening.
// `picked` holds the card pressed while the answer is being judged; `reveal`
// lands when the right choice is known and colors the board: the right card
// fills with the hue and pops, a wrong pick flashes --warn and shakes (never
// the hue, which is ruby and would read the same as red). When the route
// knows which title the answer names, its poster flips in on the stage.
// Controlled: no timers, no scoring, no network in here.

import type { CSSProperties } from "react";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";
import type { ArcadeTimer } from "@/lib/arcade/useArcadeGame";
import { TimerBar } from "./TimerBar";

/** Four tints, one per answer position, the same set Casting Call uses so
 *  the two four-card boards read as one family. Tokens, never hex. */
const TINTS = ["var(--hue-ruby)", "var(--hue-blue)", "var(--hue-sun)", "var(--hue-teal)"];

export interface QuizMedia {
  title: string;
  year?: string | null;
  posterUrl?: string | null;
}

interface QuizBoardProps {
  question: string;
  choices: string[];
  /** 0-based position of this question. */
  questionIndex: number;
  questionCount: number;
  /** The locked pick, held while the round resolves. Null before any pick. */
  picked: number | null;
  /** Set once the right answer is known; colors the board. */
  reveal: { correctIndex: number } | null;
  /** One fact about the answer, shown under the reveal. */
  note?: string | null;
  /** Per question: true right, false wrong, null or missing still to come.
   *  Fills the pips. Without it, every question before this one counts as
   *  right and this one follows `reveal`. */
  results?: (boolean | null | undefined)[];
  /** The question clock, drawn as a bar under the stage. Null hides the
   *  bar but keeps its height so the board never jumps. */
  timer?: ArcadeTimer | null;
  /** The title the answer names, when the route knows it. Its poster flips
   *  in on reveal; the slot is reserved from the start. */
  media?: QuizMedia | null;
  disabled?: boolean;
  onPick: (index: number) => void;
}

export function QuizBoard({
  question,
  choices,
  questionIndex,
  questionCount,
  picked,
  reveal,
  note,
  results,
  timer,
  media,
  disabled = false,
  onPick,
}: QuizBoardProps) {
  const locked = disabled || picked !== null || reveal !== null;
  const rightPick = reveal !== null && picked === reveal.correctIndex;

  const pipTone = (i: number): "right" | "wrong" | "now" | "todo" => {
    const known = results?.[i];
    if (known === true) return "right";
    if (known === false) return "wrong";
    if (i === questionIndex) {
      if (reveal !== null) return rightPick ? "right" : "wrong";
      return "now";
    }
    if (results === undefined && i < questionIndex) return "right";
    return "todo";
  };

  return (
    <div className="w-full">
      {/* Ten pips: the night at a glance. */}
      <div
        className="flex items-center gap-1"
        role="img"
        aria-label={`Question ${questionIndex + 1} of ${questionCount}`}
      >
        {Array.from({ length: questionCount }, (_, i) => {
          const tone = pipTone(i);
          return (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                tone === "right" && "bg-[var(--game)]",
                tone === "wrong" && "bg-warn",
                tone === "now" && "bg-[var(--game)]/40",
                tone === "todo" && "bg-border",
              )}
            />
          );
        })}
      </div>

      {/* The stage. */}
      <div
        className="mt-3 flex items-stretch gap-4 rounded-[6px] p-4 sm:mt-4 sm:gap-6 sm:p-6"
        style={{
          background:
            "linear-gradient(160deg, color-mix(in oklch, var(--game) 70%, #0b0d10), color-mix(in oklch, var(--game) 30%, #0b0d10))",
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-wider text-white/70">
            Question {questionIndex + 1} of {questionCount}
          </p>
          <p className="mt-2 text-[20px] font-black leading-[1.15] tracking-[-0.02em] text-white sm:text-[28px]">
            {question}
          </p>
        </div>
        {media && (
          <div
            className="w-[72px] shrink-0 self-center overflow-hidden rounded-[5px] sm:w-[104px]"
            style={{
              aspectRatio: "2 / 3",
              background: "color-mix(in oklab, #0b0d10 45%, transparent)",
            }}
            aria-hidden={reveal === null}
          >
            {reveal !== null &&
              (media.posterUrl ? (
                <img
                  src={tmdbImage(media.posterUrl, "w342")}
                  alt={media.year ? `${media.title} (${media.year})` : media.title}
                  draggable={false}
                  className="arcade-flip-in h-full w-full object-cover"
                />
              ) : (
                <span className="arcade-flip-in flex h-full w-full items-center justify-center px-1.5 text-center text-[11px] font-black leading-tight tracking-[-0.02em] text-white">
                  {media.title}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* The clock, right under the question. Height reserved between questions. */}
      <div className="mt-3 min-h-[40px]">
        {timer && reveal === null ? (
          <TimerBar remaining={timer.remaining} total={timer.total} />
        ) : null}
      </div>

      {/* Four answers. */}
      <div
        role="group"
        aria-label="Answers"
        className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3"
      >
        {choices.map((choice, i) => {
          const isCorrect = reveal !== null && i === reveal.correctIndex;
          const isWrongPick = reveal !== null && i === picked && i !== reveal.correctIndex;
          const isPending = reveal === null && i === picked;
          const tinted = !isCorrect && !isWrongPick && !isPending;
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              aria-pressed={i === picked}
              onClick={() => onPick(i)}
              style={
                tinted
                  ? ({
                      "--tint": TINTS[i % TINTS.length],
                      background: "color-mix(in oklch, var(--tint) 25%, var(--color-panel))",
                      borderColor: "color-mix(in oklch, var(--tint) 55%, var(--color-border))",
                    } as CSSProperties)
                  : undefined
              }
              className={cn(
                "relative flex min-h-[60px] items-center justify-center rounded-[6px] border px-3.5 py-3 text-center text-[16px] font-bold leading-snug tracking-[-0.01em] transition-[transform,background-color,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:transform-none sm:min-h-[76px] sm:px-4 sm:text-[18px]",
                !locked && "hover:-translate-y-0.5",
                isCorrect
                  ? "border-[var(--game)] bg-[var(--game)] text-[var(--game-ink)] [box-shadow:0_0_24px_color-mix(in_oklab,var(--game)_45%,transparent)]"
                  : isWrongPick
                    ? "arcade-shake border-warn bg-warn/25 text-text-bright"
                    : isPending
                      ? "border-[var(--game)] text-text-bright [background:color-mix(in_oklab,var(--game)_18%,var(--color-panel))]"
                      : "text-text-bright",
                tinted && locked && "opacity-60",
                isCorrect && rightPick && "arcade-pop",
              )}
            >
              <span className="min-w-0">{choice}</span>
            </button>
          );
        })}
      </div>

      {reveal !== null && note && (
        <p className="mt-3 text-[13.5px] leading-relaxed text-text-muted">{note}</p>
      )}

      <p aria-live="polite" className="sr-only">
        {reveal === null
          ? picked !== null
            ? "Answer locked."
            : ""
          : rightPick
            ? "Right."
            : `Wrong. The answer was ${choices[reveal.correctIndex] ?? ""}.`}
      </p>
    </div>
  );
}
