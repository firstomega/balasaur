// Shared arcade types. Pure declarations, no IO, imported by the registry,
// the payout tables, the engine hook, and the game routes.

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

export interface GameDef {
  slug: GameSlug;
  name: string;
  /** One line, what you do. Shown on the hub tile and the ready panel. */
  tagline: string;
  /** One visible line stating how comets are earned. Shown on the ready panel. */
  payoutRule: string;
  /** True when the game is one shared round per UTC day. */
  daily: boolean;
  enabled: boolean;
  /** Route path, always /play/<slug>. */
  path: string;
}

export type ArcadePhase = "ready" | "playing" | "ended";

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
