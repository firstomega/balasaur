import { describe, expect, it } from "bun:test";
import { personProse } from "./personProse";

describe("personProse", () => {
  it("states the best decade as a comparison with the runner-up", () => {
    const out = personProse("Tom Hanks", {
      titles: 80,
      bestDecade: {
        decade: "1990s",
        median: 82,
        titles: 9,
        runnerUp: { decade: "2010s", median: 77, titles: 8 },
      },
      top: [],
    });
    expect(out).toBe(
      "Tom Hanks's 1990s titles rate highest: a median Balasaur Score of 82 across 9, against 77 for the 2010s.",
    );
    expect(out).not.toContain("—");
  });

  it("no longer prints a filmography-wide median, a title count or co-stars", () => {
    const out = personProse("Tom Hanks", { titles: 80, top: [] });
    expect(out).toBe("");
    expect(out).not.toContain("median");
    expect(out).not.toContain("alongside");
  });
});
