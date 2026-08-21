import type { UserStatusRecord } from "@/hooks/useUserStatus";

// Two-axis status model.
//
//   PRIMARY (mutually exclusive):  "want"    → Watchlist   (unseen + intent want)
//                                  "watched" → History     (seen)
//   SENTIMENT (watched only):      "liked"   → + Favorites
//                                  "disliked"  (negative taste signal; History only)
//
// This replaced a three-sibling radio ("Like / Watched / Didn't watch yet") where
// "Like" secretly meant watched+liked — so tapping Watched after Like silently
// ERASED the sentiment, and the watchlist hid behind a negated label. The stored
// record shape (status + sentiment + intent) was already two-axis; only the
// button model changed, so no data migration was needed.
//
// Off-list signals (file into no bucket):
//   Not now ("skipped") is a deck-only soft pass: resurfaces later, deprioritized.
//   Never ("not_interested") is a hard reject: never resurfaces in the deck.

export type PrimaryKey = "want" | "watched";
export type SentimentKey = "liked" | "disliked";

export const PRIMARY_LABEL: Record<PrimaryKey, string> = {
  want: "Want to Watch",
  watched: "Watched",
};

export const PRIMARY_HEX: Record<PrimaryKey, string> = {
  want: "#e8b84b", // amber — watchlist
  watched: "#3b82f6", // blue — history
};

export const SENTIMENT_LABEL: Record<SentimentKey, string> = {
  liked: "Liked it",
  disliked: "Not for me",
};

export const SENTIMENT_HEX: Record<SentimentKey, string> = {
  liked: "#9fe6a0", // green — favorites
  disliked: "#e08aa4", // muted red — negative signal
};

export const NOT_INTERESTED_HEX = "#c75d6e";

export function recordForWant(): UserStatusRecord {
  return { status: "unseen", intent: "want", ts: Date.now() };
}

/** Mark watched, PRESERVING any sentiment already on the record — the old model's
 *  silent Like→Watched downgrade is the exact bug this exists to prevent. */
export function recordForWatched(prev?: UserStatusRecord): UserStatusRecord {
  return {
    status: "seen",
    sentiment: prev?.status === "seen" ? prev.sentiment : undefined,
    ts: Date.now(),
  };
}

/** Set/toggle sentiment (implies watched). Same sentiment again → clears it,
 *  leaving plain Watched. */
export function recordForSentiment(
  prev: UserStatusRecord | undefined,
  sentiment: SentimentKey,
): UserStatusRecord {
  const clearing = prev?.status === "seen" && prev.sentiment === sentiment;
  return { status: "seen", sentiment: clearing ? undefined : sentiment, ts: Date.now() };
}

/** Not now: a soft pass that resurfaces later, deprioritized. Files into no list. */
export function recordForSkip(): UserStatusRecord {
  return { status: "skipped", ts: Date.now() };
}

/** Never: a hard "won't watch". Files into NO list, and unlike Not now it never
 *  resurfaces in the deck. Distinct from Want to Watch, which is a positive intent. */
export function recordForNotInterested(): UserStatusRecord {
  return { status: "unseen", intent: "not_interested", ts: Date.now() };
}

export function primaryOf(rec: UserStatusRecord | undefined): PrimaryKey | null {
  if (!rec) return null;
  if (rec.status === "seen") return "watched";
  if (rec.status === "unseen" && rec.intent === "want") return "want";
  return null; // skipped / not_interested → no primary
}

export function sentimentOf(rec: UserStatusRecord | undefined): SentimentKey | null {
  if (rec?.status !== "seen") return null;
  return rec.sentiment ?? null;
}

export function isNotInterested(rec: UserStatusRecord | undefined): boolean {
  return rec?.status === "unseen" && rec.intent === "not_interested";
}
