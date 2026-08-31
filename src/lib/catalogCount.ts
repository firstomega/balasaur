// The one catalog count the site quotes in static copy. /about, the
// collections hub, and llms.txt import this constant so they can never
// disagree with each other again (the audit caught the site quoting 65,000,
// 66,000 and "more than 66,000" at once against a 76k catalog).
//
// Deliberately NOT used on the homepage hero: the grid's own live counter
// renders on the same screen, and two counts that drift apart fail the
// number check. Pages that use this constant have no competing counter.
//
// Measured 2026-08-31 against production:
//   select count(*) from media
//   where sensitive is not true and suggestive is not true;
// Re-measure and bump when the catalog grows materially.
export const CATALOG_COUNT = 76264;
export const CATALOG_COUNT_LABEL = CATALOG_COUNT.toLocaleString("en-US");

// Static copy quotes the floored form ("more than 76,000"): the homepage grid
// prints its own live count, which grows nightly, so an exact figure in
// cached prose would disagree with it within days. A floor stays true.
export const CATALOG_FLOOR = Math.floor(CATALOG_COUNT / 1000) * 1000;
export const CATALOG_FLOOR_LABEL = CATALOG_FLOOR.toLocaleString("en-US");
