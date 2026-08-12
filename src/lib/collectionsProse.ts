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
    default:
      return "titles";
  }
}

export function collectionDek(row: CollectionRow, top: DekTopItem[]): string {
  const parts: string[] = [];

  parts.push(
    `${row.item_count.toLocaleString()} ${subject(row)} made the cut, ordered from highest Balasaur Score to lowest.`,
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
