import { describe, expect, it } from "bun:test";
import { listLabel, pickRanksOn, type Placement } from "./ranksOn";

const p = (
  kind: string,
  slug: string,
  title: string,
  rank: number,
  item_count = 60,
): Placement => ({
  kind,
  slug,
  title,
  rank,
  item_count,
});

// Breaking Bad's placements on 2026-10-15.
const breakingBad: Placement[] = [
  p("awards", "best-emmy-winners", "Emmy Winners, Ranked", 1),
  p("decade", "best-shows-of-the-2000s", "The Best Shows of the 2000s", 1),
  p("genre", "best-crime-shows", "The Best Crime Shows of All Time", 1),
  p("genre", "best-drama-shows", "The Best Drama Shows of All Time", 1),
  p("genre-service", "best-drama-shows-on-netflix", "Drama Shows on Netflix, Ranked", 1),
  p("genre-service", "best-crime-shows-on-netflix", "Crime Shows on Netflix, Ranked", 1),
  p("service", "best-shows-on-netflix", "The Best Shows on Netflix Right Now", 1),
  p("year", "best-shows-of-2008", "The Best Shows of 2008", 1, 59),
];

describe("pickRanksOn", () => {
  it("prefers service x genre, then genre, then year, one of each", () => {
    const slugs = pickRanksOn(breakingBad).map((x) => x.slug);
    expect(slugs.join(" ")).toBe("best-crime-shows-on-netflix best-crime-shows best-shows-of-2008");
  });

  it("skips person lists even when they hold the best position", () => {
    const out = pickRanksOn([
      p("person", "best-tom-hardy-movies", "The Best Tom Hardy Movies", 2, 17),
      p("year", "best-movies-of-2010", "The Best Movies of 2010", 6),
    ]);
    expect(out.map((x) => x.slug).join(" ")).toBe("best-movies-of-2010");
  });

  it("fills from the same kind when nothing else is there", () => {
    const out = pickRanksOn([
      p("genre-service", "a", "A", 4),
      p("genre-service", "b", "B", 2),
      p("genre-service", "c", "C", 9),
      p("genre-service", "d", "D", 1),
    ]);
    expect(out.map((x) => x.slug).join(" ")).toBe("d b a");
  });

  it("returns nothing for a title on no list", () => {
    expect(pickRanksOn([]).length).toBe(0);
  });
});

describe("listLabel", () => {
  it("reads as a name inside a sentence", () => {
    expect(listLabel(breakingBad[2])).toBe("Best Crime Shows");
    expect(listLabel(breakingBad[4])).toBe("Best Drama Shows on Netflix");
    expect(listLabel(breakingBad[6])).toBe("Best Shows on Netflix");
    expect(listLabel(breakingBad[7])).toBe("Best Shows of 2008");
    expect(listLabel({ kind: "occasion", title: "Spy Stuff" })).toBe("Spy Stuff");
  });
});
