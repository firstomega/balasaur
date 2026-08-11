import { describe, expect, it } from "bun:test";
import {
  isNotInterested,
  primaryOf,
  recordForNotInterested,
  recordForSentiment,
  recordForSkip,
  recordForWant,
  recordForWatched,
  sentimentOf,
} from "./userStatus";

describe("two-axis status model", () => {
  it("maps records to primary states", () => {
    expect(primaryOf(recordForWant())).toBe("want");
    expect(primaryOf(recordForWatched())).toBe("watched");
    expect(primaryOf(recordForSkip())).toBe(null);
    expect(primaryOf(recordForNotInterested())).toBe(null);
    expect(primaryOf(undefined)).toBe(null);
  });

  it("Watched PRESERVES existing sentiment (the old Like→Watched downgrade bug)", () => {
    const liked = recordForSentiment(undefined, "liked");
    expect(sentimentOf(recordForWatched(liked))).toBe("liked");
    // ...but does not carry sentiment over from a non-watched record
    expect(sentimentOf(recordForWatched(recordForWant()))).toBe(null);
    expect(sentimentOf(recordForWatched())).toBe(null);
  });

  it("sentiment toggles: same again clears, different swaps", () => {
    const liked = recordForSentiment(undefined, "liked");
    expect(sentimentOf(liked)).toBe("liked");
    const cleared = recordForSentiment(liked, "liked");
    expect(sentimentOf(cleared)).toBe(null);
    expect(primaryOf(cleared)).toBe("watched"); // still watched
    expect(sentimentOf(recordForSentiment(liked, "disliked"))).toBe("disliked");
  });

  it("sentiment implies watched", () => {
    expect(primaryOf(recordForSentiment(recordForWant(), "liked"))).toBe("watched");
  });

  it("not-interested is its own signal, not a primary", () => {
    const rec = recordForNotInterested();
    expect(isNotInterested(rec)).toBe(true);
    expect(primaryOf(rec)).toBe(null);
    expect(isNotInterested(recordForWant())).toBe(false);
  });
});
