import { describe, expect, it } from "bun:test";
import {
  ENABLED_SLUGS,
  GAMES,
  HUB_SECTIONS,
  GUESS_COUNT_GAMES,
  NEW_RIBBON_CAP,
  GAME_TEXT_HUE_PCT,
  HUE_HEX,
  TILE_HOOK_MAX,
  isNewGame,
  newGames,
  tierFor,
} from "./games";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

describe("hooks", () => {
  it("fit two lines at 13px in the narrowest tile and end a sentence", () => {
    for (const slug of ENABLED_SLUGS) {
      const hook = GAMES[slug].hook;
      expect(hook.length).toBeLessThanOrEqual(TILE_HOOK_MAX);
      expect(/[.!]$/.test(hook)).toBe(true);
      expect(hook).not.toContain("—");
      expect(hook).not.toContain("?");
    }
  });
});

// --game-text: the hue mixed into ink in sRGB, as color-mix(in srgb, ...)
// computes it. It is the hue as text on the light ground, so it must read on
// paper, on the wash, and on the 16 percent hue tint the game band uses.
function rgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
function luminance(c: number[]): number {
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const mix = (a: number[], b: number[], p: number) => a.map((v, i) => v * p + b[i] * (1 - p));

describe("--game-text", () => {
  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../styles.css"),
    "utf8",
  );
  const token = (name: string) => {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    if (!m) throw new Error(`no --${name} in styles.css`);
    return rgb(m[1]);
  };
  const ink = token("ink");
  const paper = token("paper");
  const wash = token("wash");

  it("reads at 4.5:1 on paper, the wash and a 16% hue tint for every hue", () => {
    const low: string[] = [];
    for (const [hue, hex] of Object.entries(HUE_HEX)) {
      const text = mix(rgb(hex), ink, GAME_TEXT_HUE_PCT / 100);
      const grounds = { paper, wash, tint: mix(rgb(hex), paper, 0.16) };
      for (const [name, ground] of Object.entries(grounds)) {
        const c = contrast(text, ground);
        if (c < 4.5) low.push(`${hue} on ${name}: ${c.toFixed(2)}`);
      }
    }
    expect(low.join("\n")).toBe("");
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
