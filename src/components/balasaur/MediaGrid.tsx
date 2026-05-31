import type { MediaItem } from "@/types/media";
import { MediaCard } from "./MediaCard";

export function MediaGrid({
  items,
  onQuickWatch,
  watchedIds,
}: {
  items: MediaItem[];
  onQuickWatch?: (item: MediaItem) => void;
  watchedIds?: Set<string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item) => (
        <MediaCard
          key={item.id}
          item={item}
          onQuickWatch={onQuickWatch}
          watched={watchedIds?.has(item.id)}
        />
      ))}
    </div>
  );
}
