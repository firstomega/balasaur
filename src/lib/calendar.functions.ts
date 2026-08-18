import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CARD_COLS, rowToCardItem, type CardRow } from "@/lib/catalog.functions";
import type { MediaItem } from "@/types/media";

// The release calendar: what comes out, day by day, one month per page.
// Movie Insider built a whole site on this one view; here it is one query
// over data the nightly sync already refreshes.

export interface CalendarDay {
  date: string; // "2026-09-12"
  items: MediaItem[];
}

export interface CalendarMonth {
  month: string; // "2026-09"
  days: CalendarDay[];
  total: number;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Clamp navigation to a sane window: catalog history is thin before this. */
export const CALENDAR_MIN_MONTH = "2020-01";

/** Furthest month ahead worth a page; also stops an unbounded crawl of
 *  /calendar?m=2099-12 style URLs, since the next-month link would otherwise
 *  walk forward forever. */
export function calendarMaxMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 18, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function clampMonth(m: string): string {
  const max = calendarMaxMonth();
  if (m < CALENDAR_MIN_MONTH) return CALENDAR_MIN_MONTH;
  if (m > max) return max;
  return m;
}

export function nextMonth(m: string, delta: 1 | -1): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const getReleaseCalendar = createServerFn({ method: "GET" })
  .inputValidator((p: { month: string }) => {
    if (!p || !MONTH_RE.test(p.month)) throw new Error("Invalid month");
    return { month: p.month };
  })
  .handler(async ({ data: p }): Promise<CalendarMonth> => {
    const start = `${p.month}-01`;
    const end = `${nextMonth(p.month, 1)}-01`;
    const { data, error } = await supabaseAdmin
      .from("media")
      .select(CARD_COLS)
      // The calendar is the site presenting premieres unprompted, so the whole
      // fan-service tier (`suggestive`, superset of `sensitive`) stays out.
      .eq("suggestive", false)
      .not("poster_url", "is", null)
      .gte("release_date", start)
      .lt("release_date", end)
      .order("release_date", { ascending: true })
      .order("popularity", { ascending: false, nullsFirst: false })
      // The busiest catalogued month holds 497 qualifying premieres; 300 was
      // silently amputating the back half of such months while the header
      // claimed a full count. 1000 is PostgREST's per-request ceiling and
      // covers the maximum with headroom.
      .limit(1000);
    if (error) {
      console.error("[calendar] query failed:", error.message);
      return { month: p.month, days: [], total: 0 };
    }
    const byDay = new Map<string, MediaItem[]>();
    for (const r of (data ?? []) as unknown as CardRow[]) {
      const item = rowToCardItem(r);
      const day = (item.releaseDate ?? "").slice(0, 10);
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(item);
    }
    const days = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({ date, items }));
    return { month: p.month, days, total: days.reduce((n, d) => n + d.items.length, 0) };
  });
