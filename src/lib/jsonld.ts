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

/** The Balasaur Score (0-100) with the count of published ratings it averages:
 *  an aggregator marking up its aggregate, Metacritic-style.
 *
 *  ratingCount used to carry TMDB's vote count, which paired a four-source
 *  blend with a one-source population. Inception went out as 84 out of 100
 *  "from 39,857 ratings", when those 39,857 people rated the TMDB number that
 *  carries a tenth of the weight. Google reads ratingValue and ratingCount as
 *  one claim, so the two have to describe the same population. The count is
 *  now the sources the blend averaged, which the score breakdown on the page
 *  lists by name with each value.
 *
 *  Two rules keep the block honest, and both cost coverage on purpose.
 *
 *  Schema.org requires ratingCount or reviewCount, and Search Console reports
 *  a block without one as an invalid item. A count-less fallback used to ship
 *  for titles with no vote count, which put 11,366 pages in the invalid pile
 *  for no gain. So no count, no aggregateRating.
 *
 *  And an AggregateRating is an average of MULTIPLE ratings. A title holding
 *  one published rating has no average to report: its score is that single
 *  source rescaled, so marking it up restates TMDB's or IMDb's rating as ours.
 *  10,843 catalogued titles sit there today, nearly all TMDB-only, and they
 *  get the block back the moment a second source lands. */
function aggregateRating(d: MediaDetail) {
  const r = d.ratings;
  const ratingCount = [r.imdb, r.rottenTomatoes, r.metacritic, r.tmdb].filter(
    (v) => typeof v === "number",
  ).length;
  if (ratingCount < 2) return undefined;
  const balasaur = r.balasaur ?? computeBalasaurScore(r);
  if (typeof balasaur !== "number") return undefined;
  return {
    "@type": "AggregateRating",
    ratingValue: balasaur,
    bestRating: 100,
    worstRating: 0,
    ratingCount,
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
