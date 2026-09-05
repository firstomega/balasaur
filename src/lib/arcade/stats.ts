// Per-game play stats, guest-first, in one localStorage blob. Pure math is
// separated from storage so the streak rules are testable without a window.
// Idempotent per (slug, day): a second record for the same day is ignored, so
// a refresh or a replayed end screen never double-counts.

import type { GameSlug, GameStats } from "./types";

export const STATS_KEY = "balasaur:arcade:stats";
/** Dispatched on window after every write so hub tiles in the same tab
 *  can re-read without a reload. */
export const STATS_EVENT = "balasaur:arcade:stats";

export type StatsBlob = Partial<Record<GameSlug, GameStats>>;

export interface StatsResult {
  won: boolean;
  /** Distribution bucket: guess count ("3"), "X" for a loss, or a score. */
  bucket?: string | number;
}

export function emptyStats(): GameStats {
  return { played: 0, wins: 0, streak: 0, best: 0, lastDay: null, dist: {} };
}

/** Pure: fold one day's result into a record. Returns the same object when
 *  the day is already recorded. Streak counts consecutive day keys played;
 *  a gap of a day or more restarts it at 1. */
export function applyResult(prev: GameStats, day: number, r: StatsResult): GameStats {
  if (prev.lastDay === day) return prev;
  const streak = prev.lastDay === day - 1 ? prev.streak + 1 : 1;
  const dist = { ...prev.dist };
  if (r.bucket !== undefined) {
    const key = String(r.bucket);
    dist[key] = (dist[key] ?? 0) + 1;
  }
  return {
    played: prev.played + 1,
    wins: prev.wins + (r.won ? 1 : 0),
    streak,
    best: Math.max(prev.best, streak),
    lastDay: day,
    dist,
  };
}

/** The streak as it stands today: the stored count while yesterday or today
 *  was played, zero once a day has been missed. */
export function liveStreak(s: GameStats, today: number): number {
  if (s.lastDay === null) return 0;
  return s.lastDay >= today - 1 ? s.streak : 0;
}

/** Whole percent, 0 when nothing has been played. */
export function winPercent(s: GameStats): number {
  return s.played === 0 ? 0 : Math.round((s.wins / s.played) * 100);
}

/** Bucket counts in label order, for the guess-count bar chart. */
export function distribution(
  s: GameStats,
  labels: string[],
): { buckets: number[]; labels: string[] } {
  return { buckets: labels.map((l) => s.dist[l] ?? 0), labels };
}

function hasWindow(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function readAllStats(): StatsBlob {
  if (!hasWindow()) return {};
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StatsBlob) : {};
  } catch {
    return {};
  }
}

export function readStats(slug: GameSlug): GameStats {
  const s = readAllStats()[slug];
  return s ? { ...emptyStats(), ...s, dist: s.dist ?? {} } : emptyStats();
}

function writeAll(blob: StatsBlob): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(blob));
    window.dispatchEvent(new CustomEvent(STATS_EVENT));
  } catch {
    /* storage full or blocked: the game still plays, it just forgets */
  }
}

/** Record today's run once. Returns the record after the write (or the
 *  unchanged record when the day was already counted). */
export function recordResult(slug: GameSlug, day: number, r: StatsResult): GameStats {
  const blob = readAllStats();
  const prev = blob[slug]
    ? { ...emptyStats(), ...blob[slug], dist: blob[slug]?.dist ?? {} }
    : emptyStats();
  const next = applyResult(prev, day, r);
  if (next === prev) return prev;
  writeAll({ ...blob, [slug]: next });
  return next;
}

/** The longest streak still alive across every game, for the hub hero.
 *  keptToday says whether it was already extended today. Null when no
 *  streak is alive. */
export function bestLiveStreak(
  blob: StatsBlob,
  today: number,
): { slug: GameSlug; streak: number; keptToday: boolean } | null {
  let best: { slug: GameSlug; streak: number; keptToday: boolean } | null = null;
  for (const [slug, s] of Object.entries(blob) as [GameSlug, GameStats][]) {
    if (!s) continue;
    const streak = liveStreak(s, today);
    if (streak === 0) continue;
    const keptToday = s.lastDay === today;
    if (!best || streak > best.streak || (streak === best.streak && keptToday && !best.keptToday)) {
      best = { slug, streak, keptToday };
    }
  }
  return best;
}
