import type { MediaItem } from "@/types/media";

/**
 * Display year for a card/detail header. TV shows render a start–end range:
 * catalog rows carry `lastAirYear` (precomputed server-side); detail rows fall
 * back to deriving it from the full `seasons` array. Movies just show the year.
 */
export function displayYear(item: MediaItem): string {
  if (item.mediaType === "tv") {
    const end =
      item.lastAirYear ||
      (item.seasons ?? []).reduce<string>((acc, s) => {
        const y = s.airDate ? s.airDate.slice(0, 4) : "";
        return y && y > acc ? y : acc;
      }, "");
    if (item.year && end && end !== item.year) return `${item.year}–${end}`;
  }
  return item.year || "—";
}
