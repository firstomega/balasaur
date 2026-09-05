import { describe, expect, it } from "bun:test";
import {
  ENABLED_SLUGS,
  GAMES,
  HUB_SECTIONS,
  NEW_RIBBON_CAP,
  isNewGame,
  newGames,
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
  it("fit two lines at 13px in a 138px column and end a sentence", () => {
    for (const slug of ENABLED_SLUGS) {
      const hook = tileHook(GAMES[slug]);
      expect(hook.length).toBeLessThanOrEqual(50);
      expect(/[.?!]$/.test(hook)).toBe(true);
      expect(hook).not.toContain("—");
    }
  });

  it("hero tiles keep the registry hook", () => {
    for (const slug of HUB_SECTIONS[0].slugs) expect(tileHook(GAMES[slug])).toBe(GAMES[slug].hook);
  });
});
