// The one catalog count the site quotes in static copy. /about, the
// collections hub, llms.txt, the arcade pages and Movie Night's reveal import
// this constant so they can never disagree with each other again (the audit
// caught the site quoting 65,000, 66,000 and "more than 66,000" at once
// against a 76k catalog, and Movie Night was still "Reading 74,000 titles"
// against 104k). A test fails if any route or component prints a
// five-or-six-digit title count of its own.
//
// Deliberately NOT used on the homepage hero: the grid's own live counter
// renders on the same screen, and two counts that drift apart fail the
// number check. Pages that use this constant have no competing counter.
//
// Measured 2026-11-06 against production:
//   select count(*) from media
//   where sensitive is not true and suggestive is not true;
// Re-measure and bump when the catalog grows materially. The previous figure
// (104,121, measured 2026-10-15) was 13,708 short three weeks later, and the
// one before it (92,822, 2026-09-16) was 11,299 short a month later.
// llms.txt no longer uses this constant: it reads the count live
// (catalogCount.server.ts) and floors it with floorLabel below.
export const CATALOG_COUNT = 117829;
export const CATALOG_COUNT_LABEL = CATALOG_COUNT.toLocaleString("en-US");

// Static copy quotes the floored form ("more than 104,000"): the homepage grid
// prints its own live count, which grows nightly, so an exact figure in
// cached prose would disagree with it within days. A floor stays true.
export const CATALOG_FLOOR = Math.floor(CATALOG_COUNT / 1000) * 1000;
export const CATALOG_FLOOR_LABEL = CATALOG_FLOOR.toLocaleString("en-US");

/** The "more than N" form of any count: the thousand strictly below it, so
 *  "more than" stays true even when the count lands on a round thousand. */
export function floorLabel(count: number): string {
  const floor = Math.floor((count - 1) / 1000) * 1000;
  return floor.toLocaleString("en-US");
}
