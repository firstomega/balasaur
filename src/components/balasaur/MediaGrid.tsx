import type { MediaItem } from "@/types/media";
import { MediaCard } from "./MediaCard";

export function MediaGrid({ items }: { items: MediaItem[] }) {
  return (
    <div
      className="grid gap-[13px]"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(142px, 1fr))" }}
    >
      {items.map((item) => (
        <MediaCard key={item.id} item={item} />
      ))}
    </div>
  );
}