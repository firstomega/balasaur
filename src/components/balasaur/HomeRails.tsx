import { useHomeRails } from "@/hooks/useCatalog";
import type { MediaItem } from "@/types/media";
import { MediaCard } from "./MediaCard";
import { ScrollRail } from "./ScrollRail";

// Curated on-ramps above the grid: three horizontal rails so a casual visitor
// gets somewhere to start instead of a wall of 65k posters. Shown only on the
// unfiltered default view (any filter/sort choice means the visitor already
// knows what they're looking for — the rails would just push their results
// below the fold).

const RAILS: Array<{ key: "trending" | "newAndNoteworthy" | "hiddenGems"; title: string }> = [
  { key: "trending", title: "Trending This Week" },
  { key: "newAndNoteworthy", title: "New & Noteworthy" },
  { key: "hiddenGems", title: "Hidden Gems" },
];

export function HomeRails({
  onQuickWatch,
  watchedIds,
}: {
  onQuickWatch?: (item: MediaItem) => void;
  watchedIds?: Set<string>;
}) {
  const { data } = useHomeRails();
  if (!data) return null; // loading or failed — the grid stands on its own

  return (
    <div className="mb-6 space-y-5">
      {RAILS.map(({ key, title }) => {
        const items = data[key];
        if (!items || items.length === 0) return null;
        return (
          <section key={key} aria-label={title}>
            <h2 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">
              {title}
            </h2>
            <ScrollRail className="gap-3">
              {items.map((item) => (
                <div key={item.id} className="w-[124px] shrink-0 sm:w-[140px]">
                  <MediaCard
                    item={item}
                    onQuickWatch={onQuickWatch}
                    watched={watchedIds?.has(item.id)}
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
