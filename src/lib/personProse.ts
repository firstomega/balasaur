// Person-page data-prose, same house pattern as titleProse.ts: deterministic
// sentences from catalog facts, said only when they answer something a viewer
// would actually ask, and omitted when the fact is missing or too thin.
//
// What is NOT here, on purpose. A median score across a whole filmography and
// a "most often alongside" list were both cut on 2026-10-15: true and
// reconstructable, but nobody types "Tom Hanks median score", and a count of
// shared top-six billings is a fact about how the catalog stores credits. The
// ranked set answers "what are their best films", so the prose does not
// repeat it.
//
// What is. "What was their best decade" is a question people ask, and the
// answer here is a comparison (the winning decade against the runner-up),
// drawn from the same ranked pool as the six on the page, so every score
// behind it has already passed the trust rule.

import type { PersonCatalog } from "@/types/media";

export function personProse(name: string, catalog: PersonCatalog): string {
  const d = catalog.bestDecade;
  if (!d) return "";
  return (
    `${name}'s ${d.decade} titles rate highest: a median Balasaur Score of ${d.median} ` +
    `across ${d.titles}, against ${d.runnerUp.median} for the ${d.runnerUp.decade}.`
  );
}
