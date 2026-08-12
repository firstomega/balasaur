import { describe, expect, it } from "bun:test";
import { collectionDek, type CollectionRow, type DekTopItem } from "./collectionsProse";

const base: CollectionRow = {
  slug: "best-on-netflix",
  kind: "service",
  title: "Best on Netflix Right Now",
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
  it("always opens with the count and the score explainer", () => {
    const dek = collectionDek(base, top);
    expect(dek).toStartWith("60 titles streaming now, ranked by Balasaur Score");
    expect(dek).toContain("IMDb, Rotten Tomatoes, Metacritic, and TMDB");
  });

  it("uses Apex framing only when 2+ of the top 3 clear the bar", () => {
    expect(collectionDek(base, top)).toContain(
      "clears the Apex bar: Alpha (92), Beta (88), Gamma (84).",
    );
    const modest = top.map((t) => ({ ...t, score: 70 }));
    const dek = collectionDek(base, modest);
    expect(dek).toContain("Leading the list: Alpha (70)");
    expect(dek).not.toContain("Apex");
  });

  it("omits the top-3 sentence entirely when no scores are available", () => {
    const dek = collectionDek(base, [{ title: "Alpha" }, { title: "Beta" }]);
    expect(dek).not.toContain("Leading the list");
    expect(dek).not.toContain("Apex");
  });

  it("only claims an above-catalog median when it clears the +5 margin", () => {
    expect(collectionDek({ ...base, median_score: 67 }, top)).toContain("median score of 67");
    // 66 is above the catalog 62 but inside noise — no sentence.
    expect(collectionDek({ ...base, median_score: 66 }, top)).not.toContain("median");
    expect(collectionDek({ ...base, median_score: null }, top)).not.toContain("median");
  });

  it("names the newest arrival with a month word, and skips it on bad data", () => {
    expect(collectionDek(base, top)).toContain("The Latest Thing, released in July 2026.");
    expect(collectionDek({ ...base, newest_date: null }, top)).not.toContain("Newest arrival");
    expect(collectionDek({ ...base, newest_date: "2026-13-99" }, top)).not.toContain(
      "Newest arrival",
    );
  });

  it("picks the subject noun from the kind", () => {
    expect(collectionDek({ ...base, kind: "awards" }, top)).toContain("60 winners,");
    expect(collectionDek({ ...base, kind: "decade" }, top)).toContain("60 titles,");
    expect(collectionDek({ ...base, kind: "genre-service" }, top)).toContain(
      "60 titles streaming now,",
    );
  });

  it("formats large counts with separators", () => {
    const dek = collectionDek({ ...base, item_count: 3147, kind: "genre" }, top);
    expect(dek).toStartWith("3,147 titles,");
  });
});
