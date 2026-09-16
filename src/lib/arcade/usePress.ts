// usePress: the pixels between the finger landing and the verdict arriving.
//
// Every answer surface in the arcade used to move only on :hover, which does
// not exist on a phone, so a tap produced nothing at all until the round
// resolved and players tapped again thinking they had missed. This hook is
// the one place that decides what "the finger is down on this surface" means.
//
// Pointer discipline is modelled on BinSort: one pointer at a time, the id
// remembered so a second finger cannot release the first one's press, and a
// release on every way a gesture can end. Notably it does NOT call
// setPointerCapture: capture would redirect pointerup to the captured element
// and a finger that slid off a wrong answer would still commit it. Instead the
// press follows the pointer's position, so sliding off drops it and sliding
// back picks it up again, which is what every native button does.
//
// A board holds one of these for all of its surfaces and asks it which id is
// down, so N cards cost one piece of state.

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

/** How far past a surface's edge the finger may stray and still count as on
 *  it. Fingers are wide and edges are exact. */
const SLOP_PX = 10;

export interface PressBindings {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: PointerEvent<HTMLElement>) => void;
}

export interface Press<Id> {
  /** The surface currently under a finger, or null. */
  pressed: Id | null;
  isPressed: (id: Id) => boolean;
  /** Spread onto the surface: `{...press.bind(card.id)}`. */
  bind: (id: Id) => PressBindings;
  /** Drop the press without waiting for the pointer, e.g. once a choice has
   *  committed and the surface is about to be judged. */
  release: () => void;
}

function inside(el: Element, x: number, y: number): boolean {
  const r = el.getBoundingClientRect();
  return (
    x >= r.left - SLOP_PX &&
    x <= r.right + SLOP_PX &&
    y >= r.top - SLOP_PX &&
    y <= r.bottom + SLOP_PX
  );
}

/**
 * @param enabled False while the board is locked, disabled, or resolving.
 *   Flipping it to false releases any press already down, so a surface can
 *   never be left stuck under a verdict.
 */
export function usePress<Id extends string | number = string>(enabled = true): Press<Id> {
  const [pressed, setPressed] = useState<Id | null>(null);
  const pointerRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const release = useCallback(() => {
    pointerRef.current = null;
    setPressed(null);
  }, []);

  useEffect(() => {
    if (!enabled) release();
  }, [enabled, release]);

  // A pointer released outside the window, or over some other element,
  // never reports back to the surface. Without this the press sticks.
  useEffect(() => {
    if (pressed === null) return;
    const end = (e: globalThis.PointerEvent) => {
      if (pointerRef.current !== null && e.pointerId !== pointerRef.current) return;
      release();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [pressed, release]);

  useEffect(() => () => release(), [release]);

  const bind = useCallback(
    (id: Id): PressBindings => ({
      onPointerDown: (e) => {
        if (!enabledRef.current) return;
        // Right and middle buttons are not an answer.
        if (e.pointerType === "mouse" && e.button !== 0) return;
        // A second finger does not steal the first one's card.
        if (pointerRef.current !== null) return;
        pointerRef.current = e.pointerId;
        setPressed(id);
      },
      onPointerMove: (e) => {
        if (pointerRef.current === null || e.pointerId !== pointerRef.current) return;
        const on = inside(e.currentTarget, e.clientX, e.clientY);
        setPressed((p) => (on ? id : p === id ? null : p));
      },
      onPointerUp: (e) => {
        if (pointerRef.current !== null && e.pointerId !== pointerRef.current) return;
        release();
      },
      onPointerCancel: (e) => {
        if (pointerRef.current !== null && e.pointerId !== pointerRef.current) return;
        release();
      },
      onPointerLeave: (e) => {
        if (pointerRef.current !== null && e.pointerId !== pointerRef.current) return;
        release();
      },
    }),
    [release],
  );

  return { pressed, isPressed: (id: Id) => pressed === id, bind, release };
}

// --- The shared press vocabulary -------------------------------------------
// Four boards, one treatment, so a tap on a trivia answer and a tap on a
// poster say the same thing. Deliberately small: a scale down and a rim in
// the game's hue, no colour change, no size change, no layout.

/** PRESSED. Under reduced motion the scale drops and the rim carries it. */
export const PRESS_CLASS =
  "scale-[0.97] duration-75 ring-2 ring-[var(--game,var(--primary))] motion-reduce:transform-none";

/** COMMITTED and slow: the locked surface itself says it is still working.
 *  Boards render this in a <style> tag the way BinSort carries its own
 *  keyframes; a duplicate tag on a page is a few hundred bytes. */
export const WAIT_CSS = `
@keyframes arcade-wait {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.arcade-wait { animation: arcade-wait 850ms ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .arcade-wait { animation: none; } }
`;

/** How long a commit waits before it admits the answer is taking a while. */
export const WAIT_SLOW_MS = 900;

/** The shortest a commit stays on screen before the verdict may replace it.
 *  A verdict that lands in 40ms reads as if the tap did nothing. */
export const COMMIT_FLOOR_MS = 280;

/** True once a commit has been open longer than WAIT_SLOW_MS. Resets the
 *  moment the commit closes. */
export function useCommitWait(active: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const t = window.setTimeout(() => setSlow(true), WAIT_SLOW_MS);
    return () => window.clearTimeout(t);
  }, [active]);
  return slow;
}
