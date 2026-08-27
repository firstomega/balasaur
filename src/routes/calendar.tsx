import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TopBar } from "@/components/balasaur/TopBar";
import { MediaCard } from "@/components/balasaur/MediaCard";
import { useEffect, useState } from "react";
import {
  getReleaseCalendar,
  nextMonth,
  clampMonth,
  calendarMaxMonth,
  CALENDAR_MIN_MONTH,
  type CalendarMonth,
} from "@/lib/calendar.functions";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse } from "@/lib/seo";

// /calendar — releases by month. The month lives in the search string
// (?m=2026-09) so every month is a distinct, cacheable, indexable URL.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return `${MONTHS[mo - 1]} ${y}`;
}

function dayLabel(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    dt.getUTCDay()
  ];
  return `${weekday}, ${MONTHS[mo - 1]} ${d}`;
}

export const Route = createFileRoute("/calendar")({
  validateSearch: (s: Record<string, unknown>): { m?: string } =>
    typeof s.m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s.m) ? { m: s.m } : {},
  loaderDeps: ({ search }) => ({ m: search.m }),
  loader: async ({ deps }) => {
    await cacheSsrResponse();
    const month = clampMonth(deps.m ?? currentMonth());
    return getReleaseCalendar({ data: { month } });
  },
  head: ({ loaderData }) => {
    const m = loaderData?.month ?? currentMonth();
    const url = `${SITE_ORIGIN}/calendar${m === currentMonth() ? "" : `?m=${m}`}`;
    return {
      meta: buildMeta({
        title: `${monthLabel(m)} Movie and TV Release Calendar`,
        description: `${monthLabel(m)} movie and TV premieres, day by day, with the Balasaur Score where one exists.`,
        url,
      }),
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CalendarPage,
});

function CalendarPage() {
  const data = Route.useLoaderData() as CalendarMonth;
  const m = data.month;
  // Client-only: the SSR HTML is CDN-cached for six hours across date lines
  // and time zones, so a server-rendered "today" would be wrong for some
  // viewers and trip a hydration mismatch. The badge appears after mount.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10));
  }, []);
  const prev = nextMonth(m, -1);
  const next = nextMonth(m, 1);
  const nextAllowed = next <= calendarMaxMonth();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-text-bright">
              Release calendar
            </h1>
            <p className="mt-1 text-[14px] text-text-muted">
              {data.total} {data.total === 1 ? "premiere" : "premieres"} in {monthLabel(m)}.
            </p>
          </div>
          <nav aria-label="Month" className="flex items-center gap-1.5">
            {prev >= CALENDAR_MIN_MONTH ? (
              <Link
                to="/calendar"
                search={{ m: prev }}
                className="inline-flex h-8 items-center gap-1 rounded-[5px] border border-border bg-panel px-2.5 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:border-primary hover:text-primary"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {monthLabel(prev)}
              </Link>
            ) : null}
            {nextAllowed ? (
              <Link
                to="/calendar"
                search={{ m: next }}
                className="inline-flex h-8 items-center gap-1 rounded-[5px] border border-border bg-panel px-2.5 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:border-primary hover:text-primary"
              >
                {monthLabel(next)}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </nav>
        </div>

        {data.days.length === 0 ? (
          <p className="mt-10 text-[14px] text-text-muted">
            No catalogued premieres in {monthLabel(m)} yet.
          </p>
        ) : (
          <div className="mt-8 space-y-8">
            {data.days.map((day) => (
              <section key={day.date} aria-label={dayLabel(day.date)}>
                <h2 className="mb-2.5 flex items-baseline gap-2 border-b border-border pb-1.5">
                  <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-text-bright">
                    {dayLabel(day.date)}
                  </span>
                  {day.date === today && (
                    <span className="rounded-[3px] bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                      Today
                    </span>
                  )}
                  <span className="font-mono text-[10.5px] text-text-dim">{day.items.length}</span>
                </h2>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {day.items.map((item) => (
                    <MediaCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
