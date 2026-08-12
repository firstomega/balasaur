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
  it("opens with the count and explains the score in plain words", () => {
    const dek = collectionDek(base, top);
    expect(dek).toStartWith(
      "60 streaming titles made the cut, ordered from highest Balasaur Score to lowest.",
    );
    expect(dek).toContain("IMDb, Rotten Tomatoes, Metacritic, and TMDB");
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

  it("picks the subject noun from the kind", () => {
    expect(collectionDek({ ...base, kind: "awards" }, top)).toStartWith("60 winners made the cut");
    expect(collectionDek({ ...base, kind: "decade" }, top)).toStartWith("60 titles made the cut");
    expect(collectionDek({ ...base, kind: "genre-service" }, top)).toStartWith(
      "60 streaming titles made the cut",
    );
  });

  it("formats large counts with separators", () => {
    const dek = collectionDek({ ...base, item_count: 3147, kind: "genre" }, top);
    expect(dek).toStartWith("3,147 titles made the cut");
  });
});
