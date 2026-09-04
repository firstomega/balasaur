// The arcade engine hook: phase, score, combo, round, timer, and the comet
// payout for one run. Every game page is this hook + GameShell + one board
// primitive; no game owns its own timer or payout logic.
//
// The timer is deadline-based: a Date.now() target driven by
// requestAnimationFrame for display. Never setInterval accumulation, so a
// throttled background tab cannot stretch a round; if the tab hides past the
// deadline, the round expires the moment it returns.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { totalComets } from "./comets";
import type { ArcadePhase, PayoutLine } from "./types";

export interface ArcadeTimer {
  /** Seconds left, fractional, clamped at 0. */
  remaining: number;
  /** Seconds the countdown started from. */
  total: number;
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
    setTimer(null);
  }, [cancelFrame]);

  const startTimer = useCallback(
    (seconds: number, onExpire: () => void) => {
      cancelFrame();
      const total = seconds;
      const deadline = Date.now() + seconds * 1000;
      deadlineRef.current = deadline;
      onExpireRef.current = onExpire;
      setTimer({ remaining: total, total });

      const tick = () => {
        // A newer timer (or stopTimer) supersedes this loop.
        if (deadlineRef.current !== deadline) return;
        const remaining = Math.max(0, (deadline - Date.now()) / 1000);
        setTimer({ remaining, total });
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
