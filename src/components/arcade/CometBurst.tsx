import { useContext, useEffect, useRef, useState } from "react";
import { ArcadeCometTarget, CometMark } from "./CometChip";

// The payout flight: up to 12 comet glyphs rise off the payout total and fly
// to the CometChip in the shell header, 600ms each, staggered 40ms. Pure CSS
// transforms. With prefers-reduced-motion, or with no chip on screen to fly
// at, nothing renders and the chip count simply updates.
//
// Render it inside a relatively positioned element over the score area; it
// overlays that element and unmounts itself when the flight lands.

const MAX_GLYPHS = 12;
const FLIGHT_MS = 600;
const STAGGER_MS = 40;

export function CometBurst({ count }: { count: number }) {
  const n = Math.max(0, Math.min(count, MAX_GLYPHS));
  const target = useContext(ArcadeCometTarget);
  const hostRef = useRef<HTMLDivElement>(null);
  const [delta, setDelta] = useState<{ x: number; y: number } | null>(null);
  const [flying, setFlying] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (n <= 0) return;
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // no matchMedia: treat as reduced, count only
      reduced = true;
    }
    const host = hostRef.current;
    const chip = target?.current ?? null;
    if (reduced || !host || !chip) {
      setDone(true);
      return;
    }
    const from = host.getBoundingClientRect();
    const to = chip.getBoundingClientRect();
    setDelta({
      x: to.left + to.width / 2 - (from.left + from.width / 2),
      y: to.top + to.height / 2 - (from.top + from.height / 2),
    });
    // Two frames so the glyphs paint at rest before the transition runs.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setFlying(true));
    });
    const timer = setTimeout(() => setDone(true), FLIGHT_MS + STAGGER_MS * n + 100);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timer);
    };
  }, [n, target]);

  if (n <= 0 || done) return null;

  return (
    <div ref={hostRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
      {delta &&
        Array.from({ length: n }, (_, i) => {
          // A small deterministic spread so twelve glyphs read as a burst,
          // not a stack.
          const ox = ((i % 4) - 1.5) * 12;
          const oy = (Math.floor(i / 4) - 1) * 10;
          return (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 text-primary"
              style={{
                transform: flying
                  ? `translate(calc(-50% + ${delta.x}px), calc(-50% + ${delta.y}px)) scale(0.4)`
                  : `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px)) scale(1)`,
                opacity: flying ? 0 : 1,
                transition: `transform ${FLIGHT_MS}ms cubic-bezier(0.35, 0, 0.65, 1), opacity ${FLIGHT_MS}ms ease-in`,
                transitionDelay: `${i * STAGGER_MS}ms`,
              }}
            >
              <CometMark className="h-2 w-2" />
            </span>
          );
        })}
    </div>
  );
}
