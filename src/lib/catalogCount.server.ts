import { loose } from "@/lib/supabaseLoose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * The live title count, for surfaces that can afford one exact count per
 * response and are cached long enough that it costs nothing in practice:
 * llms.txt (one day). The same filter catalogCount.ts was measured with:
 * titles that are neither sensitive nor suggestive.
 *
 * About 0.7 seconds against the live catalog, because the filter cannot use
 * an index and every row is read. That is why the home page does not call
 * this: its grid prints its own estimated total.
 *
 * Null when the read fails, so the caller leaves the count out rather than
 * printing a typed fallback that would go stale.
 */
export async function liveCatalogCount(): Promise<number | null> {
  try {
    const { count, error } = await loose(supabaseAdmin)
      .from("media")
      .select("media_id", { count: "exact", head: true })
      .not("sensitive", "is", true)
      .not("suggestive", "is", true);
    if (error) {
      console.error("[catalog count] live count failed:", error.message);
      return null;
    }
    return typeof count === "number" && count > 0 ? count : null;
  } catch (err) {
    console.error("[catalog count] live count failed:", err);
    return null;
  }
}
