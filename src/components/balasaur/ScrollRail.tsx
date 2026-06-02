import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal scroller with hover arrow buttons and a hidden native scrollbar —
 * replaces the bare `overflow-x-auto` rows (the "ugly scrollbar"). Touch/trackpad
 * swipe still works; arrows appear on hover (desktop) and only when there's more
 * to scroll in that direction. Pass gap/snap utilities via `className`.
 */
export function ScrollRail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setCanLeft(el.scrollLeft > 2);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <div className="group/rail relative">
      <div
        ref={ref}
        className={cn(
          "flex overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {children}
      </div>
      {canLeft && <RailArrow side="left" onClick={() => nudge(-1)} />}
      {canRight && <RailArrow side="right" onClick={() => nudge(1)} />}
    </div>
  );
}

function RailArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      className={cn(
        "absolute top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-text-bright shadow-md backdrop-blur transition-opacity hover:border-primary hover:text-primary focus-visible:opacity-100 md:flex",
        "opacity-0 group-hover/rail:opacity-100",
        side === "left" ? "left-1" : "right-1",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
