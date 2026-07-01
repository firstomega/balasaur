// Central normalization for the Advanced-filter facets — the single place that turns
// messy TMDB signals (keywords, genres, certification, status, runtime) into clean,
// curated facet tags. Mirrors genres.ts / origins.ts: a static dictionary + pure
// derivation functions, run identically from sync (rowFromEnrichedItem) and the
// backfill (backfillFromRaw) so every title — new or old — gets tagged with no API
// cost. Seeded with a starter vocabulary keyed on lowercased keyword NAMES; the
// keyword-frequency export can layer in more entries (and stable keyword IDs) later.
// Unmapped keywords simply don't surface — safe and deterministic.

export type Keyword = { id?: number; name: string };

const norm = (s: string): string => s.trim().toLowerCase();

// ---- Themes: a keyword maps directly to a broad, cross-genre theme. -------------
const THEME_MAP: Record<string, string> = {
  military: "Military",
  army: "Military",
  war: "Military",
  soldier: "Military",
  "world war ii": "Military",
  "world war i": "Military",
  space: "Space",
  spacecraft: "Space",
  "outer space": "Space",
  astronaut: "Space",
  alien: "Aliens",
  extraterrestrial: "Aliens",
  "alien invasion": "Aliens",
  "time travel": "Time Travel",
  superhero: "Superhero",
  "based on comic": "Superhero",
  "marvel comic": "Superhero",
  "dc comics": "Superhero",
  zombie: "Zombies",
  undead: "Zombies",
  vampire: "Vampires",
  werewolf: "Werewolves",
  dystopia: "Dystopian",
  dystopian: "Dystopian",
  "post-apocalyptic future": "Dystopian",
  apocalypse: "Dystopian",
  heist: "Heist",
  robbery: "Heist",
  "bank robbery": "Heist",
  spy: "Espionage",
  espionage: "Espionage",
  "secret agent": "Espionage",
  "serial killer": "Serial Killer",
  supernatural: "Supernatural",
  ghost: "Supernatural",
  haunting: "Supernatural",
  "haunted house": "Supernatural",
  magic: "Magic",
  wizard: "Magic",
  witch: "Magic",
  sorcery: "Magic",
  "artificial intelligence": "AI & Robots",
  robot: "AI & Robots",
  android: "AI & Robots",
  cyborg: "AI & Robots",
  detective: "Detective",
  "private detective": "Detective",
  investigation: "Detective",
  "coming of age": "Coming of Age",
  sport: "Sports",
  boxing: "Sports",
  football: "Sports",
  basketball: "Sports",
  baseball: "Sports",
  "based on true story": "Based on a True Story",
  "based on a true story": "Based on a True Story",
  biography: "Based on a True Story",
  pandemic: "Pandemic",
  virus: "Pandemic",
  epidemic: "Pandemic",
  "high school": "High School",
  "martial arts": "Martial Arts",
  "kung fu": "Martial Arts",
  karate: "Martial Arts",
  christmas: "Holiday",
  holiday: "Holiday",
  monster: "Monsters",
  kaiju: "Monsters",
  "giant monster": "Monsters",
  politics: "Political",
  "political corruption": "Political",
  president: "Political",
  courtroom: "Legal",
  lawyer: "Legal",
  trial: "Legal",
  hospital: "Medical",
  doctor: "Medical",
  medical: "Medical",
  prison: "Prison",
  "prison escape": "Prison",
  survival: "Survival",
  conspiracy: "Conspiracy",
  cyberpunk: "Cyberpunk",
  hacker: "Cyberpunk",
  "virtual reality": "Cyberpunk",
  mafia: "Mafia & Mob",
  gangster: "Mafia & Mob",
  "organized crime": "Mafia & Mob",
  dragon: "Dragons",
  dinosaur: "Dinosaurs",
  pirate: "Pirates",
  "road trip": "Road Trip",
  band: "Music",
  "rock band": "Music",
  musician: "Music",
};

// ---- Sub-genres: fire only when a PARENT unified-genre is present AND a keyword in
//      the group matches. This is what keeps "Military" (theme) distinct from
//      "Military Sci-Fi" (a curation decision encoded here, since TMDB has neither).
type SubgenreRule = { label: string; parents: string[]; keywords: string[] };
const SUBGENRE_RULES: SubgenreRule[] = [
  {
    label: "Military Sci-Fi",
    parents: ["Science Fiction"],
    keywords: ["military", "army", "war", "space marine", "soldier"],
  },
  {
    label: "Space Opera",
    parents: ["Science Fiction"],
    keywords: ["space", "spacecraft", "outer space", "galaxy", "interstellar"],
  },
  {
    label: "Dystopian Sci-Fi",
    parents: ["Science Fiction"],
    keywords: ["dystopia", "dystopian", "post-apocalyptic future", "apocalypse"],
  },
  {
    label: "Cyberpunk",
    parents: ["Science Fiction"],
    keywords: ["cyberpunk", "hacker", "virtual reality", "artificial intelligence"],
  },
  { label: "Time-Travel Sci-Fi", parents: ["Science Fiction"], keywords: ["time travel"] },
  {
    label: "Alien Invasion",
    parents: ["Science Fiction"],
    keywords: ["alien", "alien invasion", "extraterrestrial"],
  },
  { label: "Zombie Horror", parents: ["Horror"], keywords: ["zombie", "undead"] },
  { label: "Vampire Horror", parents: ["Horror"], keywords: ["vampire"] },
  {
    label: "Supernatural Horror",
    parents: ["Horror"],
    keywords: ["supernatural", "ghost", "haunting", "demon", "possession"],
  },
  { label: "Slasher", parents: ["Horror"], keywords: ["slasher", "serial killer"] },
  {
    label: "Psychological Horror",
    parents: ["Horror"],
    keywords: ["psychological horror", "psychological"],
  },
  {
    label: "Romantic Comedy",
    parents: ["Comedy", "Romance"],
    keywords: ["romantic comedy", "romance"],
  },
  { label: "Dark Comedy", parents: ["Comedy"], keywords: ["dark comedy", "black comedy"] },
  { label: "Martial Arts", parents: ["Action"], keywords: ["martial arts", "kung fu", "karate"] },
  {
    label: "Spy / Espionage",
    parents: ["Action", "Thriller"],
    keywords: ["spy", "espionage", "secret agent"],
  },
  {
    label: "Superhero",
    parents: ["Action", "Adventure", "Science Fiction"],
    keywords: ["superhero", "based on comic", "marvel comic", "dc comics"],
  },
  { label: "Heist", parents: ["Action", "Thriller", "Crime"], keywords: ["heist", "robbery"] },
  {
    label: "Psychological Thriller",
    parents: ["Thriller"],
    keywords: ["psychological thriller", "psychological"],
  },
  {
    label: "Procedural",
    parents: ["Crime", "Drama"],
    keywords: ["police procedural", "detective", "investigation", "procedural"],
  },
  {
    label: "Mob / Mafia",
    parents: ["Crime", "Drama"],
    keywords: ["mafia", "gangster", "organized crime"],
  },
  { label: "Coming-of-Age", parents: ["Drama", "Comedy"], keywords: ["coming of age"] },
  { label: "Medical Drama", parents: ["Drama"], keywords: ["hospital", "doctor", "medical"] },
  { label: "Legal Drama", parents: ["Drama"], keywords: ["courtroom", "lawyer", "trial", "legal"] },
  {
    label: "War Drama",
    parents: ["Drama", "War"],
    keywords: ["war", "world war ii", "world war i"],
  },
  {
    label: "Epic Fantasy",
    parents: ["Fantasy"],
    keywords: ["sword and sorcery", "medieval", "dragon", "quest"],
  },
  {
    label: "Urban Fantasy",
    parents: ["Fantasy"],
    keywords: ["magic", "witch", "wizard", "supernatural"],
  },
  { label: "Anime", parents: ["Animation"], keywords: ["anime", "based on manga"] },
  { label: "True Crime", parents: ["Documentary"], keywords: ["true crime", "crime"] },
  { label: "Nature", parents: ["Documentary"], keywords: ["nature", "wildlife"] },
];

// ---- Audience: from the US certification, with an animation lean. ---------------
const MOVIE_CERT_AUDIENCE: Record<string, string> = {
  G: "Family",
  PG: "Family",
  "PG-13": "Teen",
  R: "Adult",
  "NC-17": "Mature",
};
const TV_CERT_AUDIENCE: Record<string, string> = {
  "TV-Y": "Kids",
  "TV-Y7": "Kids",
  "TV-G": "Family",
  "TV-PG": "Family",
  "TV-14": "Teen",
  "TV-MA": "Mature",
};

// ---- UI option lists ------------------------------------------------------------
// Curated vocabularies surfaced by the Advanced-filter panel, derived from the
// dictionaries above so the panel and the deriver can never drift. The labels here
// are exactly what deriveFacets() writes to the facet columns, which is what the
// server filters overlap on.

/** Sub-genre labels with their parent unified-genres. Drives the conditional panel:
 *  a sub-genre is only offered once one of its parent genres is selected. */
export const SUBGENRE_OPTIONS: { label: string; parents: string[] }[] = SUBGENRE_RULES.map((r) => ({
  label: r.label,
  parents: r.parents,
}));

/** Every distinct cross-genre theme, alphabetical. */
export const THEME_OPTIONS: string[] = Array.from(new Set(Object.values(THEME_MAP))).sort();

/** Audience bands, broadest → most mature. */
export const AUDIENCE_OPTIONS: string[] = ["Kids", "Family", "Teen", "Adult", "Mature"];

/** The normalized theme a raw TMDB keyword name maps to, if any (else undefined).
 *  Lets UI decide whether a keyword chip corresponds to a real, clickable theme
 *  filter value (only recognized keywords do — unrecognized ones render as plain
 *  text since there's nothing for them to filter into). */
export function themeForKeyword(name: string): string | undefined {
  return THEME_MAP[norm(name)];
}

export function deriveThemes(keywords: Keyword[]): string[] {
  const out = new Set<string>();
  for (const k of keywords) {
    const theme = THEME_MAP[norm(k.name)];
    if (theme) out.add(theme);
  }
  return Array.from(out);
}

export function deriveSubGenres(unifiedGenres: string[], keywords: Keyword[]): string[] {
  if (unifiedGenres.length === 0 || keywords.length === 0) return [];
  const genreSet = new Set(unifiedGenres);
  const kwSet = new Set(keywords.map((k) => norm(k.name)));
  const out = new Set<string>();
  for (const rule of SUBGENRE_RULES) {
    if (!rule.parents.some((p) => genreSet.has(p))) continue;
    if (rule.keywords.some((kw) => kwSet.has(kw))) out.add(rule.label);
  }
  return Array.from(out);
}

export function deriveAudience(opts: {
  certification?: string;
  genres: string[];
  mediaType: string;
}): string[] {
  const out = new Set<string>();
  const cert = opts.certification?.trim().toUpperCase();
  if (cert) {
    const mapped = opts.mediaType === "tv" ? TV_CERT_AUDIENCE[cert] : MOVIE_CERT_AUDIENCE[cert];
    if (mapped) out.add(mapped);
  }
  // Animation with no mature/adult signal skews family.
  if (opts.genres.includes("Animation") && !out.has("Mature") && !out.has("Adult")) {
    out.add("Family");
  }
  return Array.from(out);
}

export function deriveCompletionStatus(status?: string): string | null {
  switch ((status ?? "").trim()) {
    case "Ended":
      return "Ended";
    case "Returning Series":
      return "Ongoing";
    case "Canceled":
    case "Cancelled":
      return "Cancelled";
    case "In Production":
    case "Planned":
    case "Pilot":
      return "Upcoming";
    default:
      return null;
  }
}

// ---- raw_tmdb extraction (mirrors the patterns in media.server.ts) --------------
function extractKeywords(rawTmdb: unknown): Keyword[] {
  const k = (rawTmdb as { keywords?: { keywords?: Keyword[]; results?: Keyword[] } } | null)
    ?.keywords;
  const list = k?.keywords ?? k?.results ?? [];
  return Array.isArray(list)
    ? list.filter((x): x is Keyword => !!x && typeof x.name === "string")
    : [];
}

function extractUsCertification(rawTmdb: unknown, mediaType: string): string | undefined {
  const raw = rawTmdb as {
    release_dates?: {
      results?: { iso_3166_1: string; release_dates: { certification: string }[] }[];
    };
    content_ratings?: { results?: { iso_3166_1: string; rating: string }[] };
  } | null;
  if (mediaType === "movie") {
    const us = raw?.release_dates?.results?.find((r) => r.iso_3166_1 === "US");
    const cert = us?.release_dates?.find((d) => d.certification && d.certification.trim() !== "");
    return cert?.certification || undefined;
  }
  const us = raw?.content_ratings?.results?.find((r) => r.iso_3166_1 === "US");
  return us?.rating || undefined;
}

export interface DerivedFacets {
  sub_genres: string[];
  themes: string[];
  audience: string[];
  film_length_minutes: number | null;
  completion_status: string | null;
}

/**
 * The single entry point used by BOTH the sync row-builder and the backfill. Takes the
 * stored/just-fetched `raw_tmdb`, the title's media type, and its already-unified
 * genres, and returns the five Phase-A facet columns. Pure + deterministic.
 */
export function deriveFacets(
  rawTmdb: unknown,
  mediaType: string,
  unifiedGenres: string[],
): DerivedFacets {
  const raw = (rawTmdb ?? {}) as { runtime?: number; status?: string };
  const keywords = extractKeywords(rawTmdb);
  const cert = extractUsCertification(rawTmdb, mediaType);
  const runtime = typeof raw.runtime === "number" && raw.runtime > 0 ? raw.runtime : null;
  return {
    sub_genres: deriveSubGenres(unifiedGenres, keywords),
    themes: deriveThemes(keywords),
    audience: deriveAudience({ certification: cert, genres: unifiedGenres, mediaType }),
    film_length_minutes: mediaType === "movie" ? runtime : null,
    completion_status: mediaType === "tv" ? deriveCompletionStatus(raw.status) : null,
  };
}
