import { describe, expect, it } from "bun:test";
import { collectionDek, type CollectionRow, type DekTopItem } from "./collectionsProse";

const base: CollectionRow = {
  slug: "best-on-netflix",
  kind: "service",
  title: "The Best on Netflix Right Now",
  item_count: 60,
  top_score: 92,
  median_score: 74,
  newest_title: "The Latest Thing",
  newest_date: "2026-07-04",
};

const top: DekTopItem[] = [
  { title: "Alpha", score: 92 },
  { title: "Beta", score: 88 },
  { title: "Gamma", score: 84 },
];

describe("collectionDek", () => {
  it("opens on the leaders, not on the count or the sort order", () => {
    const dek = collectionDek(base, top);
    expect(dek).toStartWith("Alpha leads at 92");
  });

  // The page renders the count as a chip and links "Ranked by Balasaur Score"
  // to /methodology right below the dek, so restating either here was both
  // redundant and byte-identical across every shelf.
  it("never restates the count, the sort order, or the score definition", () => {
    const dek = collectionDek(base, top);
    expect(dek).not.toContain("made the cut");
    expect(dek).not.toContain("highest Balasaur Score to lowest");
    expect(dek).not.toContain("IMDb, Rotten Tomatoes, Metacritic, and TMDB");
    expect(dek).not.toContain("60");
  });

  it("returns an empty string when nothing about the shelf is notable", () => {
    const bare: CollectionRow = {
      ...base,
      median_score: null,
      newest_title: null,
      newest_date: null,
    };
    expect(collectionDek(bare, [{ title: "Alpha" }])).toBe("");
  });

  it("never contains an em-dash", () => {
    expect(collectionDek(base, top)).not.toContain("—");
  });

  it("names the leaders, adapting to how many have scores", () => {
    expect(collectionDek(base, top)).toContain(
      "Alpha leads at 92, ahead of Beta (88) and Gamma (84).",
    );
    expect(collectionDek(base, top.slice(0, 2))).toContain(
      "Alpha leads at 92, ahead of Beta (88).",
    );
    expect(collectionDek(base, top.slice(0, 1))).toContain("Alpha leads at 92.");
  });

  it("omits the leaders sentence entirely when no scores are available", () => {
    const dek = collectionDek(base, [{ title: "Alpha" }, { title: "Beta" }]);
    expect(dek).not.toContain("leads at");
  });

  it("only claims an above-catalog median when it clears the +5 margin", () => {
    expect(collectionDek({ ...base, median_score: 67 }, top)).toContain(
      "typical pick here scores 67",
    );
    // 66 is above the catalog 62 but inside noise, so no sentence.
    expect(collectionDek({ ...base, median_score: 66 }, top)).not.toContain("typical pick");
    expect(collectionDek({ ...base, median_score: null }, top)).not.toContain("typical pick");
  });

  it("names the newest arrival with a month word, and skips it on bad data", () => {
    expect(collectionDek(base, top)).toContain(
      "The newest addition is The Latest Thing, released in July 2026.",
    );
    expect(collectionDek({ ...base, newest_date: null }, top)).not.toContain("newest addition");
    expect(collectionDek({ ...base, newest_date: "2026-13-99" }, top)).not.toContain(
      "newest addition",
    );
  });

  it("reads the same for every kind, since the dek no longer names a subject noun", () => {
    const awards = collectionDek({ ...base, kind: "awards" }, top);
    expect(collectionDek({ ...base, kind: "decade" }, top)).toBe(awards);
    expect(collectionDek({ ...base, kind: "genre-service" }, top)).toBe(awards);
  });
});
