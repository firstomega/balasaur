import { useCallback, useEffect, useState } from "react";

const KEY = "balasaur:userStatus";

export type ItemStatus = "seen" | "skip" | "save";

function read(): Record<string, ItemStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, ItemStatus>) : {};
  } catch {
    return {};
  }
}

export function useUserStatus() {
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});

  useEffect(() => {
    setStatuses(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setStatuses(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const seenIds = new Set(
    Object.entries(statuses)
      .filter(([, v]) => v === "seen" || v === "skip")
      .map(([k]) => k),
  );

  const setStatus = useCallback((id: string, status: ItemStatus | null) => {
    setStatuses((prev) => {
      const next = { ...prev };
      if (status === null) delete next[id];
      else next[id] = status;
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { statuses, seenIds, setStatus };
}