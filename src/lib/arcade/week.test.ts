import { describe, expect, it } from "bun:test";
import { isoWeekStart, weekSpan } from "./week";

describe("isoWeekStart", () => {
  it("week 1 holds January 4th", () => {
    // 2026-01-04 is a Sunday, so ISO week 1 starts Monday 2025-12-29.
    expect(isoWeekStart("2026-W01")?.toISOString()).toBe("2025-12-29T00:00:00.000Z");
  });

  it("week 36 of 2026 starts Monday August 31", () => {
    expect(isoWeekStart("2026-W36")?.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("rejects garbage", () => {
    expect(isoWeekStart("2026-36")).toBe(null);
    expect(isoWeekStart("2026-W60")).toBe(null);
    expect(isoWeekStart("")).toBe(null);
  });
});

describe("weekSpan", () => {
  it("crosses a month boundary", () => {
    expect(weekSpan("2026-W36")).toBe("Aug 31 to Sep 6");
  });

  it("stays inside a month", () => {
    expect(weekSpan("2026-W37")).toBe("Sep 7 to 13");
  });

  it("crosses a year", () => {
    expect(weekSpan("2026-W01")).toBe("Dec 29 to Jan 4");
  });

  it("empty for a malformed key", () => {
    expect(weekSpan("nope")).toBe("");
  });
});
