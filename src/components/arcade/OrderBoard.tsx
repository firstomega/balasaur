// OrderBoard: five titles the player arranges, then a judged reveal. One
// shape at every width: a strip of five posters over a timeline axis, 64px
// wide at 390 and up to 150px at lg. A card drags by its grip (touch drags
// at once there: a bar under the poster on small screens, a handle between
// the arrows at lg) or by its body (mouse after 5px, touch after a 240ms
// hold, Escape cancels), and every card also carries earlier/later buttons
// so ordering never needs drag. Siblings FLIP into their new slot in 150ms;
// the dragged card lifts, follows the pointer, and springs into place on
// release. The live order goes to the parent on every move, so whatever the
// board shows is what gets scored, and a lock (timer, submit) cancels any
// drag in flight. On reveal each card is judged in place, staggered 80ms,
// with its year shown so the order explains itself. The board is safe to
// leave mounted under the end panel: with `reveal` set it renders only the
// judged strip.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, GripHorizontal, GripVertical } from "lucide-react";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";
import { TimerBar } from "./TimerBar";

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

export interface OrderBoardProps {
  /** Cards in their current display order. Owned by the parent. */
  cards: OrderCard[];
  /** Null while arranging; set after submit to lock and judge the rows. */
  reveal: OrderReveal | null;
  disabled?: boolean;
  /** Called with the live order on every change, including mid-drag. */
  onReorder: (ids: string[]) => void;
  onSubmit: () => void;
  /** The round clock, drawn above the strip. Pass api.timer. */
  timer?: { remaining: number; total: number } | null;
  /** Default "Lock it in". */
  submitLabel?: string;
}

const HOLD_MS = 240;
const FLIP_MS = 150;
const SPRING_MS = 260;
const STAGGER_MS = 80;

const ORDER_CSS = `
@keyframes orderboard-judge {
  from { opacity: 0.3; transform: scale(0.96); }
  to { opacity: 1; transform: none; }
}
.orderboard-judge { animation: orderboard-judge 320ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .orderboard-row { transform: none !important; transition: none !important; }
  .orderboard-judge { animation: none; opacity: 1; }
}
`;

const NUDGE_BTN =
  "flex h-7 w-7 items-center justify-center rounded-[4px] border border-border text-text-muted hover:border-[var(--game,var(--primary))] hover:text-text-bright disabled:opacity-30 disabled:hover:border-border disabled:hover:text-text-muted lg:h-8 lg:w-8";

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

export function OrderBoard({
  cards,
  reveal,
  disabled = false,
  onReorder,
  onSubmit,
  timer,
  submitLabel = "Lock it in",
}: OrderBoardProps) {
  const locked = disabled || reveal !== null;

  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragView, setDragView] = useState<{ id: string; offset: number; spring: boolean } | null>(
    null,
  );
  const [live, setLive] = useState("");

  const dragRef = useRef<null | {
    id: string;
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    startIndex: number;
    active: boolean;
    holdTimer: number | null;
    horizontal: boolean;
    stride: number;
    reduced: boolean;
    blockTouch: ((e: TouchEvent) => void) | null;
  }>(null);
  const dragOrderRef = useRef<string[] | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const lastRects = useRef(new Map<string, DOMRect>());
  const springTimer = useRef<number | null>(null);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const activateRef = useRef<() => void>(() => {});
  const clearRef = useRef<() => void>(() => {});

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
    clearRef.current = clearDrag;

    const activate = () => {
      const d = dragRef.current;
      if (!d || d.active) return;
      d.active = true;
      d.reduced = reducedMotion();
      // Axis and stride come from where the rows actually sit, so the same
      // code drags a column at 390 and a strip at lg.
      const ids = cardsRef.current.map((c) => c.id);
      const a = rowRefs.current.get(ids[0])?.getBoundingClientRect();
      const b = rowRefs.current.get(ids[1])?.getBoundingClientRect();
      if (a && b) {
        const dx = b.left - a.left;
        const dy = b.top - a.top;
        d.horizontal = Math.abs(dx) > Math.abs(dy);
        d.stride = Math.abs(d.horizontal ? dx : dy) || 80;
      } else {
        d.horizontal = false;
        d.stride = 80;
      }
      const el = rowRefs.current.get(d.id);
      if (el) el.style.transition = "none";
      dragOrderRef.current = ids;
      setDragOrder([...ids]);
      if (!d.reduced) setDragView({ id: d.id, offset: 0, spring: false });
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
      const dxRaw = e.clientX - d.startX;
      const dyRaw = e.clientY - d.startY;
      if (!d.active) {
        const dist = Math.hypot(dxRaw, dyRaw);
        if (d.pointerType === "mouse" || d.holdTimer === null) {
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
      const delta = d.horizontal ? dxRaw : dyRaw;
      const target = Math.max(
        0,
        Math.min(order.length - 1, d.startIndex + Math.round(delta / d.stride)),
      );
      const cur = order.indexOf(d.id);
      if (target !== cur) {
        order.splice(cur, 1);
        order.splice(target, 0, d.id);
        setDragOrder([...order]);
        onReorderRef.current([...order]);
      }
      if (!d.reduced) {
        setDragView({
          id: d.id,
          offset: delta - (target - d.startIndex) * d.stride,
          spring: false,
        });
      }
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const wasActive = d.active;
      const id = d.id;
      const reduced = d.reduced;
      clearDrag();
      if (!wasActive || reduced) return;
      // The order is already with the parent; only the row's residual offset
      // is left, and it springs into the slot.
      setDragView({ id, offset: 0, spring: true });
      if (springTimer.current) window.clearTimeout(springTimer.current);
      springTimer.current = window.setTimeout(() => setDragView(null), SPRING_MS);
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
      if (springTimer.current) window.clearTimeout(springTimer.current);
      clearDrag();
    };
  }, []);

  // A lock mid-drag (timer expiry, submit) cancels the drag. The parent
  // already holds the live order, so what is scored is what is shown.
  useEffect(() => {
    if (locked) clearRef.current();
  }, [locked]);

  const startDrag = (e: React.PointerEvent, id: string, fromGrip: boolean) => {
    if (locked || dragRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const startIndex = cardsRef.current.findIndex((c) => c.id === id);
    if (startIndex < 0) return;
    const d = {
      id,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      startIndex,
      active: false,
      holdTimer: null as number | null,
      horizontal: false,
      stride: 0,
      reduced: false,
      blockTouch: null as ((ev: TouchEvent) => void) | null,
    };
    dragRef.current = d;
    // The grip drags at once on any pointer; a touch on the row body must
    // hold first so the page can still scroll.
    if (!fromGrip && e.pointerType !== "mouse") {
      d.holdTimer = window.setTimeout(() => {
        if (dragRef.current === d && !d.active) activateRef.current();
      }, HOLD_MS);
    }
  };

  const byId = new Map(cards.map((c) => [c.id, c]));
  const orderIds = dragOrder ?? cards.map((c) => c.id);
  const orderKey = orderIds.join("|");

  // FLIP: every row that moved slots (except the one under the pointer)
  // starts where it was and transitions to where it is now.
  useLayoutEffect(() => {
    const reduced = reducedMotion();
    const draggingId = dragRef.current?.active ? dragRef.current.id : null;
    const next = new Map<string, DOMRect>();
    for (const id of orderIds) {
      const el = rowRefs.current.get(id);
      if (!el) continue;
      const cur = el.getBoundingClientRect();
      next.set(id, cur);
      const prev = lastRects.current.get(id);
      if (!prev || reduced || id === draggingId) continue;
      const dx = prev.left - cur.left;
      const dy = prev.top - cur.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.getBoundingClientRect();
      el.style.transition = `transform ${FLIP_MS}ms ease`;
      el.style.transform = "";
      const clear = () => {
        el.style.transition = "";
        el.removeEventListener("transitionend", clear);
      };
      el.addEventListener("transitionend", clear);
      window.setTimeout(clear, FLIP_MS + 50);
    }
    lastRects.current = next;
    // orderIds is derived from orderKey; the key is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

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

  const grip = (id: string, axis: "bar" | "handle", className?: string) => (
    <span
      aria-hidden="true"
      onPointerDown={(e) => {
        e.stopPropagation();
        startDrag(e, id, true);
      }}
      className={cn(
        "flex shrink-0 touch-none items-center justify-center rounded-[4px] text-text-dim",
        axis === "bar" ? "h-5 w-full" : "h-8 w-6",
        locked ? "invisible" : "cursor-grab active:cursor-grabbing",
        className,
      )}
    >
      {axis === "bar" ? (
        <GripHorizontal className="h-4 w-4" />
      ) : (
        <GripVertical className="h-4 w-4" />
      )}
    </span>
  );

  const axisLabel = "font-mono text-[10.5px] uppercase tracking-wider text-text-dim";

  return (
    <div>
      <style>{ORDER_CSS}</style>
      <p aria-live="polite" className="sr-only">
        {live}
      </p>

      {timer && !reveal && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <div className={cn("flex items-baseline justify-between", timer && !reveal ? "mt-3" : "")}>
        <span className={axisLabel}>Earliest</span>
        <span className={axisLabel}>Latest</span>
      </div>

      <ol
        className="mt-1.5 flex items-stretch gap-0.5 lg:gap-3"
        aria-label="Your order, first to last"
      >
        {orderIds.map((id, i) => {
          const c = byId.get(id);
          if (!c) return null;
          const isDragging = dragView?.id === id;
          const inPlace = reveal ? reveal.correctOrder[i] === id : null;
          const tone = reveal
            ? inPlace
              ? "border-rating/60 bg-rating/10"
              : "border-warn/60 bg-warn/10"
            : isDragging
              ? "border-[var(--game,var(--primary))] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]"
              : "border-border";
          const style: React.CSSProperties | undefined = isDragging
            ? {
                transform: dragView.spring
                  ? "translate(0, 0)"
                  : dragRef.current?.horizontal
                    ? `translateX(${dragView.offset}px) scale(1.03)`
                    : `translateY(${dragView.offset}px) scale(1.02)`,
                transition: dragView.spring
                  ? `transform ${SPRING_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1.2), box-shadow ${SPRING_MS}ms ease`
                  : "none",
              }
            : reveal
              ? { animationDelay: `${i * STAGGER_MS}ms` }
              : undefined;
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) rowRefs.current.set(id, el);
                else rowRefs.current.delete(id);
              }}
              onPointerDown={(e) => startDrag(e, id, false)}
              style={style}
              className={cn(
                "orderboard-row relative flex min-w-0 flex-1 select-none flex-col items-stretch gap-1 rounded-[5px] border bg-panel lg:gap-2 lg:rounded-[6px] lg:p-2",
                tone,
                isDragging && "z-10",
                reveal && "orderboard-judge",
                !locked && "cursor-grab",
              )}
            >
              {c.posterUrl ? (
                <img
                  src={tmdbImage(c.posterUrl, "w342")}
                  alt=""
                  draggable={false}
                  className="pointer-events-none mx-auto aspect-[2/3] w-full max-w-[150px] select-none rounded-[4px] object-cover"
                />
              ) : (
                <span className="mx-auto aspect-[2/3] w-full max-w-[150px] rounded-[4px] border border-border" />
              )}
              <span className="line-clamp-2 min-w-0 px-0.5 text-center text-[10.5px] leading-tight text-text lg:px-0 lg:text-[13px]">
                {c.title}
              </span>
              {reveal ? (
                <span
                  className={cn(
                    "arcade-flip-in shrink-0 text-center font-mono text-[13px] font-semibold tabular-nums lg:text-[16px]",
                    inPlace ? "text-rating" : "text-warn",
                  )}
                  style={{ animationDelay: `${i * STAGGER_MS + 120}ms` }}
                >
                  {c.year}
                </span>
              ) : (
                <span
                  className="mt-auto flex shrink-0 flex-col items-stretch gap-0.5 lg:flex-row lg:items-center lg:justify-center lg:gap-1.5"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {grip(id, "bar", "lg:hidden")}
                  <span className="flex items-center justify-between gap-1 lg:contents">
                    <button
                      type="button"
                      disabled={locked || i === 0}
                      aria-label={`Move ${c.title} earlier`}
                      onClick={() => nudge(i, -1)}
                      className={NUDGE_BTN}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {grip(id, "handle", "hidden lg:flex")}
                    <button
                      type="button"
                      disabled={locked || i === orderIds.length - 1}
                      aria-label={`Move ${c.title} later`}
                      onClick={() => nudge(i, 1)}
                      className={NUDGE_BTN}
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* The axis under the strip: one tick per slot, at every width. */}
      <div aria-hidden="true" className="relative mt-2 h-5 lg:mt-3">
        <span className="absolute inset-x-0 top-0 h-[2px] bg-[color-mix(in_oklab,var(--game,var(--primary))_55%,var(--color-border))]" />
        <span className="absolute inset-x-0 top-0 h-[10px] w-[2px] bg-[var(--game,var(--primary))]" />
        <span className="absolute right-0 top-0 h-[10px] w-[2px] bg-[var(--game,var(--primary))]" />
        <div className="grid grid-cols-5 gap-0.5 pt-2 lg:gap-3">
          {orderIds.map((id, i) => (
            <span
              key={id}
              className="text-center font-mono text-[10.5px] tabular-nums text-text-dim"
            >
              {i + 1}
            </span>
          ))}
        </div>
      </div>

      {!reveal && (
        <button
          type="button"
          disabled={disabled}
          onClick={onSubmit}
          className="mt-4 w-full rounded-full bg-[var(--game,var(--primary))] py-3 text-[15px] font-black tracking-[-0.01em] text-[var(--game-ink,var(--primary-foreground))] transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 motion-reduce:transform-none"
        >
          {submitLabel}
        </button>
      )}
    </div>
  );
}
