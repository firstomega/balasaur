// The line under a collection card.
//
// It used to be "top 92", which read as "the top 92 titles" and could not
// separate two shelves anyway: across 673 collections the top score has a
// standard deviation of 4.1 and half sit between 88 and 95. What a person
// actually wants before opening a shelf is not a verdict on its quality,
// which they take on trust, but where they stand in it.
//
// So the line is personal, and its VARIATION is driven by the data rather
// than by rotation: the sentence changes only where the ordinary shape would
// be wrong to say out loud, at nothing watched, at one title left, and at a
// finished shelf. Everywhere else it keeps one shape and one scale, because a
// column of cards is read by diffing it, and two scales in one column stop
// adjacent cards being comparable. The numbers do the varying.

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

  // One title short. The fraction buries this: "59 of 60" scans as "a lot",
  // when the fact worth knowing is that one specific film is still unwatched.
  // Requires progress: on a one-title shelf, nothing watched also leaves one,
  // and "all but one" would then be a claim about a shelf never touched.
  if (seen > 0 && left === 1) return "You have seen all but one";

  // Underway. Deliberately the same shape all the way from one seen to nearly
  // all: an earlier draft flipped to "30 left to see" past the halfway mark,
  // which put two different scales in one column and made adjacent cards
  // incomparable, at a threshold the reader cannot see. The number varies on
  // its own; the sentence should not.
  if (seen > 0) return `You have seen ${seen} of ${total}`;

  // Nothing seen, but some of it is already saved: still personal, still true,
  // and the state a new visitor reaches first, because saving is one tap and
  // watching is two hours. Same "of {total}" scale as the rung above, so the
  // column keeps one ruler.
  if (want > 0) return `${want} of ${total} on your watchlist`;

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
