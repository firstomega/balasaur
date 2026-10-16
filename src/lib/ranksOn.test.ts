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
    expect(slugs.join(" ")).toBe("best-crime-shows-on-netflix best-drama-shows best-shows-of-2008");
  });

  it("does not name the same genre twice while another list can fill the slot", () => {
    // Inception on 2026-10-15: British action #2, action #23, sci-fi #24.
    const inception = [
      p("genre", "best-action-movies", "The Best Action Movies of All Time", 23),
      p("genre", "best-science-fiction-movies", "The Best Science Fiction Movies of All Time", 24),
      p("origin-genre", "best-british-action-movies", "The Best British Action Movies", 2),
      p("year", "best-movies-of-2010", "The Best Movies of 2010", 6),
      p("person", "best-tom-hardy-movies", "The Best Tom Hardy Movies", 2, 17),
    ];
    expect(
      pickRanksOn(inception)
        .map((x) => x.slug)
        .join(" "),
    ).toBe("best-british-action-movies best-science-fiction-movies best-movies-of-2010");
    // Spirited Away: animation on Max, then Japanese animation and all-time
    // animation both restate it, so family takes the genre slot.
    const spirited = [
      p("genre-service", "best-animation-movies-on-max", "Animation Movies on Max, Ranked", 1),
      p("origin-genre", "best-japanese-animation-movies", "The Best Japanese Animation Movies", 1),
      p("genre", "best-animation-movies", "The Best Animation Movies of All Time", 1),
      p("genre", "best-family-movies", "The Best Family Movies of All Time", 1),
      p("year", "best-movies-of-2001", "The Best Movies of 2001", 1),
    ];
    expect(
      pickRanksOn(spirited)
        .map((x) => x.slug)
        .join(" "),
    ).toBe("best-animation-movies-on-max best-family-movies best-movies-of-2001");
  });

  it("falls back to a restated genre rather than a shorter line", () => {
    const out = pickRanksOn([
      p("genre-service", "best-crime-shows-on-netflix", "Crime Shows on Netflix, Ranked", 1),
      p("genre", "best-crime-shows", "The Best Crime Shows of All Time", 3),
    ]);
    expect(out.map((x) => x.slug).join(" ")).toBe("best-crime-shows-on-netflix best-crime-shows");
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
