import type { UserStatusRecord } from "@/hooks/useUserStatus";

export type StatusKey = "loved" | "notLoved" | "want" | "notForMe";

export const STATUS_LABEL: Record<StatusKey, string> = {
  loved: "Seen & loved",
  notLoved: "Seen, didn't love",
  want: "Want it",
  notForMe: "Not for me",
};

export const STATUS_HEX: Record<StatusKey, string> = {
  loved: "#9fe6a0",
  notLoved: "#9aa2b1",
  want: "#3b82f6",
  notForMe: "#ef4444",
};

export const STATUS_ORDER: StatusKey[] = ["want", "loved", "notLoved", "notForMe"];

export function recordForStatus(key: StatusKey): UserStatusRecord {
  const ts = Date.now();
  switch (key) {
    case "loved":
      return { status: "seen", sentiment: "liked", rewatchOk: true, ts };
    case "notLoved":
      return { status: "seen", sentiment: "disliked", rewatchOk: false, ts };
    case "want":
      return { status: "unseen", intent: "want", ts };
    case "notForMe":
      return { status: "unseen", intent: "not_interested", ts };
  }
}

export function statusKeyOf(rec: UserStatusRecord | undefined): StatusKey | null {
  if (!rec) return null;
  if (rec.status === "seen") {
    return rec.sentiment === "liked" ? "loved" : "notLoved";
  }
  return rec.intent === "want" ? "want" : "notForMe";
}