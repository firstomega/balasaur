// Schema.org JSON-LD builders for detail + person pages. These power Google
// rich results and make pages citable by AI answer engines. All fields are
// optional-safe — missing data is simply omitted.
import type { MediaDetail, PersonDetail } from "@/types/media";
import { SITE_NAME, SITE_ORIGIN, SITE_TAGLINE } from "./seo";
import { computeBalasaurScore } from "./score";

function dropEmpty<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
      delete obj[k];
    }
  }
  return obj;
}

/** The Balasaur Score (0-100 blend) with TMDB's community vote count: an
 *  aggregator marking up its aggregate, Metacritic-style.
 *
 *  Schema.org requires ratingCount or reviewCount on an AggregateRating, and
 *  Search Console reports the block as an invalid item without one. A
 *  count-less fallback used to ship for titles with no vote count, which put
 *  11,366 pages in the invalid pile for no gain: an invalid block earns
 *  nothing an absent block would not. So no count, no aggregateRating. */
function aggregateRating(d: MediaDetail) {
  const balasaur = d.ratings.balasaur ?? computeBalasaurScore(d.ratings);
  if (typeof balasaur !== "number") return undefined;
  if (typeof d.voteCount !== "number" || d.voteCount <= 0) return undefined;
  return {
    "@type": "AggregateRating",
    ratingValue: balasaur,
    bestRating: 100,
    worstRating: 0,
    ratingCount: d.voteCount,
  };
}

/** Home → Movies/TV → Title trail for detail pages. */
export function breadcrumbJsonLd(d: MediaDetail, url: string): Record<string, unknown> {
  const section = d.mediaType === "tv" ? "TV Shows" : "Movies";
  const sectionUrl = `${SITE_ORIGIN}/?type=${d.mediaType}`;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_ORIGIN },
      { "@type": "ListItem", position: 2, name: section, item: sectionUrl },
      { "@type": "ListItem", position: 3, name: d.title, item: url },
    ],
  };
}

/** Site-level identity for the homepage (no SearchAction — search isn't
 *  URL-addressable yet). */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_ORIGIN,
    description: `${SITE_TAGLINE}. Discover, track, and rate movies and TV.`,
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_ORIGIN },
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
