import { createContext, useContext, type MutableRefObject } from "react";
import { AnimatedCount } from "@/components/balasaur/AnimatedCount";
import { useComets } from "@/lib/arcade/useComets";
import { cn } from "@/lib/utils";

// The comet balance chip. Arcade-scoped by design: it renders in GameShell
// headers and the hub header only, never in the global TopBar. Personal
// state, so it renders nothing until the balance is ready after mount.

/** The comet glyph, house style like DinoMark: a rounded head streaking
 *  toward the top left. */
export function CometMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="4" />
      <path d="M12.5 12.5 4 4" />
      <path d="M15 9.5 10.5 5" />
      <path d="M9.5 15 5 10.5" />
    </svg>
  );
}

/** CometBurst flies payout glyphs at the chip. GameShell owns a ref, provides
 *  it here, and the chip registers its element; the burst reads the rect. */
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

  if (!shownReady) return null;

  return (
    <span
      ref={(el) => {
        if (target) target.current = el;
      }}
      title="Comets. Won in the arcade."
      aria-label={`${shownTotal} comets`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-panel px-2 py-1 font-mono text-[12px] tabular-nums text-text",
        className,
      )}
    >
      <CometMark className="h-3.5 w-3.5 text-primary" />
      <AnimatedCount value={shownTotal} />
    </span>
  );
}
