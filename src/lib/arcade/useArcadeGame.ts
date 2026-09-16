// The arcade engine hook: phase, score, combo, round, timer, and the comet
// payout for one run. Every game page is this hook + GameShell + one board
// primitive; no game owns its own timer or payout logic.
//
// The timer is deadline-based: a Date.now() target driven by
// requestAnimationFrame for display. Never setInterval accumulation, so a
// throttled background tab cannot stretch a round; if the tab hides past the
// deadline, the round expires the moment it returns.
//
// The frame loop runs at display rate but React state only moves when the
// printed numeral changes, about once a second. The smooth part of the
// countdown reaches the screen through useArcadeTimerPaint below, which writes
// a CSS custom property straight to the element drawing the clock. A game that
// re-rendered its board sixty times a second would be fighting the drag
// gesture for the same main thread.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { totalComets } from "./comets";
import type { ArcadePhase, PayoutLine } from "./types";

export interface ArcadeTimer {
  /** Seconds left, fractional, clamped at 0. */
  remaining: number;
  /** Seconds the countdown started from. */
  total: number;
}

/** A countdown in its last fifth. Shared so the bar, the ring and the numeral
 *  all change colour on the same value. */
export const ARCADE_TIMER_LOW = 0.2;

/** Remaining fraction of the running countdown, 1 at the start and 0 at the
 *  deadline. Null when nothing is counting down. */
type TimerFrac = number | null;

let liveFrac: TimerFrac = null;
const fracListeners = new Set<(frac: TimerFrac) => void>();

function publishFrac(frac: TimerFrac) {
  liveFrac = frac;
  for (const listener of fracListeners) listener(frac);
}

/**
 * Attach the returned ref to the root of a countdown display. The frame loop
 * writes two custom properties onto that element and its children read them:
 * --arcade-timer-frac every frame, and --arcade-timer-ink while the countdown
 * is in its last fifth. Neither is written until a countdown starts, so a
 * display rendered from its props alone still draws the right thing, and both
 * keep the last frame when the clock stops, so a bar that outlives the clock
 * (the dimmed one under a reveal) freezes exactly where it was.
 *
 * These two writes are the only imperative DOM in the arcade. They exist
 * because the alternative is a React render per frame, and because a colour
 * that flips at a threshold cannot be driven by a value sampled once a second:
 * the bar would turn orange up to a second before the number beside it.
 */
export function useArcadeTimerPaint<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    let low = false;
    const paint = (frac: TimerFrac) => {
      const el = ref.current;
      if (!el) return;
      if (frac === null) {
        el.style.removeProperty("--arcade-timer-frac");
        el.style.removeProperty("--arcade-timer-ink");
        low = false;
        return;
      }
      // Four places is well under a pixel on either display and keeps the
      // token short and free of exponent notation.
      el.style.setProperty("--arcade-timer-frac", frac.toFixed(4));
      // Touched only on the crossing, not once a frame.
      const nowLow = frac < ARCADE_TIMER_LOW;
      if (nowLow !== low) {
        low = nowLow;
        if (nowLow) el.style.setProperty("--arcade-timer-ink", "var(--warn, #fb923c)");
        else el.style.removeProperty("--arcade-timer-ink");
      }
    };

    paint(liveFrac);
    fracListeners.add(paint);
    return () => {
      fracListeners.delete(paint);
      paint(null);
    };
  }, []);

  return ref;
}

export interface ArcadeGameApi {
  phase: ArcadePhase;
  /** ready or ended -> playing. Resets score, combo, round, and payout. */
  start(): void;
  /** playing -> ended. Stops the timer and totals the payout. */
  finish(breakdown: PayoutLine[]): void;
  score: number;
  addScore(n: number): void;
  /** Consecutive correct answers. GameShell renders the chip from x2 up. */
  combo: number;
  hitCombo(): void;
  breakCombo(): void;
  round: number;
  nextRound(): void;
  /** Null when no countdown is running. */
  timer: ArcadeTimer | null;
  startTimer(seconds: number, onExpire: () => void): void;
  stopTimer(): void;
  /** Set by finish(). */
  comets: { earned: number; breakdown: PayoutLine[] };
  /** Milliseconds from start() to finish(). Null until the run ends. */
  durationMs: number | null;
}

export function useArcadeGame(): ArcadeGameApi {
  const [phase, setPhase] = useState<ArcadePhase>("ready");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [round, setRound] = useState(1);
  const [timer, setTimer] = useState<ArcadeTimer | null>(null);
  const [breakdown, setBreakdown] = useState<PayoutLine[]>([]);
  const [earned, setEarned] = useState(0);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const onExpireRef = useRef<(() => void) | null>(null);
  /** Whole seconds last pushed into React state, so the frame loop can skip
   *  the render when the numeral has not changed. */
  const shownRef = useRef(-1);

  const cancelFrame = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    cancelFrame();
    deadlineRef.current = null;
    onExpireRef.current = null;
    shownRef.current = -1;
    // No publish. The last frame stays on the element so a display that keeps
    // drawing after the clock stops holds the exact position it reached, which
    // the once-a-second props can no longer reconstruct. startTimer resets it.
    setTimer(null);
  }, [cancelFrame]);

  const startTimer = useCallback(
    (seconds: number, onExpire: () => void) => {
      cancelFrame();
      const total = seconds;
      const deadline = Date.now() + seconds * 1000;
      deadlineRef.current = deadline;
      onExpireRef.current = onExpire;
      shownRef.current = Math.ceil(total);
      publishFrac(1);
      setTimer({ remaining: total, total });

      const tick = () => {
        // A newer timer (or stopTimer) supersedes this loop.
        if (deadlineRef.current !== deadline) return;
        const remaining = Math.max(0, (deadline - Date.now()) / 1000);
        // Every frame, outside React: this is what the bar and the ring draw.
        publishFrac(total > 0 ? remaining / total : 0);
        // Once a second: this is what the numeral and the screen reader read.
        const shown = Math.ceil(remaining);
        if (shown !== shownRef.current) {
          shownRef.current = shown;
          setTimer({ remaining, total });
        }
        if (remaining <= 0) {
          deadlineRef.current = null;
          rafRef.current = null;
          const expire = onExpireRef.current;
          onExpireRef.current = null;
          expire?.();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [cancelFrame],
  );

  // Kill the display loop on unmount; nothing else holds a handle to it.
  useEffect(() => cancelFrame, [cancelFrame]);

  const start = useCallback(() => {
    stopTimer();
    setScore(0);
    setCombo(0);
    setRound(1);
    setBreakdown([]);
    setEarned(0);
    setDurationMs(null);
    startedAtRef.current = Date.now();
    setPhase("playing");
  }, [stopTimer]);

  const finish = useCallback(
    (lines: PayoutLine[]) => {
      stopTimer();
      setBreakdown(lines);
      setEarned(totalComets(lines));
      const startedAt = startedAtRef.current;
      setDurationMs(startedAt !== null ? Date.now() - startedAt : null);
      setPhase("ended");
    },
    [stopTimer],
  );

  const addScore = useCallback((n: number) => setScore((s) => s + n), []);
  const hitCombo = useCallback(() => setCombo((c) => c + 1), []);
  const breakCombo = useCallback(() => setCombo(0), []);
  const nextRound = useCallback(() => setRound((r) => r + 1), []);

  return useMemo(
    () => ({
      phase,
      start,
      finish,
      score,
      addScore,
      combo,
      hitCombo,
      breakCombo,
      round,
      nextRound,
      timer,
      startTimer,
      stopTimer,
      comets: { earned, breakdown },
      durationMs,
    }),
    [
      phase,
      start,
      finish,
      score,
      addScore,
      combo,
      hitCombo,
      breakCombo,
      round,
      nextRound,
      timer,
      startTimer,
      stopTimer,
      earned,
      breakdown,
      durationMs,
    ],
  );
}
