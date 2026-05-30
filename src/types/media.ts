export type MediaType = "movie" | "tv" | "book" | "podcast";

export interface MediaRatings {
  imdb?: number;
  rottenTomatoes?: number;
  metacritic?: number;
  tmdb?: number;
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
  keywords?: string[];
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
