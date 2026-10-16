// The person page and the /best list built for the same person link to each
// other. The list is minted nightly by rebuild_collections() from
// person_collection_roster, with the title
//   'The Best ' || person_name || ' Movies' (or ' Shows')
// These helpers mirror that one expression, so either page can find the other
// by an exact match on the roster's own spelling of the name. Matching the
// title rather than rebuilding the slug means no copy of slugify() and
// unaccent() lives here to drift. A mismatch costs a missing link, never a
// wrong one: the list is looked up, not assumed.

/** The two list titles a roster name can have, movies first. */
export function personListTitles(name: string): string[] {
  return name.trim() ? [`The Best ${name} Movies`, `The Best ${name} Shows`] : [];
}

/** The roster name a person list's title was built from. */
export function personNameFromListTitle(title: string): string | undefined {
  return /^The Best (.+) (?:Movies|Shows)$/.exec(title)?.[1];
}
