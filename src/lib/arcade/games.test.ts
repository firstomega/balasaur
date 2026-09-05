import { describe, expect, it } from "bun:test";
import {
  ENABLED_SLUGS,
  GAMES,
  HUB_SECTIONS,
  GUESS_COUNT_GAMES,
  NEW_RIBBON_CAP,
  TILE_HOOK_MAX,
  isNewGame,
  newGames,
  tierFor,
  tileHook,
} from "./games";

const DAY = 24 * 60 * 60 * 1000;

describe("NEW ribbon", () => {
  it("launch day: every game qualifies, so nobody wears one", () => {
    const launch = Date.parse(GAMES.balasaurdle.launched);
    expect(newGames(launch + DAY).length).toBe(0);
    for (const slug of ENABLED_SLUGS) expect(isNewGame(GAMES[slug], launch + DAY)).toBe(false);
  });

  it("after the window nothing is new", () => {
    const launch = Date.parse(GAMES.balasaurdle.launched);
    expect(newGames(launch + 20 * DAY).length).toBe(0);
  });

  it("never more than the cap", () => {
    expect(newGames(Date.now()).length).toBeLessThanOrEqual(NEW_RIBBON_CAP);
  });
});

describe("tile hooks", () => {
  it("fit two lines at 13px in a 129px column and end a sentence", () => {
    for (const slug of ENABLED_SLUGS) {
      const hook = tileHook(GAMES[slug]);
      expect(hook.length).toBeLessThanOrEqual(TILE_HOOK_MAX);
      expect(/[.?!]$/.test(hook)).toBe(true);
      expect(hook).not.toContain("—");
    }
  });

  it("Tonight hooks fit the hero slot: two lines at 14.5px in 197px, the md width", () => {
    for (const slug of HUB_SECTIONS[0].slugs) {
      expect(GAMES[slug].hook.length).toBeLessThanOrEqual(48);
      expect(GAMES[slug].hook).not.toContain("—");
    }
  });
});

describe("tierFor", () => {
  it("one ladder by fraction, the same word on every game", () => {
    const cases: [number, string][] = [
      [1, "Perfect"],
      [0.95, "Sharp"],
      [0.8, "Sharp"],
      [0.79, "Solid"],
      [0.6, "Solid"],
      [0.59, "Close"],
      [0.4, "Close"],
      [0.39, "Rough"],
      [0, "Rough"],
    ];
    for (const slug of ENABLED_SLUGS) {
      if (GUESS_COUNT_GAMES.has(slug)) continue;
      for (const [ratio, word] of cases) expect(tierFor(slug, ratio)).toBe(word);
    }
  });

  it("the fractions the games actually produce land where the regrade asked", () => {
    expect(tierFor("screening", 8 / 10)).toBe("Sharp");
    expect(tierFor("sequel-or-fake", 8 / 10)).toBe("Sharp");
    expect(tierFor("quote-match", 4 / 5)).toBe("Sharp");
    expect(tierFor("casting-call", 6 / 8)).toBe("Solid");
    expect(tierFor("timeline", 3 / 5)).toBe("Solid");
    expect(tierFor("timeline", 2 / 5)).toBe("Close");
    expect(tierFor("speed-sort", 21 / 24)).toBe("Sharp");
    expect(tierFor("emoji", 5 / 5)).toBe("Perfect");
    expect(tierFor("link-up", 0)).toBe("Rough");
  });

  it("clamps and survives bad input", () => {
    expect(tierFor("screening", 1.2)).toBe("Perfect");
    expect(tierFor("screening", -1)).toBe("Rough");
    expect(tierFor("screening", Number.NaN)).toBe("Rough");
  });

  it("guess-count games say how many guesses the solve took", () => {
    expect(tierFor("balasaurdle", 1, 1)).toBe("Solved in 1");
    expect(tierFor("balasaurdle", 0.5, 3)).toBe("Solved in 3");
    expect(tierFor("poster-reveal", 0, 6)).toBe("Solved in 6");
    // Without a count they use the ladder like everyone else.
    expect(tierFor("balasaurdle", 1)).toBe("Perfect");
    expect(tierFor("poster-reveal", 0.5)).toBe("Close");
    // A count means nothing on a board game and is ignored.
    expect(tierFor("screening", 0.8, 3)).toBe("Sharp");
  });
});
