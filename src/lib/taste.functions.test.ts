import { describe, expect, it } from "bun:test";
import { toFact, type FactRow } from "./taste.functions";

const row = (over: Partial<FactRow> = {}): FactRow => ({
  media_id: "movie-1",
  media_type: "movie",
  title: "A Film",
  year: "2020",
  poster_url: "/p.jpg",
  color_a: null,
  color_b: null,
  genres: ["Drama"],
  origins: [],
  rating_imdb: 7.0,
  rating_rotten_tomatoes: null,
  rating_metacritic: null,
  rating_tmdb: 8.0,
  vote_count: 400,
  ...over,
});

describe("taste card facts", () => {
  it("carries the score the badge would show", () => {
    expect(toFact(row()).score).toBe(73);
  });

  it("drops a score the badge would hide", () => {
    // One TMDB vote of 10 with an IMDb match is not a 100 worth printing.
    expect(toFact(row({ rating_imdb: 10, rating_tmdb: 10, vote_count: 1 })).score).toBeUndefined();
    // One source and a small crowd.
    expect(toFact(row({ rating_imdb: null, vote_count: 120 })).score).toBeUndefined();
  });
});
