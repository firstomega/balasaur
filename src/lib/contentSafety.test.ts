import { describe, expect, it } from "bun:test";
import { deriveSensitive, deriveSuggestive } from "./contentSafety";

const withKeywords = (names: string[], extra: Record<string, unknown> = {}) => ({
  keywords: { keywords: names.map((name, id) => ({ id, name })) },
  ...extra,
});

describe("deriveSensitive", () => {
  it("flags TMDB's adult flag outright", () => {
    expect(deriveSensitive({ adult: true })).toBe(true);
    expect(deriveSensitive({ adult: false })).toBe(false);
  });

  it("flags a production marker on a single hit", () => {
    expect(deriveSensitive(withKeywords(["softcore"]))).toBe(true);
    expect(deriveSensitive(withKeywords(["ecchi", "comedy"]))).toBe(true);
    expect(deriveSensitive(withKeywords(["pinku eiga"]))).toBe(true);
    expect(deriveSensitive(withKeywords(["soft porn"]))).toBe(true);
  });

  // Every title named below was hidden from the whole site by the old rule.
  it("never flags a film for its subject matter", () => {
    // Taxi Driver, Boogie Nights, Shame, Pearl, MaXXXine.
    expect(deriveSensitive(withKeywords(["pornography"]))).toBe(false);
    // Boogie Nights and The People vs. Larry Flynt: several facets of one
    // subject are still one subject, which is why there is no "two signals" rule.
    expect(deriveSensitive(withKeywords(["pornography", "porn actor", "porn industry"]))).toBe(
      false,
    );
    // Euphoria.
    expect(deriveSensitive(withKeywords(["pornography addiction"]))).toBe(false);
    // Primal Fear.
    expect(deriveSensitive(withKeywords(["pornographic video"]))).toBe(false);
    // Basic Instinct, the erotic thriller this module always meant to keep.
    expect(deriveSensitive(withKeywords(["erotic thriller", "eroticism"]))).toBe(false);
    // Lost Highway.
    expect(deriveSensitive(withKeywords(["pornography", "eroticism"]))).toBe(false);
  });

  it("matches whole words only: 'transmutation' is not 'smut'", () => {
    // Arifureta, flagged live by substring matching.
    expect(deriveSensitive(withKeywords(["transmutation", "fantasy"]))).toBe(false);
    expect(deriveSensitive(withKeywords(["smut"]))).toBe(true);
  });

  it("reads the TV keyword shape (results) too", () => {
    expect(deriveSensitive({ keywords: { results: [{ id: 1, name: "Hentai" }] } })).toBe(true);
  });

  it("fails open on missing/absent raw data", () => {
    expect(deriveSensitive(null)).toBe(false);
    expect(deriveSensitive({})).toBe(false);
    expect(deriveSensitive(withKeywords(["based on novel or book", "friendship"]))).toBe(false);
  });
});

describe("deriveSuggestive", () => {
  it("is a superset of sensitive", () => {
    expect(deriveSuggestive({ adult: true })).toBe(true);
    expect(deriveSuggestive(withKeywords(["softcore"]))).toBe(true);
    expect(deriveSuggestive(withKeywords(["ecchi"]))).toBe(true);
  });

  it("flags unambiguous fan-service keywords on a single hit", () => {
    expect(deriveSuggestive(withKeywords(["fan service"]))).toBe(true);
    expect(deriveSuggestive(withKeywords(["seduction comedy"]))).toBe(true);
  });

  it("leaves adult-themed cinema alone", () => {
    expect(deriveSuggestive(withKeywords(["erotic thriller", "neo-noir"]))).toBe(false);
    expect(deriveSuggestive(withKeywords(["artificial intelligence", "loneliness"]))).toBe(false);
  });

  it("matches whole words only: 'sharemarket fraud' is not 'harem'", () => {
    // The Wolf of Wall Street. Genres force the Animation path so this
    // actually exercises word matching rather than the genre gate.
    expect(deriveSuggestive(withKeywords(["sharemarket fraud"]), ["Animation"])).toBe(false);
    expect(deriveSuggestive(withKeywords(["harem"]), ["Animation"])).toBe(true);
  });

  it("does not treat 'sexual fantasy' as a fan-service marker", () => {
    // American Beauty, Barbarella, and Cashback were all excluded by this.
    expect(deriveSuggestive(withKeywords(["sexual fantasy", "suburbia"]))).toBe(false);
  });

  it("counts 'harem' only inside Animation, and only exactly", () => {
    // Boys Over Flowers, Coffee Prince and You're Beautiful are tagged
    // "reverse harem" for the romance structure, not for fan service.
    expect(deriveSuggestive(withKeywords(["harem", "romance"]), ["Drama", "Romance"])).toBe(false);
    // Ooku: The Inner Chambers and My Next Life as a Villainess are josei and
    // otome: the qualified keyword is a different thing again.
    expect(deriveSuggestive(withKeywords(["reverse harem"]), ["Animation", "Drama"])).toBe(false);
    expect(deriveSuggestive(withKeywords(["male harem"]), ["Animation", "Drama"])).toBe(false);
    expect(deriveSuggestive(withKeywords(["harem", "romance"]), ["Animation", "Comedy"])).toBe(
      true,
    );
  });

  it("fails open on missing raw data", () => {
    expect(deriveSuggestive(null)).toBe(false);
    expect(deriveSuggestive({})).toBe(false);
  });
});
