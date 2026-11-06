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

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * An ISO date as a person writes it: "2010-07-15" becomes "July 15, 2010".
 * Read from the string, never through Date, so the server and every browser
 * print the same thing whatever their time zone. A year-only or year-month
 * value prints what it has; anything unreadable comes back unchanged.
 */
export function longDate(iso: string): string {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = mo ? MONTHS[Number(mo) - 1] : undefined;
  if (!month) return y;
  if (!d || Number(d) < 1) return `${month} ${y}`;
  return `${month} ${Number(d)}, ${y}`;
}
