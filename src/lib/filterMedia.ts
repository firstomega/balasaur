import type { MediaItem } from "@/types/media";
import type { FilterState } from "@/types/filters";
import { YEAR_BOUNDS } from "@/types/filters";

function inRange(
  value: number | undefined,
  range: [number, number],
  includeUnrated: boolean,
): boolean {
  // Unknown scores pass through unless "Include unrated" is off (strict mode).
  if (value === undefined) return includeUnrated;
  return value >= range[0] && value <= range[1];
}

/**
 * Whole-item predicate shared by the grid filter and the facet-count helpers, so
 * the two can never drift. `ignoreOrigins` skips the Origin clause, letting us
 * count per-origin matches with the Origin facet's own selection removed
 * (standard faceted-search behavior — a facet doesn't constrain its own counts).
 */
function itemMatches(
  item: MediaItem,
  filters: FilterState,
  seenIds: Set<string>,
  peopleLower: string[],
  ignoreOrigins = false,
): boolean {
  if (!filters.mediaTypes.has(item.mediaType)) return false;

  if (filters.genres.size > 0 && !item.genres.some((g) => filters.genres.has(g))) return false;

  if (!ignoreOrigins && filters.origins.size > 0) {
    if (!(item.origins ?? []).some((o) => filters.origins.has(o))) return false;
  }

  if (filters.streaming.size > 0 && !item.streaming.some((s) => filters.streaming.has(s)))
    return false;

  const yearFull =
    filters.yearRange[0] === YEAR_BOUNDS[0] && filters.yearRange[1] === YEAR_BOUNDS[1];
  if (!yearFull) {
    const year = item.year ? parseInt(item.year, 10) : undefined;
    if (year === undefined) return false;
    if (year < filters.yearRange[0] || year > filters.yearRange[1]) return false;
  }

  if (!inRange(item.ratings.imdb, filters.imdbRange, filters.includeUnratedImdb)) return false;
  if (!inRange(item.ratings.rottenTomatoes, filters.rtRange, filters.includeUnratedRt))
    return false;
  if (!inRange(item.ratings.metacritic, filters.metaRange, filters.includeUnratedMeta))
    return false;

  if (peopleLower.length > 0) {
    const names = item.people.map((p) => p.name.toLowerCase());
    if (!peopleLower.every((q) => names.some((n) => n.includes(q)))) return false;
  }

  if (filters.awardWinners && !item.awardWinner) return false;
  if (filters.nominated && !item.awardNominee && !item.awardWinner) return false;

  if (filters.hideSeen && seenIds.has(item.id)) return false;

  return true;
}

/**
 * Per-origin match counts for the filter rail, computed with every *other* active
 * filter applied but the Origin facet ignored. Powers the rail's live counts and
 * lets it disable dead-end origins (0 matches) instead of letting a click land on
 * an empty grid — e.g. before the catalog's origins are backfilled, every count
 * is 0, which reads as "no origin data" rather than a silently blank result set.
 */
export function originFacetCounts(
  items: MediaItem[],
  filters: FilterState,
  seenIds: Set<string>,
): Map<string, number> {
  const peopleLower = filters.people.map((p) => p.toLowerCase());
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!itemMatches(item, filters, seenIds, peopleLower, true)) continue;
    for (const o of item.origins ?? []) {
      counts.set(o, (counts.get(o) ?? 0) + 1);
    }
  }
  return counts;
}

export function applyFilters(
  items: MediaItem[],
  filters: FilterState,
  seenIds: Set<string>,
): MediaItem[] {
  const peopleLower = filters.people.map((p) => p.toLowerCase());

  const filtered = items.filter((item) => itemMatches(item, filters, seenIds, peopleLower));

  const sorted = [...filtered];
  const pop = (m: MediaItem) => m.popularity ?? 0;
  const yr = (m: MediaItem) => (m.year ? parseInt(m.year, 10) : 0);
  const rating = (m: MediaItem) => m.ratings.imdb ?? m.ratings.tmdb ?? 0;

  switch (filters.sort) {
    case "newest":
      // Year desc, ties broken by popularity.
      sorted.sort((a, b) => yr(b) - yr(a) || pop(b) - pop(a));
      break;
    case "oldest":
      // Year asc, ties broken by popularity. Undated titles sink to the bottom.
      sorted.sort((a, b) => {
        const ay = yr(a) || Infinity;
        const by = yr(b) || Infinity;
        return ay - by || pop(b) - pop(a);
      });
      break;
    case "topRated":
      // Rating desc, ties broken by popularity.
      sorted.sort((a, b) => rating(b) - rating(a) || pop(b) - pop(a));
      break;
    case "az":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "za":
      sorted.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case "popular":
    case "trending": // retired alias → behaves as popular
    default:
      sorted.sort((a, b) => pop(b) - pop(a));
      break;
  }
  return sorted;
}

export function searchPeople(items: MediaItem[], query: string, exclude: string[]): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const excludeLower = new Set(exclude.map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  const matches: string[] = [];
  for (const item of items) {
    for (const p of item.people) {
      const key = p.name.toLowerCase();
      if (seen.has(key) || excludeLower.has(key)) continue;
      if (key.includes(q)) {
        seen.add(key);
        matches.push(p.name);
        if (matches.length >= 8) return matches;
      }
    }
  }
  return matches;
}
