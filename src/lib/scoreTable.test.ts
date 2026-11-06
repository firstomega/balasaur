import { describe, expect, it } from "bun:test";
import { BLEND_WEIGHTS, sourceRows } from "./scoreTable";
import { computeBalasaurScore } from "./score";

describe("sourceRows", () => {
  // Inception as the live database holds it on 2026-11-05.
  const inception = { imdb: 8.8, rottenTomatoes: 86, metacritic: 74, tmdb: 8.4 };

  it("prints each source in its own units, in a fixed order", () => {
    expect(sourceRows(inception, 84).map((r) => `${r.label} ${r.shown}`)).toEqual([
      "IMDb 8.8/10",
      "Rotten Tomatoes 86%",
      "Metacritic 74/100",
      "TMDB 8.4/10",
    ]);
  });

  it("gives shares that sum to 100 and reproduce the score", () => {
    const rows = sourceRows(inception, 84);
    const shares = rows.map((r) => r.share!);
    expect(shares).toEqual([42, 21, 21, 16]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("renormalises over the sources a title has", () => {
    const rows = sourceRows({ imdb: 7.0, tmdb: 7.2 }, 71);
    expect(rows.map((r) => r.share)).toEqual([71, 29]);
  });

  it("shows no shares when the score is hidden or does not match the rows", () => {
    expect(sourceRows(inception, undefined).every((r) => r.share === null)).toBe(true);
    expect(sourceRows(inception, 90).every((r) => r.share === null)).toBe(true);
    expect(sourceRows({ tmdb: 7.0 }, 70).every((r) => r.share === null)).toBe(true);
  });

  it("returns nothing for a title with no ratings", () => {
    expect(sourceRows({}, undefined)).toEqual([]);
  });

  it("keeps its weights equal to the blend's", () => {
    const one = (k: keyof typeof BLEND_WEIGHTS) => {
      // Two sources, 0 and 100: the blend lands on the other source's share.
      const r = { imdb: 0, [k]: k === "imdb" ? 0 : k === "tmdb" ? 10 : 100 };
      return computeBalasaurScore(r);
    };
    for (const k of ["rottenTomatoes", "metacritic", "tmdb"] as const) {
      const w = BLEND_WEIGHTS[k];
      expect(one(k)).toBe(Math.round((100 * w) / (w + BLEND_WEIGHTS.imdb)));
    }
  });
});
