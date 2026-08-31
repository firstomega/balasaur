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

/** Blank the answer out of a clue so a tagline cannot give the game away. */
export function redactTitle(text: string, title: string): string {
  // A one- or two-letter title ("It") cannot be redacted without shredding
  // the sentence; the final clue tolerates that small leak.
  if (!title || title.length <= 2) return text;
  const words = title.split(/\s+/).filter((w) => w.length > 2);
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
  return `Balasaurdle #${gameNumber} ${score}${hintTag}\n${squares}\nbalasaur.com/play`;
}

export interface DailyState {
  day: number;
  guessedIds: string[];
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
    if (s.day === today) return { ...fresh, ...s };
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

export function saveDaily(s: DailyState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the game still plays, it just forgets */
  }
}
