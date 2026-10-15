import type { FilterSearch } from "./filterSearch";

// The home grid's page trail (/?page=2 to /?page=400) and its filtered views.
// Pure, so the canonical and noindex decisions can be tested without
// rendering the route.

/** ?page=N to a row offset. Anything junk reads as page 1, and the ceiling
 *  stops a crawler wandering into an unbounded range of empty pages. */
export const MAX_PAGE = 400;

export function pageNumber(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 && n <= MAX_PAGE ? n : 1;
}

/** True when anything other than the page cursor is narrowing the catalog. */
export function isFiltered(search: FilterSearch | undefined): boolean {
  if (!search) return false;
  return Object.entries(search).some(([k, v]) => k !== "page" && v !== undefined && v !== "");
}

/** Where this view says it lives. Filtered slices consolidate to the root. */
export function canonicalPath(search: FilterSearch | undefined): string {
  if (isFiltered(search)) return "/";
  const n = pageNumber(search?.page);
  return n > 1 ? `/?page=${n}` : "/";
}

/**
 * Whether this view asks to be indexed. Only the unfiltered first page does.
 *
 * Pages 2 to 400 are slices of one grid. None of them answers anything a
 * person searches, and 400 of them spent crawl budget the kept title pages
 * need.
 * They say "noindex, follow": Google still follows the trail to the titles.
 * Filtered views are not marked here because they already canonicalise to
 * "/", and a noindex on a page that names another as canonical sends two
 * contradictory signals.
 */
export function homeIsIndexable(search: FilterSearch | undefined): boolean {
  if (isFiltered(search)) return true;
  return pageNumber(search?.page) === 1;
}
