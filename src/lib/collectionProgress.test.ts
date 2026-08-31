import { describe, expect, it } from "bun:test";
import { collectionProgressLine, collectionCountLine } from "./collectionProgress";

const line = (seen: number, want: number, total = 60) =>
  collectionProgressLine({ total, seen, want });

describe("collectionProgressLine", () => {
  it("says nothing when the visitor has no history on the shelf", () => {
    expect(line(0, 0)).toBe(null);
  });

  it("falls back to the watchlist before anything is watched", () => {
    expect(line(0, 3)).toBe("3 on your watchlist");
    expect(line(0, 1)).toBe("1 on your watchlist");
  });

  it("counts up while the shelf is mostly unwatched", () => {
    expect(line(1, 0)).toBe("You have seen 1 of 60");
    expect(line(8, 0)).toBe("You have seen 8 of 60");
    expect(line(29, 0)).toBe("You have seen 29 of 60");
  });

  it("flips to what is left once fewer remain than are seen", () => {
    // 30 seen of 60 leaves 30: the remaining pile is now the smaller number
    // and the one a person is tracking.
    expect(line(30, 0)).toBe("30 left to see");
    expect(line(52, 0)).toBe("8 left to see");
    expect(line(59, 0)).toBe("1 left to see");
  });

  it("has one sentence for a finished shelf", () => {
    expect(line(60, 0)).toBe("You have seen all 60");
  });

  it("prefers what you watched over what you saved", () => {
    expect(line(5, 40)).toBe("You have seen 5 of 60");
  });

  it("never exceeds the shelf, however odd the input", () => {
    expect(line(999, 0)).toBe("You have seen all 60");
    expect(line(-4, -4)).toBe(null);
    expect(collectionProgressLine({ total: 0, seen: 0, want: 0 })).toBe(null);
  });

  it("handles a one-title shelf without reading oddly", () => {
    expect(line(1, 0, 1)).toBe("You have seen all 1");
    expect(line(0, 1, 1)).toBe("1 on your watchlist");
  });
});

describe("collectionCountLine", () => {
  it("states the size, which is the number the old line was mistaken for", () => {
    expect(collectionCountLine(60)).toBe("60 titles");
    expect(collectionCountLine(1)).toBe("1 title");
    expect(collectionCountLine(1200)).toBe("1,200 titles");
  });
});
