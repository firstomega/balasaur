// The line under a collection card.
//
// It used to be "top 92", which read as "the top 92 titles" and could not
// separate two shelves anyway: across 673 collections the top score has a
// standard deviation of 4.1 and half sit between 88 and 95. What a person
// actually wants before opening a shelf is not a verdict on its quality,
// which they take on trust, but where they stand in it.
//
// So the line is personal, and its VARIATION is driven by the data rather
// than by rotation: the sentence changes when the meaning of the number
// changes. Early in a shelf the interesting figure is how many you have
// seen; near the end it is how many are left; at the end it is that you are
// done. Because shelves differ in how far a person has got, a column of
// cards varies on its own without any string being picked at random.

export interface ProgressInput {
  total: number;
  seen: number;
  want: number;
}

/**
 * The line, or null when there is nothing personal to say yet and the card
 * should fall back to its impersonal count. Never invents a number: every
 * figure here is countable by opening the shelf.
 */
export function collectionProgressLine(input: ProgressInput): string | null {
  const total = Math.max(0, Math.floor(input.total));
  const seen = Math.max(0, Math.min(Math.floor(input.seen), total));
  const want = Math.max(0, Math.min(Math.floor(input.want), total));
  if (total === 0) return null;
  const left = total - seen;

  // Finished. Worth its own sentence: it is the only state where the number
  // a person wants is the whole shelf.
  if (seen === total) return `You have seen all ${total}`;

  // Nearly finished, so the small number is the useful one. The threshold is
  // "fewer left than seen", not a percentage, because that is exactly the
  // point where the remaining pile becomes the thing you are tracking.
  if (seen > 0 && left <= seen) {
    return left === 1 ? "1 left to see" : `${left} left to see`;
  }

  // Underway.
  if (seen > 0) return `You have seen ${seen} of ${total}`;

  // Nothing seen, but some of it is already saved: still personal, still true,
  // and it is the state a new visitor reaches first because saving is one tap
  // and watching is two hours.
  if (want > 0) return want === 1 ? "1 on your watchlist" : `${want} on your watchlist`;

  // Nothing to say about this person and this shelf.
  return null;
}

/** The impersonal line, used before the library arrives and for shelves the
 *  visitor has never touched. It also kills the old misreading: the count of
 *  titles is the number the owner expected "top 92" to be. */
export function collectionCountLine(total: number): string {
  const n = Math.max(0, Math.floor(total));
  return `${n.toLocaleString("en-US")} ${n === 1 ? "title" : "titles"}`;
}
