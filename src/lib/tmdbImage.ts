// TMDB serves each image at a fixed size chosen via the URL path segment
// (https://image.tmdb.org/t/p/<size>/<file>). Our `media` rows store whatever
// size the ingest picked — often full-res "original" for backdrops and provider
// logos — so these helpers rewrite that segment to request an appropriately
// small size (and build a `srcset`) per surface, with no re-ingest needed.
// Non-TMDB or empty URLs pass through unchanged.
const TMDB_HOST = "image.tmdb.org";
const SIZE_SEGMENT = /\/t\/p\/[^/]+\//;

/** Rewrite a stored TMDB image URL to a specific size (e.g. "w342", "w1280"). */
export function tmdbImage(url: string | undefined | null, size: string): string {
  if (!url) return "";
  if (!url.includes(TMDB_HOST)) return url;
  return url.replace(SIZE_SEGMENT, `/t/p/${size}/`);
}

/** Build a `srcset` from one source at several widths, or undefined for non-TMDB URLs. */
export function tmdbSrcSet(
  url: string | undefined | null,
  variants: { w: number; size: string }[],
): string | undefined {
  if (!url || !url.includes(TMDB_HOST)) return undefined;
  return variants.map(({ w, size }) => `${tmdbImage(url, size)} ${w}w`).join(", ");
}
