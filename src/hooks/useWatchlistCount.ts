import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Fired on window after a signed-in status write lands (useUserStatus). */
export const STATUS_WRITTEN_EVENT = "balasaur:status-written";

/**
 * How many titles are on the signed-in visitor's Watchlist, for the header.
 * Null while signed out or loading. The header reads one count, not the whole
 * status table, and re-reads it whenever a save lands anywhere on the page.
 * Client-only: the server has no user, so the cached HTML never carries it.
 */
export function useWatchlistCount(): number | null {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id ?? null;
  const { data } = useQuery({
    queryKey: ["watchlistCount", uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_media_status")
        .select("media_id", { count: "exact", head: true })
        .eq("user_id", uid as string)
        .eq("status", "unseen")
        .eq("intent", "want");
      if (error) throw error;
      return count ?? 0;
    },
  });
  useEffect(() => {
    if (!uid) return;
    const refresh = () => void qc.invalidateQueries({ queryKey: ["watchlistCount", uid] });
    window.addEventListener(STATUS_WRITTEN_EVENT, refresh);
    return () => window.removeEventListener(STATUS_WRITTEN_EVENT, refresh);
  }, [qc, uid]);
  return uid && typeof data === "number" ? data : null;
}
