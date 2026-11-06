import { describe, expect, it } from "bun:test";
import { HOME_TITLE, homeDescription } from "./homeSnippet";
import { SITE_DESCRIPTION } from "./seo";

// Shapes and values read from the live catalog on 2026-11-06: the first three
// movies and shows on the home grid's Top rated sort.
const LIVE = {
  movies: [
    { title: "The Godfather", score: 94 },
    { title: "12 Angry Men", score: 93 },
    { title: "Schindler's List", score: 92 },
  ],
  shows: [
    { title: "Breaking Bad", score: 94 },
    { title: "Avatar: The Last Airbender", score: 92 },
    { title: "Band of Brothers", score: 92 },
  ],
};

describe("home title", () => {
  it("is a plain label that fits a search result", () => {
    expect(HOME_TITLE).toBe("Balasaur: Movie and TV Ratings in One Score");
    expect(HOME_TITLE.length).toBeLessThanOrEqual(60);
  });
});

describe("homeDescription", () => {
  it("names both leaders and the runner-up when it all fits", () => {
    expect(homeDescription(LIVE)).toBe(
      "The Godfather leads movies at 94, ahead of 12 Angry Men (93). Breaking Bad leads shows at 94. Scores blend IMDb, Rotten Tomatoes, Metacritic and TMDB.",
    );
    expect(homeDescription(LIVE).length).toBeLessThanOrEqual(160);
  });

  it("drops the show leader before the line that says what the score is", () => {
    const long = {
      movies: [
        { title: "The Lord of the Rings: The Return of the King", score: 91 },
        { title: "The Godfather Part II", score: 90 },
      ],
      shows: [{ title: "Avatar: The Last Airbender", score: 92 }],
    };
    const out = homeDescription(long);
    expect(out).toBe(
      "The Lord of the Rings: The Return of the King leads movies at 91, ahead of The Godfather Part II (90). Scores blend IMDb, Rotten Tomatoes, Metacritic and TMDB.",
    );
    expect(out.length).toBeLessThanOrEqual(160);
  });

  it("never says 'ahead of' a title with the same score", () => {
    const tied = {
      movies: [
        { title: "The Godfather", score: 94 },
        { title: "Gintama", score: 94 },
      ],
      shows: [],
    };
    expect(homeDescription(tied)).toBe(
      "The Godfather leads movies at 94. Scores blend IMDb, Rotten Tomatoes, Metacritic and TMDB.",
    );
  });

  it("falls back to the site description when the read failed", () => {
    expect(homeDescription(null)).toBe(SITE_DESCRIPTION);
    expect(homeDescription(undefined)).toBe(SITE_DESCRIPTION);
    expect(homeDescription({ movies: [], shows: [] })).toBe(SITE_DESCRIPTION);
  });

  it("uses the show leader alone when no movie came back", () => {
    expect(homeDescription({ movies: [], shows: LIVE.shows })).toBe(
      "Breaking Bad leads shows at 94. Scores blend IMDb, Rotten Tomatoes, Metacritic and TMDB.",
    );
  });

  it("has no em-dash and no question", () => {
    for (const s of [homeDescription(LIVE), HOME_TITLE, SITE_DESCRIPTION]) {
      expect(s).not.toContain("—");
      expect(s).not.toContain("?");
    }
  });
});
