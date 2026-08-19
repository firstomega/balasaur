import { describe, expect, it } from "bun:test";
import { personProse } from "./personProse";

describe("personProse", () => {
  it("states counts, median, best decade, and collaborators as flat facts", () => {
    const out = personProse("Tom Hanks", {
      titles: 80,
      scored: 78,
      medianScore: 73,
      bestDecade: "1990s",
      bestDecadeMedian: 78,
      bestDecadeTitles: 14,
      collaborators: [
        { name: "Tim Allen", together: 13 },
        { name: "Joan Cusack", together: 8 },
        { name: "Steven Spielberg", together: 8 },
      ],
    });
    expect(out).toContain(
      "80 titles in this catalog, 78 of them scored with a median Balasaur Score of 73.",
    );
    expect(out).toContain("The 1990s rate best: median 78 across 14 titles.");
    expect(out).toContain(
      "Tom Hanks appears most often alongside Tim Allen (13 titles), Joan Cusack (8), Steven Spielberg (8).",
    );
    expect(out).not.toContain("—");
  });

  it("omits the decade line when the best decade does not beat the overall median", () => {
    const out = personProse("X", {
      titles: 10,
      scored: 10,
      medianScore: 70,
      bestDecade: "2000s",
      bestDecadeMedian: 70,
      bestDecadeTitles: 5,
      collaborators: [],
    });
    expect(out).toBe("10 titles in this catalog with a median Balasaur Score of 70.");
  });

  it("stays quiet on a thin filmography", () => {
    expect(
      personProse("X", { titles: 2, scored: 2, medianScore: 50, collaborators: [] }),
    ).toBe("");
  });
});
