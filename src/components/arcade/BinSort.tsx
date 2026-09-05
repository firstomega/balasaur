// BinSort: one card with a face, two tinted bins. Swipe the card (a flick
// commits on speed, a slow drag on distance), tap a bin, or press an arrow
// key. The card tilts under the finger and leaves from wherever it was
// released, flying toward the bin it belongs in; a wrong sort holds first
// with "Goes X" so the miss is read. Exits stack, so the next card takes
// input the moment the last one is judged. A card carrying a verdict (Sequel
// or Fake) gets a REAL/FAKE stamp, flips to its story, and holds until tap
// or 2.5s; any input during the hold dismisses it rather than sorting the
// next card blind. Controlled: the parent owns the deck and judges every
// choice via onChoose; combos and scoring are the engine's job.

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";
import { TimerBar } from "./TimerBar";

export interface BinCard {
  id: string;
  label: string;
  /** Small mono line under the label, e.g. a year or "sequel to Jaws". */
  sub?: string | null;
  posterUrl?: string | null;
  /** Seed for the typographic face drawn when there is no poster. Defaults
   *  to the label; Sequel or Fake passes the anchor title so every fake
   *  sequel to the same film shares a look. */
  faceKey?: string | null;
  /** The truth about this card, shown on it after the call: the stamp slams
   *  in, the card flips to the story and holds. Omit for plain sorting. */
  verdict?: { stamp: "REAL" | "FAKE"; story: string } | null;
}

export interface BinDef {
  key: string;
  label: string;
}

export interface BinSortProps {
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
  /** The round clock, drawn above the card. Pass api.timer. */
  timer?: { remaining: number; total: number } | null;
  /** How long a verdict card holds on its story. Default 2500. */
  verdictHoldMs?: number;
}

const HOLD_WRONG_MS = 450;
const STAMP_MS = 650;
const FLIP_MS = 420;
const FLICK_PX_PER_MS = 0.5;
const SAMPLE_WINDOW_MS = 100;

const BIN_CSS = `
@keyframes binsort-wiggle {
  0%, 100% { transform: none; }
  22% { transform: translateX(-10px) rotate(-2deg); }
  50% { transform: none; }
  72% { transform: translateX(10px) rotate(2deg); }
}
.binsort-wiggle { animation: binsort-wiggle 900ms ease-in-out 500ms 1 both; }
.binsort-3d { transform-style: preserve-3d; transition: transform ${FLIP_MS}ms cubic-bezier(0.2, 0.8, 0.3, 1); }
.binsort-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
@media (prefers-reduced-motion: reduce) {
  .binsort-card { transform: none !important; transition: none !important; }
  .binsort-wiggle { animation: none; }
  .binsort-3d { transition: none; }
}
`;

interface Exit {
  key: number;
  card: BinCard;
  correct: boolean;
  /** Where the card flies: the bin it belongs in. */
  dir: 0 | 1;
  correctLabel: string;
  fromDx: number;
  fromRot: number;
  vx: number;
}

/** A stable 32-bit hash so the same title always draws the same face. */
export function faceHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Two hues from one hash: a deterministic poster ground. */
export function faceGradient(seed: string): string {
  const h = faceHash(seed);
  const h1 = h % 360;
  const h2 = (h1 + 36 + ((h >>> 9) % 40)) % 360;
  return `linear-gradient(160deg, hsl(${h1} 58% 34%), hsl(${h2} 62% 12%))`;
}

function tilt(dx: number): number {
  return Math.max(-10, Math.min(10, dx * 0.06));
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

function Face({ c, dim = false }: { c: BinCard; dim?: boolean }) {
  const poster = c.posterUrl ? tmdbImage(c.posterUrl, "w342") : "";
  return (
    <div
      className={cn("absolute inset-0 overflow-hidden rounded-[6px]", dim && "opacity-60")}
      style={poster ? undefined : { background: faceGradient(c.faceKey ?? c.label) }}
    >
      {poster ? (
        <img
          src={poster}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
        />
      ) : (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-3 rounded-[4px] border border-white/25"
          />
          <span className="absolute inset-0 flex items-center justify-center px-6 pb-8 text-center text-[26px] font-black uppercase leading-[1.05] tracking-[-0.02em] text-white/95 [text-shadow:0_2px_12px_rgba(0,0,0,0.45)]">
            {c.label}
          </span>
        </>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-10">
        {poster && (
          <span className="block text-[17px] font-black leading-tight tracking-[-0.01em] text-white">
            {c.label}
          </span>
        )}
        {c.sub && (
          <span className={cn("block font-mono text-[11px] text-white/75", poster && "mt-1")}>
            {c.sub}
          </span>
        )}
      </div>
    </div>
  );
}

function ExitCard({
  exit,
  holdMs,
  dismissTick,
  onRelease,
  onDone,
}: {
  exit: Exit;
  holdMs: number;
  /** Bumped by any input while a verdict holds; the card flies at once. */
  dismissTick: number;
  onRelease: (key: number, verdict: boolean) => void;
  onDone: (key: number) => void;
}) {
  const [stage, setStage] = useState<"seed" | "settle" | "fly">("seed");
  const [flipped, setFlipped] = useState(false);
  const verdict = exit.card.verdict ?? null;
  const flyMs = Math.round(Math.max(150, Math.min(280, 280 - Math.abs(exit.vx) * 90)));
  const timers = useRef<number[]>([]);
  const flownRef = useRef(false);
  const mountedAt = useRef(0);
  const releaseRef = useRef(onRelease);
  releaseRef.current = onRelease;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const firstTick = useRef(dismissTick);

  const fly = () => {
    if (flownRef.current) return;
    flownRef.current = true;
    releaseRef.current(exit.key, !!verdict);
    setStage("fly");
    timers.current.push(window.setTimeout(() => doneRef.current(exit.key), flyMs + 40));
  };
  const flyRef = useRef(fly);
  flyRef.current = fly;

  useEffect(() => {
    mountedAt.current = Date.now();
    const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    // Two frames so the seeded (release) position paints before any
    // transition runs from it.
    let raf1 = 0;
    let raf2 = 0;
    const afterPaint = (fn: () => void) => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(fn);
      });
    };
    if (verdict) {
      // Pulled back to center to be read, stamped, flipped, held.
      afterPaint(() => setStage("settle"));
      later(() => setFlipped(true), STAMP_MS);
      later(() => flyRef.current(), STAMP_MS + FLIP_MS + holdMs);
    } else if (exit.correct) {
      afterPaint(() => flyRef.current());
    } else {
      later(() => flyRef.current(), HOLD_WRONG_MS);
    }
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!verdict || dismissTick === firstTick.current) return;
    // Ignore a dismiss inside the stamp beat so a double-tap cannot skip
    // the story before it is readable.
    if (Date.now() - mountedAt.current < STAMP_MS) return;
    flyRef.current();
  }, [dismissTick, verdict]);

  const seed = `translateX(${exit.fromDx}px) rotate(${exit.fromRot}deg)`;
  const target =
    exit.dir === 0 ? "translateX(-160%) rotate(-14deg)" : "translateX(160%) rotate(14deg)";

  return (
    <div
      aria-hidden="true"
      onClick={verdict ? () => flyRef.current() : undefined}
      style={{
        transform:
          stage === "fly" ? target : stage === "settle" ? "translateX(0) rotate(0deg)" : seed,
        opacity: stage === "fly" ? 0 : 1,
        transition:
          stage === "fly"
            ? `transform ${flyMs}ms ease-in, opacity ${flyMs}ms ease-in`
            : stage === "settle"
              ? "transform 300ms cubic-bezier(0.2, 0.9, 0.3, 1.1)"
              : "none",
        perspective: "900px",
      }}
      className={cn(
        "binsort-card absolute inset-0 z-20 rounded-[6px]",
        verdict && !flownRef.current ? "cursor-pointer" : "pointer-events-none",
      )}
    >
      <div
        className={cn(
          "binsort-3d relative h-full w-full rounded-[6px] ring-2",
          exit.correct ? "ring-rating" : "ring-destructive",
        )}
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        <div className="binsort-face absolute inset-0 rounded-[6px]">
          <Face c={exit.card} />
          {verdict && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span
                className={cn(
                  "arcade-stamp rounded-[6px] border-[3px] bg-black/55 px-3 py-1 text-[40px] font-black uppercase leading-none tracking-[0.08em]",
                  verdict.stamp === "REAL" ? "border-rating text-rating" : "border-warn text-warn",
                )}
              >
                {verdict.stamp}
              </span>
            </span>
          )}
          {!verdict && !exit.correct && (
            <span className="absolute inset-x-3 top-3 rounded-[4px] border border-destructive/70 bg-black/80 px-2 py-1.5 text-center font-mono text-[11px] uppercase tracking-wider text-destructive">
              Goes {exit.correctLabel}
            </span>
          )}
        </div>
        {verdict && (
          <div
            className="binsort-face absolute inset-0 flex flex-col rounded-[6px] border border-border bg-panel p-4"
            style={{ transform: "rotateY(180deg)" }}
          >
            <span
              className={cn(
                "font-mono text-[11px] uppercase tracking-wider",
                exit.correct ? "text-rating" : "text-destructive",
              )}
            >
              {verdict.stamp === "REAL" ? "Real" : "Fake"}.{" "}
              {exit.correct ? "You called it." : "You missed."}
            </span>
            <span className="mt-2 text-[15px] font-black leading-tight tracking-[-0.01em] text-text-bright">
              {exit.card.label}
            </span>
            <span className="mt-2 flex-1 overflow-hidden text-[13.5px] leading-snug text-text">
              {verdict.story}
            </span>
            <span className="mt-2 font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
              Tap to continue
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function BinSort({
  card,
  nextCard,
  bins,
  disabled = false,
  onChoose,
  timer,
  verdictHoldMs = 2500,
}: BinSortProps) {
  const [drag, setDrag] = useState<{ dx: number; spring: boolean } | null>(null);
  const [pressed, setPressed] = useState(false);
  const [exits, setExits] = useState<Exit[]>([]);
  const [holdingVerdict, setHoldingVerdict] = useState(0);
  const [dismissTick, setDismissTick] = useState(0);
  const [live, setLive] = useState("");
  const [wiggleId, setWiggleId] = useState<string | null>(null);

  const stackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<null | {
    cardId: string;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
    samples: { x: number; t: number }[];
  }>(null);
  const seqRef = useRef(0);
  const springTimer = useRef<number | null>(null);
  const firstSeen = useRef<string | null>(null);

  // The first card of a run wiggles once toward each bin.
  useEffect(() => {
    if (!card || firstSeen.current) return;
    firstSeen.current = card.id;
    if (!reducedMotion()) setWiggleId(card.id);
  }, [card]);

  useEffect(
    () => () => {
      if (springTimer.current) window.clearTimeout(springTimer.current);
    },
    [],
  );

  const cardWidth = () => stackRef.current?.getBoundingClientRect().width ?? 260;
  const threshold = () => Math.max(80, Math.min(160, cardWidth() * 0.4));

  const choose = (dir: 0 | 1, from: { dx?: number; vx?: number } = {}) => {
    if (!card || disabled) return;
    if (holdingVerdict > 0) {
      // Input during a story hold dismisses the story; it never sorts the
      // card underneath unseen.
      setDismissTick((t) => t + 1);
      return;
    }
    const chosen = card;
    const correct = onChoose(dir);
    const correctDir: 0 | 1 = correct ? dir : dir === 0 ? 1 : 0;
    const correctLabel = bins[correctDir].label;
    setLive(
      chosen.verdict
        ? `${correct ? "Right" : "Wrong"}. ${chosen.label} is ${chosen.verdict.stamp.toLowerCase()}. ${chosen.verdict.story}`
        : correct
          ? `Right. ${chosen.label}: ${correctLabel}.`
          : `Wrong. ${chosen.label} goes ${correctLabel}.`,
    );
    setDrag(null);
    setPressed(false);
    setWiggleId(null);
    dragRef.current = null;
    const dx = from.dx ?? 0;
    const exit: Exit = {
      key: ++seqRef.current,
      card: chosen,
      correct,
      dir: correctDir,
      correctLabel,
      fromDx: dx,
      fromRot: tilt(dx),
      vx: from.vx ?? 0,
    };
    setExits((x) => [...x, exit]);
    if (chosen.verdict) setHoldingVerdict((n) => n + 1);
  };

  const releaseExit = (_key: number, verdict: boolean) => {
    if (verdict) setHoldingVerdict((n) => Math.max(0, n - 1));
  };
  const removeExit = (key: number) => setExits((x) => x.filter((e) => e.key !== key));

  // Arrow keys always work while a card is up; any key dismisses a story.
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
      if (
        holdingVerdict > 0 &&
        ["ArrowLeft", "ArrowRight", "Enter", " ", "Escape"].includes(e.key)
      ) {
        e.preventDefault();
        setDismissTick((t) => t + 1);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        choose(0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        choose(1);
      } else if (e.key === "Escape" && dragRef.current?.active) {
        dragRef.current = null;
        springBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const springBack = () => {
    setDrag({ dx: 0, spring: true });
    if (springTimer.current) window.clearTimeout(springTimer.current);
    springTimer.current = window.setTimeout(() => setDrag(null), 200);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!card || disabled || dragRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (holdingVerdict > 0) {
      setDismissTick((t) => t + 1);
      return;
    }
    dragRef.current = {
      cardId: card.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      samples: [{ x: e.clientX, t: e.timeStamp }],
    };
    setWiggleId(null);
    setPressed(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (card?.id !== d.cardId) {
      // The deck advanced under the finger (timer expiry); drop the drag.
      dragRef.current = null;
      setDrag(null);
      setPressed(false);
      return;
    }
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null;
        setPressed(false);
        return;
      }
      if (Math.abs(dx) < 6) return;
      d.active = true;
      setPressed(false);
    }
    d.samples.push({ x: e.clientX, t: e.timeStamp });
    if (d.samples.length > 6) d.samples.shift();
    // Under reduced motion the CSS kills the transform; dx still decides.
    setDrag({ dx, spring: false });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    setPressed(false);
    if (!d.active || card?.id !== d.cardId) {
      setDrag(null);
      return;
    }
    const dx = e.clientX - d.startX;
    // Velocity over the last hundred milliseconds of the gesture.
    const now = e.timeStamp;
    const recent = d.samples.filter((s) => now - s.t <= SAMPLE_WINDOW_MS);
    const first = recent[0] ?? d.samples[d.samples.length - 1];
    const dt = Math.max(1, now - first.t);
    const vx = (e.clientX - first.x) / dt;
    if (Math.abs(vx) >= FLICK_PX_PER_MS) {
      choose(vx > 0 ? 1 : 0, { dx, vx });
    } else if (Math.abs(dx) >= threshold()) {
      choose(dx > 0 ? 1 : 0, { dx, vx });
    } else {
      springBack();
    }
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    setPressed(false);
  };

  const armedBin: 0 | 1 | null =
    drag && !drag.spring && Math.abs(drag.dx) > threshold() / 2 ? (drag.dx > 0 ? 1 : 0) : null;
  const inputOpen = !disabled && !!card;
  const storyOpen = holdingVerdict > 0;

  const liveTransform = drag
    ? drag.spring
      ? "translateX(0) rotate(0deg)"
      : `translateX(${drag.dx}px) rotate(${tilt(drag.dx)}deg) scale(1.02)`
    : pressed
      ? "translateY(-4px) scale(1.02)"
      : undefined;

  const bin = (i: 0 | 1) => {
    const b = bins[i];
    const armed = armedBin === i;
    return (
      <button
        key={b.key}
        type="button"
        disabled={!inputOpen}
        aria-label={`${b.label} bin`}
        onClick={() => choose(i)}
        className={cn(
          "flex min-h-[76px] flex-1 items-center justify-center gap-2.5 rounded-[6px] border px-3 py-2 text-[15px] font-semibold leading-snug transition-colors",
          "lg:min-h-0 lg:min-w-[132px] lg:max-w-[220px] lg:flex-col lg:gap-3 lg:text-[17px]",
          i === 0 ? "order-2 lg:order-none" : "order-3 lg:order-none",
          armed
            ? "border-[var(--game,var(--primary))] bg-[var(--game,var(--primary))] text-[var(--game-ink,var(--primary-foreground))]"
            : "border-[color-mix(in_oklab,var(--game,var(--primary))_40%,var(--color-border))] text-text-bright [background:color-mix(in_oklab,var(--game,var(--primary))_14%,var(--color-panel))] hover:[background:color-mix(in_oklab,var(--game,var(--primary))_26%,var(--color-panel))]",
          !inputOpen && "opacity-50",
          storyOpen && "opacity-70",
        )}
      >
        {i === 0 && (
          <ArrowLeft
            className="h-7 w-7 shrink-0 lg:h-9 lg:w-9"
            strokeWidth={2.5}
            aria-hidden="true"
          />
        )}
        <span className="text-center">{b.label}</span>
        {i === 1 && (
          <ArrowRight
            className="h-7 w-7 shrink-0 lg:h-9 lg:w-9"
            strokeWidth={2.5}
            aria-hidden="true"
          />
        )}
      </button>
    );
  };

  // overflow-x: clip on the root. A dragged card tilts and slides past the
  // column edge and an exit clone flies to 160% of its width; without the
  // clip both extend the document sideways at 390 (a 260px card at +160%
  // reaches 676px) and the page scrolls under the thumb. Clip leaves the
  // vertical axis alone, so the press lift and the wiggle still show.
  return (
    <div className="overflow-x-clip">
      <style>{BIN_CSS}</style>
      <p aria-live="polite" className="sr-only">
        {live}
      </p>

      {timer && <TimerBar remaining={timer.remaining} total={timer.total} className="mb-4" />}

      <div
        role="group"
        aria-label="Bins"
        className="flex flex-wrap items-stretch gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-5"
      >
        {bin(0)}

        <div className="order-1 w-full lg:order-none lg:w-auto">
          <div
            ref={stackRef}
            className="relative mx-auto aspect-[2/3] w-[min(100%,260px)] select-none lg:w-[300px]"
          >
            {nextCard && (
              <div
                aria-hidden="true"
                className="binsort-card absolute inset-0 scale-[0.96] rounded-[6px] ring-1 ring-border"
              >
                <Face c={nextCard} dim />
              </div>
            )}

            {card && (
              <div
                key={card.id}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                style={{
                  touchAction: "pan-y",
                  transform: liveTransform,
                  transformOrigin: "50% 90%",
                  transition: drag?.spring
                    ? "transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1.2)"
                    : drag
                      ? "none"
                      : "transform 120ms ease-out",
                }}
                className={cn(
                  "binsort-card absolute inset-0 z-10 rounded-[6px] ring-1",
                  wiggleId === card.id && !drag && "binsort-wiggle",
                  armedBin !== null
                    ? "ring-2 ring-[var(--game,var(--primary))]"
                    : "ring-border-strong",
                  disabled ? "opacity-50" : "cursor-grab active:cursor-grabbing",
                )}
              >
                <Face c={card} />
              </div>
            )}

            {exits.map((exit) => (
              <ExitCard
                key={exit.key}
                exit={exit}
                holdMs={verdictHoldMs}
                dismissTick={dismissTick}
                onRelease={releaseExit}
                onDone={removeExit}
              />
            ))}
          </div>
        </div>

        {bin(1)}
      </div>
    </div>
  );
}
