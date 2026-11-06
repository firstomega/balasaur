import { describe, expect, it } from "bun:test";
import { calendarDays, readReleaseCalendar, type CalendarRow } from "./calendar.functions";
import { DataUnavailableError } from "./dataError";
import { FAILED, rejectionOf, stubSupabase } from "./supabaseStub";

function row(over: Partial<CalendarRow>): CalendarRow {
  return {
    media_id: "movie-1",
    media_type: "movie",
    title: "A Film",
    year: "2026",
    poster_url: "/p.jpg",
    popularity: 10,
    release_date: "2026-10-02",
    rating_imdb: null,
    rating_rotten_tomatoes: null,
    rating_metacritic: null,
    rating_tmdb: null,
    genres: ["Drama"],
    origins: [],
    streaming: [],
    seasons: null,
    award_winner: false,
    award_nominee: false,
    vote_count: null,
    film_length_minutes: 110,
    ...over,
  };
}

describe("calendarDays", () => {
  it("keeps premieres and drops trailers, shorts and talk shows", () => {
    const days = calendarDays([
      row({ media_id: "movie-1", title: "Real Film" }),
      row({ media_id: "movie-2", title: "Grand Theft Auto VI: An Extended Look" }),
      row({ media_id: "movie-3", title: "A Short", film_length_minutes: 12 }),
      row({ media_id: "tv-4", media_type: "tv", title: "Late Show", genres: ["Talk"] }),
      // Runtime unknown before release: not read as a short.
      row({ media_id: "movie-5", title: "Unannounced Runtime", film_length_minutes: null }),
    ]);
    expect(days.length).toBe(1);
    expect(days[0].items.map((i) => i.title).join("|")).toBe("Real Film|Unannounced Runtime");
  });

  it("shows no badge for a one-source score", () => {
    const [day] = calendarDays([row({ rating_tmdb: 10, vote_count: 1 })]);
    expect(day.items[0].ratings.balasaur).toBeUndefined();
  });

  it("groups by day in date order", () => {
    const days = calendarDays([
      row({ media_id: "movie-1", release_date: "2026-10-09" }),
      row({ media_id: "movie-2", release_date: "2026-10-02" }),
    ]);
    expect(days.map((d) => d.date).join(",")).toBe("2026-10-02,2026-10-09");
  });
});

describe("readReleaseCalendar", () => {
  it("throws on a failed read instead of returning an empty month", async () => {
    // An empty month served for six hours is what the CDN would keep.
    const db = stubSupabase({ media: FAILED });
    expect(await rejectionOf(readReleaseCalendar("2026-10", db))).toBeInstanceOf(
      DataUnavailableError,
    );
  });

  it("returns an empty month when the read succeeds with no rows", async () => {
    const db = stubSupabase({ media: { data: [] } });
    expect(await readReleaseCalendar("2031-02", db)).toEqual({
      month: "2031-02",
      days: [],
      total: 0,
    });
  });

  it("groups the rows a successful read returns", async () => {
    const db = stubSupabase({ media: { data: [row({}), row({ media_id: "movie-2" })] } });
    const month = await readReleaseCalendar("2026-10", db);
    expect(month.total).toBe(2);
    expect(month.days.map((d) => d.date)).toEqual(["2026-10-02"]);
  });
});
