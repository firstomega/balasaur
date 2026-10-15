import { describe, expect, it } from "bun:test";
import { titleProse, normalizedSources, runtimeLabel, type TitleProseInput } from "./titleProse";

const movie: TitleProseInput = {
  mediaType: "movie",
  title: "Example Film",
  year: "2014",
  genres: ["Thriller"],
  streaming: ["Netflix"],
  runtime: 117,
  voteCount: 340000,
  awardWinner: false,
  ratings: { balasaur: 84, imdb: 8.1, rottenTomatoes: 96, metacritic: 74 },
};

describe("normalizedSources", () => {
  it("puts every source on a 0 to 100 scale while showing native units", () => {
    const s = normalizedSources({ imdb: 8.1, rottenTomatoes: 96, metacritic: 74 });
    expect(s.map((x) => x.pct).join(",")).toBe("81,96,74");
    expect(s[0].shown).toBe("8.1/10");
    expect(s[1].shown).toBe("96%");
  });

  it("uses TMDB only when IMDb is absent, so the audience axis is never doubled", () => {
    expect(normalizedSources({ imdb: 8.1, tmdb: 7.9 }).length).toBe(1);
    expect(normalizedSources({ tmdb: 7.9 })[0].label).toBe("TMDB");
  });

  it("prints ten-point scores with one decimal, the way IMDb does", () => {
    // Birds of Prey sits at a flat 6 on IMDb, which IMDb itself prints as 6.0.
    expect(normalizedSources({ imdb: 6 })[0].shown).toBe("6.0/10");
    expect(normalizedSources({ tmdb: 8 })[0].shown).toBe("8.0/10");
  });
});

describe("runtimeLabel", () => {
  it("drops the minutes on the hour and the hours under one", () => {
    expect(runtimeLabel(148)).toBe("2h 28m");
    expect(runtimeLabel(120)).toBe("2h");
    expect(runtimeLabel(48)).toBe("48m");
  });
});

describe("titleProse", () => {
  it("opens with the score and the sources behind it", () => {
    expect(titleProse(movie)).toStartWith(
      "A Balasaur Score of 84 out of 100, drawn from IMDb 8.1/10, Rotten Tomatoes 96%, Metacritic 74/100.",
    );
  });

  it("never contains an em-dash", () => {
    expect(titleProse(movie)).not.toContain("—");
  });

  it("never measures a title against the catalog median, a scale nobody holds", () => {
    expect(titleProse(movie)).not.toContain("catalog median");
    expect(titleProse({ ...movie, ratings: { ...movie.ratings, balasaur: 40 } })).not.toContain(
      "catalog median",
    );
  });

  it("says the sources agree only when they are genuinely tight", () => {
    // 81, 96, 74 spans 22 points. Not agreement, so: nothing.
    expect(titleProse(movie)).not.toContain("Every source");

    const tight = titleProse({
      ...movie,
      ratings: { balasaur: 78, imdb: 7.8, rottenTomatoes: 80, metacritic: 75 },
    });
    expect(tight).toContain("Every source lands within 5 points of the others");
  });

  it("attaches the vote count to the agreement claim, not as its own sentence", () => {
    const tight = titleProse({
      ...movie,
      voteCount: 3641,
      ratings: { balasaur: 78, imdb: 7.8, rottenTomatoes: 80, metacritic: 75 },
    });
    // 3,641 rounds to 3,600, not 4,000: a reader can check this in one click.
    expect(tight).toContain("across 3,600 audience votes.");
    expect(
      titleProse({
        ...movie,
        voteCount: 12,
        ratings: { balasaur: 78, imdb: 7.8, rottenTomatoes: 80, metacritic: 75 },
      }),
    ).not.toContain("votes");
  });

  it("mentions runtime only at the extremes", () => {
    expect(titleProse(movie)).not.toContain("1h 57m");
    expect(titleProse({ ...movie, runtime: 168 })).toContain("runs long at 2h 48m");
    expect(titleProse({ ...movie, runtime: 82 })).toContain("compact 1h 22m");
  });

  it("describes a finished series as finished, and an ongoing one honestly", () => {
    const tv: TitleProseInput = {
      ...movie,
      mediaType: "tv",
      runtime: undefined,
      numberOfSeasons: 5,
      numberOfEpisodes: 62,
      completionStatus: "Ended",
    };
    expect(titleProse(tv)).toContain(
      "The series ran 5 seasons across 62 episodes and has finished, so there is no cliffhanger risk.",
    );
    expect(titleProse({ ...tv, completionStatus: "Returning Series" })).toContain(
      "5 seasons across 62 episodes so far, still running.",
    );
    expect(
      titleProse({
        ...tv,
        completionStatus: "Returning Series",
        numberOfSeasons: 1,
        numberOfEpisodes: 0,
      }),
    ).toContain("1 season so far, still running.");
  });

  it("lists streaming services with readable grammar", () => {
    expect(titleProse(movie)).toContain("Streaming on Netflix.");
    expect(titleProse({ ...movie, streaming: ["Netflix", "Hulu"] })).toContain(
      "Streaming on Netflix and Hulu.",
    );
    expect(titleProse({ ...movie, streaming: ["Netflix", "Hulu", "Max"] })).toContain(
      "Streaming on Netflix, Hulu, and Max.",
    );
    expect(titleProse({ ...movie, streaming: [] })).not.toContain("Streaming on");
  });

  it("makes no award claim, because the flag behind it does not mean 'major'", () => {
    // `award_winner` is true for any OMDb-reported win, craft and festival
    // prizes included. Jurassic World Rebirth trips it with an empty list of
    // named awards. Until awards_won reaches the payload, the page says nothing.
    expect(titleProse({ ...movie, awardWinner: true })).not.toContain("award");
    expect(titleProse({ ...movie, awardNominee: true })).not.toContain("award");
  });

  it("caps the paragraph, and never at the cost of the streaming line", () => {
    const loaded = titleProse({
      ...movie,
      runtime: 168,
      streaming: ["Netflix", "Hulu"],
      ratings: { balasaur: 78, imdb: 7.8, rottenTomatoes: 80, metacritic: 75 },
      franchise: { size: 4, rank: 2 },
    });
    expect(loaded.split(". ").length).toBeLessThanOrEqual(5);
    expect(loaded).toContain("Streaming on Netflix and Hulu.");
  });

  it("degrades to nothing rather than padding when there is no data", () => {
    expect(titleProse({ mediaType: "movie", title: "Unknown", ratings: {} })).toBe("");
  });
});

describe("titleProse never sets critics against audiences", () => {
  it("says nothing about a gap between the critic and audience numbers", () => {
    // Inception: IMDb 8.8 against Metacritic 74 used to print "Audiences rate
    // it 14 points higher than critics do." The numbers are on the page; the
    // sentence manufactured a tension nobody came to read about.
    const inception = titleProse({
      ...movie,
      ratings: { balasaur: 84, imdb: 8.8, rottenTomatoes: 86, metacritic: 74 },
    });
    const wide = titleProse({ ...movie, ratings: { balasaur: 60, imdb: 8.5, metacritic: 48 } });
    for (const out of [inception, wide]) {
      expect(/\bcritics?\b|\baudiences\b|points higher/i.test(out)).toBe(false);
    }
  });
});

describe("titleProse catalog and franchise claims", () => {
  const base = {
    mediaType: "movie",
    title: "X",
    ratings: { balasaur: 84, imdb: 8.4, rottenTomatoes: 90 },
  };

  it("never ranks a title against a slice of the catalog", () => {
    // "Scores higher than 99% of the 2,072 2010s action movies in this
    // catalog" measured against a shelf nobody holds in their head. The
    // payload still carries the cohort, and the prose ignores it.
    const withCohort = {
      ...base,
      cohort: { label: "2010s action movies", size: 2072, percentile: 99 },
    } as TitleProseInput;
    const out = titleProse(withCohort);
    expect(out).not.toContain("in this catalog");
    expect(/higher than \d+%/.test(out)).toBe(false);
    // The low end went with it: "Most of the 800 1990s comedy movies in this
    // catalog score higher" ranked against the same unheld shelf.
    const low = titleProse({
      ...base,
      ratings: { balasaur: 40, imdb: 4.2, rottenTomatoes: 38 },
      cohort: { label: "1990s comedy movies", size: 800, percentile: 12 },
    } as TitleProseInput);
    expect(low).not.toContain("in this catalog");
    expect(low).not.toContain("score higher");
    // Nor on one source, nor on a score the page hides.
    const single = titleProse({
      mediaType: "movie",
      title: "X",
      ratings: { balasaur: 83, tmdb: 8.3 },
      cohort: { label: "2020s action movies", size: 2035, percentile: 96 },
    } as TitleProseInput);
    expect(single).not.toContain("in this catalog");
    const thinShelf = titleProse({
      ...base,
      voteCount: 3,
      cohort: { label: "2010s action movies", size: 2072, percentile: 99 },
    } as TitleProseInput);
    expect(thinShelf).not.toContain("in this catalog");
  });

  it("does not rank a title whose score the page hides", () => {
    // Two sources but three votes: no badge, so no "Number 1 of 4" either.
    const thin = titleProse({
      ...base,
      voteCount: 3,
      franchise: { size: 4, rank: 1 },
    });
    expect(thin).not.toContain("its series");
    // One source with a crowd behind it is shown, so it may be ranked in its series.
    const crowd = titleProse({
      mediaType: "tv",
      title: "X",
      voteCount: 2956,
      ratings: { tmdb: 8.0 },
      franchise: { size: 3, rank: 1 },
    });
    expect(crowd).toContain("The highest scoring of the 3 titles in its series.");
  });

  it("does not state a score the page hides, even when the caller passes one", () => {
    // A one-vote TMDB 10 blends to 100. The badge is hidden, so is the sentence.
    const oneVote = titleProse({
      mediaType: "movie",
      title: "X",
      voteCount: 1,
      ratings: { balasaur: 100, tmdb: 10 },
    });
    expect(oneVote).not.toContain("Balasaur Score");
    const thin = titleProse({ ...base, voteCount: 3 });
    expect(thin).not.toContain("Balasaur Score");
    expect(titleProse({ ...base, voteCount: 30 })).toContain("A Balasaur Score of 84 out of 100");
  });

  it("names franchise standing", () => {
    const first = titleProse({ ...base, franchise: { size: 3, rank: 1 } });
    expect(first).toContain("The highest scoring of the 3 titles in its series.");
    const second = titleProse({ ...base, franchise: { size: 6, rank: 3 } });
    expect(second).toContain("Number 3 of 6 in its series by score.");
    const solo = titleProse({ ...base, franchise: { size: 1, rank: 1 } });
    expect(solo).not.toContain("its series");
  });
});
