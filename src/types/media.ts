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
}