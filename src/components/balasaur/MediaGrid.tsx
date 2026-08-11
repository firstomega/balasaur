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
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
