import { describe, expect, it } from "bun:test";
import {
  buildEpisodeHeatmap,
  peakTroughSentence,
  ratingBand,
  summarizeSeasons,
  type EpisodeRating,
  type SeasonSize,
} from "./episodes";

/** Build a season of episodes with the given ratings, in order. */
function season(n: number, ratings: number[]): EpisodeRating[] {
  return ratings.map((rating, i) => ({
    season: n,
    episode: i + 1,
    rating,
    votes: 100 + i,
    airDate: `2011-04-${String(17 + i).padStart(2, "0")}`,
    name: `S${n}E${i + 1}`,
  }));
}

function sizes(...pairs: [number, number][]): SeasonSize[] {
  return pairs.map(([seasonNumber, episodeCount]) => ({ seasonNumber, episodeCount }));
}

describe("ratingBand", () => {
  it("puts each rating in the band its legend claims", () => {
    expect(ratingBand(9.6)).toBe(4);
    expect(ratingBand(9)).toBe(4);
    expect(ratingBand(8.9)).toBe(3);
    expect(ratingBand(8)).toBe(3);
    expect(ratingBand(7.9)).toBe(2);
    expect(ratingBand(7)).toBe(2);
    expect(ratingBand(6.9)).toBe(1);
    expect(ratingBand(6)).toBe(1);
    expect(ratingBand(5.9)).toBe(0);
    expect(ratingBand(0.1)).toBe(0);
  });
});

describe("summarizeSeasons", () => {
  it("averages what it was given and counts the cells it will draw", () => {
    const out = summarizeSeasons(
      [...season(1, [8, 9]), ...season(2, [7, 7, 7])],
      sizes([1, 2], [2, 3]),
    );
    expect(out.map((s) => s.season).join()).toBe("1,2");
    expect(out[0].average).toBe(8.5);
    expect(out[0].rated).toBe(2);
    expect(out[0].expected).toBe(2);
    expect(out[1].average).toBe(7);
    expect(out[1].rated).toBe(3);
  });

  it("orders seasons and episodes even when the rows arrive shuffled", () => {
    const rows = [...season(2, [7, 8]), ...season(1, [9, 6])].reverse();
    const out = summarizeSeasons(rows, sizes([1, 2], [2, 2]));
    expect(out.map((s) => s.season).join()).toBe("1,2");
    expect(out[0].episodes.map((e) => e.episode).join()).toBe("1,2");
  });

  it("rounds the average to the one decimal the sentence prints", () => {
    const out = summarizeSeasons(season(1, [8.1, 8.2, 8.3, 9.1]), sizes([1, 4]));
    expect(out[0].average).toBe(8.4);
  });

  it("drops specials, unrated rows and duplicates", () => {
    const rows: EpisodeRating[] = [
      { season: 0, episode: 1, rating: 9, votes: 10, airDate: null, name: "Special" },
      { season: 1, episode: 1, rating: 0, votes: 0, airDate: null, name: "Unrated" },
      ...season(1, [8, 9]),
      { season: 1, episode: 1, rating: 2, votes: 5, airDate: null, name: "Duplicate" },
    ];
    const out = summarizeSeasons(rows, sizes([1, 2]));
    expect(out.length).toBe(1);
    expect(out[0].rated).toBe(2);
    expect(out[0].average).toBe(8.5);
  });

  it("keeps a season the catalog row has not heard of yet", () => {
    const out = summarizeSeasons([...season(1, [8, 8]), ...season(2, [9])], sizes([1, 2]));
    expect(out.map((s) => s.season).join()).toBe("1,2");
    expect(out[1].expected).toBe(1);
  });
});

describe("peakTroughSentence", () => {
  it("names the peak and the trough with numbers the grid can be checked against", () => {
    const seasons = summarizeSeasons(
      [
        ...season(1, [8, 8]),
        ...season(4, [9.4, 9.4, 9.4, 9.4, 9.4, 9.4, 9.4, 9.4, 9.4, 9.4]),
        ...season(6, [7.1, 7.1]),
      ],
      sizes([1, 2], [4, 10], [6, 2]),
    );
    expect(peakTroughSentence(seasons)).toBe(
      "Season 4 is the peak: 9.4 average across 10 episodes. Season 6 drops to 7.1.",
    );
  });

  it("says episode, not episodes, for a one episode season", () => {
    const seasons = summarizeSeasons(
      [...season(1, [9.2]), ...season(2, [6, 6])],
      sizes([1, 1], [2, 2]),
    );
    expect(peakTroughSentence(seasons)).toBe(
      "Season 1 is the peak: 9.2 average across 1 episode. Season 2 drops to 6.0.",
    );
  });

  it("drops the second sentence when every season averages the same", () => {
    const seasons = summarizeSeasons(
      [...season(1, [8, 8]), ...season(2, [8, 8])],
      sizes([1, 2], [2, 2]),
    );
    expect(peakTroughSentence(seasons)).toBe(
      "Season 1 is the peak: 8.0 average across 2 episodes.",
    );
  });

  it("prints a trailing zero so the number reads as a rating", () => {
    const seasons = summarizeSeasons(
      [...season(1, [9, 9]), ...season(2, [7, 7])],
      sizes([1, 2], [2, 2]),
    );
    expect(peakTroughSentence(seasons)).toContain("9.0 average");
    expect(peakTroughSentence(seasons)).toContain("drops to 7.0");
  });

  it("uses no em-dash", () => {
    const seasons = summarizeSeasons(
      [...season(1, [9, 9]), ...season(2, [7, 7])],
      sizes([1, 2], [2, 2]),
    );
    expect(peakTroughSentence(seasons)).not.toContain("—");
  });

  it("returns nothing for nothing", () => {
    expect(peakTroughSentence([])).toBe("");
  });
});

describe("buildEpisodeHeatmap coverage gate", () => {
  it("renders a show with full coverage across two seasons", () => {
    const map = buildEpisodeHeatmap(
      [...season(1, [8, 8.6]), ...season(2, [9, 9.2])],
      sizes([1, 2], [2, 2]),
    );
    expect(map === null).toBe(false);
    expect(map!.rated).toBe(4);
    expect(map!.expected).toBe(4);
    expect(map!.coverage).toBe(1);
    expect(map!.peak.season).toBe(2);
    expect(map!.trough.season).toBe(1);
    expect(map!.longestSeason).toBe(2);
  });

  it("refuses a show rated in only one season", () => {
    expect(buildEpisodeHeatmap(season(1, [8, 9]), sizes([1, 2], [2, 2]))).toBe(null);
  });

  it("refuses a show under 60% covered", () => {
    // 6 rated of 12 the show is meant to have.
    const map = buildEpisodeHeatmap(
      [...season(1, [8, 8, 8]), ...season(2, [9, 9, 9])],
      sizes([1, 6], [2, 6]),
    );
    expect(map).toBe(null);
  });

  it("takes a show at exactly 60%", () => {
    // 6 rated of 10.
    const map = buildEpisodeHeatmap(
      [...season(1, [8, 8, 8]), ...season(2, [9, 9, 9])],
      sizes([1, 5], [2, 5]),
    );
    expect(map === null).toBe(false);
    expect(map!.coverage).toBeCloseTo(0.6, 5);
  });

  it("counts seasons with no ratings at all against coverage", () => {
    // Two fully rated seasons, six unrated ones: the grid would show a third of the show.
    const map = buildEpisodeHeatmap(
      [...season(1, [8, 8, 8, 8, 8]), ...season(2, [9, 9, 9, 9, 9])],
      sizes([1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5]),
    );
    expect(map).toBe(null);
  });

  it("refuses when the show's episode count is unknown", () => {
    // No sizes means no denominator, and 100% coverage of what we happen to
    // hold is not a claim worth making.
    expect(buildEpisodeHeatmap([...season(1, [8, 8]), ...season(2, [9, 9])], [])).toBe(null);
    expect(buildEpisodeHeatmap([], sizes([1, 10], [2, 10]))).toBe(null);
  });

  it("still renders when one season is newer than the catalog row", () => {
    const map = buildEpisodeHeatmap(
      [...season(1, [8, 8]), ...season(2, [9, 9])],
      sizes([1, 2]), // season 2 not in the stored seasons yet
    );
    expect(map === null).toBe(false);
    expect(map!.expected).toBe(4);
  });

  it("carries the sentence it will print", () => {
    const map = buildEpisodeHeatmap(
      [...season(1, [8, 8]), ...season(2, [9.5, 9.5])],
      sizes([1, 2], [2, 2]),
    );
    expect(map!.sentence).toBe(
      "Season 2 is the peak: 9.5 average across 2 episodes. Season 1 drops to 8.0.",
    );
  });
});
