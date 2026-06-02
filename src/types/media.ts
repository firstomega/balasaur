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
}

export interface MediaDetail extends MediaItem {
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
  keywords?: string[];
  providers?: WatchProviders;
  providersAll?: WatchProvidersAllRegions;
}

export interface PersonCreditGroup {
  department: string;
  items: MediaItem[];
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
}
