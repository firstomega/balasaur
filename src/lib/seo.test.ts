import { describe, expect, it } from "bun:test";
import { clampDescription, composeTitle, detailMeta, personMeta } from "./seo";

describe("composeTitle", () => {
  it("keeps every tail that fits and adds the brand when it is free", () => {
    expect(composeTitle("Sinners (2025)", [" rating 81/100", ", where to watch"])).toBe(
      "Sinners (2025) rating 81/100, where to watch | Balasaur",
    );
  });

  it("keeps the keywords and drops the brand, never the other way round", () => {
    // 44 characters of title leaves room for the rating or the brand, not both.
    const out = composeTitle("Little Amélie or the Character of Rain (2025)", [" rating 89/100"]);
    expect(out).toBe("Little Amélie or the Character of Rain (2025) rating 89/100");
    expect(out).not.toContain("Balasaur");
  });

  it("drops tails from the least valuable end when nothing else fits", () => {
    const out = composeTitle("The Punisher: One Last Kill (2026)", [
      " rating 83/100",
      ", where to watch",
    ]);
    expect(out).toBe("The Punisher: One Last Kill (2026) rating 83/100 | Balasaur");
  });

  it("returns the head alone when even that overruns", () => {
    const long = "A".repeat(80);
    expect(composeTitle(long, [" tail"])).toBe(long);
  });
});

describe("clampDescription", () => {
  it("prefers whole sentences over a mid-clause cut", () => {
    const t = "First sentence here. Second sentence is quite a lot longer than the first one is.";
    expect(clampDescription(t, 60)).toBe("First sentence here.");
  });

  it("does not split a decimal rating, which reads as a sentence end", () => {
    const t =
      "A Balasaur Score of 56 out of 100, drawn from IMDb 5.8/10, Rotten Tomatoes 50%. Next one.";
    expect(clampDescription(t, 90)).toStartWith("A Balasaur Score of 56");
  });

  it("splits before a sentence that opens with a digit", () => {
    const t =
      "A Balasaur Score of 72 out of 100. 5 seasons across 62 episodes so far, still running.";
    expect(clampDescription(t, 40)).toBe("A Balasaur Score of 72 out of 100.");
  });

  it("fills a wide leftover gap rather than wasting the snippet", () => {
    const t = `${"A".repeat(90)}. ${"word ".repeat(30)}end.`;
    const out = clampDescription(t, 160);
    expect(out.length).toBeGreaterThan(140);
    expect(out.endsWith("…")).toBe(true);
  });

  it("leaves a narrow gap alone", () => {
    const t = "Short one. And a second sentence that will not fit in the remaining space at all.";
    expect(clampDescription(t, 40)).toBe("Short one.");
  });

  it("falls back to the tagline with no text", () => {
    expect(clampDescription(undefined)).toContain("Discover, track, and rate");
  });
});

describe("detailMeta", () => {
  const base = {
    mediaType: "movie",
    title: "Sinners",
    year: "2025",
    streaming: ["Max"],
    runtime: 138,
    voteCount: 4983,
    ratings: { balasaur: 81, imdb: 7.5, rottenTomatoes: 97, metacritic: 84 },
  };

  it("puts the rating in the title, because that is the word people type", () => {
    expect(detailMeta(base).title).toContain("rating 81/100");
  });

  it("describes the page with its own prose, not the shared TMDB synopsis", () => {
    const overview = "A pair of brothers return to their hometown and find something waiting.";
    const out = detailMeta({ ...base, overview });
    expect(out.description).toContain("Rotten Tomatoes 97%");
    expect(out.description).not.toContain("hometown");
  });

  it("falls back to the synopsis only when there is no prose to write", () => {
    const out = detailMeta({
      mediaType: "movie",
      title: "Obscure",
      ratings: {},
      overview: "Something happens to someone.",
    });
    expect(out.description).toContain("Something happens to someone.");
  });

  it("offers where to watch only when there is somewhere to watch", () => {
    expect(detailMeta(base).title).toContain("where to watch");
    expect(detailMeta({ ...base, streaming: [] }).title).not.toContain("where to watch");
  });
});

describe("personMeta", () => {
  const stats = {
    titles: 80,
    scored: 78,
    medianScore: 73,
    bestDecade: "1990s",
    bestDecadeMedian: 78,
    bestDecadeTitles: 14,
    collaborators: [{ name: "Tim Allen", together: 13 }],
  };

  it("counts the filmography in the title", () => {
    expect(personMeta({ name: "Tom Hanks", stats }).title).toBe(
      "Tom Hanks: 80 movies and TV shows, ranked | Balasaur",
    );
  });

  it("describes the person with catalog stats, not the shared TMDB biography", () => {
    const out = personMeta({ name: "Tom Hanks", biography: "Born in Concord, California.", stats });
    expect(out.description).toContain("median Balasaur Score of 73");
    expect(out.description).not.toContain("Concord");
  });

  it("falls back to the biography for a thin filmography", () => {
    const out = personMeta({
      name: "Nobody",
      biography: "Born in Concord, California.",
      stats: { titles: 1, scored: 0, collaborators: [] },
    });
    expect(out.title).toBe("Nobody: movies and TV shows | Balasaur");
    expect(out.description).toBe("Born in Concord, California.");
  });
});
