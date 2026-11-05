/**
 * The order and rank numbers of a best-of list, as the page shows them.
 *
 * Rows are ordered by the score printed on them, highest first, so a reader
 * can explain every step from what is on screen. The stored order is usually
 * the same; it drifts when a score changes after the nightly rebuild (12 rows
 * across 782 lists on 2026-11-05), and a 80 above an 81 reads as broken.
 * The sort is stable, so equal scores keep the stored order between them.
 *
 * Equal scores share a rank ("1, 2, 3, 3, 3, 6"): the order inside a tie rests
 * on a value the page does not show, so no number should claim it. A row
 * without a shown score cannot tie with anything; it keeps its own position
 * and sorts after every scored row.
 */
export interface RankedEntry<T> {
  item: T;
  rank: number;
}

export function rankByShownScore<T>(
  items: readonly T[],
  scoreOf: (item: T) => number | null | undefined,
): RankedEntry<T>[] {
  const scored = items.map((item, at) => {
    const s = scoreOf(item);
    return { item, at, score: typeof s === "number" && Number.isFinite(s) ? s : null };
  });
  scored.sort((a, b) => {
    if (a.score === null || b.score === null) {
      if (a.score === b.score) return a.at - b.at;
      return a.score === null ? 1 : -1;
    }
    return b.score - a.score || a.at - b.at;
  });
  const out: RankedEntry<T>[] = [];
  for (let i = 0; i < scored.length; i++) {
    const cur = scored[i];
    const prev = scored[i - 1];
    const tied = i > 0 && cur.score !== null && prev.score === cur.score;
    out.push({ item: cur.item, rank: tied ? out[i - 1].rank : i + 1 });
  }
  return out;
}
