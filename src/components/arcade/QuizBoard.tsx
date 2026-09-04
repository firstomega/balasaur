// QuizBoard: one question, four stacked answer buttons, a locked reveal.
// Built for The 8PM Screening, where the pick is confirmed by the server:
// `picked` holds the button pressed while the answer is in flight, `reveal`
// lands when the server says which choice was right. Controlled: no timers,
// no scoring, no network in here.

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
  disabled = false,
  onPick,
}: QuizBoardProps) {
  const locked = disabled || picked !== null || reveal !== null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
          Q{questionIndex + 1}/{questionCount}
        </span>
        <div className="flex items-center gap-1" aria-hidden="true">
          {Array.from({ length: questionCount }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${
                i < questionIndex
                  ? "bg-primary/50"
                  : i === questionIndex
                    ? "bg-primary"
                    : "bg-border-strong"
              }`}
            />
          ))}
        </div>
      </div>

      <p className="mt-3 text-[16px] leading-snug text-text-bright">{question}</p>

      <div role="group" aria-label="Answers" className="mt-4 space-y-2">
        {choices.map((choice, i) => {
          const isCorrect = reveal !== null && i === reveal.correctIndex;
          const isWrongPick = reveal !== null && i === picked && i !== reveal.correctIndex;
          const isPending = reveal === null && i === picked;
          const tone = isCorrect
            ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
            : isWrongPick
              ? "border-orange-400/60 bg-orange-400/10 text-orange-300"
              : isPending
                ? "border-primary bg-panel text-text-bright ring-1 ring-primary/40"
                : locked
                  ? "border-border bg-panel text-text opacity-60"
                  : "border-border bg-panel text-text";
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              aria-pressed={i === picked}
              onClick={() => onPick(i)}
              className={`block min-h-[44px] w-full rounded-[5px] border px-3 py-2.5 text-left text-[14px] leading-snug ${tone}`}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {reveal !== null && note && (
        <p className="mt-3 text-[13px] leading-relaxed text-text-muted">{note}</p>
      )}

      <p aria-live="polite" className="sr-only">
        {reveal === null
          ? picked !== null
            ? "Answer locked."
            : ""
          : picked === reveal.correctIndex
            ? "Right."
            : `Wrong. The answer was ${choices[reveal.correctIndex] ?? ""}.`}
      </p>
    </div>
  );
}
