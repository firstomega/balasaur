// Arcade client: typed wrappers over the arcade_* database functions.
//
// Same shape as src/lib/night.ts: every write is a SECURITY DEFINER RPC that
// returns jsonb with an 'error' key on failure instead of raising, so callers
// check {error} on the result. The generated Database types predate these
// functions, so every call goes through one narrow cast here and nowhere else.

import { supabase } from "@/integrations/supabase/client";
import type { GameSlug } from "@/lib/arcade/types";

async function call<T>(fn: string, params: Record<string, unknown>): Promise<T> {
  const rpc = supabase.rpc.bind(supabase) as (
    fn: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc(fn, params);
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------- Submit a finished run ----------

export interface ArcadeSubmitResult {
  error?: string;
  /** Comets credited for this run. 0 when the day was already credited. */
  comets?: number;
  /** Wallet total after the credit. */
  wallet?: number;
  /** True when a run for this game and day already existed. */
  duplicate?: boolean;
  best_score?: number;
  streak?: number;
}

/** Submit one finished run. The server credits the client payout clamped
 *  to the game's daily cap; only the first run per game per UTC day earns. */
export function arcadeSubmitRun(args: {
  game: GameSlug;
  dayKey: number;
  score: number;
  durationMs: number;
  /** True when the run counts as a win; feeds the day's played/won line. */
  won?: boolean;
  /** Optional CDN geo hint for the national board; profiles.country wins. */
  country?: string | null;
  /** Client payout total; the server clamps it to the game's daily cap. */
  comets?: number;
}): Promise<ArcadeSubmitResult> {
  return call("arcade_submit_run", {
    p_game_slug: args.game,
    p_day_key: args.dayKey,
    p_score: args.score,
    p_duration_ms: args.durationMs,
    p_won: args.won ?? false,
    p_country: args.country ?? null,
    p_comets: args.comets ?? null,
  });
}

// ---------- One-time guest merge ----------

/** One guest game-day's claimed credit: game slug, day key, comets. */
export interface GuestRunClaim {
  g: string;
  d: number;
  c: number;
}

export interface ArcadeMergeResult {
  error?: string;
  /** Comets actually credited, after server-side caps. */
  credited?: number;
  accepted?: number;
  skipped?: number;
  /** True when this account already spent its one merge. */
  already_merged?: boolean;
}

/** Credit a signed-in account with its guest-era comets, once per account,
 *  server-capped. Merged credit never touches leaderboards. */
export function arcadeMergeGuest(args: {
  runs: GuestRunClaim[];
  clientTotal: number;
}): Promise<ArcadeMergeResult> {
  return call("arcade_merge_guest", {
    p_runs: args.runs,
    p_client_total: args.clientTotal,
  });
}

// ---------- Boards ----------

export interface WeeklyBoardRow {
  rank: number;
  username: string;
  display_name: string;
  avatar_preset: string | null;
  country: string | null;
  comets: number;
}

export interface ArcadeWeeklyBoard {
  error?: string;
  week_key: string;
  rows: WeeklyBoardRow[];
}

/** Weekly comet standings, public profiles only. Null week means the current
 *  ISO week; a country narrows to that national board. */
export function arcadeWeeklyBoard(args?: {
  week?: string;
  country?: string;
  limit?: number;
}): Promise<ArcadeWeeklyBoard> {
  return call("arcade_leaderboard", {
    p_week_key: args?.week ?? null,
    p_country: args?.country ?? null,
    p_limit: args?.limit ?? 100,
  });
}

export interface DayBoardRow {
  rank: number;
  username: string;
  display_name: string;
  avatar_preset: string | null;
  score: number;
  duration_ms: number;
}

export interface ArcadeDayBoard {
  error?: string;
  day_key: number;
  rows: DayBoardRow[];
}

/** One game's score board for one day, public profiles only. Null day means
 *  today. The 8PM Screening polls this while its board is visible. */
export function arcadeDayBoard(args: {
  game: GameSlug;
  dayKey?: number;
  limit?: number;
}): Promise<ArcadeDayBoard> {
  return call("arcade_day_board", {
    p_game_slug: args.game,
    p_day_key: args.dayKey ?? null,
    p_limit: args.limit ?? 100,
  });
}
