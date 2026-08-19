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

/** Catalog-wide typical Balasaur Score (mirrors the rank.ts prior). */
const CATALOG_MEDIAN = 62;

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

  parts.push(
    `${row.item_count.toLocaleString("en-US")} ${subject(row)} made the cut, ordered from highest Balasaur Score to lowest.`,
  );
  parts.push(
    `The score blends IMDb, Rotten Tomatoes, Metacritic, and TMDB ratings into one 0 to 100 number.`,
  );

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

  if (typeof row.median_score === "number" && row.median_score >= CATALOG_MEDIAN + 5) {
    parts.push(
      `The typical pick here scores ${row.median_score}, well above the catalog median of ${CATALOG_MEDIAN}.`,
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
