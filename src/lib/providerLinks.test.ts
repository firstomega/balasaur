import { describe, expect, it } from "bun:test";
import { providerWatchUrl } from "./providerLinks";

describe("providerWatchUrl", () => {
  it("sends each major service to its own search for the title", () => {
    expect(providerWatchUrl("Netflix", "Heat")).toBe("https://www.netflix.com/search?q=Heat");
    expect(providerWatchUrl("Amazon Prime Video", "Heat")).toBe(
      "https://www.primevideo.com/search/?phrase=Heat",
    );
    expect(providerWatchUrl("Disney Plus", "Moana")).toBe(
      "https://www.disneyplus.com/search?q=Moana",
    );
    expect(providerWatchUrl("HBO Max", "Heat")).toBe("https://play.hbomax.com/search?q=Heat");
  });

  it("handles TMDB's real name variants, including a trailing space", () => {
    expect(providerWatchUrl("Netflix Standard with Ads", "Heat")).toBe(
      "https://www.netflix.com/search?q=Heat",
    );
    expect(providerWatchUrl("Paramount Plus Apple TV Channel ", "Heat")).toBe(
      "https://tv.apple.com/search?term=Heat",
    );
  });

  it("routes channel storefronts to the platform that hosts playback", () => {
    expect(providerWatchUrl("HBO Max Amazon Channel", "Heat")).toBe(
      "https://www.primevideo.com/search/?phrase=Heat",
    );
    expect(providerWatchUrl("Paramount+ Amazon Channel", "Heat")).toBe(
      "https://www.primevideo.com/search/?phrase=Heat",
    );
  });

  it("URI-encodes titles", () => {
    expect(providerWatchUrl("Netflix", "Monsters, Inc.")).toBe(
      "https://www.netflix.com/search?q=Monsters%2C%20Inc.",
    );
  });

  it("returns null for providers without a reliable public search URL", () => {
    expect(providerWatchUrl("Rakuten TV", "Heat")).toBe(null);
    expect(providerWatchUrl("SF Anytime", "Heat")).toBe(null);
    expect(providerWatchUrl("", "Heat")).toBe(null);
    expect(providerWatchUrl("Netflix", "")).toBe(null);
  });
});
