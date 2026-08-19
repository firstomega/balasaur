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

  it("flags a single strong keyword", () => {
    expect(deriveSensitive(withKeywords(["softcore"]))).toBe(true);
    expect(deriveSensitive(withKeywords(["ecchi", "comedy"]))).toBe(true);
    expect(deriveSensitive(withKeywords(["pinku eiga"]))).toBe(true);
  });

  it("needs two weak signals — one 'erotic thriller' stays browsable", () => {
    expect(deriveSensitive(withKeywords(["erotic thriller", "neo-noir"]))).toBe(false);
    expect(deriveSensitive(withKeywords(["erotic thriller", "sexual fantasy"]))).toBe(true);
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
  });

  it("flags unambiguous fan-service keywords on a single hit", () => {
    expect(deriveSuggestive(withKeywords(["ecchi", "comedy"]))).toBe(true);
    expect(deriveSuggestive(withKeywords(["fan service"]))).toBe(true);
    expect(deriveSuggestive(withKeywords(["gravure"]))).toBe(true);
  });

  it("leaves adult-themed cinema alone: one 'erotic thriller' is not fan service", () => {
    expect(deriveSuggestive(withKeywords(["erotic thriller", "neo-noir"]))).toBe(false);
    expect(deriveSuggestive(withKeywords(["artificial intelligence", "loneliness"]))).toBe(false);
  });

  // Each of these three shipped to production as a false positive.
  it("matches whole words only: 'sharemarket fraud' is not 'harem'", () => {
    // The Wolf of Wall Street, flagged live by substring matching.
    expect(deriveSuggestive(withKeywords(["sharemarket fraud", "stockbroker"]), ["Drama"])).toBe(
      false,
    );
    expect(deriveSuggestive(withKeywords(["harem"]), ["Animation"])).toBe(true);
  });

  it("does not treat 'sexual fantasy' as a fan-service marker", () => {
    // American Beauty, Barbarella, and Cashback were all excluded by this.
    expect(deriveSuggestive(withKeywords(["sexual fantasy", "suburbia"]))).toBe(false);
    // It remains a WEAK signal for sensitive, where two are required.
    expect(deriveSuggestive(withKeywords(["sexual fantasy", "erotic thriller"]))).toBe(true);
  });

  it("counts 'harem' only inside Animation, where it names the subgenre", () => {
    // Boys Over Flowers, Coffee Prince and You're Beautiful are tagged
    // "reverse harem" for the romance structure, not for fan service.
    expect(deriveSuggestive(withKeywords(["reverse harem", "romance"]), ["Drama", "Romance"])).toBe(
      false,
    );
    expect(deriveSuggestive(withKeywords(["harem", "romance"]), ["Animation", "Comedy"])).toBe(
      true,
    );
  });

  it("fails open on missing raw data", () => {
    expect(deriveSuggestive(null)).toBe(false);
    expect(deriveSuggestive({})).toBe(false);
  });
});
