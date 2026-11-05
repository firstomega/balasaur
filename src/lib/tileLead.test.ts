import { describe, expect, it } from "bun:test";
import { tileFactLine, type TileLead } from "./tileLead";

const lead = (over: Partial<TileLead> = {}): TileLead => ({
  id: "movie-539",
  posterUrl: "/p.jpg",
  swatch: "navy",
  swatchAlt: null,
  title: "Psycho",
  score: 90,
  first: true,
  ...over,
});

describe("tileFactLine", () => {
  it("names the leader and its score", () => {
    expect(tileFactLine(lead(), 60)).toBe("Psycho leads at 90");
  });

  it("falls back to the count when the leader's score is not trusted", () => {
    expect(tileFactLine(lead({ score: null }), 60)).toBe("60 titles");
  });

  it("falls back to the count when the peeking title is not in first place", () => {
    expect(tileFactLine(lead({ first: false }), 1250)).toBe("1,250 titles");
  });

  it("falls back to the count with no leader, and says title for one", () => {
    expect(tileFactLine(null, 1)).toBe("1 title");
  });
});
