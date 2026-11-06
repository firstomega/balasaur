import type { SwatchKey } from "@/lib/posterSwatch";

export type MediaType = "movie" | "tv" | "book" | "podcast";

export interface MediaRatings {
  imdb?: number;
  rottenTomatoes?: number;
  metacritic?: number;
  tmdb?: number;
  /** Balasaur Score: 0–100 blend of the external scores (+ user ratings, later). */
  balasaur?: number;
}

export interface MediaPerson {
  name: string;
  role: string;
  personId?: number;
}

export interface MediaSeason {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string;
  posterUrl?: string;
  overview?: string;
}

export interface ProviderRef {
  name: string;
  logoUrl?: string;
}

export interface WatchProviders {
  region: string;
  stream: ProviderRef[];
  rent: ProviderRef[];
  buy: ProviderRef[];
  link?: string;
  /** ISO 3166-1 region codes that have any provider data for this title. */
  availableRegions: string[];
}

export interface WatchProvidersAllRegions {
  byRegion: Record<
    string,
    { stream: ProviderRef[]; rent: ProviderRef[]; buy: ProviderRef[]; link?: string }
  >;
  availableRegions: string[];
}

export interface MediaItem {
  id: string;
  mediaType: MediaType;
  title: string;
  year: string;
  overview: string;
  posterUrl: string;
  squareArtUrl?: string;
  ratings: MediaRatings;
  genres: string[];
  streaming: string[];
  lengthLabel: string;
  people: MediaPerson[];
  awardWinner?: boolean;
  awardNominee?: boolean;
  popularity?: number;
  seasons?: MediaSeason[];
  releaseDate?: string;
  origins?: string[];
  /**
   * For TV: the latest season air year, precomputed server-side so the catalog
   * payload can omit the heavy `seasons` array. MediaCard uses this for the
   * `year–endYear` range display.
   */
  lastAirYear?: string;
  /**
   * For TV: number of seasons (excluding specials), precomputed server-side
   * so the catalog payload can omit the heavy `seasons` array.
   */
  seasonCount?: number;
  /** TMDB community vote count. */
  voteCount?: number;
  /**
   * Tile colour read from the poster (media.swatch), one of the keys in
   * src/lib/posterSwatch.ts. Null or absent until the poster has been read;
   * a card then paints on the neutral paper tile.
   */
  swatch?: SwatchKey | null;
  /** The poster's second swatch, when it has one that differs (media.swatch_alt). */
  swatchAlt?: SwatchKey | null;
  /**
   * Why this card is in a related rail — the facets it shares with the anchor
   * title ("Same series", a person, a sub-genre, a theme, a decade). Set only
   * by the similarity engine.
   */
  matchReasons?: string[];
}

export interface MediaDetail extends MediaItem {
  /**
   * IMDb vote count, from the stored OMDb payload. Read by the kept-set rule
   * (src/lib/indexKeep.ts); never displayed.
   */
  imdbVotes?: number;
  backdropUrl?: string;
  tagline?: string;
  runtime?: number;
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  cast: MediaPerson[];
  crew: MediaPerson[];
  certification?: string;
  facts: {
    budget?: number;
    revenue?: number;
    originalLanguage?: string;
    productionCountries?: string[];
    productionCompanies?: string[];
    status?: string;
    releaseDate?: string;
  };
  external: {
    imdbId?: string;
    homepage?: string;
    wikidataId?: string;
  };
  images?: string[];
  imagesOriginal?: string[];
  trailer?: { key: string; name: string; site: "YouTube" };
  related?: MediaItem[];
  /** Cross-category "more like this" — titles of the OTHER media type. */
  relatedCross?: MediaItem[];
  /** Version of the similarity engine that built the rails (cache healing). */
  relatedVersion?: number;
  /** Catalog context from title_context(): cohort percentile + franchise
   *  standing, feeding the data-prose layer. */
  context?: {
    cohort?: { label: string; size: number; percentile: number };
    franchise?: { size: number; rank: number };
  };
  keywords?: string[];
  providers?: WatchProviders;
  providersAll?: WatchProvidersAllRegions;
}

/** A title on a person's page, with what they did on it: the character for a
 *  cast credit ("Woody (voice)", "Self"), the job or jobs for a crew credit,
 *  and for a TV cast credit the number of episodes. Both come from TMDB's
 *  combined credits; a payload cached before they were kept has neither. */
export interface PersonCredit extends MediaItem {
  role?: string;
  episodes?: number;
  /** Whether the catalog holds this title, set on every read by the catalog
   *  join. False means the row is printed without a link: a title outside
   *  the catalog has no page worth sending anyone to, and each such link was
   *  a door crawlers walked through into a live TMDB call. Absent means the
   *  join did not run or failed, and the row keeps its link. */
  inCatalog?: boolean;
}

export interface PersonCreditGroup {
  department: string;
  items: PersonCredit[];
}

export interface PersonDetail {
  id: string;
  name: string;
  biography?: string;
  birthday?: string;
  deathday?: string;
  placeOfBirth?: string;
  knownForDepartment?: string;
  profileUrl?: string;
  imdbId?: string;
  groups: PersonCreditGroup[];
  /** Set when the credits carry `role` and `episodes`. A cached payload
   *  without it predates them and is rebuilt from TMDB on its next read. */
  creditRoles?: boolean;
  /** Whether this person is in the kept set Google is offered
   *  (person_index_kept, see src/lib/indexKeep.ts). Read on every request,
   *  never trusted from the cache; absent when the lookup failed. */
  indexable?: boolean;
  /** Set when that lookup failed: the page renders its default (noindex) but
   *  is sent uncached, so the guess is never kept. Cleared on every read. */
  incomplete?: true;
  /** Leading and directing credits, from person_stats(). Never rendered: this
   *  is the index gate only, and it counts a person only where they are
   *  top-billed or directing, which is the wrong number to print. The numbers
   *  the page prints come from `catalog` below. */
  stats?: {
    titles: number;
  };
  /** Facts derived by joining every credit above against the catalog. Attached
   *  at read time, so they track the nightly refresh rather than the cached
   *  payload's age. Every number here is reconstructable from the cards the
   *  page renders, which is the whole point of computing it this way: the old
   *  numbers came from a name match against top-billed credits only, so the
   *  grid could not confirm a single one of them. */
  catalog?: PersonCatalog;
  /** The /best/best-<name>-movies and -shows lists for this person, when the
   *  nightly rebuild minted them. Attached at read time, like `catalog`. */
  lists?: PersonList[];
}

export interface DecadeMedian {
  decade: string;
  median: number;
  titles: number;
}

export interface PersonCatalog {
  /** Credits this catalog holds, across every department, deduped by title. */
  titles: number;
  /** The decade whose ranked titles rate highest, with the decade it beat.
   *  Absent unless two decades qualify and one is ahead. */
  bestDecade?: DecadeMedian & { runnerUp: DecadeMedian };
  /** Highest-scoring credits, best first, one per franchise. Empty when the
   *  ranked pool is too small for an order to mean anything. */
  top: MediaItem[];
}

/** A /best list built for this person, linked from their page. */
export interface PersonList {
  slug: string;
  title: string;
  itemCount: number;
  /** media_id of the list's first title (collections.poster_ids[0]). */
  leadId?: string;
}
