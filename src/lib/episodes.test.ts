import { rampWindow } from "@/components/balasaur/EpisodeHeatmap";
import { describe, expect, it } from "bun:test";
import {
  buildEpisodeHeatmap,
  peakTroughSentence,
  ratingScale,
  scaleBand,
  RAMP_MIN_SPREAD,
  RAMP_STEPS,
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

/** The ratings of one flat list of episodes, for the scale tests. */
function ramp(from: number, to: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

describe("ratingScale", () => {
  it("spends the whole ramp on the band this show's episodes actually live in", () => {
    const scale = ratingScale(ramp(7, 9.4, 40));
    expect(scale.lo).toBeGreaterThan(6.9);
    expect(scale.hi).toBeLessThan(9.5);
    expect(scale.hi - scale.lo).toBeGreaterThan(RAMP_MIN_SPREAD);
  });

  it("refuses to exaggerate a show whose episodes are all the same", () => {
    // Every episode between 9.2 and 9.5. Without a floor on the spread the
    // 9.2s would be painted the darkest step, which is a lie told by arithmetic.
    const scale = ratingScale(ramp(9.2, 9.5, 20));
    expect(scale.hi - scale.lo).toBeCloseTo(RAMP_MIN_SPREAD, 5);
    const bands = ramp(9.2, 9.5, 20).map((r) => scaleBand(r, scale));
    expect(Math.max(...bands) - Math.min(...bands) <= 1).toBe(true);
    expect(Math.min(...bands) >= 4).toBe(true);
  });

  it("keeps the window inside 0 to 10 without narrowing it", () => {
    const scale = ratingScale(ramp(9.7, 10, 20));
    expect(scale.hi).toBe(10);
    expect(scale.hi - scale.lo).toBeCloseTo(RAMP_MIN_SPREAD, 5);
    expect(ratingScale([0.2, 0.2, 0.3]).lo).toBe(0);
  });

  it("does not let one review-bombed episode flatten the rest", () => {
    // Nineteen episodes between 8.4 and 9.2, and one 2.1 finale.
    const withBomb = [...ramp(8.4, 9.2, 19), 2.1];
    const scale = ratingScale(withBomb);
    expect(scale.lo).toBeGreaterThan(7.5);
    expect(scaleBand(2.1, scale)).toBe(0);
    // The 8.4 and the 9.2 still land in different steps.
    expect(scaleBand(9.2, scale)).toBeGreaterThan(scaleBand(8.4, scale));
  });

  it("puts the ends of the ramp at the ends of the scale", () => {
    const scale = ratingScale(ramp(6, 9, 50));
    expect(scaleBand(scale.lo, scale)).toBe(0);
    expect(scaleBand(scale.hi, scale)).toBe(RAMP_STEPS - 1);
    expect(scaleBand(scale.lo - 3, scale)).toBe(0);
    expect(scaleBand(scale.hi + 3, scale)).toBe(RAMP_STEPS - 1);
  });

  it("never goes backwards", () => {
    const scale = ratingScale(ramp(5.5, 9.6, 60));
    let last = -1;
    for (const r of ramp(4, 10, 200)) {
      const band = scaleBand(r, scale);
      expect(band >= last).toBe(true);
      last = band;
    }
  });

  it("survives an empty list and a flat one", () => {
    expect(ratingScale([]).lo).toBe(0);
    expect(ratingScale([]).hi).toBe(10);
    const flat = ratingScale([8, 8, 8]);
    expect(flat.hi - flat.lo).toBeCloseTo(RAMP_MIN_SPREAD, 5);
    expect(scaleBand(8, flat)).toBe(3);
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
    // The ramp is cut from this show's own four episodes, not from 0 to 10.
    expect(map!.scale.hi - map!.scale.lo >= RAMP_MIN_SPREAD).toBe(true);
    expect(map!.scale.hi <= 10).toBe(true);
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

describe("rampWindow", () => {
  // Hue has to keep meaning the same thing on every page. Regression for a
  // grade finding: a show whose worst season averaged 7.2 was painted in
  // red-brown and read as a disaster before the eye reached the legend.
  it("lifts the ramp off red for a show that is never bad", () => {
    expect(rampWindow(7.2)).toBe(2);
    expect(rampWindow(8.4)).toBe(2);
  });

  it("keeps red for a show that earns it", () => {
    expect(rampWindow(2.1)).toBe(0);
    expect(rampWindow(3.0)).toBe(0);
  });

  it("moves with the floor in between", () => {
    expect(rampWindow(5.0)).toBe(2);
    expect(rampWindow(4.0)).toBe(1);
  });
});
