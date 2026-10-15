import { describe, expect, it } from "bun:test";
import { personListSlugs, personNameFromListTitle, sqlSlugify } from "./personLists";

const json = (v: unknown) => JSON.stringify(v);

describe("personListSlugs", () => {
  // Each one is a live slug from the collections table on 2026-10-15.
  it("reproduces the slugs rebuild_collections() minted", () => {
    expect(personListSlugs("Tom Hanks")[0]).toBe("best-tom-hanks-movies");
    expect(personListSlugs("Samuel L. Jackson")[0]).toBe("best-samuel-l-jackson-movies");
    expect(personListSlugs("J.K. Simmons")[1]).toBe("best-j-k-simmons-shows");
    expect(personListSlugs("Luis Guzmán")[0]).toBe("best-luis-guzman-movies");
    expect(personListSlugs("Vincent D'Onofrio")[0]).toBe("best-vincent-d-onofrio-movies");
    expect(personListSlugs("Robert Downey Jr.")[0]).toBe("best-robert-downey-jr-movies");
  });

  it("folds the letters unaccent() rewrites", () => {
    expect(sqlSlugify("Nikolaj Lie Kaas Ørsted")).toBe("nikolaj-lie-kaas-orsted");
    expect(sqlSlugify("Rock & Roll+")).toBe("rock-and-roll-plus");
  });

  it("returns nothing for a name with no letters", () => {
    expect(json(personListSlugs("…"))).toBe(json([]));
  });
});

describe("personNameFromListTitle", () => {
  it("reads the roster name back out of a list title", () => {
    expect(personNameFromListTitle("The Best Tom Hanks Movies")).toBe("Tom Hanks");
    expect(personNameFromListTitle("The Best J.K. Simmons Shows")).toBe("J.K. Simmons");
    expect(personNameFromListTitle("Thrillers on Netflix")).toBeUndefined();
  });
});
