import {
  IMDB_BOUNDS,
  META_BOUNDS,
  RT_BOUNDS,
  YEAR_BOUNDS,
  defaultFilterState,
  type FilterState,
} from "@/types/filters";
import type { MediaType } from "@/types/media";

// Compact, readable URL params for the homepage filters — so a filtered view is
// shareable, bookmarkable, linkable (detail-page metadata links straight into it),
// and crawlable. Only non-default values are emitted, keeping URLs short. Round-trips:
// searchToFilters(filtersToSearch(f)) reproduces f.

/** The homepage's typed search params. All optional strings (URL-native). */
export interface FilterSearch {
  type?: string;
  genres?: string;
  subgenres?: string;
  themes?: string;
  audience?: string;
  completion?: string;
  length?: string;
  origins?: string;
  streaming?: string;
  people?: string;
  year?: string;
  imdb?: string;
  rt?: string;
  meta?: string;
  imdbU?: string;
  rtU?: string;
  metaU?: string;
  awardsWon?: string;
  awardsNom?: string;
  win?: string;
  nom?: string;
  sort?: string;
  hideSeen?: string;
}

const csv = (s: Iterable<string>): string => [...s].join(",");
const parseCsv = (v: string | undefined): string[] =>
  v
    ? v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

function parseRange(v: string | undefined, fallback: [number, number]): [number, number] {
  if (!v) return fallback;
  const [a, b] = v.split("-").map((n) => Number(n));
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : fallback;
}

const SEARCH_KEYS: (keyof FilterSearch)[] = [
  "type",
  "genres",
  "subgenres",
  "themes",
  "audience",
  "completion",
  "length",
  "origins",
  "streaming",
  "people",
  "year",
  "imdb",
  "rt",
  "meta",
  "imdbU",
  "rtU",
  "metaU",
  "awardsWon",
  "awardsNom",
  "win",
  "nom",
  "sort",
  "hideSeen",
];

/** Coerce raw router search into our typed shape — keep only known string params.
 *  Used as the route's `validateSearch` so it never chokes on stray/typed values. */
export function parseFilterSearch(raw: Record<string, unknown>): FilterSearch {
  const out: FilterSearch = {};
  for (const k of SEARCH_KEYS) {
    const v = raw[k];
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

/** True if any filter param is present (used to decide URL vs sessionStorage on load). */
export function hasFilterSearch(s: FilterSearch): boolean {
  return Object.values(s).some((v) => v !== undefined && v !== "");
}

export function filtersToSearch(f: FilterState): FilterSearch {
  const s: FilterSearch = {};
  if (f.mediaTypes.size === 1) s.type = [...f.mediaTypes][0];
  if (f.genres.size) s.genres = csv(f.genres);
  if (f.subGenres.size) s.subgenres = csv(f.subGenres);
  if (f.themes.size) s.themes = csv(f.themes);
  if (f.audience.size) s.audience = csv(f.audience);
  if (f.completion.size) s.completion = csv(f.completion);
  if (f.filmLength.size) s.length = csv(f.filmLength);
  if (f.origins.size) s.origins = csv(f.origins);
  if (f.streaming.size) s.streaming = csv(f.streaming);
  if (f.people.length) s.people = f.people.join(",");
  if (f.yearRange[0] !== YEAR_BOUNDS[0] || f.yearRange[1] !== YEAR_BOUNDS[1])
    s.year = `${f.yearRange[0]}-${f.yearRange[1]}`;
  if (f.imdbRange[0] !== IMDB_BOUNDS[0] || f.imdbRange[1] !== IMDB_BOUNDS[1])
    s.imdb = `${f.imdbRange[0]}-${f.imdbRange[1]}`;
  if (f.rtRange[0] !== RT_BOUNDS[0] || f.rtRange[1] !== RT_BOUNDS[1])
    s.rt = `${f.rtRange[0]}-${f.rtRange[1]}`;
  if (f.metaRange[0] !== META_BOUNDS[0] || f.metaRange[1] !== META_BOUNDS[1])
    s.meta = `${f.metaRange[0]}-${f.metaRange[1]}`;
  if (!f.includeUnratedImdb) s.imdbU = "0";
  if (!f.includeUnratedRt) s.rtU = "0";
  if (!f.includeUnratedMeta) s.metaU = "0";
  if (f.awardsWon.size) s.awardsWon = csv(f.awardsWon);
  if (f.awardsNominated.size) s.awardsNom = csv(f.awardsNominated);
  if (f.awardWinners) s.win = "1";
  if (f.nominated) s.nom = "1";
  if (f.sort !== "popular") s.sort = f.sort;
  if (f.hideSeen) s.hideSeen = "1";
  return s;
}

export function searchToFilters(s: FilterSearch): FilterState {
  const d = defaultFilterState();
  return {
    mediaTypes:
      s.type === "movie" || s.type === "tv"
        ? new Set<MediaType>([s.type])
        : new Set<MediaType>([...d.mediaTypes]),
    genres: new Set(parseCsv(s.genres)),
    subGenres: new Set(parseCsv(s.subgenres)),
    themes: new Set(parseCsv(s.themes)),
    audience: new Set(parseCsv(s.audience)),
    completion: new Set(parseCsv(s.completion)),
    filmLength: new Set(parseCsv(s.length)),
    origins: new Set(parseCsv(s.origins)),
    streaming: new Set(parseCsv(s.streaming)),
    people: parseCsv(s.people),
    yearRange: parseRange(s.year, d.yearRange),
    imdbRange: parseRange(s.imdb, d.imdbRange),
    rtRange: parseRange(s.rt, d.rtRange),
    metaRange: parseRange(s.meta, d.metaRange),
    includeUnratedImdb: s.imdbU !== "0",
    includeUnratedRt: s.rtU !== "0",
    includeUnratedMeta: s.metaU !== "0",
    awardsWon: new Set(parseCsv(s.awardsWon)),
    awardsNominated: new Set(parseCsv(s.awardsNom)),
    awardWinners: s.win === "1",
    nominated: s.nom === "1",
    sort: (s.sort as FilterState["sort"]) ?? d.sort,
    hideSeen: s.hideSeen === "1",
  };
}
