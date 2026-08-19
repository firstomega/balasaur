// Content safety: flag erotica-adjacent titles so the homepage/browse grid and
// rails don't surface them to a casual visitor. Flagged titles are NOT deleted
// and stay reachable through title search and direct links — `sensitive` is a
// browse-visibility flag, not censorship.
//
// Sources of signal (all from the stored raw_tmdb payload — no extra API calls):
// - TMDB's own `adult` flag (rarely set, but definitive when it is).
// - Keywords: STRONG terms are individually damning ("softcore" is not a term
//   that lands on Oppenheimer by accident); WEAK terms ("erotic", "ecchi") show
//   up on legitimate mainstream titles, so two of them must agree before we
//   flag. This keeps erotic thrillers like Basic Instinct browsable while the
//   softcore/fan-service tail gets tucked away. "ecchi" is deliberately STRONG:
//   the keyword only lands on deliberately-titillating fan-service anime — the
//   exact genre the homepage complaint was about.
// Rows whose raw_tmdb is missing (the July data-copy loss, healing nightly)
// simply stay unflagged until their payload returns — fail-open by design.

const STRONG_TERMS = [
  "softcore",
  "sexploitation",
  "pink film",
  "pinku eiga",
  "hentai",
  "ecchi",
  "porn",
  "pornograph",
  "adult film",
  "adult movie",
  "adult cinema",
  "av idol",
  "gravure",
  "sex film",
  "smut",
];

const WEAK_TERMS = ["erotic", "fan service", "fanservice", "sexual fantasy"];

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

  let weakHits = 0;
  for (const kw of keywords) {
    if (STRONG_TERMS.some((t) => kw.includes(t))) return true;
    if (WEAK_TERMS.some((t) => kw.includes(t))) weakHits++;
  }
  return weakHits >= 2;
}

// ---- Suggestive: the fan-service tier ---------------------------------------
//
// A second, wider net below `sensitive`. Titles built around titillation
// (ecchi, fan-service anime) are not hard-adult, but they have no business
// appearing in recommendation rails, collections, or the rate deck, and
// especially not next to kids' titles. They remain fully browsable and
// searchable: this flag only gates the surfaces where the SITE is doing the
// recommending. Adult-themed cinema (an R-rated drama about a relationship
// with an AI, an erotic thriller) is deliberately NOT caught here.
//
// Three rules learned by getting each one wrong on live data:
//
//   1. Match whole words. Substring matching flagged The Wolf of Wall Street,
//      because "sharemarket fraud" contains "harem".
//   2. "sexual fantasy" is not a fan-service marker. As a single hit it took
//      out American Beauty, Barbarella, and Cashback. It stays a WEAK term
//      for `sensitive`, where two independent signals are required.
//   3. "harem" only means the anime subgenre inside Animation. On live action
//      it is a romance structure, and it was excluding the most famous
//      K-dramas there are: Boys Over Flowers, Coffee Prince, You're Beautiful.

/** Unambiguous fan-service markers: one whole-word hit is enough. */
const SUGGESTIVE_TERMS = ["ecchi", "fan service", "fanservice", "gravure", "seduction comedy"];

/** Only inside Animation, where it names the subgenre rather than a plot shape. */
const ANIMATION_ONLY_TERMS = ["harem"];

/** Whole-word test, so a term never matches inside a longer word. */
function hasTerm(keywords: string[], terms: string[]): boolean {
  return terms.some((t) => {
    const re = new RegExp(
      `(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`,
      "i",
    );
    return keywords.some((kw) => re.test(kw));
  });
}

export function deriveSuggestive(rawTmdb: unknown, genres: string[] = []): boolean {
  if (deriveSensitive(rawTmdb)) return true;
  const keywords = extractKeywordNames(rawTmdb);
  if (keywords.length === 0) return false;
  if (hasTerm(keywords, SUGGESTIVE_TERMS)) return true;
  return genres.includes("Animation") && hasTerm(keywords, ANIMATION_ONLY_TERMS);
}
