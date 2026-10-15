// The person page and the /best list built for the same person link to each
// other. The list is minted nightly by rebuild_collections() from
// person_collection_roster, with the slug
//   'best-' || slugify(unaccent(person_name)) || '-movies' (or '-shows')
// and the title 'The Best ' || person_name || ' Movies' (or ' Shows').
// These helpers mirror those two expressions so either page can find the
// other without a schema change. A mismatch costs a missing link, never a
// wrong one: the slug is looked up, not assumed.

/** Letters unaccent() rewrites that Unicode decomposition leaves alone. */
const UNACCENT_EXTRA: Record<string, string> = {
  ø: "o",
  Ø: "O",
  ß: "ss",
  æ: "ae",
  Æ: "AE",
  œ: "oe",
  Œ: "OE",
  ł: "l",
  Ł: "L",
  đ: "d",
  Đ: "D",
  ð: "d",
  þ: "th",
  ı: "i",
};

/** public.slugify(unaccent(t)), in JavaScript. */
export function sqlSlugify(t: string): string {
  const unaccented = t
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[øØßæÆœŒłŁđĐðþı]/g, (c) => UNACCENT_EXTRA[c] ?? c);
  return unaccented
    .toLowerCase()
    .replace(/\+/g, "-plus")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The two list slugs a roster name can have. */
export function personListSlugs(name: string): string[] {
  const s = sqlSlugify(name);
  return s ? [`best-${s}-movies`, `best-${s}-shows`] : [];
}

/** The roster name a person list's title was built from. */
export function personNameFromListTitle(title: string): string | undefined {
  return /^The Best (.+) (?:Movies|Shows)$/.exec(title)?.[1];
}
