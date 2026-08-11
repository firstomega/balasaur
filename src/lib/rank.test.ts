import { describe, expect, it } from "bun:test";
import { computeRankScore } from "./rank";

const NOW = new Date("2026-08-11T00:00:00Z");

describe("computeRankScore", () => {
  it("is 0-ish for a dead row and bounded for a maxed one", () => {
    const dead = computeRankScore({}, NOW);
    // no popularity, no rating (prior contributes via 0-vote confidence = 0 → pure prior)
    expect(dead).toBeCloseTo(0.4 * 62, 0);
    const maxed = computeRankScore(
      { popularity: 5000, balasaur: 100, voteCount: 1_000_000, releaseDate: "2026-08-10" },
      NOW,
    );
    expect(maxed).toBeGreaterThan(95);
    expect(maxed).toBeLessThanOrEqual(100);
  });

  it("vote confidence: few votes get shrunk toward the prior", () => {
    const few = computeRankScore({ balasaur: 95, voteCount: 40 }, NOW);
    const many = computeRankScore({ balasaur: 85, voteCount: 400_000 }, NOW);
    // a 9.5 from 40 votes must NOT outrank an 8.5 from 400k votes
    expect(many).toBeGreaterThan(few);
  });

  it("popularity is log-scaled", () => {
    const a = computeRankScore({ popularity: 10 }, NOW);
    const b = computeRankScore({ popularity: 100 }, NOW);
    const c = computeRankScore({ popularity: 1000 }, NOW);
    expect(b - a).toBeGreaterThan(0);
    // each 10× step adds roughly the same amount (log behavior)
    expect(Math.abs(b - a - (c - b))).toBeLessThan(3);
  });

  it("recency decays and unparsable dates get no bonus", () => {
    const fresh = computeRankScore({ releaseDate: "2026-08-01" }, NOW);
    const old = computeRankScore({ releaseDate: "2015-08-01" }, NOW);
    const none = computeRankScore({ releaseDate: "unknown" }, NOW);
    expect(fresh).toBeGreaterThan(old);
    expect(none).toBe(computeRankScore({}, NOW));
  });

  it("rounds to one decimal (skip-unchanged stability across daily runs)", () => {
    const v = computeRankScore(
      { popularity: 37.3, balasaur: 71, voteCount: 812, releaseDate: "2024-02-19" },
      NOW,
    );
    expect(v).toBe(Math.round(v * 10) / 10);
  });
});
