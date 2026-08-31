// The collection-page intro: deterministic data-prose composed from the
// collection's materialized stats. Every sentence is a claim only our database
// can make (counts, scores, medians vs the catalog prior, newest arrival).
// That's the whole anti-slop strategy: no LLM freeform, no hype adjectives,
// no em-dashes, no rhetorical questions. If a fact isn't notable, its
// sentence is omitted.

export interface CollectionRow {
  slug: string;
  kind: string;
  title: string;
  item_count: number;
  top_score: number | null;
  median_score: number | null;
  newest_title: string | null;
  newest_date: string | null;
  /** Last rebuild_collections() run — when this shelf's ranking was refreshed. */
  updated_at?: string | null;
}

export interface DekTopItem {
  title: string;
  score?: number;
}

/**
 * The real median Balasaur Score across the indexable catalog, printed on
 * collection pages as a public claim.
 *
 * This is NOT the rank.ts PRIOR, which happens to be a similar number and was
 * previously reused here. The prior is an internal smoothing constant chosen to
 * damp low-vote titles; this is a measured fact about the catalog, and the two
 * are free to drift apart. Reusing the prior put "the catalog median of 62" on
 * 633 collection pages against a true median of 66.
 *
 * Measured 2026-08-27 against production: median 66.0 across 66,335 scored
 * titles, excluding sensitive and suggestive rows. Re-measure when the catalog
 * grows materially:
 *   select percentile_cont(0.5) within group (order by rating_balasaur)
 *   from media where rating_balasaur is not null
 *     and sensitive is not true and suggestive is not true;
 */
export const CATALOG_MEDIAN = 66;

/** A shelf only claims to beat the catalog once it clears this margin. */
export const CATALOG_MEDIAN_MARGIN = 5;

function monthWord(iso: string): string | null {
  const m = Number(iso.slice(5, 7));
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return m >= 1 && m <= 12 ? months[m - 1] : null;
}

/** Subject noun for the opening sentence, derived from the kind. */
function subject(row: CollectionRow): string {
  switch (row.kind) {
    case "service":
    case "genre-service":
      return "streaming titles";
    case "awards":
      return "winners";
    case "occasion":
      return "picks";
    default:
      return "titles";
  }
}

export function collectionDek(row: CollectionRow, top: DekTopItem[]): string {
  const parts: string[] = [];

  // The names lead. Every sentence in this paragraph except this one is nearly
  // identical across all 635 collections, differing only in a count; the
  // leaders are what a reader searching for a "best" list wants first, and
  // they are the only part of the meta description that distinguishes one
  // collection page from another in a search result.
  const scored = top.filter((t) => typeof t.score === "number").slice(0, 3);
  if (scored.length === 1) {
    parts.push(`${scored[0].title} leads at ${scored[0].score}.`);
  } else if (scored.length === 2) {
    parts.push(
      `${scored[0].title} leads at ${scored[0].score}, ahead of ${scored[1].title} (${scored[1].score}).`,
    );
  } else if (scored.length >= 3) {
    parts.push(
      `${scored[0].title} leads at ${scored[0].score}, ahead of ${scored[1].title} (${scored[1].score}) and ${scored[2].title} (${scored[2].score}).`,
    );
  }

  parts.push(
    `${row.item_count.toLocaleString("en-US")} ${subject(row)} made the cut, ordered from highest Balasaur Score to lowest.`,
  );

  // Always state the median, because the collections hub now prints it on
  // every card ("60 titles · half above 82") and a number on a card that the
  // page it links to never mentions is a number nobody can check. The
  // comparison against the catalog is the part that has to earn itself: it is
  // only worth a clause when the shelf genuinely clears the catalog by a
  // margin, otherwise it is a boast about being average.
  if (typeof row.median_score === "number") {
    parts.push(
      row.median_score >= CATALOG_MEDIAN + CATALOG_MEDIAN_MARGIN
        ? `The typical pick here scores ${row.median_score}, well above the catalog median of ${CATALOG_MEDIAN}.`
        : `The typical pick here scores ${row.median_score}.`,
    );
  }

  if (row.newest_title && row.newest_date) {
    const month = monthWord(row.newest_date);
    if (month) {
      parts.push(
        `The newest addition is ${row.newest_title}, released in ${month} ${row.newest_date.slice(0, 4)}.`,
      );
    }
  }

  // What the score is made of, last on purpose. It is word for word identical
  // on all 635 collection pages, so while it sat second it filled the meta
  // description of every one of them with the same sentence. Down here it is
  // still on the page and no longer crowds out the names that differ.
  parts.push(
    `The score blends IMDb, Rotten Tomatoes, Metacritic, and TMDB ratings into one 0 to 100 number.`,
  );

  return parts.join(" ");
}

// ---- Composition: what the ranked list is made of -------------------------
//
// A second short paragraph computed from the loaded items themselves, so every
// number is reconstructable by counting the rows on screen. Sentences are
// omitted when the underlying fact is unremarkable.

export interface CompositionItem {
  score?: number;
  year?: string;
  streaming?: string[];
}

export function collectionComposition(items: CompositionItem[]): string {
  const parts: string[] = [];
  const scores = items
    .map((i) => i.score)
    .filter((s): s is number => typeof s === "number")
    .sort((a, b) => b - a);

  // The spread, top to bottom. Skipped for tiny lists where both ends are
  // already on screen without scrolling.
  if (scores.length >= 8 && scores[0] !== scores[scores.length - 1]) {
    parts.push(`Scores run ${scores[0]} down to ${scores[scores.length - 1]}.`);
  }

  // Decade concentration, stated as an exact count.
  const decades = new Map<string, number>();
  let dated = 0;
  for (const i of items) {
    if (i.year && /^\d{4}/.test(i.year)) {
      dated++;
      const dec = `${i.year.slice(0, 3)}0s`;
      decades.set(dec, (decades.get(dec) ?? 0) + 1);
    }
  }
  if (dated >= 8) {
    const [topDec, topN] = [...decades.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topN / dated >= 0.4 && decades.size > 1) {
      parts.push(`${topN} of the ${dated} are from the ${topDec}.`);
    }
  }

  // Service overlap: the one service that carries the biggest share.
  const services = new Map<string, number>();
  for (const i of items) {
    for (const s of i.streaming ?? []) services.set(s, (services.get(s) ?? 0) + 1);
  }
  if (items.length >= 8 && services.size > 0) {
    const [topSvc, topN] = [...services.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topN / items.length >= 0.3 && topN < items.length) {
      parts.push(`${topN} of the ${items.length} stream on ${topSvc}.`);
    }
  }

  return parts.join(" ");
}
