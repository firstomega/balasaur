import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArcadeCometTarget, CometMark } from "./CometChip";

// The payout flight: 8 to 12 comet glyphs at 16px leave the comet numeral
// on the end screen, arc toward the CometChip in the header, and the chip
// bumps with a glow when the last one lands. Pure CSS transforms on a fixed
// overlay so no panel can clip the flight. Reduced motion, or no chip on
// screen to fly at: nothing renders and the chip count simply updates.
//
// Two ways to fire it:
//   <CometBurst count fire />          declarative, from the numeral's box
//   useCometBurst()(count, fromEl)     imperative, from anywhere under a
//                                      <CometBurstProvider> (GameShell)

const MIN_GLYPHS = 8;
const MAX_GLYPHS = 12;
const FLIGHT_MS = 700;
const STAGGER_MS = 45;

interface Flight {
  id: number;
  n: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

interface BurstApi {
  fire: (count: number, from?: HTMLElement | null) => void;
}

export const CometBurstContext = createContext<BurstApi | null>(null);

/** Returns a fire(count, fromElement) function. Outside a provider it is a
 *  no-op, so callers never need to guard. */
export function useCometBurst(): BurstApi["fire"] {
  const ctx = useContext(CometBurstContext);
  return ctx?.fire ?? noop;
}

function noop() {}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

function center(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function glyphCount(count: number): number {
  if (count <= 0) return 0;
  return Math.max(MIN_GLYPHS, Math.min(MAX_GLYPHS, count));
}

function bump(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("arc-bump");
  // Reflow so a second bump restarts the animation.
  void el.offsetWidth;
  el.classList.add("arc-bump");
  setTimeout(() => el.classList.remove("arc-bump"), 400);
}

/** Owns the overlay and hands out fire(). GameShell wraps the page in one. */
export function CometBurstProvider({ children }: { children: ReactNode }) {
  const target = useContext(ArcadeCometTarget);
  const [flights, setFlights] = useState<Flight[]>([]);
  const nextId = useRef(1);

  const fire = useCallback(
    (count: number, from?: HTMLElement | null) => {
      const n = glyphCount(count);
      const chip = target?.current ?? null;
      if (n <= 0 || !chip || reducedMotion()) return;
      const origin = from ? center(from) : center(chip);
      const flight: Flight = { id: nextId.current++, n, from: origin, to: center(chip) };
      setFlights((f) => [...f, flight]);
    },
    [target],
  );

  const api = useMemo(() => ({ fire }), [fire]);

  return (
    <CometBurstContext.Provider value={api}>
      {children}
      {flights.map((f) => (
        <FlightLayer
          key={f.id}
          flight={f}
          onDone={() => {
            bump(target?.current ?? null);
            setFlights((all) => all.filter((x) => x.id !== f.id));
          }}
        />
      ))}
    </CometBurstContext.Provider>
  );
}

/** One flight: n glyphs on a fixed layer, painted at rest for two frames,
 *  then transitioned to the chip along an arc (a rotated midpoint), unmounts
 *  itself when the last glyph lands. */
function FlightLayer({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const { n, from, to } = flight;

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setStage(1));
    });
    const mid = setTimeout(() => setStage(2), FLIGHT_MS * 0.45);
    const end = setTimeout(onDone, FLIGHT_MS + STAGGER_MS * n + 80);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(mid);
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // The arc bows away from the straight line, up and to the side the chip is
  // on, so the swarm reads as thrown rather than slid.
  const bowX = dx * 0.5 + (dx >= 0 ? 1 : -1) * 40;
  const bowY = dy * 0.5 - 60;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50">
      {Array.from({ length: n }, (_, i) => {
        // A deterministic spread so twelve glyphs read as a burst, not a stack.
        const ox = ((i % 4) - 1.5) * 16;
        const oy = (Math.floor(i / 4) - 1) * 12;
        const transform =
          stage === 0
            ? `translate(${from.x + ox}px, ${from.y + oy}px) scale(1) rotate(0deg)`
            : stage === 1
              ? `translate(${from.x + bowX + ox * 0.6}px, ${from.y + bowY + oy * 0.6}px) scale(1.1) rotate(-20deg)`
              : `translate(${to.x}px, ${to.y}px) scale(0.5) rotate(-40deg)`;
        return (
          <span
            key={i}
            className="absolute left-0 top-0 -ml-2 -mt-2 text-[var(--game,var(--primary))]"
            style={{
              transform,
              opacity: stage === 2 ? 0 : 1,
              transition: `transform ${FLIGHT_MS * 0.55}ms cubic-bezier(0.3, 0, 0.5, 1), opacity ${FLIGHT_MS * 0.4}ms ease-in`,
              transitionDelay: `${i * STAGGER_MS}ms`,
            }}
          >
            <CometMark className="h-4 w-4" />
          </span>
        );
      })}
    </div>
  );
}

/** Declarative burst. Render it inside a relatively positioned element over
 *  the comet numeral; when `fire` turns true the glyphs leave from there.
 *  Uses the provider when one is above it, otherwise carries its own layer. */
export function CometBurst({ count, fire = true }: { count: number; fire?: boolean }) {
  const ctx = useContext(CometBurstContext);
  const target = useContext(ArcadeCometTarget);
  const hostRef = useRef<HTMLSpanElement>(null);
  const firedRef = useRef(false);
  const [local, setLocal] = useState<Flight | null>(null);

  useEffect(() => {
    if (!fire || firedRef.current || count <= 0) return;
    firedRef.current = true;
    if (ctx) {
      ctx.fire(count, hostRef.current);
      return;
    }
    const n = glyphCount(count);
    const chip = target?.current ?? null;
    const host = hostRef.current;
    if (!chip || !host || reducedMotion()) return;
    setLocal({ id: 1, n, from: center(host), to: center(chip) });
  }, [fire, count, ctx, target]);

  return (
    <>
      <span ref={hostRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />
      {local && (
        <FlightLayer
          flight={local}
          onDone={() => {
            bump(target?.current ?? null);
            setLocal(null);
          }}
        />
      )}
    </>
  );
}
