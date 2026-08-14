import { describe, expect, it } from "bun:test";
import { CORROBORATION_MIN_VOTES, isCorroborated, isIndexableDetail } from "./indexability";

const indexable = {
  overview: "A synopsis long enough to stand alone in a search result.",
  posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
  voteCount: 40732,
  ratings: { balasaur: 81, imdb: 8.7, rottenTomatoes: 73, metacritic: 74 },
};

describe("isCorroborated", () => {
  it("admits a title once enough people have rated it", () => {
    expect(isCorroborated({ voteCount: CORROBORATION_MIN_VOTES })).toBe(true);
    expect(isCorroborated({ voteCount: CORROBORATION_MIN_VOTES - 1 })).toBe(false);
  });

  it("admits a title with a critic score even when few people rated it", () => {
    expect(isCorroborated({ voteCount: 3, ratings: { rottenTomatoes: 96 } })).toBe(true);
    expect(isCorroborated({ voteCount: 3, ratings: { metacritic: 74 } })).toBe(true);
  });

  it("rejects a title nobody rated and no critic reviewed", () => {
    expect(isCorroborated({})).toBe(false);
    expect(isCorroborated({ voteCount: 19, ratings: {} })).toBe(false);
  });
});

describe("isIndexableDetail", () => {
  it("indexes a page that can stand alone", () => {
    expect(isIndexableDetail(indexable)).toBe(true);
  });

  it("still requires art, a synopsis, and a score", () => {
    expect(isIndexableDetail({ ...indexable, overview: "" })).toBe(false);
    expect(isIndexableDetail({ ...indexable, posterUrl: "" })).toBe(false);
    expect(isIndexableDetail({ ...indexable, ratings: {} })).toBe(false);
  });

  it("rejects the thin tail: complete metadata, but nobody has seen it", () => {
    // This is the shape that filled 7,811 of the old sitemap's 10,000 slots.
    expect(
      isIndexableDetail({
        overview: "A synopsis.",
        posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
        voteCount: 19,
        ratings: { balasaur: 68, tmdb: 6.8 },
      }),
    ).toBe(false);
  });

  it("treats a missing rating count as uncorroborated rather than assuming the best", () => {
    expect(
      isIndexableDetail({
        overview: "A synopsis.",
        posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
        ratings: { balasaur: 77 },
      }),
    ).toBe(false);
  });
});
