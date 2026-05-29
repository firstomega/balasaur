// TODO: replace localStorage with Supabase persistence + auth in a later phase.
import { useCallback, useEffect, useMemo, useState } from "react";

const KEY = "balasaur:userStatus";

export type SeenStatus = "seen" | "unseen";
export type Sentiment = "liked" | "disliked";
export type Intent = "want" | "not_interested";

export interface UserStatusRecord {
  status: SeenStatus;
  sentiment?: Sentiment;
  rewatchOk?: boolean;
  intent?: Intent;
  ts: number;
}

export type StatusMap = Record<string, UserStatusRecord>;

function read(): StatusMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StatusMap;
  } catch {
    return {};
  }
}

function write(map: StatusMap) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function useUserStatus() {
  const [statuses, setStatuses] = useState<StatusMap>({});

  useEffect(() => {
    setStatuses(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setStatuses(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const seenIds = useMemo(
    () =>
      new Set(
        Object.entries(statuses)
          .filter(([, v]) => v.status === "seen")
          .map(([k]) => k),
      ),
    [statuses],
  );

  const recordStatus = useCallback((id: string, record: UserStatusRecord | null) => {
    setStatuses((prev) => {
      const next = { ...prev };
      if (record === null) delete next[id];
      else next[id] = record;
      write(next);
      return next;
    });
  }, []);

  return { statuses, seenIds, recordStatus };
}