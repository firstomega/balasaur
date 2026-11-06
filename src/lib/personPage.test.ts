import { describe, expect, it } from "bun:test";
import type { MediaItem, PersonCreditGroup } from "@/types/media";
import { decadeRuns, personListLead } from "./personPage";

function item(id: string, year: string, extra: Partial<MediaItem> = {}): MediaItem {
  return {
    id,
    mediaType: "movie",
    title: id,
    year,
    overview: "",
    posterUrl: `https://image.tmdb.org/t/p/w500/${id}.jpg`,
    ratings: {},
    genres: [],
    streaming: [],
    lengthLabel: "",
    people: [],
    ...extra,
  } as MediaItem;
}

describe("decadeRuns", () => {
  it("splits newest first at each decade and puts undated credits last", () => {
    const runs = decadeRuns([
      item("a", "2021"),
      item("x", ""),
      item("b", "2019"),
      item("c", "2010"),
      item("d", "1995"),
    ]);
    expect(runs.map((r) => [r.decade, r.items.map((i) => i.id)])).toEqual([
      ["2020s", ["a"]],
      ["2010s", ["b", "c"]],
      ["1990s", ["d"]],
      [null, ["x"]],
    ]);
  });

  it("never repeats a decade when the input is out of year order", () => {
    const runs = decadeRuns([item("a", "2009"), item("b", "2011"), item("c", "2008")]);
    expect(runs.map((r) => r.decade)).toEqual(["2010s", "2000s"]);
    expect(runs[1].items.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("keeps the given order within one year", () => {
    const runs = decadeRuns([item("late", "2001"), item("early", "2001")]);
    expect(runs[0].items.map((i) => i.id)).toEqual(["late", "early"]);
  });
});

describe("personListLead", () => {
  const trusted = {
    ratings: { imdb: 8.3, rottenTomatoes: 100, metacritic: 95, tmdb: 8.0, balasaur: 89 },
    voteCount: 18000,
    swatch: "sky" as const,
    swatchAlt: null,
  };
  const groups: PersonCreditGroup[] = [
    { department: "Acting", items: [item("movie-1", "1995", trusted), item("movie-2", "1998")] },
  ];

  it("leads with the list's first title when the page holds it", () => {
    const lead = personListLead(
      { slug: "s", title: "t", itemCount: 42, leadId: "movie-1" },
      groups,
    );
    expect([lead?.id, lead?.swatch, lead?.score, lead?.first]).toEqual([
      "movie-1",
      "sky",
      89,
      true,
    ]);
  });

  it("gives no lead when the first title is not among the credits", () => {
    expect(
      personListLead({ slug: "s", title: "t", itemCount: 42, leadId: "movie-9" }, groups),
    ).toBe(null);
    expect(personListLead({ slug: "s", title: "t", itemCount: 42 }, groups)).toBe(null);
  });

  it("hides an untrusted score but keeps the poster", () => {
    const lead = personListLead({ slug: "s", title: "t", itemCount: 3, leadId: "movie-2" }, groups);
    expect(lead?.score).toBe(null);
  });
});
