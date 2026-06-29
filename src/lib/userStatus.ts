import type { UserStatusRecord } from "@/hooks/useUserStatus";

// Filable library statuses — shown as detail-page buttons AND as list buckets.
// "Skip" is intentionally NOT here: it's a deck-only soft signal (see recordForSkip).
export type StatusKey = "like" | "watched" | "didntWatch";

export const STATUS_LABEL: Record<StatusKey, string> = {
  like: "Like",
  watched: "Watched",
  didntWatch: "Didn't watch yet",
};

export const STATUS_HEX: Record<StatusKey, string> = {
  like: "#9fe6a0", // green — favorites
  watched: "#3b82f6", // blue — history
  didntWatch: "#e8b84b", // amber — watchlist
};

// Detail-page button order.
export const STATUS_ORDER: StatusKey[] = ["like", "watched", "didntWatch"];

export function recordForStatus(key: StatusKey): UserStatusRecord {
  const ts = Date.now();
  switch (key) {
    case "like":
      // Watched AND loved → lands in Favorites + History.
      return { status: "seen", sentiment: "liked", ts };
    case "watched":
      // Watched, no strong feeling → History only.
      return { status: "seen", ts };
    case "didntWatch":
      // Haven't seen it but want to → Watchlist.
      return { status: "unseen", intent: "want", ts };
  }
}

/** Skip: a soft "not now" that resurfaces later, deprioritized. Files into no list. */
export function recordForSkip(): UserStatusRecord {
  return { status: "skipped", ts: Date.now() };
}

/** Not interested: a hard "won't watch" — files into NO list, and (unlike Skip) never
 *  resurfaces in the deck. Distinct from "Didn't watch yet", which is a Watchlist want. */
export function recordForNotInterested(): UserStatusRecord {
  return { status: "unseen", intent: "not_interested", ts: Date.now() };
}

export function statusKeyOf(rec: UserStatusRecord | undefined): StatusKey | null {
  if (!rec) return null;
  if (rec.status === "seen") return rec.sentiment === "liked" ? "like" : "watched";
  if (rec.status === "unseen") return rec.intent === "want" ? "didntWatch" : null;
  return null; // "skipped" → not a filed status
}
