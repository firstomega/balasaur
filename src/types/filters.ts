import type { MediaType } from "./media";

// "trending" is retired (it sorted identically to "popular"); kept in the union
// so any persisted/old value still type-checks and falls back to popular sort.
export type SortKey = "popular" | "newest" | "oldest" | "topRated" | "trending";

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
  hideSeen: boolean;
  sort: SortKey;
}

export const STREAMING_OPTIONS = ["Netflix", "Max", "Prime", "Apple TV+", "Hulu"] as const;

export const YEAR_BOUNDS: [number, number] = [1950, new Date().getFullYear()];
export const IMDB_BOUNDS: [number, number] = [0, 10];
export const RT_BOUNDS: [number, number] = [0, 100];
export const META_BOUNDS: [number, number] = [0, 100];

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
    hideSeen: false,
    sort: "popular",
  };
}
