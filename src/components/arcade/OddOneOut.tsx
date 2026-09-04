// OddOneOut: one movie, four actor names, one was never in it. Name tiles,
// not photos: the cast data carries no images, so the board is typographic.
// The 5-second countdown lives in the shell's TimerRing, driven by the game
// route; this board only takes the pick. Controlled: reveal state comes in
// as a prop, the pick goes out as a callback.

import { useEffect } from "react";

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
  choices: OddOneOutChoice[];
  /** Null while the round is open; set to resolve it. */
  reveal: OddOneOutReveal | null;
  disabled?: boolean;
  onPick: (index: number) => void;
}

export function OddOneOut({
  title,
  year,
  choices,
  reveal,
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
  const wrongPick =
    reveal !== null && reveal.pickedIndex !== null && reveal.pickedIndex !== reveal.correctIndex;

  return (
    <div>
      <p className="text-[15px] text-text">
        Not in <span className="font-semibold text-text-bright">{movieLabel}</span>:
      </p>

      <div role="group" aria-label="Actors" className="mt-3 grid grid-cols-2 gap-2.5">
        {choices.map((c, i) => {
          const isCorrect = reveal !== null && i === reveal.correctIndex;
          const isWrongPick = reveal !== null && wrongPick && i === reveal.pickedIndex;
          const tone = isCorrect
            ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
            : isWrongPick
              ? "border-orange-400/60 bg-orange-400/10 text-orange-300"
              : "border-border bg-panel text-text-bright";
          return (
            <button
              key={i}
              type="button"
              disabled={!open}
              onClick={() => onPick(i)}
              className={`relative min-h-[64px] rounded-[5px] border px-3 py-2 text-[15px] font-semibold leading-snug ${tone} ${
                reveal === null && disabled ? "opacity-50" : ""
              }`}
            >
              <span
                className="absolute left-1.5 top-1 font-mono text-[10px] text-text-dim"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              {c.name}
              {reveal !== null && !isCorrect && c.role && (
                <span className="mt-0.5 block font-mono text-[10.5px] font-normal text-text-dim">
                  in it as {c.role}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className="sr-only">
        {reveal === null
          ? ""
          : reveal.pickedIndex === reveal.correctIndex
            ? `Right. ${choices[reveal.correctIndex]?.name} was never in ${movieLabel}.`
            : `${reveal.pickedIndex === null ? "Time ran out." : "Wrong."} ${
                choices[reveal.correctIndex]?.name ?? ""
              } was the one not in ${movieLabel}.`}
      </p>
    </div>
  );
}
