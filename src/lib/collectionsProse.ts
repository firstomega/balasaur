// The collection-page dek: deterministic data-prose composed from the
// collection's materialized stats. Every sentence is a claim only our database
// can make (counts, scores, medians vs the catalog prior, newest arrival) —
// that's the whole anti-slop strategy. No LLM freeform, no hype adjectives,
// no rhetorical questions; if a fact isn't notable, its sentence is omitted.

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
/** The named tier bar — scores at/above read as exceptional. */
const APEX_BAR = 85;

function scoreList(items: DekTopItem[]): string {
  return items
    .filter((i) => typeof i.score === "number")
    .slice(0, 3)
    .map((i) => `${i.title} (${i.score})`)
    .join(", ");
}

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
      return "titles streaming now";
    case "year":
    case "decade":
    case "genre-decade":
      return "titles";
    case "awards":
      return "winners";
    default:
      return "titles";
  }
}

export function collectionDek(row: CollectionRow, top: DekTopItem[]): string {
  const parts: string[] = [];

  parts.push(
    `${row.item_count.toLocaleString()} ${subject(row)}, ranked by Balasaur Score — ` +
      `one 0–100 blend of IMDb, Rotten Tomatoes, Metacritic, and TMDB ratings.`,
  );

  const apexCount = top.filter((t) => (t.score ?? 0) >= APEX_BAR).length;
  const listed = scoreList(top);
  if (listed) {
    if (apexCount >= 2) {
      parts.push(`The top of the shelf clears the Apex bar: ${listed}.`);
    } else {
      parts.push(`Leading the list: ${listed}.`);
    }
  }

  if (typeof row.median_score === "number" && row.median_score >= CATALOG_MEDIAN + 5) {
    parts.push(
      `The shelf's median score of ${row.median_score} runs well above the catalog-wide ${CATALOG_MEDIAN}.`,
    );
  }

  if (row.newest_title && row.newest_date) {
    const month = monthWord(row.newest_date);
    if (month)
      parts.push(
        `Newest arrival: ${row.newest_title}, released in ${month} ${row.newest_date.slice(0, 4)}.`,
      );
  }

  return parts.join(" ");
}
