// Content safety: flag adult titles so the browse grid and rails don't surface
// them to a casual visitor. Flagged titles are NOT deleted and stay reachable
// through title search and direct links. `sensitive` is a browse-visibility
// flag, not censorship.
//
// The rule is one distinction, and everything here follows from it:
//
//   A title is flagged for what it IS, never for what it is ABOUT.
//
// TMDB keywords describe subject matter as readily as product. "pornography"
// is the keyword on Taxi Driver, Boogie Nights, Shame, and The People vs.
// Larry Flynt, none of which are pornography. "erotic" is the keyword on
// Basic Instinct. Flagging on those hid 116 acclaimed films from the entire
// site, including Taxi Driver (Balasaur 86, 13,655 votes), which is exactly
// the failure this comment exists to prevent recurring.
//
// So only PRODUCTION markers flag: keywords that name the thing itself
// (hentai, softcore, pinku eiga, av idol). Subject markers never flag on
// their own, and there is deliberately no "two weak signals" rule, because
// two subject markers about sex are still a film about sex.
//
// Rows whose raw_tmdb is missing (the July data-copy loss, healing nightly)
// stay unflagged until their payload returns: fail-open by design.

/** Whole-word test. Substring matching flagged Arifureta, because
 *  "transmutation" contains "smut". */
function hasTerm(keywords: string[], terms: string[]): boolean {
  return terms.some((t) => {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i");
    return keywords.some((kw) => re.test(kw));
  });
}

/** Exact-match test, for terms whose qualified forms mean something else. */
function hasExactTerm(keywords: string[], terms: string[]): boolean {
  return keywords.some((kw) => terms.includes(kw.trim()));
}

/**
 * Production markers: the title IS adult content. One whole-word hit flags.
 * Every entry names a product or a production tradition, never a topic.
 */
const PRODUCTION_TERMS = [
  "hentai",
  "softcore",
  "soft porn",
  "sexploitation",
  "pink film",
  "pinku eiga",
  "roman porno",
  "av idol",
  "adult film",
  "adult movie",
  "adult cinema",
  "sex film",
  "porn film",
  "porn films",
  "pornographic film",
  "gay pornography",
  "erotic movie",
  "smut",
  "ecchi",
  "gravure",
];

interface KeywordLike {
  name?: string;
}

function extractKeywordNames(rawTmdb: unknown): string[] {
  const k = (
    rawTmdb as {
      keywords?: { keywords?: KeywordLike[]; results?: KeywordLike[] };
    } | null
  )?.keywords;
  const list = k?.keywords ?? k?.results ?? [];
  return Array.isArray(list)
    ? list.map((x) => (typeof x?.name === "string" ? x.name.toLowerCase() : "")).filter(Boolean)
    : [];
}

export function deriveSensitive(rawTmdb: unknown): boolean {
  const adult = (rawTmdb as { adult?: unknown } | null)?.adult;
  if (adult === true) return true;

  const keywords = extractKeywordNames(rawTmdb);
  if (keywords.length === 0) return false;
  return hasTerm(keywords, PRODUCTION_TERMS);
}

// ---- Suggestive: the fan-service tier ---------------------------------------
//
// A second, wider net below `sensitive`. Titles built around titillation are
// not hard-adult, but they have no business appearing in recommendation rails,
// collections, or the rate deck, and especially not next to kids' titles. They
// remain fully browsable and searchable: this flag only gates the surfaces
// where the SITE is doing the recommending.
//
// Two rules, each learned by getting it wrong on live data:
//
//   1. "harem" only means the anime subgenre inside Animation, and only
//      exactly. On live action it is a romance structure, and it was
//      excluding the most famous K-dramas there are: Boys Over Flowers,
//      Coffee Prince, You're Beautiful. Qualified forms mean something else
//      again: "reverse harem" and "male harem" are the josei and otome
//      structure, which took out Ooku: The Inner Chambers.
//   2. "sexual fantasy" is not a fan-service marker. As a single hit it
//      excluded American Beauty, Barbarella, and Cashback.
//
// In today's catalog every suggestive-only row comes from the Animation rule;
// the markers below are already covered upstream by PRODUCTION_TERMS or do not
// appear as TMDB keywords yet, and are kept so the tier still fires if they do.

const SUGGESTIVE_TERMS = ["fan service", "fanservice", "seduction comedy"];

/** Only inside Animation, where it names the subgenre rather than a plot shape. */
const ANIMATION_ONLY_TERMS = ["harem"];

export function deriveSuggestive(rawTmdb: unknown, genres: string[] = []): boolean {
  if (deriveSensitive(rawTmdb)) return true;
  const keywords = extractKeywordNames(rawTmdb);
  if (keywords.length === 0) return false;
  if (hasTerm(keywords, SUGGESTIVE_TERMS)) return true;
  return genres.includes("Animation") && hasExactTerm(keywords, ANIMATION_ONLY_TERMS);
}
