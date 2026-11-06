import { describe, expect, it } from "bun:test";
import { rankByShownScore } from "./sharedRank";

const rank = (scores: (number | null)[]) =>
  rankByShownScore(
    scores.map((s, i) => ({ id: i, s })),
    (x) => x.s,
  ).map((r) => [r.item.id, r.rank]);

describe("rankByShownScore", () => {
  it("gives equal scores one rank and skips the places they hold", () => {
    // The top of Action Movies on Netflix, 2026-11-05.
    expect(rank([87, 85, 84, 84, 84, 83, 83, 83, 83, 82])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 3],
      [4, 3],
      [5, 6],
      [6, 6],
      [7, 6],
      [8, 6],
      [9, 10],
    ]);
  });

  it("orders by the shown score when the stored order drifted, keeping ties stable", () => {
    expect(rank([81, 80, 81, 79])).toEqual([
      [0, 1],
      [2, 1],
      [1, 3],
      [3, 4],
    ]);
  });

  it("puts rows without a shown score last, each on its own place", () => {
    expect(rank([null, 90, null, 90])).toEqual([
      [1, 1],
      [3, 1],
      [0, 3],
      [2, 4],
    ]);
  });

  it("handles an empty list", () => {
    expect(rank([])).toEqual([]);
  });
});
