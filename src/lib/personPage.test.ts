import { describe, expect, it } from "bun:test";
import type { MediaItem, PersonCredit, PersonCreditGroup } from "@/types/media";
import {
  creditLinks,
  decadeRuns,
  joinCatalogCredits,
  personListLead,
  splitSelfCredits,
} from "./personPage";

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

describe("splitSelfCredits", () => {
  const credit = (id: string, role?: string) =>
    ({
      id,
      mediaType: "tv",
      title: id,
      year: "2020",
      overview: "",
      posterUrl: "",
      ratings: {},
      genres: [],
      streaming: [],
      lengthLabel: "",
      people: [],
      role,
    }) as PersonCredit;

  it("moves appearances as themselves to their own list, in order", () => {
    const items = [
      credit("a", "Woody (voice)"),
      credit("b", "Self"),
      credit("c", "Himself - Guest"),
      credit("d", "Narrator"),
      credit("e", "Captain Richard Phillips"),
    ];
    const { roles, self } = splitSelfCredits(items);
    expect(roles.map((i) => i.id)).toEqual(["a", "e"]);
    expect(self.map((i) => i.id)).toEqual(["b", "c", "d"]);
  });

  it("leaves a credit with no role, or a character that only starts like one, with the roles", () => {
    const { roles, self } = splitSelfCredits([credit("a"), credit("b", "Selfridge")]);
    expect(roles.map((i) => i.id)).toEqual(["a", "b"]);
    expect(self).toEqual([]);
  });
});

// The shapes below are the real ones: a person record's credit as
// buildPersonFromRaw stores it (TMDB card, "movie-<id>", role, no score), and
// a catalog row as the join maps it (Balasaur Score, swatch).
function tmdbCredit(id: string, extra: Partial<PersonCredit> = {}): PersonCredit {
  return { ...item(id, "2004"), ratings: { tmdb: 6.9 }, role: "Viktor Navorski", ...extra };
}

describe("joinCatalogCredits", () => {
  const groups: PersonCreditGroup[] = [
    {
      department: "Acting",
      items: [
        tmdbCredit("movie-594", { title: "The Terminal" }),
        tmdbCredit("tv-113667", {
          title: "Scene by Scene",
          mediaType: "tv",
          role: "Self",
          episodes: 1,
        }),
      ],
    },
    {
      department: "Directing",
      items: [tmdbCredit("movie-594", { title: "The Terminal", role: undefined })],
    },
  ];
  const rows = new Map([["movie-594", { media_id: "movie-594", score: 71 }]]);
  const toItem = (r: { media_id: string; score: number }): MediaItem =>
    item(r.media_id, "2004", {
      title: "The Terminal",
      ratings: { balasaur: r.score },
      swatch: "sky",
    });

  it("marks catalog credits in and keeps what they did on it", () => {
    const [acting] = joinCatalogCredits(groups, rows, toItem);
    const { id, inCatalog, role, ratings, swatch } = acting.items[0];
    expect({ id, inCatalog, role, ratings, swatch }).toEqual({
      id: "movie-594",
      inCatalog: true,
      role: "Viktor Navorski",
      ratings: { balasaur: 71 },
      swatch: "sky",
    });
  });

  it("marks every credit without a catalog row out, keeping its TMDB card", () => {
    const [acting] = joinCatalogCredits(groups, rows, toItem);
    const { id, title, role, episodes, inCatalog } = acting.items[1];
    expect({ id, title, role, episodes, inCatalog }).toEqual({
      id: "tv-113667",
      title: "Scene by Scene",
      role: "Self",
      episodes: 1,
      inCatalog: false,
    });
    expect(acting.items[1].ratings.balasaur).toBeUndefined();
  });

  it("marks the same title the same way in every department", () => {
    const out = joinCatalogCredits(groups, rows, toItem);
    expect(out[1].items[0].inCatalog).toBe(true);
  });

  it("marks everything out when a successful lookup found nothing", () => {
    const out = joinCatalogCredits(groups, new Map(), toItem);
    expect(out.flatMap((g) => g.items.map((i) => i.inCatalog))).toEqual([false, false, false]);
  });

  it("leaves the input untouched, so a cached record is never altered", () => {
    joinCatalogCredits(groups, rows, toItem);
    expect(groups[0].items.every((i) => i.inCatalog === undefined)).toBe(true);
  });
});

describe("creditLinks", () => {
  it("links a credit the catalog holds", () => {
    expect(creditLinks(tmdbCredit("movie-594", { inCatalog: true }))).toBe(true);
  });

  it("prints a credit outside the catalog without a link", () => {
    expect(creditLinks(tmdbCredit("movie-15673", { inCatalog: false }))).toBe(false);
    expect(creditLinks(tmdbCredit("tv-113667", { mediaType: "tv", inCatalog: false }))).toBe(false);
  });

  it("keeps the link when the join never marked the credit", () => {
    // A failed lookup, or a record served before the join ran.
    expect(creditLinks(tmdbCredit("movie-15673"))).toBe(true);
    expect(creditLinks(tmdbCredit("tv-113667", { mediaType: "tv" }))).toBe(true);
  });

  it("never links an id that is not a TMDB number", () => {
    expect(creditLinks(tmdbCredit("movie-", { inCatalog: true }))).toBe(false);
    expect(creditLinks(tmdbCredit("tv-abc", { mediaType: "tv" }))).toBe(false);
  });
});
