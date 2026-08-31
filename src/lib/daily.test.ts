import { describe, expect, it } from "bun:test";
import {
  leaksTitle,
  titlePattern,
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

describe("redactTitle word boundaries", () => {
  it("never garbles words that merely contain a title word", () => {
    expect(redactTitle("There is something out there.", "The Thing")).toBe(
      "There is something out there.",
    );
    expect(redactTitle("What is that thing?", "The Thing")).toBe("What is that ___?");
    expect(redactTitle("They said it was over.", "It")).toBe("They said it was over.");
  });

  it("still blanks the full title and its standalone words", () => {
    expect(redactTitle("The Thing returns: the thing is back.", "The Thing")).toBe(
      "___ returns: ___ is back.",
    );
  });
});

describe("titlePattern", () => {
  it("blanks every letter after the first of each word", () => {
    expect(titlePattern("The Dark Knight")).toBe("T__ D___ K_____");
  });
  it("keeps punctuation and blanks digits", () => {
    expect(titlePattern("Se7en")).toBe("S____");
    expect(titlePattern("WALL·E")).toBe("W___·_");
  });
});

describe("shareText hints", () => {
  it("stays silent at zero hints", () => {
    expect(shareText(10, 3, true, 0)).not.toContain("hint");
  });
  it("declares hints when used", () => {
    expect(shareText(10, 3, true, 2)).toContain("3/6 (2 hints)");
    expect(shareText(10, 2, true, 1)).toContain("(1 hint)");
  });
});

describe("leaksTitle", () => {
  it("ignores stopwords so structural clues survive", () => {
    // The bug this exists to prevent: "the" is 3 characters, so a naive
    // word guard dropped clue 1 on every title containing it.
    expect(leaksTitle("A movie from the 1990s.", "The Truman Show")).toBe(false);
    expect(leaksTitle("Genres: Drama.", "The Godfather")).toBe(false);
  });
  it("catches a real leak, whole word and whole title", () => {
    expect(leaksTitle("It aired on Fargo Network.", "Fargo")).toBe(true);
    expect(leaksTitle("Features Truman Capote.", "The Truman Show")).toBe(true);
    expect(leaksTitle("Tagline: the truman show", "The Truman Show")).toBe(true);
  });
  it("does not fire on a substring inside another word", () => {
    expect(leaksTitle("Features Christopher Nolan.", "Up")).toBe(false);
    expect(leaksTitle("It aired on Showtime.", "Show Me a Hero")).toBe(false);
  });
});

describe("redactTitle stopwords", () => {
  it("leaves common words alone while blanking the real ones", () => {
    // The full title is blanked whole when it appears. This case is the one
    // stopwords are for: only the meaningful words are hunted, so the article
    // survives and the sentence still reads.
    const out = redactTitle("The show must go on for Truman", "The Truman Show");
    expect(out.startsWith("The ")).toBe(true);
    expect(out).not.toContain("Truman");
  });
});
