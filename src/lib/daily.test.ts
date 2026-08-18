import { describe, expect, it } from "bun:test";
import {
  DAILY_EPOCH_UTC,
  dayNumber,
  dailyIndex,
  redactTitle,
  shareText,
  MAX_GUESSES,
} from "./daily";

describe("dayNumber", () => {
  it("is 1 on the epoch day and increments at UTC midnight", () => {
    expect(dayNumber(DAILY_EPOCH_UTC)).toBe(1);
    expect(dayNumber(DAILY_EPOCH_UTC + 86_399_000)).toBe(1);
    expect(dayNumber(DAILY_EPOCH_UTC + 86_400_000)).toBe(2);
  });
});

describe("dailyIndex", () => {
  it("is deterministic and in range", () => {
    for (const day of [1, 2, 100, 5000]) {
      const i = dailyIndex(day, 1200);
      expect(i).toBe(dailyIndex(day, 1200));
      expect(i >= 0).toBe(true);
      expect(i).toBeLessThan(1200);
    }
  });

  it("does not repeat on consecutive days", () => {
    const seen = new Set<number>();
    for (let d = 1; d <= 30; d++) seen.add(dailyIndex(d, 1200));
    expect(seen.size).toBeGreaterThan(25);
  });

  it("survives an empty pool", () => {
    expect(dailyIndex(7, 0)).toBe(0);
  });
});

describe("redactTitle", () => {
  it("blanks the title and its longer words, case-insensitively", () => {
    expect(
      redactTitle("Fear can hold you prisoner. Hope can set you free.", "The Shawshank Redemption"),
    ).toBe("Fear can hold you prisoner. Hope can set you free.");
    expect(redactTitle("Heat is coming to the city", "Heat")).toBe("___ is coming to the city");
    expect(redactTitle("the GODFATHER returns", "The Godfather")).toBe("___ returns");
  });

  it("leaves short stop-words alone", () => {
    expect(redactTitle("It is what it is", "It")).toBe("It is what it is");
  });
});

describe("shareText", () => {
  it("renders a win as red squares then one green", () => {
    expect(shareText(42, 3, true)).toBe("Balasaurdle #42 3/6\n🟥🟥🟩\nbalasaur.com/play");
  });

  it("renders a loss as a full red row with X", () => {
    expect(shareText(42, MAX_GUESSES, false)).toBe(
      "Balasaurdle #42 X/6\n🟥🟥🟥🟥🟥🟥\nbalasaur.com/play",
    );
  });

  it("a first-guess win is a single green square", () => {
    expect(shareText(1, 1, true)).toBe("Balasaurdle #1 1/6\n🟩\nbalasaur.com/play");
  });
});
