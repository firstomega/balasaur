import { describe, expect, it } from "bun:test";
import {
  RELATED_RAIL_MAX,
  RELATED_RAIL_MIN,
  isStrongMatch,
  keyPeopleOf,
  matchReasons,
  railAnchorOf,
  selectRail,
  type RelatedFacets,
} from "./relatedRail";

// Inception as the anchor, with the facets related_titles returned for real
// candidates on 2026-10-15.
const inception = railAnchorOf({
  genres: ["Action", "Science Fiction", "Adventure"],
  crew: [
    { name: "Christopher Nolan", role: "Director" },
    { name: "Hans Zimmer", role: "Original Music Composer" },
  ],
  cast: [
    { name: "Leonardo DiCaprio", role: "Dom Cobb" },
    { name: "Joseph Gordon-Levitt", role: "Arthur" },
    { name: "Ken Watanabe", role: "Saito" },
    { name: "Tom Hardy", role: "Eames" },
  ],
});

const row = (f: Partial<RelatedFacets>): RelatedFacets => ({
  same_franchise: false,
  shared_people: [],
  shared_sub_genres: [],
  shared_themes: [],
  shared_genres: [],
  era_match: false,
  ...f,
});

const phineasAndFerb = row({
  shared_sub_genres: ["Spy / Espionage"],
  shared_themes: ["Espionage"],
  shared_genres: ["Action", "Adventure", "Science Fiction"],
});
const tenet = row({
  shared_people: ["Christopher Nolan"],
  shared_sub_genres: ["Spy / Espionage"],
  shared_themes: ["Espionage"],
  shared_genres: ["Action", "Science Fiction"],
});
const madMax = row({
  shared_people: ["Tom Hardy"],
  shared_genres: ["Action", "Adventure", "Science Fiction"],
});
const spyHeist = row({
  shared_sub_genres: ["Spy / Espionage"],
  shared_themes: ["Espionage", "Heist"],
});

describe("keyPeopleOf", () => {
  it("takes the director and the top three billed, not the composer or the fourth", () => {
    const key = inception.keyPeople;
    expect(key.has("Christopher Nolan")).toBe(true);
    expect(key.has("Ken Watanabe")).toBe(true);
    expect(key.has("Tom Hardy")).toBe(false);
    expect(key.has("Hans Zimmer")).toBe(false);
  });

  it("reads the stored people shape when cast and crew are missing", () => {
    const key = keyPeopleOf({
      people: [
        { name: "Vince Gilligan", role: "Creator" },
        { name: "Bryan Cranston", role: "Walter White" },
        { name: "Aaron Paul", role: "Jesse Pinkman" },
        { name: "Anna Gunn", role: "Skyler White" },
        { name: "RJ Mitte", role: "Walter White Jr." },
      ],
    });
    expect([...key].join("|")).toBe("Vince Gilligan|Bryan Cranston|Aaron Paul|Anna Gunn");
  });
});

describe("isStrongMatch", () => {
  it("refuses a sub-genre and the theme that is the same keyword said twice", () => {
    expect(isStrongMatch(phineasAndFerb, inception)).toBe(false);
  });

  it("refuses broad genres alone, however many", () => {
    const r = row({ shared_genres: ["Action", "Adventure", "Science Fiction"] });
    expect(isStrongMatch(r, inception)).toBe(false);
  });

  it("accepts the director", () => {
    expect(isStrongMatch(tenet, inception)).toBe(true);
  });

  it("refuses a shared supporting actor with nothing else", () => {
    expect(isStrongMatch(madMax, inception)).toBe(false);
  });

  it("accepts a sub-genre plus a theme that is a different idea", () => {
    expect(isStrongMatch(spyHeist, inception)).toBe(true);
  });

  it("accepts the same franchise", () => {
    expect(isStrongMatch(row({ same_franchise: true }), inception)).toBe(true);
  });

  it("keeps a family or animated title off a page that is neither, unless a person links them", () => {
    const animatedSpyHeist = { ...spyHeist, genres: ["Animation", "Action", "Family"] };
    expect(isStrongMatch(animatedSpyHeist, inception)).toBe(false);
    const toyStory = railAnchorOf({ genres: ["Animation", "Family", "Comedy"] });
    expect(isStrongMatch(animatedSpyHeist, toyStory)).toBe(true);
    const withDirector = { ...animatedSpyHeist, shared_people: ["Christopher Nolan"] };
    expect(isStrongMatch(withDirector, inception)).toBe(true);
  });
});

describe("matchReasons", () => {
  it("names the key person first and drops the echoed theme", () => {
    expect(matchReasons(tenet, inception.keyPeople).join(" · ")).toBe(
      "Christopher Nolan · Spy / Espionage · Action",
    );
  });

  it("does not print Mob / Mafia and Mafia & Mob as two reasons", () => {
    const r = row({
      same_franchise: true,
      shared_sub_genres: ["Mob / Mafia"],
      shared_themes: ["Mafia & Mob"],
    });
    expect(matchReasons(r, new Set()).join(" · ")).toBe("Same series · Mob / Mafia");
  });
});

describe("selectRail", () => {
  it("shows no rail under the minimum and never pads with weak rows", () => {
    const rows = [tenet, tenet, tenet, phineasAndFerb, madMax, phineasAndFerb];
    expect(RELATED_RAIL_MIN).toBe(4);
    expect(selectRail(rows, inception)).toBe(undefined);
  });

  it("caps the rail and keeps only strong rows, in order", () => {
    const rows = [phineasAndFerb, ...Array.from({ length: 12 }, () => tenet)];
    const out = selectRail(rows, inception) ?? [];
    expect(out.length).toBe(RELATED_RAIL_MAX);
    expect(RELATED_RAIL_MAX).toBe(8);
    expect(out.every((r) => r === tenet)).toBe(true);
  });
});
