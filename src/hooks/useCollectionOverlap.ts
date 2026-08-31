import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserStatus } from "@/hooks/useUserStatus";
import { primaryOf } from "@/lib/userStatus";

export interface ShelfOverlap {
  seen: number;
  want: number;
}

/**
 * How much of each collection the visitor has already watched or saved.
 *
 * The hub is CDN-cached and identical for every visitor, so this cannot ride
 * along with the page. It runs once after mount: the browser posts the library
 * it already holds (localStorage for guests, the synced table for accounts)
 * and gets back one row per shelf that overlaps. Shelves with no overlap are
 * absent from the map, which is the common case and keeps the payload small.
 */
export function useCollectionOverlap(): {
  overlap: Map<string, ShelfOverlap>;
  ready: boolean;
} {
  const { statuses, ready: statusReady } = useUserStatus();
  const [overlap, setOverlap] = useState<Map<string, ShelfOverlap>>(new Map());
  // Distinguish "no data yet" from "asked, and you have watched nothing":
  // the card shows its impersonal line in both cases, but only the second is
  // final, and a card must not flip its line twice.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!statusReady) return;
    const seenIds: string[] = [];
    const wantIds: string[] = [];
    for (const [id, rec] of Object.entries(statuses)) {
      const p = primaryOf(rec);
      if (p === "watched") seenIds.push(id);
      else if (p === "want") wantIds.push(id);
    }
    if (seenIds.length === 0 && wantIds.length === 0) {
      setOverlap(new Map());
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("collections_library_overlap", {
        p_seen_ids: seenIds,
        p_want_ids: wantIds,
      });
      if (cancelled) return;
      if (error) {
        // A failed lookup leaves every card on its impersonal line, which is
        // a complete card, so there is nothing to tell the visitor about.
        console.error("[collections] overlap lookup failed:", error.message);
        setReady(true);
        return;
      }
      const next = new Map<string, ShelfOverlap>();
      for (const row of (data ?? []) as { slug: string; seen: number; want: number }[]) {
        next.set(row.slug, { seen: row.seen ?? 0, want: row.want ?? 0 });
      }
      setOverlap(next);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // statuses is rebuilt on every status change; the id lists are what matter,
    // and re-running on a change is correct (marking something seen should
    // update the shelves it belongs to).
  }, [statuses, statusReady]);

  return { overlap, ready };
}
