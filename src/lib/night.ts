// Movie Night client: typed wrappers over the night_* database functions, the
// per-room identity kept in this browser, and the realtime channel.
//
// Architecture in one breath: the database is the truth, the realtime channel
// is a doorbell. Every write goes through an RPC; after writing, the writer
// taps the room channel and every phone refetches night_state. Presence only
// says who is connected right now. A refresh or a dropped connection loses
// nothing, because nothing lives only in the socket.

import { supabase } from "@/integrations/supabase/client";

// ---------- Types mirrored from the SQL payloads ----------

export interface NightRoomInfo {
  code: string;
  mode: "solo" | "group";
  status: "lobby" | "results";
  media_type: "movie" | "tv" | "either";
  services: string[];
  roll_seq: number;
  reveal_at: string | null;
  winner_media_id: string | null;
  winner_name: string | null;
  expires_at: string;
}

export interface NightSignals {
  era?: "new" | "modern" | "classic";
  length?: "short" | "standard" | "long";
  crowd?: "mainstream" | "hidden";
  vibe?: "true_story" | "edge" | "another_world" | "crime" | "comfort" | "big";
}

export interface NightMemberInfo {
  display_name: string;
  ready: boolean;
  is_host: boolean;
  is_signed_in: boolean;
  is_you: boolean;
  genres_want: string[];
  genres_less: string[];
  signals: NightSignals;
}

export interface NightRollItem {
  media_id: string;
  title: string;
  media_type: string;
  year: string | null;
  poster_url: string | null;
  score: number | null;
  genres: string[];
  streaming: string[];
  runtime: number | null;
  match: number;
  reasons: {
    wanted_by: string[];
    genres: { genre: string; members: string[] }[];
    held_back: { genre: string; count: number }[];
    signals: { era: number; length: number; crowd: number; vibes: string[] };
  };
}

export interface NightState {
  error?: string;
  room: NightRoomInfo;
  you: {
    display_name: string;
    ready: boolean;
    genres_want: string[];
    genres_less: string[];
    signals: NightSignals;
    is_host: boolean;
  };
  members: NightMemberInfo[];
  roll: { seq: number; items: NightRollItem[]; created_at: string } | null;
}

// ---------- Wizard vocabularies ----------
//
// Values must match the whitelists in night_set_prefs and the mappings in
// night_recommend exactly; a label change here is free, a value change is a
// migration.

export const NIGHT_ERAS = [
  { value: "new", label: "Something new" },
  { value: "modern", label: "2000s onward" },
  { value: "classic", label: "Before 2000" },
] as const;

export const NIGHT_LENGTHS = [
  { value: "short", label: "Under 100 min" },
  { value: "standard", label: "Regular length" },
  { value: "long", label: "Epic is fine" },
] as const;

export const NIGHT_CROWDS = [
  { value: "mainstream", label: "Crowd pleaser" },
  { value: "hidden", label: "Hidden gem" },
] as const;

export const NIGHT_VIBES = [
  { value: "true_story", label: "Actually happened" },
  { value: "edge", label: "Edge of the seat" },
  { value: "another_world", label: "Another world" },
  { value: "crime", label: "Crime scene" },
  { value: "comfort", label: "Easy watch" },
  { value: "big", label: "Big and loud" },
] as const;

// ---------- RPC plumbing ----------

// The generated Database types predate the night_* functions, so the rpc call
// goes through one narrow cast here and nowhere else.
async function call<T>(fn: string, params: Record<string, unknown>): Promise<T> {
  const rpc = supabase.rpc.bind(supabase) as (
    fn: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc(fn, params);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface NightSession {
  member_token: string;
  state: NightState;
}

export function createNightRoom(opts: {
  displayName: string;
  mode: "solo" | "group";
  mediaType: "movie" | "tv" | "either";
  services: string[];
  isSignedIn: boolean;
}): Promise<NightSession & { error?: string }> {
  return call("night_create", {
    p_display_name: opts.displayName,
    p_mode: opts.mode,
    p_media_type: opts.mediaType,
    p_services: opts.services,
    p_is_signed_in: opts.isSignedIn,
  });
}

export function joinNightRoom(opts: {
  code: string;
  displayName: string;
  isSignedIn: boolean;
}): Promise<NightSession & { error?: string }> {
  return call("night_join", {
    p_code: opts.code,
    p_display_name: opts.displayName,
    p_is_signed_in: opts.isSignedIn,
  });
}

export function fetchNightState(code: string, memberToken: string): Promise<NightState> {
  return call("night_state", { p_code: code, p_member_token: memberToken });
}

/** For signal updates: a value sets, an explicit null clears that one key,
 *  an absent key leaves it untouched (the server merges). */
export type NightSignalsUpdate = {
  [K in keyof NightSignals]?: NightSignals[K] | null;
};

export function saveNightPrefs(
  memberToken: string,
  prefs: {
    genresWant?: string[];
    genresLess?: string[];
    signals?: NightSignalsUpdate;
    watchedIds?: string[];
    wantIds?: string[];
    ready?: boolean;
  },
): Promise<{ ok?: boolean; error?: string }> {
  return call("night_set_prefs", {
    p_member_token: memberToken,
    p_genres_want: prefs.genresWant ?? null,
    p_genres_less: prefs.genresLess ?? null,
    p_signals: prefs.signals ?? null,
    p_watched_ids: prefs.watchedIds ?? null,
    p_want_ids: prefs.wantIds ?? null,
    p_ready: prefs.ready ?? null,
  });
}

export function rollNight(
  memberToken: string,
  opts?: { limit?: number; delaySeconds?: number },
): Promise<{ roll_seq?: number; reveal_at?: string; items?: NightRollItem[]; error?: string }> {
  return call("night_roll", {
    p_member_token: memberToken,
    p_limit: opts?.limit ?? 5,
    p_delay_seconds: opts?.delaySeconds ?? 4,
  });
}

export function setNightRoom(
  memberToken: string,
  opts: { mediaType?: "movie" | "tv" | "either"; services?: string[] },
): Promise<{ ok?: boolean; error?: string }> {
  return call("night_set_room", {
    p_member_token: memberToken,
    p_media_type: opts.mediaType ?? null,
    p_services: opts.services ?? null,
  });
}

export function markNightWatched(
  memberToken: string,
  mediaId: string,
): Promise<{ ok?: boolean; error?: string }> {
  return call("night_mark_watched", { p_member_token: memberToken, p_media_id: mediaId });
}

export function pickNightWinner(
  memberToken: string,
  mediaId: string,
): Promise<{ ok?: boolean; error?: string }> {
  return call("night_pick", { p_member_token: memberToken, p_media_id: mediaId });
}

// ---------- Per-room identity, kept in this browser ----------

const TOKEN_PREFIX = "balasaur:night:token:";
const NAME_KEY = "balasaur:night:name";

export function getNightToken(code: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_PREFIX + code.toUpperCase());
  } catch {
    return null;
  }
}

export function setNightToken(code: string, token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_PREFIX + code.toUpperCase(), token);
  } catch {
    // storage unavailable; the session just won't survive a refresh
  }
}

export function getSavedNightName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setSavedNightName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // non-fatal
  }
}

// ---------- Realtime: doorbell and presence ----------

export interface NightChannel {
  /** Announce a state change; every phone in the room refetches. */
  poke: () => void;
  /** Names currently connected (deduplicated, includes you). */
  leave: () => void;
}

export function joinNightChannel(
  code: string,
  displayName: string,
  handlers: { onPoke: () => void; onPresence: (names: string[]) => void },
): NightChannel {
  const channel = supabase.channel(`night:${code.toUpperCase()}`, {
    config: { presence: { key: displayName } },
  });

  channel
    .on("broadcast", { event: "poke" }, () => handlers.onPoke())
    .on("presence", { event: "sync" }, () => {
      handlers.onPresence(Object.keys(channel.presenceState()));
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ at: Date.now() });
        // A reconnect means pokes were missed; refetch to be safe.
        handlers.onPoke();
      }
    });

  return {
    poke: () => {
      void channel.send({ type: "broadcast", event: "poke", payload: {} });
    },
    leave: () => {
      void supabase.removeChannel(channel);
    },
  };
}

// ---------- Member colors ----------
//
// Stable per join order, used for the live rings on chips so "who picked
// this" reads at a glance without labels.

export const NIGHT_COLORS = [
  "#e8b84b", // amber
  "#7dc4e4", // sky
  "#9fe6a0", // green
  "#e08aa4", // rose
  "#c4a7e7", // lavender
  "#f0a35e", // tangerine
  "#8ad3c3", // teal
  "#d9d97a", // olive
] as const;

export function nightColor(memberIndex: number): string {
  return NIGHT_COLORS[memberIndex % NIGHT_COLORS.length];
}
