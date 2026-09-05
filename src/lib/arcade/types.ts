// Shared arcade types. Pure declarations, no IO, imported by the registry,
// the payout tables, the stats store, the engine hook, and the game routes.

import type { MediaItem } from "@/types/media";
import type { SnippetRow } from "@/components/arcade/LeaderboardSnippet";

/** Every game the arcade knows, enabled or not. One slug = one route. */
export type GameSlug =
  | "balasaurdle"
  | "quote-match"
  | "taglines"
  | "casting-call"
  | "link-up"
  | "timeline"
  | "screening"
  | "emoji"
  | "speed-sort"
  | "sequel-or-fake"
  | "poster-reveal";

/** One named hue per game. The hex lives in src/styles.css as --hue-<name>
 *  with a matching --hue-<name>-ink; games.ts maps slug to hue. */
export type ArcadeHue =
  | "blue"
  | "ice"
  | "crimson"
  | "magenta"
  | "gold"
  | "teal"
  | "violet"
  | "ruby"
  | "sun"
  | "lime"
  | "orange";

export interface GameDef {
  slug: GameSlug;
  name: string;
  /** Route path, always /play/<slug>. */
  path: string;
  hue: ArcadeHue;
  /** The dare. Second person, one line. Hub tile and game header. */
  hook: string;
  /** How a round works, one line. Ready panel only. */
  rule: string;
  /** One visible line stating how comets are earned. Ready panel. */
  payoutRule: string;
  /** How long a round takes: "1 min", "2 min", "5 min". */
  minutes: string;
  /** ISO date the game shipped. A NEW ribbon shows for 14 days after. */
  launched: string;
  /** Every game is one shared round per UTC day. */
  daily: true;
  enabled: boolean;
}

export type ArcadePhase = "ready" | "playing" | "ended";

/** Per-game record kept in localStorage under balasaur:arcade:stats.
 *  Streak counts consecutive day keys played; best is the longest streak
 *  ever; dist counts results by bucket ("1".."6", "X", or a score). */
export interface GameStats {
  played: number;
  wins: number;
  streak: number;
  best: number;
  /** Day key of the last recorded run, null before the first. */
  lastDay: number | null;
  dist: Record<string, number>;
}

/** One line of a comet payout. Every number on an end screen comes from one
 *  of these, so the math is reconstructable: count x per = value, or a flat
 *  value with no count. */
export interface PayoutLine {
  label: string;
  count?: number;
  per?: number;
  value: number;
}

/** The outcome of one round inside a run, kept so end screens can replay
 *  what happened (answer rails, share grids). */
export interface RoundResult {
  round: number;
  correct: boolean;
  /** The media id of the round's answer, when the answer is a title. */
  mediaId?: string;
  /** Short display label for the round's answer, e.g. the title. */
  label?: string;
}

/** What a finished run submits to the server. Comets are never sent; the
 *  server recomputes them from the score. */
export interface RunSubmission {
  game: GameSlug;
  dayKey: number;
  score: number;
  durationMs: number;
}

/** Everything a route hands EndScreen for one finished run. */
export interface EndScreenContent {
  /** The tier word shown first, in the game hue: "Perfect ten", "Par". */
  tier?: string;
  headline: string;
  /** Rows of result emoji (🟩🟥⬛🟨), rendered on screen as colored squares. */
  grid?: string[];
  stats?: GameStats;
  /** Guess-count games only: one bucket per guess count, today's lit. */
  distribution?: { buckets: number[]; today?: number; labels?: string[] };
  shareText: string;
  shareImage?: { title: string; subtitle: string };
  answers?: MediaItem[];
  answersLabel?: string;
  leaderboard?: { rows: SnippetRow[]; you?: SnippetRow; label?: string };
  /** A losing run shows no ledger; lostHint says what would have paid. */
  lost?: boolean;
  lostHint?: string;
}
