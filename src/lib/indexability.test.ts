import { describe, expect, it } from "bun:test";
import { hasSubstance, substanceFacts, isIndexableDetail } from "./indexability";

const indexable = {
  overview: "A synopsis long enough to stand alone in a search result.",
  posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
  streaming: ["Netflix"],
  cast: [1, 2, 3],
  runtime: 169,
  ratings: { balasaur: 81, imdb: 8.7, rottenTomatoes: 73, metacritic: 74 },
};

describe("substanceFacts", () => {
  it("counts each independent thing the page can say", () => {
    expect(substanceFacts(indexable)).toBe(5);
    expect(substanceFacts({ ratings: { imdb: 7.1 }, runtime: 100 })).toBe(2);
    expect(substanceFacts({})).toBe(0);
  });

  it("treats a critic pair as one fact, not two", () => {
    expect(substanceFacts({ ratings: { rottenTomatoes: 90, metacritic: 80 } })).toBe(1);
  });
});

describe("isIndexableDetail", () => {
  it("indexes a page that can stand alone", () => {
    expect(isIndexableDetail(indexable)).toBe(true);
  });

  it("still requires art, a synopsis and a score", () => {
    expect(isIndexableDetail({ ...indexable, overview: "" })).toBe(false);
    expect(isIndexableDetail({ ...indexable, posterUrl: "" })).toBe(false);
    expect(isIndexableDetail({ ...indexable, ratings: {} })).toBe(false);
  });

  it("rejects a poster and a borrowed blurb with nothing else", () => {
    expect(
      isIndexableDetail({
        overview: "A synopsis.",
        posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
        ratings: { balasaur: 68, tmdb: 6.8 },
      }),
    ).toBe(false);
  });

  // The regression this file exists to prevent. Every title below ranked on
  // Google while carrying noindex under the old popularity gate.
  it("keeps pages that rank despite few or unknown ratings", () => {
    // Be My Guest with Ina Garten: 3 votes, ranked position 7.1
    expect(
      isIndexableDetail({
        overview: "Ina Garten hosts.",
        posterUrl: "https://image.tmdb.org/t/p/w500/p.jpg",
        ratings: { balasaur: 70, imdb: 7.4 },
        streaming: ["Max"],
        numberOfSeasons: 2,
      }),
    ).toBe(true);

    // The Patient: no vote count fetched at all, ranked position 7.5
    expect(
      isIndexableDetail({
        overview: "A therapist is held captive.",
        posterUrl: "https://image.tmdb.org/t/p/w500/p.jpg",
        ratings: { balasaur: 72, imdb: 7.3 },
        streaming: ["Hulu"],
        cast: [1, 2, 3],
        numberOfSeasons: 1,
      }),
    ).toBe(true);
  });

  it("never treats missing data as evidence against a page", () => {
    const known = { ...indexable, voteCount: 3 };
    const unknown = { ...indexable };
    expect(isIndexableDetail(known)).toBe(isIndexableDetail(unknown));
  });
});
