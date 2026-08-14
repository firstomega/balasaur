// Which pages earn a slot in Google's index.
//
// Two callers depend on this agreeing with itself: the detail routes, which
// stamp noindex on pages that fail it, and listSitemapEntries, which must
// never submit a URL whose page renders noindex. Keeping the rule here, pure
// and tested, is what stops the two from drifting apart.

/**
 * Minimum TMDB rating count for a title to count as corroborated. Titles below
 * it must instead carry a critic score, which only a real release earns.
 */
export const CORROBORATION_MIN_VOTES = 250;

/**
 * Has enough of the world seen this for a page about it to be worth indexing?
 *
 * Rating count is the proxy: it says how many people cared enough to rate the
 * title. A critic score is the alternate route in, since a film can have a
 * proper theatrical release and still hold few TMDB votes.
 *
 * This exists because the catalog holds 68,100 titles of which 57,507 cleared
 * the old bar of art + synopsis + a score. Asking a search engine to index
 * 57,507 pages built from the same API a dozen competitors also mirror is how
 * a database site earns a "low value content" verdict across every page it
 * owns, including the good ones. Corroboration cuts that to about 17,700.
 */
export function isCorroborated(d: {
  voteCount?: number;
  ratings?: { rottenTomatoes?: number; metacritic?: number };
}): boolean {
  if ((d.voteCount ?? 0) >= CORROBORATION_MIN_VOTES) return true;
  return d.ratings?.rottenTomatoes !== undefined || d.ratings?.metacritic !== undefined;
}

/**
 * A detail page earns an index slot only when it can stand alone in a search
 * result: art, a synopsis, a score, and corroboration that people have seen it.
 */
export function isIndexableDetail(d: {
  overview?: string;
  posterUrl?: string;
  voteCount?: number;
  ratings?: {
    imdb?: number;
    tmdb?: number;
    balasaur?: number;
    rottenTomatoes?: number;
    metacritic?: number;
  };
}): boolean {
  return Boolean(
    d.overview &&
    d.posterUrl &&
    (d.ratings?.balasaur !== undefined ||
      d.ratings?.imdb !== undefined ||
      d.ratings?.tmdb !== undefined) &&
    isCorroborated(d),
  );
}
