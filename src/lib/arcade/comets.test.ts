import { describe, expect, it } from "bun:test";
import {
  balasaurdlePayout,
  castingCallPayout,
  emojiPayout,
  linkUpPayout,
  posterRevealPayout,
  quoteMatchPayout,
  screeningPayout,
  sequelOrFakePayout,
  speedSortPayout,
  taglinesPayout,
  timelinePayout,
  totalComets,
} from "./comets";
import type { PayoutLine } from "./types";

/** Every line's arithmetic must be reconstructable: count x per = value. */
function expectReconstructable(lines: PayoutLine[]) {
  for (const line of lines) {
    if (line.count !== undefined && line.per !== undefined) {
      expect(line.value).toBe(line.count * line.per);
    }
  }
}

describe("totalComets", () => {
  it("sums line values, including negatives", () => {
    expect(totalComets([])).toBe(0);
    expect(
      totalComets([
        { label: "a", value: 8 },
        { label: "b", count: 2, per: -2, value: -4 },
      ]),
    ).toBe(4);
  });
});

describe("balasaurdlePayout", () => {
  it("pays nothing on a loss", () => {
    expect(totalComets(balasaurdlePayout({ guesses: 6, won: false }))).toBe(0);
  });
  it("pays 12 for a first-guess solve", () => {
    const lines = balasaurdlePayout({ guesses: 1, won: true });
    expectReconstructable(lines);
    expect(totalComets(lines)).toBe(12);
  });
  it("pays 6 for a mid solve with one hint", () => {
    const lines = balasaurdlePayout({ guesses: 3, won: true, hints: 1 });
    expectReconstructable(lines);
    expect(totalComets(lines)).toBe(6);
  });
  it("floors a hint-heavy last-guess win at 2 with a single Solved line", () => {
    const lines = balasaurdlePayout({ guesses: 6, won: true, hints: 3 });
    expectReconstructable(lines);
    expect(totalComets(lines)).toBe(2);
    expect(JSON.stringify(lines)).toBe(JSON.stringify([{ label: "Solved", value: 2 }]));
  });
  it("keeps the hint line when the total stays above the floor", () => {
    const lines = balasaurdlePayout({ guesses: 2, won: true, hints: 1 });
    expectReconstructable(lines);
    expect(totalComets(lines)).toBe(8);
    expect(lines.map((l) => l.label).join(",")).toBe("Solved,Guesses to spare,Hints");
  });
});

describe("posterRevealPayout", () => {
  it("pays nothing on a loss", () => {
    expect(totalComets(posterRevealPayout({ guesses: 6, won: false }))).toBe(0);
  });
  it("pays 6 for a fourth-guess solve", () => {
    const lines = posterRevealPayout({ guesses: 4, won: true });
    expectReconstructable(lines);
    expect(totalComets(lines)).toBe(6);
  });
  it("pays 12 max and 2 min", () => {
    expect(totalComets(posterRevealPayout({ guesses: 1, won: true }))).toBe(12);
    expect(totalComets(posterRevealPayout({ guesses: 6, won: true }))).toBe(2);
  });
});

describe("taglinesPayout and quoteMatchPayout", () => {
  it("pays 0 at zero matches", () => {
    expect(totalComets(taglinesPayout({ matches: 0, clean: false }))).toBe(0);
    expect(totalComets(quoteMatchPayout({ matches: 0, clean: false }))).toBe(0);
  });
  it("pays 6 at three matches", () => {
    const lines = taglinesPayout({ matches: 3, clean: false });
    expectReconstructable(lines);
    expect(totalComets(lines)).toBe(6);
  });
  it("pays 15 for a clean board", () => {
    expect(totalComets(taglinesPayout({ matches: 5, clean: true }))).toBe(15);
    expect(totalComets(quoteMatchPayout({ matches: 5, clean: true }))).toBe(15);
  });
  it("withholds the clean bonus when a wrong commit happened", () => {
    expect(totalComets(taglinesPayout({ matches: 5, clean: false }))).toBe(10);
  });
});

describe("castingCallPayout", () => {
  it("pays 0, 10, and 40 at zero, five, and twenty right calls", () => {
    expect(totalComets(castingCallPayout({ correct: 0 }))).toBe(0);
    const mid = castingCallPayout({ correct: 5 });
    expectReconstructable(mid);
    expect(totalComets(mid)).toBe(10);
    expect(totalComets(castingCallPayout({ correct: 20 }))).toBe(40);
  });
});

describe("linkUpPayout", () => {
  it("pays nothing unsolved", () => {
    expect(totalComets(linkUpPayout({ solved: false, steps: 3, par: 4 }))).toBe(0);
  });
  it("pays 8 flat at par, over par, and under par", () => {
    expect(totalComets(linkUpPayout({ solved: true, steps: 4, par: 4 }))).toBe(8);
    expect(totalComets(linkUpPayout({ solved: true, steps: 6, par: 4 }))).toBe(8);
    expect(JSON.stringify(linkUpPayout({ solved: true, steps: 2, par: 4 }))).toBe(
      JSON.stringify([{ label: "Chain complete", value: 8 }]),
    );
  });
});

describe("timelinePayout", () => {
  it("pays 0, 6, and 15 at zero, three, and five right slots", () => {
    expect(totalComets(timelinePayout({ correctSlots: 0 }))).toBe(0);
    const mid = timelinePayout({ correctSlots: 3 });
    expectReconstructable(mid);
    expect(totalComets(mid)).toBe(6);
    expect(totalComets(timelinePayout({ correctSlots: 5 }))).toBe(15);
  });
});

describe("screeningPayout", () => {
  it("pays 0, 18, and 40 at zero, six, and ten right answers", () => {
    expect(totalComets(screeningPayout({ correct: 0 }))).toBe(0);
    const mid = screeningPayout({ correct: 6 });
    expectReconstructable(mid);
    expect(totalComets(mid)).toBe(18);
    expect(totalComets(screeningPayout({ correct: 10 }))).toBe(40);
  });
});

describe("emojiPayout", () => {
  it("pays 0 with nothing solved", () => {
    expect(totalComets(emojiPayout({ solved: 0, firstTry: 0 }))).toBe(0);
  });
  it("pays 10 for four solves, two on the first guess", () => {
    const lines = emojiPayout({ solved: 4, firstTry: 2 });
    expectReconstructable(lines);
    expect(totalComets(lines)).toBe(10);
  });
  it("pays 24 for eight first-guess solves", () => {
    expect(totalComets(emojiPayout({ solved: 8, firstTry: 8 }))).toBe(24);
  });
});

describe("speedSortPayout", () => {
  it("pays 0 with nothing sorted and no clean bonus for an idle minute", () => {
    expect(totalComets(speedSortPayout({ sorted: 0, missed: 0 }))).toBe(0);
  });
  it("pays 12 for twelve sorts with misses", () => {
    const lines = speedSortPayout({ sorted: 12, missed: 3 });
    expectReconstructable(lines);
    expect(totalComets(lines)).toBe(12);
  });
  it("pays 35 for a clean thirty", () => {
    expect(totalComets(speedSortPayout({ sorted: 30, missed: 0 }))).toBe(35);
  });
});

describe("sequelOrFakePayout", () => {
  it("pays 0, 6, and 20 at zero, six, and a fifteen streak", () => {
    expect(totalComets(sequelOrFakePayout({ correct: 0, bestStreak: 0 }))).toBe(0);
    const mid = sequelOrFakePayout({ correct: 6, bestStreak: 6 });
    expectReconstructable(mid);
    expect(totalComets(mid)).toBe(6);
    expect(totalComets(sequelOrFakePayout({ correct: 15, bestStreak: 15 }))).toBe(20);
  });
  it("withholds the streak bonus under ten", () => {
    expect(totalComets(sequelOrFakePayout({ correct: 9, bestStreak: 9 }))).toBe(9);
  });
});
