// BinSort: one card in the center, two labeled bins. Swipe the card left or
// right with pointer tracking, or tap the two big bin buttons, which always
// work; ArrowLeft and ArrowRight too. The exit flies 150ms toward the chosen
// bin, the next card is already rendered underneath, and a wrong sort holds
// the card for a beat to show which bin it belonged in before flying.
// Controlled: the parent owns the deck and judges every choice via onChoose;
// combos and scoring are the engine's job.

import { useEffect, useRef, useState } from "react";
import { tmdbImage } from "@/lib/tmdbImage";

export interface BinCard {
  id: string;
  label: string;
  /** Small mono line under the label, e.g. a year or a franchise. */
  sub?: string | null;
  posterUrl?: string | null;
}

export interface BinDef {
  key: string;
  label: string;
}

interface BinSortProps {
  /** The card in play. Null when the deck is done. */
  card: BinCard | null;
  /** Rendered underneath the card in play so the advance is instant. */
  nextCard?: BinCard | null;
  /** Index 0 is the left bin, 1 the right. */
  bins: [BinDef, BinDef];
  disabled?: boolean;
  /** Judge one sort. Return true when the card belongs in that bin. The
   *  parent advances the deck in the same call. */
  onChoose: (binIndex: 0 | 1) => boolean;
}

const FLY_MS = 150;
const FLASH_MS = 450;

const BIN_CSS = `
@keyframes binsort-fly-l {
  to { transform: translateX(-150%) rotate(-8deg); opacity: 0; }
}
@keyframes binsort-fly-r {
  to { transform: translateX(150%) rotate(8deg); opacity: 0; }
}
.binsort-fly-l { animation: binsort-fly-l 150ms ease-in forwards; }
.binsort-fly-r { animation: binsort-fly-r 150ms ease-in forwards; }
.binsort-spring { transition: transform 150ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .binsort-card { transform: none !important; }
  .binsort-fly-l, .binsort-fly-r { animation: none; opacity: 0; }
  .binsort-spring { transition: none; }
}
`;

interface ExitState {
  card: BinCard;
  dir: 0 | 1;
  correct: boolean;
  /** The bin the card belonged in; shown when the sort was wrong. */
  correctLabel: string;
  stage: "flash" | "fly";
  fromDx: number;
}

export function BinSort({ card, nextCard, bins, disabled = false, onChoose }: BinSortProps) {
  const [drag, setDrag] = useState<{ dx: number; spring: boolean } | null>(null);
  const [exit, setExit] = useState<ExitState | null>(null);
  const [live, setLive] = useState("");

  const dragRef = useRef<null | {
    cardId: string;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  }>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(
    () => () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };

  const threshold = () =>
    Math.max(90, Math.min(240, typeof window === "undefined" ? 120 : window.innerWidth * 0.3));

  const choose = (dir: 0 | 1, fromDx = 0) => {
    if (!card || disabled || exit) return;
    const chosen = card;
    const correct = onChoose(dir);
    const correctLabel = correct ? bins[dir].label : bins[dir === 0 ? 1 : 0].label;
    setLive(
      correct
        ? `Right. ${chosen.label}: ${correctLabel}.`
        : `Wrong. ${chosen.label} goes ${correctLabel}.`,
    );
    setDrag(null);
    dragRef.current = null;
    if (correct) {
      setExit({ card: chosen, dir, correct, correctLabel, stage: "fly", fromDx });
      later(() => setExit(null), FLY_MS + 30);
    } else {
      setExit({ card: chosen, dir, correct, correctLabel, stage: "flash", fromDx });
      later(() => {
        setExit((x) => (x && x.card.id === chosen.id ? { ...x, stage: "fly" } : x));
        later(() => setExit(null), FLY_MS + 30);
      }, FLASH_MS);
    }
  };

  // Arrow keys always work while a card is up.
  useEffect(() => {
    if (!card || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        choose(0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        choose(1);
      } else if (e.key === "Escape" && dragRef.current?.active) {
        dragRef.current = null;
        setDrag({ dx: 0, spring: true });
        later(() => setDrag(null), FLY_MS + 30);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!card || disabled || exit || dragRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragRef.current = {
      cardId: card.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (card?.id !== d.cardId) {
      // The deck advanced under the finger (timer expiry); drop the drag.
      dragRef.current = null;
      setDrag(null);
      return;
    }
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null;
        return;
      }
      if (Math.abs(dx) < 8) return;
      d.active = true;
    }
    // Under reduced motion the CSS kills the transform; dx still decides commit.
    setDrag({ dx, spring: false });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    if (!d.active || card?.id !== d.cardId) {
      setDrag(null);
      return;
    }
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) >= threshold()) {
      choose(dx > 0 ? 1 : 0, dx);
    } else {
      setDrag({ dx: 0, spring: true });
      later(() => setDrag(null), FLY_MS + 30);
    }
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    setDrag(null);
  };

  const armedBin: 0 | 1 | null =
    drag && !drag.spring && Math.abs(drag.dx) > threshold() / 2 ? (drag.dx > 0 ? 1 : 0) : null;

  const cardFace = (c: BinCard) => (
    <>
      {c.posterUrl && (
        <img
          src={tmdbImage(c.posterUrl, "w342")}
          alt=""
          draggable={false}
          className="pointer-events-none mb-2.5 h-[192px] w-[128px] select-none rounded-[4px] object-cover"
        />
      )}
      <span className="text-center text-[16px] font-semibold leading-snug text-text-bright">
        {c.label}
      </span>
      {c.sub && (
        <span className="mt-1 text-center font-mono text-[11px] text-text-dim">{c.sub}</span>
      )}
    </>
  );

  const cardShell =
    "absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-[6px] border bg-panel p-4";

  return (
    <div>
      <style>{BIN_CSS}</style>
      <p aria-live="polite" className="sr-only">
        {live}
      </p>

      <div className="relative mx-auto h-[300px] w-full max-w-[260px] select-none">
        {nextCard && (
          <div
            aria-hidden="true"
            className={`${cardShell} binsort-card scale-[0.96] border-border opacity-60`}
          >
            {cardFace(nextCard)}
          </div>
        )}

        {card && (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            style={{
              touchAction: "pan-y",
              transform:
                drag && !exit
                  ? `translateX(${drag.dx}px) rotate(${Math.max(-6, Math.min(6, drag.dx * 0.04))}deg)`
                  : undefined,
            }}
            className={`${cardShell} binsort-card z-10 ${
              drag?.spring ? "binsort-spring" : ""
            } ${armedBin !== null ? "border-primary" : "border-border"} ${
              disabled ? "opacity-50" : "cursor-grab"
            }`}
          >
            {cardFace(card)}
          </div>
        )}

        {exit && (
          <div
            aria-hidden="true"
            style={
              exit.stage === "flash" && exit.fromDx !== 0
                ? { transform: `translateX(${exit.fromDx}px)` }
                : undefined
            }
            className={`${cardShell} binsort-card z-20 ${
              exit.stage === "fly" ? (exit.dir === 0 ? "binsort-fly-l" : "binsort-fly-r") : ""
            } ${exit.correct ? "border-emerald-400/60" : "border-orange-400/60"}`}
          >
            {cardFace(exit.card)}
            {!exit.correct && (
              <span className="absolute inset-x-3 bottom-3 rounded-[4px] border border-orange-400/60 bg-background/90 px-2 py-1.5 text-center font-mono text-[11px] uppercase tracking-wider text-orange-300">
                Goes {exit.correctLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <div role="group" aria-label="Bins" className="mt-4 flex gap-2.5">
        {bins.map((bin, i) => (
          <button
            key={bin.key}
            type="button"
            disabled={disabled || !card}
            onClick={() => choose(i as 0 | 1)}
            className={`min-h-[52px] flex-1 rounded-[5px] border bg-panel px-3 py-2 text-[14px] font-semibold leading-snug text-text-bright disabled:opacity-50 ${
              armedBin === i ? "border-primary ring-1 ring-primary/40" : "border-border"
            }`}
          >
            {bin.label}
            <span
              aria-hidden="true"
              className="mt-0.5 hidden font-mono text-[10px] font-normal text-text-dim lg:block"
            >
              {i === 0 ? "←" : "→"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
