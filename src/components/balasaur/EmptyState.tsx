import type { CSSProperties, ReactNode } from "react";
import { DinoMark, type DinoMood } from "./DinoMark";

/**
 * The one empty state. Every dead end on the site renders this, so a person who
 * hits two of them recognises the second.
 *
 * The shape is fixed: a claim, then the way out. `line` states what is true
 * about this list; `hint` says the one action that changes it; `action` carries
 * the controls that do it. A dead end with no exit is the failure this
 * component exists to prevent, so `action` is expected on anything the visitor
 * can act on.
 *
 * The box is capped at 480px and centred. Stretched to the full 1050px of a
 * desktop main column it held a small mark and two short lines across a void,
 * which read as a broken layout rather than as a dead end. 480px is the
 * measure the two lines actually want, and the mark is sized to that box.
 */
export interface EmptyStateProps {
  /** The claim. One sentence, no adjectives, no apology for the design. */
  line: string;
  /** What to do next, in words. */
  hint?: string;
  /** The controls that do it: a Link, a button, or a few of them. */
  action?: ReactNode;
  /** Defaults to `sleep`. `chomp` suits a state the visitor just emptied. */
  mood?: DinoMood;
  /** `panel` is the standalone card. `inline` sits inside an existing panel. */
  variant?: "panel" | "inline";
  /** Extra classes on the outer box. */
  className?: string;
  /** Inline overrides on the outer box, for surfaces with their own palette
   *  (the library room). Inline wins over the token classes deterministically;
   *  a competing Tailwind utility would not. */
  style?: CSSProperties;
}

/** Filled control. Use for the single action that most people want. */
export const EMPTY_ACTION_CLASS =
  "inline-flex cursor-pointer items-center justify-center rounded-[5px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90";

/** Outlined control. Use for the alternative. */
export const EMPTY_ACTION_QUIET_CLASS =
  "inline-flex cursor-pointer items-center justify-center rounded-[5px] border border-border-strong bg-background px-4 py-2 text-[13px] font-semibold text-text-bright transition-colors hover:border-primary hover:text-primary";

export function EmptyState({
  line,
  hint,
  action,
  mood = "sleep",
  variant = "panel",
  className,
  style,
}: EmptyStateProps) {
  const inline = variant === "inline";

  return (
    <div
      style={style}
      className={
        (inline
          ? "mx-auto flex w-full max-w-[480px] flex-col items-center px-4 py-6 text-center"
          : "mx-auto flex w-full max-w-[480px] flex-col items-center rounded-[5px] border border-border bg-panel px-8 py-12 text-center") +
        (className ? " " + className : "")
      }
    >
      <DinoMark
        mood={mood}
        size={inline ? 32 : 96}
        className={inline ? "h-8 w-8 text-primary/70" : "h-24 w-24 text-primary/80"}
      />
      <p
        className={
          inline
            ? "mt-3 text-[14px] font-bold leading-snug tracking-[-0.01em] text-text-bright"
            : "mt-5 text-[19px] font-black leading-snug tracking-[-0.02em] text-text-bright"
        }
      >
        {line}
      </p>
      {hint && (
        <p
          className={
            inline
              ? "mt-1 text-[12.5px] leading-relaxed text-text-muted"
              : "mt-2 text-[13.5px] leading-relaxed text-text-muted"
          }
        >
          {hint}
        </p>
      )}
      {action && (
        <div
          className={
            (inline ? "mt-3" : "mt-5") + " flex w-full flex-wrap items-center justify-center gap-2"
          }
        >
          {action}
        </div>
      )}
    </div>
  );
}
