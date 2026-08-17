// Which pages earn a slot in Google's index.
//
// Two callers depend on this agreeing with itself: the detail routes, which
// stamp noindex on pages that fail it, and listSitemapEntries, which must
// never submit a URL whose page renders noindex. Keeping the rule here, pure
// and tested, is what stops the two from drifting apart.
//
// HISTORY, because this was wrong once and the reason matters.
//
// The first version asked "did enough people rate this": 250+ TMDB votes or a
// critic score. The Search Console export on 2026-08-17 showed eleven of the
// thirteen best-performing pages carrying noindex, several ranking on page
// one. Two separate faults:
//
//   1. It read `(voteCount ?? 0) >= 250`, which turns UNKNOWN into ZERO.
//      23,436 catalogued titles have no vote count fetched at all. The
//      Patient, an Apple TV+ drama starring Steve Carell, was excluded
//      because a number was missing. The prose layer never makes this
//      mistake: it omits a sentence when a fact is absent rather than
//      asserting something false about it.
//   2. Even a KNOWN low count does not predict search demand. Be My Guest
//      with Ina Garten has 3 votes and ranked at position 7.1; Testament has
//      6 votes and ranked at 5.9. TMDB votes simply do not track how often
//      people search for a television programme.
//
// So popularity is gone from this gate. What remains is the honest question:
// can this page stand alone in a search result, or is it a poster and a
// borrowed blurb?
//
// Breadth and quality are not in tension. noindex is a PROHIBITION and should
// only bar pages with nothing to say. The sitemap is a REQUEST and stays
// curated and small. Google is already choosing between them: it discovered
// 10,337 URLs and indexed 287.

/** How many independent facts a page needs beyond art, synopsis and score. */
export const MIN_SUBSTANCE_FACTS = 2;

export interface SubstanceInput {
  streaming?: string[];
  cast?: unknown[];
  crew?: unknown[];
  runtime?: number;
  numberOfSeasons?: number;
  ratings?: {
    imdb?: number;
    rottenTomatoes?: number;
    metacritic?: number;
  };
}

/**
 * Count the independent things this page can actually say. Each is a fact a
 * reader gets that a bare stub would not have: an audience rating, a critic
 * rating, where to watch it, who made it, and how long it runs.
 */
export function substanceFacts(d: SubstanceInput): number {
  let n = 0;
  if (d.ratings?.imdb !== undefined) n++;
  if (d.ratings?.rottenTomatoes !== undefined || d.ratings?.metacritic !== undefined) n++;
  if ((d.streaming?.length ?? 0) > 0) n++;
  if ((d.cast?.length ?? 0) + (d.crew?.length ?? 0) >= 3) n++;
  if (d.runtime !== undefined || (d.numberOfSeasons ?? 0) > 0) n++;
  return n;
}

/** Does this page have enough to say to stand alone in a search result? */
export function hasSubstance(d: SubstanceInput): boolean {
  return substanceFacts(d) >= MIN_SUBSTANCE_FACTS;
}

/**
 * A detail page earns an index slot when it can stand alone: art, a synopsis,
 * a score, and at least two further facts. Deliberately no popularity test;
 * see the history note above.
 */
export function isIndexableDetail(
  d: SubstanceInput & {
    overview?: string;
    posterUrl?: string;
    ratings?: {
      imdb?: number;
      tmdb?: number;
      balasaur?: number;
      rottenTomatoes?: number;
      metacritic?: number;
    };
  },
): boolean {
  return Boolean(
    d.overview &&
    d.posterUrl &&
    (d.ratings?.balasaur !== undefined ||
      d.ratings?.imdb !== undefined ||
      d.ratings?.tmdb !== undefined) &&
    hasSubstance(d),
  );
}
