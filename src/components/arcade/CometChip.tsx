import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { AnimatedCount } from "@/components/balasaur/AnimatedCount";
import { useComets } from "@/lib/arcade/useComets";
import { cn } from "@/lib/utils";
import { ArcadeMotion } from "./arcadeMotion";

// The comet balance chip. Arcade-scoped by design: it renders in GameShell
// headers and the hub header only, never in the global TopBar. Personal
// state, so it renders nothing until the balance is ready after mount, and
// nothing at all while the balance is zero: a first-time visitor is not shown
// a currency they have not earned yet. It animates in on the first credit.

/** The comet glyph: a solid head with a tapered tail streaking to the top
 *  left, plus one thin streak beside it. Painted in currentColor. */
export function CometMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.3 13.7C11.2 12.3 6.6 8.6 3 3c5.6 3.4 9.4 7.8 11.3 10.7z" fill="currentColor" />
      <path
        d="M19 11.5c-1.6-2.6-4.2-5-7.6-6.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16.6" cy="16.6" r="3.6" fill="currentColor" />
    </svg>
  );
}

/** CometBurst flies payout glyphs at the chip. GameShell owns a ref, provides
 *  it here, and the chip registers its element; the burst reads the rect and
 *  bumps the element when the last glyph lands. */
export const ArcadeCometTarget = createContext<MutableRefObject<HTMLElement | null> | null>(null);

export function CometChip({
  total,
  ready,
  className,
}: {
  /** Pass the balance from the page's own useComets instance so a credit in
   *  that instance ticks this chip; two hook instances do not share state
   *  in-tab. Omitted (hub header), the chip reads its own. */
  total?: number;
  ready?: boolean;
  className?: string;
}) {
  const own = useComets();
  const target = useContext(ArcadeCometTarget);
  const shownTotal = total ?? own.total;
  const shownReady = ready ?? own.ready;
  const visible = shownReady && shownTotal > 0;

  // First appearance in this mount animates in; a chip that was already
  // visible on load does not pop.
  const seenRef = useRef(false);
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    if (!visible || seenRef.current) return;
    seenRef.current = true;
    if (shownReady) setEntering(true);
  }, [visible, shownReady]);

  if (!visible) return null;

  return (
    <span
      ref={(el) => {
        if (target) target.current = el;
      }}
      aria-label={`${shownTotal} comets`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[12px] tabular-nums text-text-bright",
        "border-[color-mix(in_oklab,var(--game,var(--primary))_40%,var(--color-border))] bg-[color-mix(in_oklab,var(--game,var(--primary))_12%,var(--color-panel))]",
        entering && "arc-pop",
        className,
      )}
    >
      <ArcadeMotion />
      <CometMark className="h-4 w-4 text-[var(--game,var(--primary))]" />
      <AnimatedCount value={shownTotal} />
    </span>
  );
}
