import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { type Shelf, readShelves, writeShelves, sanitize } from "@/lib/shelves";

// Shelf state, mirroring the userStatus philosophy: localStorage is the
// anonymous home, the table is the signed-in home, and a signed-in write that
// misses the DB still lands locally so nothing the user arranged evaporates.
// Rows are tiny (a name and an id array), so every save writes the shelf
// whole; there is no per-item sync to get subtly wrong.

interface ShelfRow {
  shelf_id: string;
  name: string;
  position: number;
  items: unknown;
  updated_at: string;
}

function rowToShelf(r: ShelfRow): Shelf {
  return sanitize([
    {
      id: r.shelf_id,
      name: r.name,
      items: Array.isArray(r.items) ? (r.items as string[]) : [],
      ts: new Date(r.updated_at).getTime(),
    },
  ])[0];
}

export function useShelves() {
  const { user } = useAuth();
  const [shelves, setShelvesState] = useState<Shelf[]>([]);
  const [ready, setReady] = useState(false);
  const migratedRef = useRef<string | null>(null);
  const shelvesRef = useRef<Shelf[]>([]);
  shelvesRef.current = shelves;

  // Anonymous: localStorage, synced across tabs.
  useEffect(() => {
    if (user) return;
    setShelvesState(readShelves() ?? []);
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "balasaur:shelves") setShelvesState(readShelves() ?? []);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user]);

  // Signed in: push any local-only shelves once, then the table is the truth.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      if (migratedRef.current !== user.id) {
        const local = readShelves();
        if (local && local.length > 0) {
          const rows = local.map((s, i) => ({
            user_id: user.id,
            shelf_id: s.id,
            name: s.name,
            position: i,
            items: s.items,
            updated_at: new Date(s.ts || Date.now()).toISOString(),
          }));
          const { error } = await supabase
            .from("user_shelves")
            .upsert(rows, { onConflict: "user_id,shelf_id", ignoreDuplicates: true });
          if (error) {
            console.error("[shelves] sign-in migration failed:", error.message);
            // Keep local and retry on a later load.
          } else {
            try {
              window.localStorage.removeItem("balasaur:shelves");
            } catch {
              /* ignore */
            }
            migratedRef.current = user.id;
          }
        } else {
          migratedRef.current = user.id;
        }
      }

      const { data, error } = await supabase
        .from("user_shelves")
        .select("shelf_id, name, position, items, updated_at")
        .eq("user_id", user.id)
        .order("position", { ascending: true });
      if (cancelled) return;
      if (!error && data) {
        setShelvesState((data as ShelfRow[]).map(rowToShelf));
      } else if (error) {
        console.error("[shelves] load failed:", error.message);
        setShelvesState(readShelves() ?? []);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  /** Apply an update and persist it: localStorage for guests, the table for
   *  accounts (with a local fallback so a failed write is not a lost shelf). */
  const update = useCallback(
    (next: Shelf[]) => {
      const prev = shelvesRef.current;
      setShelvesState(next);
      if (!user) {
        writeShelves(next);
        return;
      }
      (async () => {
        const gone = prev.filter((p) => !next.some((n) => n.id === p.id));
        for (const g of gone) {
          const { error } = await supabase
            .from("user_shelves")
            .delete()
            .eq("user_id", user.id)
            .eq("shelf_id", g.id);
          if (error) console.error("[shelves] delete failed:", error.message);
        }
        if (next.length > 0) {
          const rows = next.map((s, i) => ({
            user_id: user.id,
            shelf_id: s.id,
            name: s.name,
            position: i,
            items: s.items,
            updated_at: new Date(s.ts || Date.now()).toISOString(),
          }));
          const { error } = await supabase
            .from("user_shelves")
            .upsert(rows, { onConflict: "user_id,shelf_id" });
          if (error) {
            console.error("[shelves] save failed:", error.message);
            writeShelves(next);
          }
        }
      })();
    },
    [user],
  );

  return { shelves, ready, update };
}
