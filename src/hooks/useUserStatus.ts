import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { MediaItem } from "@/types/media";

const KEY = "balasaur:userStatus";

export type SeenStatus = "seen" | "unseen" | "skipped";
export type Sentiment = "liked" | "disliked";
export type Intent = "want" | "not_interested";

export interface UserStatusRecord {
  status: SeenStatus;
  sentiment?: Sentiment;
  rewatchOk?: boolean;
  intent?: Intent;
  ts: number;
  // Optional snapshot, used so we can render saved lists without the catalog.
  snapshot?: {
    mediaType: string;
    title: string;
    posterUrl?: string;
    year?: string;
  };
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

function clearLocal() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

interface DbRow {
  media_id: string;
  media_type: string;
  title: string;
  poster_url: string | null;
  year: string | null;
  status: SeenStatus;
  sentiment: Sentiment | null;
  intent: Intent | null;
  rewatch_ok: boolean | null;
  updated_at: string;
}

function rowToRecord(r: DbRow): UserStatusRecord {
  return {
    status: r.status,
    sentiment: r.sentiment ?? undefined,
    intent: r.intent ?? undefined,
    rewatchOk: r.rewatch_ok ?? undefined,
    ts: new Date(r.updated_at).getTime(),
    snapshot: {
      mediaType: r.media_type,
      title: r.title,
      posterUrl: r.poster_url ?? undefined,
      year: r.year ?? undefined,
    },
  };
}

function recordToInsert(
  userId: string,
  mediaId: string,
  rec: UserStatusRecord,
  fallback?: { mediaType: string; title: string; posterUrl?: string; year?: string },
) {
  const snap = rec.snapshot ?? fallback;
  return {
    user_id: userId,
    media_id: mediaId,
    media_type: snap?.mediaType ?? "unknown",
    title: snap?.title ?? mediaId,
    poster_url: snap?.posterUrl ?? null,
    year: snap?.year ?? null,
    status: rec.status,
    sentiment: rec.sentiment ?? null,
    intent: rec.intent ?? null,
    rewatch_ok: rec.rewatchOk ?? null,
    updated_at: new Date(rec.ts).toISOString(),
  };
}

/**
 * Caller can attach an optional MediaItem so we can persist a snapshot for
 * the My Lists view, since we don't store the catalog yet.
 */
export type RecordStatusFn = (
  id: string,
  record: UserStatusRecord | null,
  item?: MediaItem,
) => void;

export function useUserStatus() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<StatusMap>({});
  // Flips true once the initial status load (localStorage for anon, DB for
  // signed-in) has settled, so consumers can build off real data instead of the
  // empty initial map. The swipe deck depends on this to avoid re-showing titles
  // the user has already filed.
  const [ready, setReady] = useState(false);
  const migratedRef = useRef<string | null>(null);
  // One-shot count of picks just migrated local→account on sign-in. The deck
  // reads this to confirm "Saved your N picks", then calls clearJustMigrated().
  const [justMigrated, setJustMigrated] = useState(0);

  // Anonymous: load from localStorage and stay in sync across tabs.
  useEffect(() => {
    if (user) return;
    setStatuses(read());
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setStatuses(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user]);

  // Signed in: migrate any local-only rows once, then load from the table.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      // 1. Migrate any localStorage entries the user accumulated while anon.
      if (migratedRef.current !== user.id) {
        const local = read();
        const entries = Object.entries(local);
        if (entries.length > 0) {
          const rows = entries.map(([id, rec]) => recordToInsert(user.id, id, rec));
          // onConflict ignore so we don't stomp newer server state.
          const { error: migrateErr } = await supabase
            .from("user_media_status")
            .upsert(rows, { onConflict: "user_id,media_id", ignoreDuplicates: true });
          // Supabase RETURNS the error rather than throwing, so it must be checked
          // before clearing local data — otherwise a failed write silently destroys
          // the user's picks while the UI tells them they were saved.
          if (migrateErr) {
            console.error("[userStatus] sign-in migration failed:", migrateErr.message);
            // Keep localStorage and leave migratedRef unset so a later load retries.
          } else {
            clearLocal();
            if (!cancelled) setJustMigrated(entries.length);
            migratedRef.current = user.id;
          }
        } else {
          migratedRef.current = user.id;
        }
      }

      // 2. Load all rows for the user.
      const { data, error } = await supabase
        .from("user_media_status")
        .select(
          "media_id, media_type, title, poster_url, year, status, sentiment, intent, rewatch_ok, updated_at",
        )
        .eq("user_id", user.id);
      if (cancelled) return;
      if (!error && data) {
        const map: StatusMap = {};
        for (const row of data as DbRow[]) {
          map[row.media_id] = rowToRecord(row);
        }
        setStatuses(map);
      }
      // Mark ready even if the load failed, so the UI proceeds with what we have
      // rather than hanging — never block on a spinner forever.
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const seenIds = useMemo(
    () =>
      new Set(
        Object.entries(statuses)
          .filter(([, v]) => v.status === "seen")
          .map(([k]) => k),
      ),
    [statuses],
  );

  const recordStatus = useCallback<RecordStatusFn>(
    (id, record, item) => {
      // Optimistic local update.
      setStatuses((prev) => {
        const next = { ...prev };
        if (record === null) {
          delete next[id];
        } else {
          const withSnap: UserStatusRecord = {
            ...record,
            snapshot:
              record.snapshot ??
              (item
                ? {
                    mediaType: item.mediaType,
                    title: item.title,
                    posterUrl: item.posterUrl,
                    year: item.year,
                  }
                : prev[id]?.snapshot),
          };
          next[id] = withSnap;
        }
        if (!user) write(next);
        return next;
      });

      // Persist for signed-in users.
      if (user) {
        if (record === null) {
          void supabase
            .from("user_media_status")
            .delete()
            .eq("user_id", user.id)
            .eq("media_id", id);
        } else {
          const fallback = item
            ? {
                mediaType: item.mediaType,
                title: item.title,
                posterUrl: item.posterUrl,
                year: item.year,
              }
            : undefined;
          void supabase
            .from("user_media_status")
            .upsert(recordToInsert(user.id, id, record, fallback), {
              onConflict: "user_id,media_id",
            });
        }
      }
    },
    [user],
  );

  const count = useMemo(() => Object.keys(statuses).length, [statuses]);
  const clearJustMigrated = useCallback(() => setJustMigrated(0), []);

  return {
    statuses,
    seenIds,
    recordStatus,
    isAnonymous: !user,
    ready,
    count,
    justMigrated,
    clearJustMigrated,
  };
}
