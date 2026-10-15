import { describe, expect, it } from "bun:test";
import { deriveAudience, themeEchoesSubGenre } from "./taxonomy";

// This project's bun:test type stubs only expose toBe, so arrays are compared
// through a stable join.
const aud = (opts: Parameters<typeof deriveAudience>[0]) => deriveAudience(opts).join("|");

describe("deriveAudience", () => {
  it("maps US certifications", () => {
    expect(aud({ certification: "PG", genres: [], mediaType: "movie" })).toBe("Family");
    expect(aud({ certification: "TV-MA", genres: [], mediaType: "tv" })).toBe("Mature");
  });

  it("never assumes Animation means Family — uncertified adult anime broke this", () => {
    expect(aud({ genres: ["Animation", "Drama"], mediaType: "tv" })).toBe("");
  });

  it("family-leans only Animation that carries the Family genre and no cert", () => {
    expect(aud({ genres: ["Animation", "Family"], mediaType: "tv" })).toBe("Family");
    // A certification always wins over the lean.
    expect(aud({ certification: "TV-14", genres: ["Animation", "Family"], mediaType: "tv" })).toBe(
      "Teen",
    );
  });

  it("strips Kids/Family from suggestive or sensitive titles, even certified ones", () => {
    expect(
      aud({
        certification: "TV-PG",
        genres: ["Animation", "Family"],
        mediaType: "tv",
        matureContent: true,
      }),
    ).toBe("");
    // Mature bands survive the strip.
    expect(aud({ certification: "R", genres: [], mediaType: "movie", matureContent: true })).toBe(
      "Adult",
    );
  });
});

describe("themeEchoesSubGenre", () => {
  it("treats a theme fired by the same keyword as the same fact", () => {
    expect(themeEchoesSubGenre("Espionage", "Spy / Espionage")).toBe(true);
    expect(themeEchoesSubGenre("Mafia & Mob", "Mob / Mafia")).toBe(true);
    expect(themeEchoesSubGenre("Aliens", "Alien Invasion")).toBe(true);
    expect(themeEchoesSubGenre("Detective", "Procedural")).toBe(true);
  });

  it("keeps a different idea distinct", () => {
    expect(themeEchoesSubGenre("Heist", "Spy / Espionage")).toBe(false);
    expect(themeEchoesSubGenre("Time Travel", "Space Opera")).toBe(false);
  });
});
