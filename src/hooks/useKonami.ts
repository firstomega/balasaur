import { useEffect, useRef } from "react";

/** Typing in a field is typing, not a shortcut. */
export function isTypingTarget(
  el: { tagName?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** The ring buffer: append and keep only the last `size` characters. */
export function pushKey(buffer: string, key: string, size: number): string {
  if (size < 1) return "";
  return (buffer + key.toLowerCase()).slice(-size);
}

/**
 * Watch for a short literal sequence of printable keys and fire once when it
 * lands. One `keydown` listener; state is a single closure string trimmed to
 * the length of `code` on every key, so the idle cost is that string and
 * nothing else. No timers, no state updates, no re-renders until it matches.
 */
export function useKonami(code: string, onMatch: () => void): void {
  // Kept in a ref so a caller passing an inline arrow does not resubscribe the
  // listener on every render.
  const handler = useRef(onMatch);
  handler.current = onMatch;

  useEffect(() => {
    const want = code.toLowerCase();
    if (!want) return;
    let buffer = "";

    const onKey = (e: KeyboardEvent) => {
      // Printable single characters only: this drops Shift, arrows, F-keys.
      if (e.key.length !== 1) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target as HTMLElement | null)) return;

      buffer = pushKey(buffer, e.key, want.length);
      if (buffer === want) {
        buffer = "";
        handler.current();
      }
    };

    window.addEventListener("keydown", onKey, { passive: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [code]);
}
