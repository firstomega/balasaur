import type { MediaType } from "./media";

// "trending" is retired (it sorted identically to "popular"); kept in the union
// so any persisted/old value still type-checks and falls back to popular sort.
export type SortKey = "popular" | "newest" | "oldest" | "topRated" | "az" | "za" | "trending";

export interface RangeFilter {
  min: number;
  max: number;
}

export interface FilterState {
  mediaTypes: Set<MediaType>;
  genres: Set<string>;
  origins: Set<string>;
  streaming: Set<string>;
  yearRange: [number, number];
  imdbRange: [number, number];
  rtRange: [number, number];
  metaRange: [number, number];
  includeUnratedImdb: boolean;
  includeUnratedRt: boolean;
  includeUnratedMeta: boolean;
  people: string[];
  awardWinners: boolean;
  nominated: boolean;
  /** Big-four award keys filtered as a WIN (e.g. "oscar"). */
  awardsWon: Set<string>;
  /** Big-four award keys filtered as a NOMINATION (includes winners). */
  awardsNominated: Set<string>;
  // Advanced filters (Phase A).
  subGenres: Set<string>;
  themes: Set<string>;
  audience: Set<string>;
  /** TV completion status: Ongoing / Ended / Cancelled / Upcoming. */
  completion: Set<string>;
  /** Film-length bucket keys (see FILM_LENGTH_BUCKETS). */
  filmLength: Set<string>;
  hideSeen: boolean;
  sort: SortKey;
}

export const AWARD_OPTIONS = [
  { key: "oscar", label: "Oscars" },
  { key: "globe", label: "Golden Globes" },
  { key: "bafta", label: "BAFTA" },
  { key: "emmy", label: "Emmys" },
] as const;

export const STREAMING_OPTIONS = [
  "Netflix",
  "Max",
  "Prime",
  "Disney+",
  "Apple TV+",
  "Hulu",
] as const;

export const YEAR_BOUNDS: [number, number] = [1950, new Date().getFullYear()];
export const IMDB_BOUNDS: [number, number] = [0, 10];
export const RT_BOUNDS: [number, number] = [0, 100];
export const META_BOUNDS: [number, number] = [0, 100];

// Film-length buckets (movies). `min`/`max` are inclusive minute bounds — also used to
// build the server-side range filter and the facet buckets so UI + query + RPC agree.
export const FILM_LENGTH_BUCKETS = [
  { key: "short", label: "Short", hint: "< 90m", min: 0, max: 89 },
  { key: "feature", label: "Feature", hint: "90–119m", min: 90, max: 119 },
  { key: "long", label: "Long", hint: "120–149m", min: 120, max: 149 },
  { key: "epic", label: "Epic", hint: "150m+", min: 150, max: 100000 },
] as const;

export const COMPLETION_OPTIONS = ["Ongoing", "Ended", "Cancelled", "Upcoming"] as const;

export function defaultFilterState(): FilterState {
  return {
    mediaTypes: new Set<MediaType>(["movie", "tv"]),
    genres: new Set(),
    origins: new Set(),
    streaming: new Set(),
    yearRange: [...YEAR_BOUNDS],
    imdbRange: [...IMDB_BOUNDS],
    rtRange: [...RT_BOUNDS],
    metaRange: [...META_BOUNDS],
    includeUnratedImdb: true,
    includeUnratedRt: true,
    includeUnratedMeta: true,
    people: [],
    awardWinners: false,
    nominated: false,
    awardsWon: new Set(),
    awardsNominated: new Set(),
    subGenres: new Set(),
    themes: new Set(),
    audience: new Set(),
    completion: new Set(),
    filmLength: new Set(),
    hideSeen: false,
    sort: "popular",
  };
}
