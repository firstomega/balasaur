// OrderBoard: five title cards in a column, arranged by the player and then
// judged. Drag a row to reorder (mouse drags immediately after 5px, touch
// after a 240ms hold, Escape cancels; the library.tsx conventions), and every
// row also carries up and down buttons so ordering never requires drag.
// Controlled: the parent owns the order and the reveal; on submit it passes
// the true order back and the board colors each row in place, year shown, so
// the final order explains itself.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { tmdbImage } from "@/lib/tmdbImage";

export interface OrderCard {
  id: string;
  title: string;
  posterUrl?: string | null;
  /** Shown only after reveal, next to the verdict color. */
  year: string | number;
}

export interface OrderReveal {
  /** The true order, first to last. Locks the board. */
  correctOrder: string[];
}

interface OrderBoardProps {
  /** Cards in their current display order. Owned by the parent. */
  cards: OrderCard[];
  /** Null while arranging; set after submit to lock and color the rows. */
  reveal: OrderReveal | null;
  disabled?: boolean;
  onReorder: (ids: string[]) => void;
  onSubmit: () => void;
}

const ROW_GAP = 8;

const ORDER_CSS = `
@media (prefers-reduced-motion: reduce) {
  .orderboard-row { transform: none !important; }
}
`;

const NUDGE_BTN =
  "flex h-8 w-9 items-center justify-center rounded-[4px] border border-border text-text-muted hover:border-primary hover:text-text-bright disabled:opacity-30 disabled:hover:border-border disabled:hover:text-text-muted";

export function OrderBoard({
  cards,
  reveal,
  disabled = false,
  onReorder,
  onSubmit,
}: OrderBoardProps) {
  const locked = disabled || reveal !== null;

  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragView, setDragView] = useState<{ id: string; offset: number } | null>(null);
  const [live, setLive] = useState("");

  const dragRef = useRef<null | {
    id: string;
    pointerId: number;
    pointerType: string;
    startY: number;
    startIndex: number;
    active: boolean;
    holdTimer: number | null;
    stride: number;
    reduced: boolean;
    blockTouch: ((e: TouchEvent) => void) | null;
  }>(null);
  const dragOrderRef = useRef<string[] | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const activateRef = useRef<() => void>(() => {});

  useEffect(() => {
    const clearDrag = () => {
      const d = dragRef.current;
      if (d?.holdTimer) window.clearTimeout(d.holdTimer);
      if (d?.blockTouch) document.removeEventListener("touchmove", d.blockTouch);
      dragRef.current = null;
      dragOrderRef.current = null;
      setDragOrder(null);
      setDragView(null);
    };

    const activate = () => {
      const d = dragRef.current;
      if (!d || d.active) return;
      d.active = true;
      try {
        d.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {
        d.reduced = true;
      }
      const el = rowRefs.current.get(d.id);
      d.stride = (el?.getBoundingClientRect().height ?? 72) + ROW_GAP;
      dragOrderRef.current = cardsRef.current.map((c) => c.id);
      setDragOrder([...dragOrderRef.current]);
      if (!d.reduced) setDragView({ id: d.id, offset: 0 });
      d.blockTouch = (ev: TouchEvent) => ev.preventDefault();
      document.addEventListener("touchmove", d.blockTouch, { passive: false });
      try {
        if (navigator.vibrate) navigator.vibrate(10);
      } catch {
        /* ignore */
      }
    };
    activateRef.current = activate;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active) {
        const dist = Math.abs(e.clientY - d.startY);
        if (d.pointerType === "mouse") {
          if (dist > 5) activate();
        } else if (dist > 8) {
          // The finger is scrolling, not holding; let the page have it.
          clearDrag();
          return;
        }
        if (!dragRef.current?.active) return;
      }
      const order = dragOrderRef.current;
      if (!order) return;
      const dy = e.clientY - d.startY;
      const target = Math.max(
        0,
        Math.min(order.length - 1, d.startIndex + Math.round(dy / d.stride)),
      );
      const cur = order.indexOf(d.id);
      if (target !== cur) {
        order.splice(cur, 1);
        order.splice(target, 0, d.id);
        setDragOrder([...order]);
      }
      if (!d.reduced) {
        setDragView({ id: d.id, offset: dy - (target - d.startIndex) * d.stride });
      }
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const order = d.active ? dragOrderRef.current : null;
      clearDrag();
      if (order) onReorderRef.current(order);
    };

    const onCancel = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      clearDrag();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragRef.current?.active) clearDrag();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      clearDrag();
    };
  }, []);

  const onRowPointerDown = (e: React.PointerEvent, id: string) => {
    if (locked || dragRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const startIndex = cardsRef.current.findIndex((c) => c.id === id);
    if (startIndex < 0) return;
    const d = {
      id,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startY: e.clientY,
      startIndex,
      active: false,
      holdTimer: null as number | null,
      stride: 0,
      reduced: false,
      blockTouch: null as ((ev: TouchEvent) => void) | null,
    };
    dragRef.current = d;
    if (e.pointerType !== "mouse") {
      d.holdTimer = window.setTimeout(() => {
        if (dragRef.current === d && !d.active) activateRef.current();
      }, 240);
    }
  };

  const byId = new Map(cards.map((c) => [c.id, c]));
  const orderIds = dragOrder ?? cards.map((c) => c.id);

  const nudge = (i: number, dir: -1 | 1) => {
    if (locked) return;
    const ids = cardsRef.current.map((c) => c.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onReorder(ids);
    const moved = byId.get(ids[j]);
    if (moved) setLive(`${moved.title} is now ${j + 1} of ${ids.length}.`);
  };

  return (
    <div>
      <style>{ORDER_CSS}</style>
      <p aria-live="polite" className="sr-only">
        {live}
      </p>

      <ol className="space-y-2" aria-label="Your order, first to last">
        {orderIds.map((id, i) => {
          const c = byId.get(id);
          if (!c) return null;
          const isDragging = dragView?.id === id;
          const inPlace = reveal ? reveal.correctOrder[i] === id : null;
          const tone = reveal
            ? inPlace
              ? "border-emerald-400/60 bg-emerald-400/10"
              : "border-orange-400/60 bg-orange-400/10"
            : isDragging
              ? "border-primary shadow-lg"
              : "border-border";
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) rowRefs.current.set(id, el);
                else rowRefs.current.delete(id);
              }}
              onPointerDown={(e) => onRowPointerDown(e, id)}
              style={isDragging ? { transform: `translateY(${dragView.offset}px)` } : undefined}
              className={`orderboard-row relative flex select-none items-center gap-2.5 rounded-[5px] border bg-panel px-2.5 py-1.5 ${tone} ${
                isDragging ? "z-10" : ""
              } ${locked ? "" : "cursor-grab"}`}
            >
              {c.posterUrl ? (
                <img
                  src={tmdbImage(c.posterUrl, "w154")}
                  alt=""
                  draggable={false}
                  className="pointer-events-none h-[68px] w-[45px] shrink-0 select-none rounded-[3px] object-cover"
                />
              ) : (
                <span className="h-[68px] w-[45px] shrink-0 rounded-[3px] border border-border" />
              )}
              <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-text">{c.title}</span>
              {reveal ? (
                <span
                  className={`shrink-0 font-mono text-[13px] tabular-nums ${
                    inPlace ? "text-emerald-300" : "text-orange-300"
                  }`}
                >
                  {c.year}
                </span>
              ) : (
                <span
                  className="flex shrink-0 flex-col gap-1"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={locked || i === 0}
                    aria-label={`Move ${c.title} up`}
                    onClick={() => nudge(i, -1)}
                    className={NUDGE_BTN}
                  >
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={locked || i === orderIds.length - 1}
                    aria-label={`Move ${c.title} down`}
                    onClick={() => nudge(i, 1)}
                    className={NUDGE_BTN}
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {!reveal && (
        <button
          type="button"
          disabled={disabled}
          onClick={onSubmit}
          className="mt-4 w-full rounded-[5px] bg-primary py-2.5 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Submit order
        </button>
      )}
    </div>
  );
}
