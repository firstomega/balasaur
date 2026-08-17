import { Flame } from "lucide-react";
import { useHomeRails } from "@/hooks/useCatalog";
import type { MediaItem } from "@/types/media";
import { MediaCard, type QuickAction } from "./MediaCard";
import { ScrollRail } from "./ScrollRail";

// Curated on-ramps above the grid: horizontal rails so a casual visitor gets
// somewhere to start instead of a wall of 65k posters. Shown only on the
// unfiltered default view (any filter/sort choice means the visitor already
// knows what they're looking for — the rails would just push their results
// below the fold).
//
// Visually distinct from the grid on purpose: the rails live in a bordered
// panel band, each with an accent icon, and carry per-rail poster overlays —
// rank numerals on Trending, release-date chips on New & Noteworthy / Coming
// Soon — so they read as editorial shelves, not more grid.

/** Big translucent rank numeral, Netflix-top-10 style. */
function RankNumeral({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="font-mono text-[30px] font-bold leading-none text-white/95 [text-shadow:0_2px_10px_rgba(0,0,0,0.95),0_0_2px_rgba(0,0,0,0.9)]"
    >
      {n}
    </span>
  );
}

const RAILS: Array<{
  key: keyof ReturnType<typeof emptyRails>;
  title: string;
  Icon: typeof Flame;
  iconClass: string;
  overlay?: (item: MediaItem, index: number) => React.ReactNode;
}> = [
  // Trending is the only title rail left. New & Noteworthy, Coming Soon and
  // Hidden Gems became real collection pages in v8 and are reached from the
  // collections rail above, which took three scrollers off the homepage and
  // turned them into indexable pages.
  {
    key: "trending",
    title: "Trending This Week",
    Icon: Flame,
    iconClass: "text-[#e8b552]",
    overlay: (_item, i) => <RankNumeral n={i + 1} />,
  },
];

function emptyRails() {
  return { trending: [] as MediaItem[] };
}

export function HomeRails({
  boostCountry,
  onQuickAction,
  onOpenActions,
  savedIds,
  watchedIds,
  rejectedIds,
}: {
  boostCountry?: string;
  onQuickAction?: (item: MediaItem, action: QuickAction) => void;
  onOpenActions?: (item: MediaItem) => void;
  savedIds?: Set<string>;
  watchedIds?: Set<string>;
  rejectedIds?: Set<string>;
}) {
  const { data } = useHomeRails(boostCountry);
  if (!data) return null; // loading or failed — the grid stands on its own

  return (
    <div className="space-y-5">
      {RAILS.map(({ key, title, Icon, iconClass, overlay }) => {
        // Cheap client-side personalization: a title the viewer hard-rejected
        // never shows up in a rail again.
        const items = (data[key] ?? []).filter((i) => !rejectedIds?.has(i.id));
        if (items.length === 0) return null;
        return (
          <section key={key} aria-label={title}>
            <h2 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-bright">
              <Icon className={`h-3.5 w-3.5 ${iconClass}`} aria-hidden="true" />
              {title}
            </h2>
            {/* Card width sits between the old shelf (124/140) and the grid's
                cards: big enough to read, still visibly subordinate to the grid
                so the shelf → canvas hierarchy holds. */}
            <ScrollRail className="gap-3">
              {items.map((item, i) => (
                <div key={item.id} className="w-[148px] shrink-0 sm:w-[170px]">
                  <MediaCard
                    item={item}
                    imgSizes="(max-width: 640px) 148px, 170px"
                    eager={key === "trending" && i < 3}
                    onQuickAction={onQuickAction}
                    onOpenActions={onOpenActions}
                    saved={savedIds?.has(item.id)}
                    watched={watchedIds?.has(item.id)}
                    rejected={rejectedIds?.has(item.id)}
                    posterOverlay={overlay?.(item, i)}
                  />
                </div>
              ))}
            </ScrollRail>
          </section>
        );
      })}
    </div>
  );
}
