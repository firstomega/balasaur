// Balasaurdle: pure helpers, shared by the server pick and the client UI.
// Kept free of IO so the whole game logic is testable.

/** Days since the fixed epoch, UTC. Game #1 was 2026-08-18. */
export const DAILY_EPOCH_UTC = Date.UTC(2026, 7, 18);

export function dayNumber(now = Date.now()): number {
  return Math.floor((now - DAILY_EPOCH_UTC) / 86_400_000) + 1;
}

/** Deterministic index into a pool for a given day. Knuth multiplicative. */
export function dailyIndex(day: number, poolSize: number): number {
  if (poolSize <= 0) return 0;
  return Math.abs((day * 2654435761) % 2147483647) % poolSize;
}

export const MAX_GUESSES = 6;
export const MAX_HINTS = 3;

// Words too common to treat as part of an answer. Without this, "The Truman
// Show" makes any clue containing "the" look like a leak, and 1,140 of the
// 3,930 titles in the daily pool contain "the" as a word: clue 1 reads "from
// the 1990s" and would have been dropped on roughly a third of all days.
const TITLE_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "his",
  "her",
  "its",
  "our",
  "you",
  "your",
  "who",
  "not",
  "but",
  "all",
  "one",
  "two",
  "out",
  "off",
  "was",
  "are",
  "has",
  "had",
  "with",
  "from",
  "into",
  "that",
  "this",
  "then",
  "than",
  "them",
  "they",
  "there",
  "when",
  "what",
  "some",
  "more",
  "most",
  "were",
  "been",
  "over",
  "under",
  "after",
  "before",
  "about",
  "again",
  "still",
  "never",
  "always",
  "part",
]);

/** The meaningful words of a title: the ones that would give the game away. */
function titleWords(title: string): string[] {
  return title
    .split(/\s+/)
    .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w.toLowerCase().replace(/[^\w]/g, "")));
}

/** Would this clue hand the player the answer? Used to drop a clue whose
 *  fact happens to contain the title, e.g. a network or a person named after
 *  the show. Stopwords are ignored, so "from the 1990s" is not a leak. */
export function leaksTitle(text: string, title: string): boolean {
  if (!title || title.length <= 2) return false;
  const hay = text.toLowerCase();
  if (hay.includes(title.toLowerCase())) return true;
  return titleWords(title).some((w) =>
    new RegExp(`\\b${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay),
  );
}

/** Blank the answer out of a clue so a tagline cannot give the game away. */
export function redactTitle(text: string, title: string): string {
  // A one- or two-letter title ("It") cannot be redacted without shredding
  // the sentence; the final clue tolerates that small leak.
  if (!title || title.length <= 2) return text;
  const words = titleWords(title);
  let out = text;
  for (const w of [title, ...words]) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Word boundaries, so "The Thing" blanks "the" and "thing" but never
    // garbles "there" into "___re". Skipped at an edge that is not a word
    // character ("WALL·E"), where \b would stop the match entirely.
    const lead = /^\w/.test(w) ? "\\b" : "";
    const tail = /\w$/.test(w) ? "\\b" : "";
    out = out.replace(new RegExp(`${lead}${esc}${tail}`, "gi"), "___");
  }
  return out;
}

/** The title with every letter blanked: "The Dark Knight" → "T__ D___ K______".
 *  Digits count as letters (a year in a title would give too much away);
 *  punctuation survives, because its shape is part of the puzzle's charm. */
export function titlePattern(title: string): string {
  return title
    .split(/(\s+)/)
    .map((part) =>
      /^\s+$/.test(part)
        ? part
        : part
            .split("")
            .map((ch, i) => (i === 0 ? ch.toUpperCase() : /[\p{L}\p{N}]/u.test(ch) ? "_" : ch))
            .join(""),
    )
    .join("");
}

/** The shareable result grid, Wordle-convention. Hints ride along honestly. */
export function shareText(gameNumber: number, guesses: number, won: boolean, hints = 0): string {
  const squares = won ? "🟥".repeat(guesses - 1) + "🟩" : "🟥".repeat(MAX_GUESSES);
  const score = won ? `${guesses}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const hintTag = hints > 0 ? ` (${hints} hint${hints === 1 ? "" : "s"})` : "";
  return `Balasaurdle #${gameNumber} ${score}${hintTag}\n${squares}\nbalasaur.com/play/balasaurdle`;
}

/** One guess as it was made: the catalog id and the title the player saw,
 *  so a reload mid-game can still show what was tried. */
export interface DailyGuess {
  id: string;
  title: string;
}

export interface DailyState {
  day: number;
  guessedIds: string[];
  /** Every guess in order with its title. Same length and order as
   *  guessedIds; a blob written before titles were kept fills in blanks. */
  guesses: DailyGuess[];
  solved: boolean;
  gaveUp: boolean;
  streak: number;
  best: number;
  played: number;
  wins: number;
  /** On-demand hints revealed this game, 0 to MAX_HINTS. */
  hintsUsed: number;
}

const KEY = "balasaur:daily";

export function loadDaily(today: number): DailyState {
  const fresh: DailyState = {
    day: today,
    guessedIds: [],
    guesses: [],
    solved: false,
    gaveUp: false,
    streak: 0,
    best: 0,
    played: 0,
    wins: 0,
    hintsUsed: 0,
  };
  if (typeof window === "undefined") return fresh;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fresh;
    const s = JSON.parse(raw) as DailyState & { lastFinishedDay?: number };
    if (s.day === today) return { ...fresh, ...s, guesses: guessesOf(s) };
    // New day: carry the streak only if yesterday was finished with a win.
    const carried = s.solved && s.day === today - 1 ? s.streak : 0;
    return {
      ...fresh,
      streak: carried,
      best: s.best ?? 0,
      played: s.played ?? 0,
      wins: s.wins ?? 0,
    };
  } catch {
    return fresh;
  }
}

/** The guess list with titles, rebuilt from ids alone when a blob predates
 *  the titles field. Ids stay the record; titles are display only. */
function guessesOf(s: Partial<DailyState>): DailyGuess[] {
  const ids = Array.isArray(s.guessedIds) ? s.guessedIds : [];
  const kept = Array.isArray(s.guesses) ? s.guesses : [];
  return ids.map((id, i) => {
    const g = kept[i];
    return g && g.id === id && typeof g.title === "string" ? g : { id, title: "" };
  });
}

export function saveDaily(s: DailyState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the game still plays, it just forgets */
  }
}
