// The collection-page intro: deterministic data-prose composed from the
// collection's materialized stats. Every sentence is a claim about the titles
// in this shelf (leaders and their scores, median vs the catalog prior, newest
// arrival). That's the whole anti-slop strategy: no LLM freeform, no hype
// adjectives, no em-dashes, no rhetorical questions. If a fact isn't notable,
// its sentence is omitted.
//
// The dek deliberately does NOT state the item count, describe the sort order,
// or define the Balasaur Score. The page already renders the count as a chip
// and links "Ranked by Balasaur Score" to /methodology directly beneath this
// paragraph, and a reader looking at a descending list of scores does not need
// to be told it descends. Those two sentences were also byte-identical across
// every shelf, which made them the most duplicated strings on the domain and
// pushed the real claims out of the meta description.

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

/**
 * Returns "" when nothing notable is known about the shelf. Callers must
 * handle that: render no paragraph, and fall back for the meta description.
 */
export function collectionDek(row: CollectionRow, top: DekTopItem[]): string {
  const parts: string[] = [];

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
