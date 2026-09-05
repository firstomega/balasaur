// OddOneOut: one movie, four actor names, one was never in it. A pip strip
// counts the night's rounds; the poster is the anchor beside the prompt; the
// four answers are large cards in four tints with the name centered; the
// countdown is a bar right under the cards and shows nothing but the clock.
// On reveal the odd one fills with the game hue and the three real actors
// show the part they played. Controlled: reveal state comes in as a prop,
// the pick goes out as a callback, the clock belongs to the game route.

import { useEffect, type CSSProperties } from "react";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";
import type { ArcadeTimer } from "@/lib/arcade/useArcadeGame";
import { TimerBar } from "./TimerBar";

export interface OddOneOutChoice {
  name: string;
  /** The part this actor played when they ARE in the movie, e.g.
   *  "Neil McCauley". Shown on reveal. Absent for the impostor. */
  role?: string | null;
}

export interface OddOneOutReveal {
  /** Index of the impostor, the right answer. */
  correctIndex: number;
  /** What the player picked, or null when the clock ran out. */
  pickedIndex: number | null;
}

interface OddOneOutProps {
  title: string;
  year?: string | number | null;
  /** The movie's poster. Falls back to a typographic card. */
  posterUrl?: string | null;
  choices: OddOneOutChoice[];
  /** Null while the round is open; set to resolve it. */
  reveal: OddOneOutReveal | null;
  /** The round clock, drawn as a bar under the cards. Null hides the bar
   *  but keeps its height so the board never jumps. */
  timer?: ArcadeTimer | null;
  /** 1-based number of the round in play. Fills the pip strip. */
  round?: number;
  /** Rounds in the run, usually eight. */
  rounds?: number;
  /** Outcome of each finished round, in order: the pips color from it.
   *  Without it every round before this one counts as right. */
  results?: (boolean | null | undefined)[];
  /** "Round 3 of 8". Read for the pip strip when `round`/`rounds` are not
   *  passed; never printed on the timer. */
  roundLabel?: string;
  disabled?: boolean;
  onPick: (index: number) => void;
}

/** Four tints, one per answer position, so the cards read as four choices
 *  and not four copies of one box. Tokens, never hex. */
const TINTS = ["var(--hue-ruby)", "var(--hue-blue)", "var(--hue-sun)", "var(--hue-teal)"];

/** Where the pips count from when the route only passes a label. */
function parseRound(label?: string): { round: number; rounds: number } | null {
  const m = label?.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);
  if (!m) return null;
  const round = Number(m[1]);
  const rounds = Number(m[2]);
  return round >= 1 && rounds >= round ? { round, rounds } : null;
}

export function OddOneOut({
  title,
  year,
  posterUrl,
  choices,
  reveal,
  timer,
  round,
  rounds,
  results,
  roundLabel,
  disabled = false,
  onPick,
}: OddOneOutProps) {
  const open = !disabled && !reveal;

  // Keys 1-4 answer while the round is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      )
        return;
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) {
        e.preventDefault();
        onPick(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, choices.length, onPick]);

  const movieLabel = year ? `${title} (${year})` : title;
  const rightPick = reveal !== null && reveal.pickedIndex === reveal.correctIndex;
  const wrongPick =
    reveal !== null && reveal.pickedIndex !== null && reveal.pickedIndex !== reveal.correctIndex;

  const count =
    round !== undefined && rounds !== undefined ? { round, rounds } : parseRound(roundLabel);
  const pipTone = (i: number): "right" | "wrong" | "now" | "todo" => {
    if (!count) return "todo";
    const known = results?.[i];
    if (known === true) return "right";
    if (known === false) return "wrong";
    if (i === count.round - 1) {
      if (reveal !== null) return rightPick ? "right" : "wrong";
      return "now";
    }
    if (results === undefined && i < count.round - 1) return "right";
    return "todo";
  };

  return (
    <div className="mx-auto w-full max-w-[800px]">
      {/* The pips: the run at a glance, right or wrong per round. */}
      {count && (
        <div
          className="mb-3 flex items-center gap-1 sm:mb-4"
          role="img"
          aria-label={`Round ${count.round} of ${count.rounds}`}
        >
          {Array.from({ length: count.rounds }, (_, i) => {
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
      )}

      {/* The prompt: poster as the anchor, the title in display type. */}
      <div className="flex items-center gap-4 sm:gap-6">
        <div
          className="w-[96px] shrink-0 overflow-hidden rounded-[6px] border border-border bg-panel sm:w-[160px]"
          style={{ aspectRatio: "2 / 3" }}
        >
          {posterUrl ? (
            <img
              key={posterUrl}
              src={tmdbImage(posterUrl, "w342")}
              alt=""
              draggable={false}
              className="arcade-flip-in h-full w-full object-cover"
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center px-2 text-center text-[13px] font-black leading-tight tracking-[-0.02em] text-text-bright sm:text-[18px]"
              style={{
                background:
                  "linear-gradient(160deg, color-mix(in oklch, var(--game) 70%, #0b0d10), color-mix(in oklch, var(--game) 30%, #0b0d10))",
              }}
            >
              {title}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--game)]">
            Never in
          </p>
          <h2 className="mt-1 text-[24px] font-black leading-[1.05] tracking-[-0.02em] text-text-bright sm:text-[36px]">
            {title}
          </h2>
          {year ? (
            <p className="mt-1 font-mono text-[12px] text-text-muted sm:text-[13px]">{year}</p>
          ) : null}
        </div>
      </div>

      {/* Four answers, four tints, the name centered. */}
      <div
        role="group"
        aria-label="Actors"
        className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3"
      >
        {choices.map((c, i) => {
          const isCorrect = reveal !== null && i === reveal.correctIndex;
          const isWrongPick = wrongPick && i === reveal?.pickedIndex;
          const tint = TINTS[i % TINTS.length];
          return (
            <button
              key={i}
              type="button"
              disabled={!open}
              onClick={() => onPick(i)}
              style={
                isCorrect || isWrongPick
                  ? undefined
                  : ({
                      "--tint": tint,
                      background: "color-mix(in oklch, var(--tint) 25%, var(--color-panel))",
                      borderColor: "color-mix(in oklch, var(--tint) 55%, var(--color-border))",
                    } as CSSProperties)
              }
              className={cn(
                "relative flex min-h-[76px] flex-col items-center justify-center rounded-[6px] border px-3 py-3 text-center transition-[transform,background-color,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:transform-none sm:min-h-[92px] sm:px-4",
                open && "hover:-translate-y-0.5",
                isCorrect &&
                  "border-[var(--game)] bg-[var(--game)] text-[var(--game-ink)] [box-shadow:0_0_24px_color-mix(in_oklab,var(--game)_45%,transparent)]",
                isCorrect && rightPick && "arcade-pop",
                isWrongPick && "arcade-shake border-warn bg-warn/25 text-text-bright",
                !isCorrect && !isWrongPick && "text-text-bright",
                reveal !== null && !isCorrect && !isWrongPick && "opacity-70",
                reveal === null && disabled && "opacity-50",
              )}
            >
              <span className="text-[17px] font-black leading-tight tracking-[-0.02em] sm:text-[20px]">
                {c.name}
              </span>
              {reveal !== null && (
                <span
                  className={cn(
                    "mt-1 block font-mono text-[10.5px] leading-tight sm:text-[11px]",
                    isCorrect ? "text-[var(--game-ink)]/80" : "text-text-muted",
                  )}
                >
                  {isCorrect ? "never in it" : c.role ? `in it as ${c.role}` : "in it"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* The clock, right under what it times. Height reserved between rounds. */}
      <div className="mt-3 min-h-[40px] sm:mt-4">
        {timer && reveal === null ? (
          <TimerBar remaining={timer.remaining} total={timer.total} />
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {reveal === null
          ? ""
          : rightPick
            ? `Right. ${choices[reveal.correctIndex]?.name} was never in ${movieLabel}.`
            : `${reveal.pickedIndex === null ? "Time ran out." : "Wrong."} ${
                choices[reveal.correctIndex]?.name ?? ""
              } was the one not in ${movieLabel}.`}
      </p>
    </div>
  );
}
