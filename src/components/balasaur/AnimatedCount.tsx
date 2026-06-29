import { useEffect, useRef, useState } from "react";

/** A number that tweens to its new value, so the filter result count visibly ticks
 *  (e.g. 1,240 → 340) as filters change — makes filtering feel responsive. SSR-safe:
 *  renders the exact value on the server and on first client paint (no mismatch); the
 *  animation only runs on subsequent client-side changes. */
export function AnimatedCount({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const duration = 400;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = to;
    };
  }, [value]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
