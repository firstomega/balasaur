import type { FilterState } from "@/types/filters";
import type { FilterSearch } from "@/lib/filterSearch";

const KEY = "balasaur:breadcrumbs";
const MAX_ENTRIES = 8;

export interface BreadcrumbEntry {
  label: string;
  search: FilterSearch;
}

/** A short, human label for a filter state, most-specific facet first — used so the
 *  breadcrumb trail reads like "Korean · Thriller" rather than a raw query string. */
export function labelForFilters(f: FilterState): string {
  const parts: string[] = [];
  if (f.origins.size) parts.push([...f.origins][0]);
  if (f.themes.size) parts.push([...f.themes][0]);
  if (f.subGenres.size) parts.push([...f.subGenres][0]);
  if (f.genres.size) parts.push([...f.genres][0]);
  if (f.audience.size) parts.push([...f.audience][0]);
  if (parts.length < 2 && f.mediaTypes.size === 1) {
    parts.push(f.mediaTypes.has("movie") ? "Movies" : "TV");
  }
  return parts.length > 0 ? parts.slice(0, 2).join(" · ") : "All titles";
}

function read(): BreadcrumbEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as BreadcrumbEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: BreadcrumbEntry[]) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // storage unavailable / quota — non-fatal, trail just won't persist
  }
}

export function loadTrail(): BreadcrumbEntry[] {
  return read();
}

/** Append a view to the trail (skips consecutive duplicates), capped to the most
 *  recent MAX_ENTRIES so browsing a long session doesn't grow the strip forever. */
export function recordView(entry: BreadcrumbEntry): BreadcrumbEntry[] {
  const prev = read();
  if (prev.length > 0 && prev[prev.length - 1].label === entry.label) return prev;
  const next = [...prev, entry].slice(-MAX_ENTRIES);
  write(next);
  return next;
}

export function clearTrail(): BreadcrumbEntry[] {
  write([]);
  return [];
}
