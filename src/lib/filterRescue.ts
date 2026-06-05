import {
  FILM_LENGTH_BUCKETS,
  IMDB_BOUNDS,
  META_BOUNDS,
  RT_BOUNDS,
  YEAR_BOUNDS,
  type FilterState,
} from "@/types/filters";
import type { MediaType } from "@/types/media";

/** One "remove this filter group" option for the empty-state rescue. `next` is the
 *  FilterState you'd get by dropping just this group (everything else kept). */
export interface RescueCandidate {
  key: string;
  label: string;
  next: FilterState;
}

const FILM_LABEL: Record<string, string> = Object.fromEntries(
  FILM_LENGTH_BUCKETS.map((b) => [b.key, b.label]),
);

function joinLabel(values: string[], max = 3): string {
  if (values.length <= max) return values.join(", ");
  return `${values.slice(0, max).join(", ")} +${values.length - max}`;
}

/** Build the set of single-group removals for the current filters. The empty-state
 *  prices each one (via a facet count) and surfaces the biggest unlockers. */
export function rescueCandidates(filters: FilterState): RescueCandidate[] {
  const out: RescueCandidate[] = [];

  if (filters.genres.size > 0) {
    // Clearing a parent genre also clears its scoped sub-genres.
    out.push({
      key: "genres",
      label: joinLabel([...filters.genres]),
      next: { ...filters, genres: new Set(), subGenres: new Set() },
    });
  }
  if (filters.subGenres.size > 0) {
    out.push({
      key: "subGenres",
      label: joinLabel([...filters.subGenres]),
      next: { ...filters, subGenres: new Set() },
    });
  }
  if (filters.themes.size > 0) {
    out.push({
      key: "themes",
      label: joinLabel([...filters.themes]),
      next: { ...filters, themes: new Set() },
    });
  }
  if (filters.audience.size > 0) {
    out.push({
      key: "audience",
      label: joinLabel([...filters.audience]),
      next: { ...filters, audience: new Set() },
    });
  }
  if (filters.completion.size > 0) {
    out.push({
      key: "completion",
      label: joinLabel([...filters.completion]),
      next: { ...filters, completion: new Set() },
    });
  }
  if (filters.filmLength.size > 0) {
    out.push({
      key: "filmLength",
      label: joinLabel([...filters.filmLength].map((k) => FILM_LABEL[k] ?? k)),
      next: { ...filters, filmLength: new Set() },
    });
  }
  if (filters.origins.size > 0) {
    out.push({
      key: "origins",
      label: joinLabel([...filters.origins]),
      next: { ...filters, origins: new Set() },
    });
  }
  if (filters.streaming.size > 0) {
    out.push({
      key: "streaming",
      label: joinLabel([...filters.streaming]),
      next: { ...filters, streaming: new Set() },
    });
  }
  if (filters.people.length > 0) {
    out.push({
      key: "people",
      label: joinLabel(filters.people),
      next: { ...filters, people: [] },
    });
  }
  if (filters.mediaTypes.size === 1) {
    out.push({
      key: "mediaTypes",
      label: filters.mediaTypes.has("movie") ? "Movies only" : "TV only",
      next: { ...filters, mediaTypes: new Set<MediaType>(["movie", "tv"]) },
    });
  }
  if (filters.yearRange[0] !== YEAR_BOUNDS[0] || filters.yearRange[1] !== YEAR_BOUNDS[1]) {
    out.push({
      key: "year",
      label: `Years ${filters.yearRange[0]}–${filters.yearRange[1]}`,
      next: { ...filters, yearRange: [...YEAR_BOUNDS] },
    });
  }
  const ratingsActive =
    filters.imdbRange[0] !== IMDB_BOUNDS[0] ||
    filters.imdbRange[1] !== IMDB_BOUNDS[1] ||
    filters.rtRange[0] !== RT_BOUNDS[0] ||
    filters.rtRange[1] !== RT_BOUNDS[1] ||
    filters.metaRange[0] !== META_BOUNDS[0] ||
    filters.metaRange[1] !== META_BOUNDS[1] ||
    !filters.includeUnratedImdb ||
    !filters.includeUnratedRt ||
    !filters.includeUnratedMeta;
  if (ratingsActive) {
    out.push({
      key: "ratings",
      label: "Rating filters",
      next: {
        ...filters,
        imdbRange: [...IMDB_BOUNDS],
        rtRange: [...RT_BOUNDS],
        metaRange: [...META_BOUNDS],
        includeUnratedImdb: true,
        includeUnratedRt: true,
        includeUnratedMeta: true,
      },
    });
  }
  if (
    filters.awardWinners ||
    filters.nominated ||
    filters.awardsWon.size > 0 ||
    filters.awardsNominated.size > 0
  ) {
    out.push({
      key: "awards",
      label: "Award filters",
      next: {
        ...filters,
        awardWinners: false,
        nominated: false,
        awardsWon: new Set(),
        awardsNominated: new Set(),
      },
    });
  }

  return out;
}
