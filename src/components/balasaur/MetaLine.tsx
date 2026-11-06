import { Fragment } from "react";

/**
 * A meta line, "2025 · Animation · 2 Seasons", that wraps like a sentence. Each
 * bit holds together, so "TV-MA" and "1 Season" never split, and the dot rides
 * at the end of the bit before it, so a wrapped line ends on a dot and the next
 * one starts on a word, never on a separator.
 */
export function MetaLine({ bits, className }: { bits: string[]; className?: string }) {
  const shown = bits.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <p className={className}>
      {shown.map((bit, i) => {
        const last = i === shown.length - 1;
        return (
          <Fragment key={i}>
            <span className="whitespace-nowrap">
              {bit}
              {!last && " ·"}
            </span>
            {!last && " "}
          </Fragment>
        );
      })}
    </p>
  );
}
