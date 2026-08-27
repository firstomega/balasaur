import { describe, it, expect } from "bun:test";
import { movieJsonLd, tvJsonLd } from "./jsonld";
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
  ratings: { imdb: 8.8, rottenTomatoes: 87, metacritic: 74, tmdb: 8.4, balasaur: 84 },
} as unknown as MediaDetail;

const rating = (d: MediaDetail) =>
  (movieJsonLd(d, "https://balasaur.com/movie/27205") as Record<string, unknown>)
    .aggregateRating as Record<string, unknown> | undefined;

describe("aggregateRating", () => {
  it("counts the ratings the score averages, not TMDB's voters", () => {
    // Inception blends four published ratings. It used to ship ratingCount
    // 39857, the number of people who rated one of them.
    expect(JSON.stringify(rating(base))).toBe(
      '{"@type":"AggregateRating","ratingValue":84,"bestRating":100,"worstRating":0,"ratingCount":4}',
    );
  });

  it("counts only the sources this title actually has", () => {
    const twoOf = { ...base, ratings: { imdb: 8.8, tmdb: 8.4, balasaur: 87 } } as MediaDetail;
    expect(rating(twoOf)?.ratingCount).toBe(2);
  });

  it("no longer needs a TMDB vote count to emit anything", () => {
    const noVotes = { ...base, voteCount: undefined } as MediaDetail;
    expect(rating(noVotes)?.ratingCount).toBe(4);
  });

  it("says nothing when one source is the whole score", () => {
    // DAHMER: TMDB 8.0 and nothing else. A score of 80 here is TMDB's number
    // rescaled, so there is no average of ours to report.
    const dahmer = {
      ...base,
      mediaType: "tv",
      title: "DAHMER - Monster: The Jeffrey Dahmer Story",
      voteCount: 2911,
      ratings: { tmdb: 8, balasaur: 80 },
    } as unknown as MediaDetail;
    const out = tvJsonLd(dahmer, "https://balasaur.com/tv/113988") as Record<string, unknown>;
    expect(out.aggregateRating).toBeUndefined();
    expect(out.name).toBe("DAHMER - Monster: The Jeffrey Dahmer Story");
  });

  it("says nothing when there are no ratings at all", () => {
    expect(rating({ ...base, ratings: {} } as MediaDetail)).toBeUndefined();
  });
});
