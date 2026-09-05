import { describe, expect, it } from "bun:test";
import { formatClock, formatShort, msUntilNextUtcMidnight } from "./NextCountdown";

describe("msUntilNextUtcMidnight", () => {
  it("measures to the next 00:00 UTC, not the viewer's midnight", () => {
    const at = Date.UTC(2026, 8, 4, 17, 19, 48);
    expect(msUntilNextUtcMidnight(at)).toBe(((6 * 60 + 40) * 60 + 12) * 1000);
  });
  it("is a full day at exactly midnight", () => {
    expect(msUntilNextUtcMidnight(Date.UTC(2026, 8, 5))).toBe(24 * 60 * 60 * 1000);
  });
});

describe("formatClock", () => {
  it("pads to hh:mm:ss", () => {
    expect(formatClock(((6 * 60 + 40) * 60 + 12) * 1000)).toBe("06:40:12");
    expect(formatClock(999)).toBe("00:00:00");
    expect(formatClock(0)).toBe("00:00:00");
  });
});

describe("formatShort", () => {
  it("drops the hours under sixty minutes and the whole thing under one", () => {
    expect(formatShort(((3 * 60 + 12) * 60 + 5) * 1000)).toBe("3h 12m");
    expect(formatShort((2 * 60 + 7) * 60 * 1000)).toBe("2h 07m");
    expect(formatShort(12 * 60 * 1000)).toBe("12m");
    expect(formatShort(30 * 1000)).toBe("under a minute");
  });
});
