import { defaultFilterState, type FilterState } from "@/types/filters";
import type { MediaType } from "@/types/media";

// Persist the homepage filter state for the current tab session so leaving for a
// detail page (and coming back, via the Back button or the logo) restores the same
// filters instead of resetting them. Sets aren't JSON-serializable, so we convert
// to/from arrays. sessionStorage (not local) → fresh tabs start clean.
const KEY = "balasaur:filters";

interface Serialized {
  mediaTypes: string[];
  genres: string[];
  origins: string[];
  streaming: string[];
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
  awardsWon: string[];
  awardsNominated: string[];
  hideSeen: boolean;
  sort: string;
}

export function saveFilters(f: FilterState): void {
  if (typeof window === "undefined") return;
  try {
    const s: Serialized = {
      mediaTypes: [...f.mediaTypes],
      genres: [...f.genres],
      origins: [...f.origins],
      streaming: [...f.streaming],
      yearRange: f.yearRange,
      imdbRange: f.imdbRange,
      rtRange: f.rtRange,
      metaRange: f.metaRange,
      includeUnratedImdb: f.includeUnratedImdb,
      includeUnratedRt: f.includeUnratedRt,
      includeUnratedMeta: f.includeUnratedMeta,
      people: f.people,
      awardWinners: f.awardWinners,
      nominated: f.nominated,
      awardsWon: [...f.awardsWon],
      awardsNominated: [...f.awardsNominated],
      hideSeen: f.hideSeen,
      sort: f.sort,
    };
    window.sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable / quota — non-fatal
  }
}

export function loadFilters(): FilterState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Serialized>;
    const d = defaultFilterState();
    return {
      mediaTypes: new Set<MediaType>((s.mediaTypes as MediaType[]) ?? [...d.mediaTypes]),
      genres: new Set<string>(s.genres ?? []),
      origins: new Set<string>(s.origins ?? []),
      streaming: new Set<string>(s.streaming ?? []),
      yearRange: s.yearRange ?? d.yearRange,
      imdbRange: s.imdbRange ?? d.imdbRange,
      rtRange: s.rtRange ?? d.rtRange,
      metaRange: s.metaRange ?? d.metaRange,
      includeUnratedImdb: s.includeUnratedImdb ?? d.includeUnratedImdb,
      includeUnratedRt: s.includeUnratedRt ?? d.includeUnratedRt,
      includeUnratedMeta: s.includeUnratedMeta ?? d.includeUnratedMeta,
      people: s.people ?? [],
      awardWinners: s.awardWinners ?? d.awardWinners,
      nominated: s.nominated ?? d.nominated,
      awardsWon: new Set<string>(s.awardsWon ?? []),
      awardsNominated: new Set<string>(s.awardsNominated ?? []),
      hideSeen: s.hideSeen ?? d.hideSeen,
      sort: (s.sort as FilterState["sort"]) ?? d.sort,
    };
  } catch {
    return null;
  }
}
