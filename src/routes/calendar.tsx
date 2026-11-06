import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

  const navPill =
    "inline-flex h-9 items-center gap-1 rounded-full border border-border-strong px-3 text-base font-bold text-text-bright transition-colors hover:border-text-bright";

  return (
    <div className="bg-background text-foreground">
      <main id="main" className="mx-auto w-full max-w-grid px-4 pb-12 pt-6 md:pt-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-text-bright md:text-[64px]">
              Release calendar
            </h1>
            <p className="mt-2 text-lg text-text-muted">
              {data.total} {data.total === 1 ? "premiere" : "premieres"} in {monthLabel(m)}.
            </p>
          </div>
          <nav aria-label="Month" className="flex items-center gap-1.5">
            {prev >= CALENDAR_MIN_MONTH ? (
              <Link to="/calendar" search={{ m: prev }} className={navPill}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                {monthLabel(prev)}
              </Link>
            ) : null}
            {nextAllowed ? (
              <Link to="/calendar" search={{ m: next }} className={navPill}>
                {monthLabel(next)}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
          </nav>
        </div>

        {data.days.length === 0 ? (
          <p className="mt-10 text-lg text-text-muted">
            No catalogued premieres in {monthLabel(m)} yet.
          </p>
        ) : (
          // A sequence of days is a timeline: on desktop the date holds a
          // column of its own and stays in view beside its premieres, so a day
          // with one title costs one card's height rather than a heading row
          // and a mostly empty grid row.
          <div className="mt-8 md:mt-10">
            {data.days.map((day) => (
              <section
                key={day.date}
                aria-label={dayLabel(day.date)}
                className="border-t border-border py-5 md:grid md:grid-cols-[200px_1fr] md:gap-6 md:py-6"
              >
                <div className="mb-3 md:mb-0">
                  <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 md:sticky md:top-20 md:flex-col md:items-start">
                    {/* One line on a phone; on desktop the weekday sits over
                        the date so the column never breaks "November 1". */}
                    <span className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright md:text-3xl">
                      {dayLabel(day.date)
                        .split(", ")
                        .map((part, i) => (
                          <span key={i} className="md:block">
                            {i > 0 ? " " : ""}
                            {part}
                            {i === 0 ? "," : ""}
                          </span>
                        ))}
                    </span>
                    <span className="flex items-center gap-2">
                      {day.date === today && (
                        <span className="rounded-full bg-text-bright px-2 py-0.5 text-xs font-bold text-background">
                          Today
                        </span>
                      )}
                      <span className="text-sm font-bold text-text-muted">
                        <span className="font-mono tabular-nums">{day.items.length}</span>{" "}
                        {day.items.length === 1 ? "premiere" : "premieres"}
                      </span>
                    </span>
                  </h2>
                </div>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 md:gap-3.5 lg:grid-cols-6 xl:grid-cols-7">
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
