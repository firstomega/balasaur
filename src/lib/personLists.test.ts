import { describe, expect, it } from "bun:test";
import { personListTitles, personNameFromListTitle } from "./personLists";

const json = (v: unknown) => JSON.stringify(v);

describe("personListTitles", () => {
  // Live titles from the collections table on 2026-10-15, including names
  // with initials, an accent and an apostrophe, which a rebuilt slug had to
  // get exactly right and an exact title match does not.
  it("reproduces the titles rebuild_collections() minted", () => {
    expect(json(personListTitles("Tom Hanks"))).toBe(
      json(["The Best Tom Hanks Movies", "The Best Tom Hanks Shows"]),
    );
    expect(personListTitles("Samuel L. Jackson")[0]).toBe("The Best Samuel L. Jackson Movies");
    expect(personListTitles("Luis Guzmán")[0]).toBe("The Best Luis Guzmán Movies");
    expect(personListTitles("Vincent D'Onofrio")[1]).toBe("The Best Vincent D'Onofrio Shows");
  });

  it("returns nothing for an empty name", () => {
    expect(json(personListTitles("  "))).toBe(json([]));
  });

  it("round-trips through personNameFromListTitle", () => {
    for (const name of ["Tom Hanks", "J.K. Simmons", "Robert Downey Jr."]) {
      for (const title of personListTitles(name)) {
        expect(personNameFromListTitle(title)).toBe(name);
      }
    }
  });
});

describe("personNameFromListTitle", () => {
  it("reads the roster name back out of a list title", () => {
    expect(personNameFromListTitle("The Best Tom Hanks Movies")).toBe("Tom Hanks");
    expect(personNameFromListTitle("The Best J.K. Simmons Shows")).toBe("J.K. Simmons");
    expect(personNameFromListTitle("Thrillers on Netflix")).toBeUndefined();
  });
});
