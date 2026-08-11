import { describe, expect, it } from "bun:test";
import { computeBalasaurScore } from "./score";

describe("computeBalasaurScore", () => {
  it("returns undefined with no inputs", () => {
    expect(computeBalasaurScore({})).toBeUndefined();
    expect(
      computeBalasaurScore({ imdb: null, rottenTomatoes: null, metacritic: null, tmdb: null }),
    ).toBeUndefined();
  });

  it("renormalizes to a single source", () => {
    expect(computeBalasaurScore({ imdb: 8.4 })).toBe(84);
    expect(computeBalasaurScore({ tmdb: 7.2 })).toBe(72);
    expect(computeBalasaurScore({ rottenTomatoes: 91 })).toBe(91);
  });

  it("blends with documented weights (imdb .25 / rt .125 / mc .125 / tmdb .10)", () => {
    // (80·.25 + 90·.125 + 70·.125 + 60·.10) / 0.6 = 46/0.6 ≈ 76.7 → 77
    expect(computeBalasaurScore({ imdb: 8, rottenTomatoes: 90, metacritic: 70, tmdb: 6 })).toBe(77);
  });

  it("user ratings dominate when present (weight .50)", () => {
    // (95*.5 + 60*.25) / .75 = 83.33 → 83
    expect(computeBalasaurScore({ userAvg: 95, imdb: 6 })).toBe(83);
  });

  it("matches the SQL generated column on a mixed example", () => {
    // Mirrors supabase/migrations/20260811100000: imdb 7.0 + tmdb 8.0
    // (70*.25 + 80*.10)/.35 = 25.5/0.35 ≈ 72.86 → 73
    expect(computeBalasaurScore({ imdb: 7, tmdb: 8 })).toBe(73);
  });
});
