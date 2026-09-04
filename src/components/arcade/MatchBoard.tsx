// MatchBoard: N text prompts (taglines, quotes) paired against N title cards
// (posters). Tap-first: arm one side, tap the other to commit, in either
// order. A pointer drag of a prompt card onto a poster also commits on
// desktop mice, never required. Controlled: the parent owns the matched
// list and judges every attempt via onPair; the board knows nothing about
// scoring, combos, or where rounds come from.

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Check } from "lucide-react";
import { tmdbImage } from "@/lib/tmdbImage";

export interface MatchPrompt {
  id: string;
  text: string;
}

export interface MatchTitleCard {
  id: string;
  title: string;
  year?: string | null;
  posterUrl?: string | null;
}

export interface MatchPair {
  promptId: string;
  titleId: string;
}

interface MatchBoardProps {
  prompts: MatchPrompt[];
  titles: MatchTitleCard[];
  /** Locked pairs, in the order they were made. Owned by the parent. */
  matched: MatchPair[];
  disabled?: boolean;
  /** Judge one attempt. Return true for a correct pair (the parent then adds
   *  it to `matched`); on false the board shakes both elements and re-arms
   *  nothing. Combo bookkeeping is the parent's job. */
  onPair: (promptId: string, titleId: string) => boolean;
}

const SHAKE_CSS = `
@keyframes arcade-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}
.arcade-shake { animation: arcade-shake 200ms ease-in-out; }
`;

type Armed = { kind: "prompt" | "title"; id: string } | null;

export function MatchBoard({
  prompts,
  titles,
  matched,
  disabled = false,
  onPair,
}: MatchBoardProps) {
  const [armed, setArmed] = useState<Armed>(null);
  const [shaking, setShaking] = useState<Set<string>>(new Set());
  const [live, setLive] = useState("");
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(
    null,
  );
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matchedPromptIds = new Set(matched.map((m) => m.promptId));
  const matchedTitleIds = new Set(matched.map((m) => m.titleId));
  const openPrompts = prompts.filter((p) => !matchedPromptIds.has(p.id));
  const openTitles = titles.filter((t) => !matchedTitleIds.has(t.id));

  const commit = (promptId: string, titleId: string) => {
    if (disabled) return;
    const ok = onPair(promptId, titleId);
    setArmed(null);
    if (ok) {
      setLive("Matched.");
    } else {
      setLive("Not a match.");
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      setShaking(new Set([promptId, titleId]));
      shakeTimerRef.current = setTimeout(() => setShaking(new Set()), 300);
    }
  };

  const tap = (kind: "prompt" | "title", id: string) => {
    if (disabled) return;
    if (dragRef.current?.moved) return; // a drag just committed; swallow the click
    if (armed && armed.kind !== kind) {
      commit(kind === "prompt" ? id : armed.id, kind === "title" ? id : armed.id);
      return;
    }
    setArmed(armed?.id === id ? null : { kind, id });
  };

  // Desktop-only drag of a prompt card onto a poster. Touch keeps tap-to-pair
  // (and its scroll gesture); mice get the shortcut.
  const onPromptPointerDown = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (disabled || e.pointerType !== "mouse" || e.button !== 0) return;
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPromptPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    setDrag({ id: d.id, dx, dy });
  };
  const onPromptPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    if (d.moved) {
      const hit = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-match-title]");
      const titleId = hit?.dataset.matchTitle;
      if (titleId && !matchedTitleIds.has(titleId)) commit(d.id, titleId);
      // Keep `moved` so the click that follows this pointerup is swallowed,
      // then forget the drag on the next tick.
      setTimeout(() => {
        dragRef.current = null;
      }, 0);
    } else {
      dragRef.current = null;
    }
  };

  const dragStyle = (id: string): CSSProperties | undefined =>
    drag && drag.id === id
      ? { transform: `translate(${drag.dx}px, ${drag.dy}px)`, zIndex: 20, position: "relative" }
      : undefined;

  const titleLabel = (t: MatchTitleCard) => (t.year ? `${t.title} (${t.year})` : t.title);

  return (
    <div>
      <style>{SHAKE_CSS}</style>
      <p aria-live="polite" className="sr-only">
        {live}
      </p>

      {matched.length > 0 && (
        <ul className="space-y-1.5" aria-label="Matched pairs">
          {matched.map((m) => {
            const prompt = prompts.find((p) => p.id === m.promptId);
            const title = titles.find((t) => t.id === m.titleId);
            if (!prompt || !title) return null;
            return (
              <li
                key={m.promptId}
                className="flex items-center gap-2.5 rounded-[5px] border border-border bg-panel px-2.5 py-1.5 opacity-70"
              >
                {title.posterUrl ? (
                  <img
                    src={tmdbImage(title.posterUrl, "w154")}
                    alt=""
                    draggable={false}
                    className="h-[48px] w-[32px] shrink-0 rounded-[3px] object-cover"
                  />
                ) : (
                  <span className="h-[48px] w-[32px] shrink-0 rounded-[3px] border border-border" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text-muted">{prompt.text}</span>
                  <span className="block font-mono text-[11px] text-text-dim">
                    {titleLabel(title)}
                  </span>
                </span>
                <Check className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                <span className="sr-only">Matched</span>
              </li>
            );
          })}
        </ul>
      )}

      {openPrompts.length > 0 && (
        <div className={`flex gap-2.5 sm:flex-col ${matched.length > 0 ? "mt-3" : ""}`}>
          <div
            role="group"
            aria-label="Titles"
            className="flex shrink-0 flex-col gap-2 sm:flex-row sm:justify-center"
          >
            {openTitles.map((t) => {
              const isArmed = armed?.kind === "title" && armed.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-match-title={t.id}
                  disabled={disabled}
                  aria-pressed={isArmed}
                  aria-label={titleLabel(t)}
                  onClick={() => tap("title", t.id)}
                  className={`relative h-[108px] w-[72px] overflow-hidden rounded-[4px] border sm:h-[144px] sm:w-[96px] ${
                    isArmed ? "border-primary ring-1 ring-primary/40" : "border-border"
                  } ${shaking.has(t.id) ? "arcade-shake" : ""} disabled:opacity-50`}
                >
                  {t.posterUrl ? (
                    <img
                      src={tmdbImage(t.posterUrl, "w154")}
                      alt=""
                      draggable={false}
                      className="pointer-events-none h-full w-full select-none object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-panel px-1 text-center text-[11px] leading-tight text-text">
                      {t.title}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Prompts"
            className="flex min-w-0 flex-1 flex-col gap-2 sm:grid sm:grid-cols-5"
          >
            {openPrompts.map((p) => {
              const isArmed = armed?.kind === "prompt" && armed.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isArmed}
                  style={dragStyle(p.id)}
                  onClick={() => tap("prompt", p.id)}
                  onPointerDown={(e) => onPromptPointerDown(e, p.id)}
                  onPointerMove={onPromptPointerMove}
                  onPointerUp={onPromptPointerUp}
                  className={`min-h-[44px] w-full rounded-[5px] border bg-panel px-3 py-2.5 text-left text-[13px] leading-snug text-text ${
                    isArmed ? "border-primary ring-1 ring-primary/40" : "border-border"
                  } ${shaking.has(p.id) ? "arcade-shake" : ""} disabled:opacity-50`}
                >
                  {p.text}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
