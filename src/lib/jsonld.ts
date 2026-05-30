// Schema.org JSON-LD builders for detail + person pages. These power Google
// rich results and make pages citable by AI answer engines. All fields are
// optional-safe — missing data is simply omitted.
import type { MediaDetail, PersonDetail } from "@/types/media";
import { SITE_ORIGIN } from "./seo";

function dropEmpty<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
      delete obj[k];
    }
  }
  return obj;
}

/** IMDb (0–10) is the most universal; fall back to TMDB. RT/Metacritic differ in scale. */
function aggregateRating(d: MediaDetail) {
  const imdb = d.ratings.imdb ?? d.ratings.tmdb;
  if (typeof imdb !== "number") return undefined;
  return {
    "@type": "AggregateRating",
    ratingValue: imdb,
    bestRating: 10,
    worstRating: 0,
  };
}

function directors(d: MediaDetail) {
  return d.crew
    .filter((c) => c.role === "Director")
    .map((c) => ({ "@type": "Person", name: c.name }));
}

function actors(d: MediaDetail) {
  return d.cast.slice(0, 8).map((c) => ({ "@type": "Person", name: c.name }));
}

export function movieJsonLd(d: MediaDetail, url: string): Record<string, unknown> {
  return dropEmpty({
    "@context": "https://schema.org",
    "@type": "Movie",
    name: d.title,
    url,
    image: d.posterUrl || undefined,
    description: d.overview || undefined,
    datePublished: d.releaseDate || undefined,
    genre: d.genres,
    director: directors(d),
    actor: actors(d),
    aggregateRating: aggregateRating(d),
  });
}

export function tvJsonLd(d: MediaDetail, url: string): Record<string, unknown> {
  return dropEmpty({
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: d.title,
    url,
    image: d.posterUrl || undefined,
    description: d.overview || undefined,
    startDate: d.releaseDate || undefined,
    numberOfSeasons: d.numberOfSeasons || undefined,
    genre: d.genres,
    actor: actors(d),
    aggregateRating: aggregateRating(d),
  });
}

export function personJsonLd(d: PersonDetail, url: string): Record<string, unknown> {
  return dropEmpty({
    "@context": "https://schema.org",
    "@type": "Person",
    name: d.name,
    url,
    image: d.profileUrl || undefined,
    description: d.biography || undefined,
    birthDate: d.birthday || undefined,
    deathDate: d.deathday || undefined,
    birthPlace: d.placeOfBirth || undefined,
    jobTitle: d.knownForDepartment || undefined,
    sameAs: d.imdbId ? `https://www.imdb.com/name/${d.imdbId}/` : undefined,
    mainEntityOfPage: SITE_ORIGIN,
  });
}
