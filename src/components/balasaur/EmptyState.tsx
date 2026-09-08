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
 * It is not a card. Two earlier versions were: first a bordered box stretched
 * to the full 1050px of a desktop column, then a 480px box centred in it. Both
 * drew a rectangle around the emptiness and made a person measure it. What is
 * left is the mark, the claim and the way out, set at the top of the column on
 * the same left edge as the page's own heading, so an empty list reads as a
 * page with a short answer rather than as a container that failed to fill.
 *
 * The mark leads and the text sits beside it, which is also what makes the
 * block short: on a 390px phone the old centred stack ran most of a screen
 * before the visitor reached the button that got them out of it.
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
  /** `panel` is the page-level state. `inline` sits inside an existing panel. */
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
  // A surface that paints its own ground behind this block needs room inside
  // it; a bare page does not, and padding there would push the mark off the
  // left edge the page's own heading sits on. The library room is the only
  // caller that paints one, and it does it with `style`.
  const onOwnGround = Boolean(style?.backgroundColor);

  return (
    <div
      style={style}
      className={
        (inline
          ? "flex w-full items-start gap-3 py-5 text-left"
          : "flex w-full items-start gap-4 text-left sm:gap-6") +
        (inline ? "" : onOwnGround ? " px-5 py-7 sm:px-7 sm:py-8" : " py-4 sm:py-6") +
        // Nothing here draws a border of its own. A caller that names one in
        // `style` gets it, which is how the library room keeps its edge.
        (style?.borderColor ? " border" : "") +
        (className ? " " + className : "")
      }
    >
      <DinoMark
        mood={mood}
        size={inline ? 32 : 96}
        filled={!inline}
        className={
          inline
            ? "mt-0.5 h-8 w-8 shrink-0 text-primary/70"
            : "-ml-1 h-16 w-16 shrink-0 text-primary/90 sm:h-24 sm:w-24"
        }
      />
      <div className={"min-w-0 " + (inline ? "max-w-[62ch]" : "max-w-[560px]")}>
        <p
          className={
            inline
              ? "text-[14px] font-bold leading-snug tracking-[-0.01em] text-text-bright"
              : "text-[20px] font-black leading-[1.15] tracking-[-0.02em] text-text-bright sm:text-[26px]"
          }
        >
          {line}
        </p>
        {hint && (
          <p
            className={
              inline
                ? "mt-1 text-[12.5px] leading-relaxed text-text-muted"
                : "mt-2 text-[14px] leading-relaxed text-text-muted sm:text-[15px]"
            }
          >
            {hint}
          </p>
        )}
        {action && (
          <div className={(inline ? "mt-3" : "mt-5") + " flex flex-wrap items-center gap-2"}>
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
