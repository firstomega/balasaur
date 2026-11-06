import { loose } from "@/lib/supabaseLoose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ssrBudget } from "@/lib/ssrBudget";

/**
 * The live title count, for llms.txt. The same filter catalogCount.ts was
 * measured with: titles that are neither sensitive nor suggestive.
 *
 * About 0.7 seconds against the live catalog, because the filter cannot use
 * an index and every row is read. That is why the home page does not call
 * this: its grid prints its own estimated total.
 *
 * Two guards, because the response's own day-long cache header is not
 * honoured in production today (pages arrive marked no-cache) and llms.txt is
 * exactly what crawlers fetch:
 * - A good count is kept in this server process for six hours, so a burst of
 *   requests costs one full read, not one per request.
 * - The read gets two seconds. A slow or dead database leaves the count out
 *   instead of holding the response open.
 *
 * Null when the read fails or runs long, so the caller leaves the count out
 * rather than printing a typed fallback that would go stale. A failure is not
 * kept, so the next request tries again.
 */
const KEEP_MS = 6 * 60 * 60 * 1000;
const BUDGET_MS = 2000;

let kept: { count: number; at: number } | null = null;
let inFlight: Promise<number | null> | null = null;

async function readCount(): Promise<number | null> {
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

export async function liveCatalogCount(): Promise<number | null> {
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.count;
  // Concurrent requests share one read rather than each starting their own.
  inFlight ??= readCount()
    .then((count) => {
      if (count !== null) kept = { count, at: Date.now() };
      return count;
    })
    .finally(() => {
      inFlight = null;
    });
  // A read that outlives the budget still finishes and fills `kept` for the
  // next request; this one goes out without the count.
  return (await ssrBudget(inFlight, BUDGET_MS)) ?? kept?.count ?? null;
}
