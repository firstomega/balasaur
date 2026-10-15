import { describe, it, expect } from "bun:test";
import { breadcrumbJsonLd, movieJsonLd, tvJsonLd } from "./jsonld";
import type { MediaDetail } from "@/types/media";

/** Inception's real row, trimmed to what the builders read. */
const base = {
  id: 27205,
  mediaType: "movie",
  title: "Inception",
  posterUrl: "/poster.jpg",
  overview: "A thief who steals corporate secrets through dream-sharing technology.",
  releaseDate: "2010-07-15",
  genres: ["Action", "Science Fiction"],
  streaming: ["Netflix"],
  lengthLabel: "2h 28m",
  people: [],
  cast: [{ name: "Leonardo DiCaprio", role: "Cobb" }],
  crew: [{ name: "Christopher Nolan", role: "Director" }],
  facts: {},
  voteCount: 39857,
  ratings: { imdb: 8.8, rottenTomatoes: 86, metacritic: 74, tmdb: 8.4, balasaur: 84 },
} as unknown as MediaDetail;

describe("rating markup", () => {
  // The Balasaur Score is compiled from IMDb, Rotten Tomatoes, Metacritic and
  // TMDB, and Google's review snippet policy rules out ratings aggregated from
  // other sites. No title emits the block, however many sources it has.
  const url = "https://balasaur.com/movie/inception-27205";

  it("leaves aggregateRating off a fully rated movie", () => {
    // Inception shipped "aggregateRating":{...,"ratingCount":4} until this change.
    const out = movieJsonLd(base, url);
    expect(out.aggregateRating).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("Rating");
    expect(out.name).toBe("Inception");
    expect(out["@type"]).toBe("Movie");
  });

  it("leaves aggregateRating off a title whose score the page hides", () => {
    // Two sources but three votes: no badge on the page. With the block gone
    // for every title, a thin one cannot slip a rating back into the markup.
    const thin = { ...base, voteCount: 3, ratings: { imdb: 9.6, tmdb: 10 } } as MediaDetail;
    const out = movieJsonLd(thin, url);
    expect(out.aggregateRating).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("Rating");
  });

  it("leaves aggregateRating off a TV series", () => {
    const dahmer = {
      ...base,
      mediaType: "tv",
      title: "DAHMER - Monster: The Jeffrey Dahmer Story",
      numberOfSeasons: 1,
      voteCount: 2911,
      ratings: { tmdb: 8, balasaur: 80 },
    } as unknown as MediaDetail;
    const out = tvJsonLd(dahmer, "https://balasaur.com/tv/113988");
    expect(out.aggregateRating).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("Rating");
    expect(out.numberOfSeasons).toBe(1);
  });

  it("still drops empty fields from a title with almost no data", () => {
    const bare = {
      ...base,
      posterUrl: undefined,
      overview: "",
      genres: [],
      cast: [],
      crew: [],
      ratings: {},
    } as unknown as MediaDetail;
    expect(Object.keys(movieJsonLd(bare, url)).sort().join(",")).toBe(
      "@context,@type,datePublished,name,url",
    );
  });
});

describe("breadcrumbJsonLd", () => {
  it("names only pages that are their own canonical", () => {
    // A crumb pointing at /?type=movie handed Google a filtered homepage view
    // that canonicalises to "/", which Search Console files as an alternate
    // page on every title. Every item must be a URL with no query string.
    const url = "https://balasaur.com/movie/inception-27205";
    const trail = breadcrumbJsonLd(base, url) as {
      itemListElement: { position: number; name: string; item: string }[];
    };
    expect(JSON.stringify(trail.itemListElement.map((i) => i.item))).toBe(
      JSON.stringify(["https://balasaur.com", url]),
    );
    expect(trail.itemListElement.map((i) => i.position).join(",")).toBe("1,2");
    for (const i of trail.itemListElement) expect(i.item).not.toContain("?");
  });
});
