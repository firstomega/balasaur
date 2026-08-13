import { describe, expect, it } from "bun:test";
import { titleProse, divergenceNote, normalizedSources, type TitleProseInput } from "./titleProse";

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
});

describe("divergenceNote", () => {
  it("names the split only when it clears the noise band", () => {
    expect(divergenceNote({ imdb: 8.1, metacritic: 74 })).toBe(null);
    expect(divergenceNote({ imdb: 8.5, metacritic: 48 })).toBe(
      "Audiences rate it 37 points higher than critics do.",
    );
    expect(divergenceNote({ imdb: 5.0, metacritic: 88 })).toBe(
      "Critics rate it 38 points higher than audiences do.",
    );
  });

  it("returns null when either side is missing", () => {
    expect(divergenceNote({ imdb: 8.1 })).toBe(null);
    expect(divergenceNote({ metacritic: 74 })).toBe(null);
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

  it("claims a catalog comparison only outside the noise band", () => {
    expect(titleProse(movie)).toContain("well above the catalog median of 62");
    expect(titleProse({ ...movie, ratings: { ...movie.ratings, balasaur: 70 } })).not.toContain(
      "catalog median",
    );
    expect(titleProse({ ...movie, ratings: { ...movie.ratings, balasaur: 40 } })).toContain(
      "well below the catalog median",
    );
  });

  it("reports vote weight only when there is real weight behind it", () => {
    expect(titleProse(movie)).toContain("340,000 votes");
    expect(titleProse({ ...movie, voteCount: 12 })).not.toContain("votes");
    expect(titleProse({ ...movie, voteCount: 2_400_000 })).toContain("2.4M votes");
  });

  it("describes runtime in bands rather than raw minutes alone", () => {
    expect(titleProse(movie)).toContain("Running time is 1h 57m.");
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
      "5 seasons across 62 episodes so far.",
    );
    expect(
      titleProse({
        ...tv,
        completionStatus: "Returning Series",
        numberOfSeasons: 1,
        numberOfEpisodes: 0,
      }),
    ).toContain("1 season so far.");
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

  it("states awards flatly, and says nothing when there are none", () => {
    expect(titleProse({ ...movie, awardWinner: true })).toContain("won at least one major award");
    expect(titleProse({ ...movie, awardNominee: true })).toContain("nominated for a major award");
    expect(titleProse(movie)).not.toContain("award");
  });

  it("degrades to nothing rather than padding when there is no data", () => {
    expect(titleProse({ mediaType: "movie", title: "Unknown", ratings: {} })).toBe("");
  });
});
