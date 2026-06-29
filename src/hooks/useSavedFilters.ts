import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { serializeFilters, deserializeFilters, type Serialized } from "@/lib/filterStorage";
import type { FilterState } from "@/types/filters";
import type { Json } from "@/integrations/supabase/types";

export interface SavedFilter {
  id: string;
  name: string;
  filters: FilterState;
}

interface Row {
  id: string;
  name: string;
  filter_state: Json;
}

function rowToSaved(r: Row): SavedFilter {
  return {
    id: r.id,
    name: r.name,
    filters: deserializeFilters((r.filter_state ?? {}) as unknown as Partial<Serialized>),
  };
}

/** CRUD for a signed-in user's saved filter views (RLS-scoped to their own rows).
 *  Fails soft: any error → empty list / no-op, so a missing table or transient error
 *  never crashes the rail. */
export function useSavedFilters() {
  const { user } = useAuth();
  const [items, setItems] = useState<SavedFilter[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) {
          setItems([]);
          setReady(true);
        }
        return;
      }
      try {
        const { data, error } = await supabase
          .from("saved_filters")
          .select("id, name, filter_state")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (!cancelled) setItems((data ?? []).map((r) => rowToSaved(r as Row)));
      } catch (e) {
        console.error("[savedFilters] load failed:", e);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const save = useCallback(
    async (name: string, filters: FilterState): Promise<boolean> => {
      if (!user) return false;
      try {
        const { data, error } = await supabase
          .from("saved_filters")
          .insert({
            user_id: user.id,
            name,
            filter_state: serializeFilters(filters) as unknown as Json,
          })
          .select("id, name, filter_state")
          .single();
        if (error) throw error;
        if (data) setItems((prev) => [rowToSaved(data as Row), ...prev]);
        return true;
      } catch (e) {
        console.error("[savedFilters] save failed:", e);
        return false;
      }
    },
    [user],
  );

  const remove = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((s) => s.id !== id)); // optimistic
      if (!user) return;
      try {
        const { error } = await supabase
          .from("saved_filters")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        if (error) throw error;
      } catch (e) {
        console.error("[savedFilters] delete failed:", e);
      }
    },
    [user],
  );

  return { items, ready, save, remove };
}
