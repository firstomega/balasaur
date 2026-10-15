import { describe, expect, it } from "bun:test";
import { TWO_SOURCES_OR_CROWD, candidateTrustInput } from "./originCollections";
import { isRankable } from "./trust";

const row = {
  media_type: "tv",
  title: "My Mister",
  genres: ["Drama"],
  film_length_minutes: null,
  rating_imdb: 9.1,
  rating_rotten_tomatoes: null,
  rating_metacritic: null,
  rating_tmdb: 8.7,
  vote_count: 206,
};

describe("country shelf gate", () => {
  it("asks the database for every pair of sources, or a crowd", () => {
    expect(TWO_SOURCES_OR_CROWD.split(",and(").length).toBe(7);
    expect(TWO_SOURCES_OR_CROWD).toContain("vote_count.gte.500");
    expect(TWO_SOURCES_OR_CROWD).toContain(
      "and(rating_metacritic.not.is.null,rating_tmdb.not.is.null)",
    );
  });

  it("ranks a real drama and refuses a variety show", () => {
    expect(isRankable(candidateTrustInput(row))).toBe(true);
    expect(
      isRankable(candidateTrustInput({ ...row, title: "Running Man", genres: ["Reality TV"] })),
    ).toBe(false);
  });

  it("refuses a one-source title without a crowd behind it", () => {
    // Perfect Crown on 2026-10-15: TMDB only, 221 votes.
    expect(isRankable(candidateTrustInput({ ...row, rating_imdb: null, vote_count: 221 }))).toBe(
      false,
    );
  });
});
