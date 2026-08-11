import type { MediaItem } from "@/types/media";
import { MediaCard, type QuickAction } from "./MediaCard";

export function MediaGrid({
  items,
  onQuickAction,
  savedIds,
  watchedIds,
  rejectedIds,
}: {
  items: MediaItem[];
  onQuickAction?: (item: MediaItem, action: QuickAction) => void;
  savedIds?: Set<string>;
  watchedIds?: Set<string>;
  rejectedIds?: Set<string>;
}) {
  // One column fewer at each desktop breakpoint than the original firehose
  // (posters ~20% larger on a 13" laptop) with slightly wider gutters — dense
  // enough to keep the data-tool identity, big enough to actually read a
  // poster. 2xl gets the sixth column back on genuinely wide screens.
  return (
    <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {items.map((item) => (
        <MediaCard
          key={item.id}
          item={item}
          onQuickAction={onQuickAction}
          saved={savedIds?.has(item.id)}
          watched={watchedIds?.has(item.id)}
          rejected={rejectedIds?.has(item.id)}
        />
      ))}
    </div>
  );
}
