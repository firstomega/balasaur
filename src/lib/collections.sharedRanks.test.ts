import { describe, expect, it } from "bun:test";
import { sharedRanks, type ListScoreRow } from "./collections.functions";

// A row whose shown score is exactly `score`: IMDb and TMDB both at score/10
// blend to score, two sources and enough votes pass the trust rule.
const row = (id: string, rank: number, score: number | null): ListScoreRow => ({
  media_id: id,
  rank,
  media:
    score === null
      ? {
          rating_imdb: null,
          rating_rotten_tomatoes: null,
          rating_metacritic: null,
          rating_tmdb: 9,
          vote_count: 3,
        }
      : {
          rating_imdb: score / 10,
          rating_rotten_tomatoes: null,
          rating_metacritic: null,
          rating_tmdb: score / 10,
          vote_count: 400,
        },
});

describe("sharedRanks: the rank a title page prints for a list", () => {
  it("gives tied scores one rank, the number the list page prints", () => {
    const ranks = sharedRanks([row("a", 1, 90), row("b", 2, 88), row("c", 3, 88), row("d", 4, 85)]);
    expect(ranks).toEqual([
      { id: "a", rank: 1 },
      { id: "b", rank: 2 },
      { id: "c", rank: 2 },
      { id: "d", rank: 4 },
    ]);
  });

  it("orders by the shown score when a saved position has drifted", () => {
    // Saved #2 now scores above saved #1: the list page puts it first.
    const ranks = sharedRanks([row("a", 1, 80), row("b", 2, 81)]);
    expect(ranks.map((r) => r.id)).toEqual(["b", "a"]);
    expect(ranks.find((r) => r.id === "a")?.rank).toBe(2);
  });

  it("reads rows in saved order whatever order they arrive in", () => {
    const ranks = sharedRanks([row("c", 3, 88), row("a", 1, 90), row("b", 2, 88)]);
    expect(ranks.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("drops rows whose title is gone, as the list page does", () => {
    const gone: ListScoreRow = { media_id: "x", rank: 1, media: null };
    const ranks = sharedRanks([gone, row("a", 2, 90), row("b", 3, 85)]);
    expect(ranks).toEqual([
      { id: "a", rank: 1 },
      { id: "b", rank: 2 },
    ]);
  });

  it("puts a row with no shown score after every scored row, untied", () => {
    const ranks = sharedRanks([row("a", 1, null), row("b", 2, 70), row("c", 3, null)]);
    expect(ranks).toEqual([
      { id: "b", rank: 1 },
      { id: "a", rank: 2 },
      { id: "c", rank: 3 },
    ]);
  });
});
