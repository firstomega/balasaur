// The weekly board's week, as dates a person reads. The database keys a
// week as "2026-W36" (ISO week, UTC); nobody should see that key. The span
// is the ISO Monday through Sunday of that week, as calendar dates.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of an ISO week key, or null when the key is malformed. */
export function isoWeekStart(weekKey: string): Date | null {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(weekKey.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  // ISO week 1 is the week that holds January 4th.
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Dow = new Date(jan4).getUTCDay() || 7;
  const week1Monday = jan4 - (jan4Dow - 1) * DAY_MS;
  return new Date(week1Monday + (week - 1) * 7 * DAY_MS);
}

function monthDay(d: Date): { month: string; day: number } {
  return {
    month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    day: d.getUTCDate(),
  };
}

/** "Sep 1 to 7", or "Aug 31 to Sep 6" when the week crosses a month.
 *  Empty for a key that does not parse, so the caller renders nothing. */
export function weekSpan(weekKey: string): string {
  const start = isoWeekStart(weekKey);
  if (!start) return "";
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const a = monthDay(start);
  const b = monthDay(end);
  if (a.month === b.month) return `${a.month} ${a.day} to ${b.day}`;
  return `${a.month} ${a.day} to ${b.month} ${b.day}`;
}
