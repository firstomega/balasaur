import { describe, expect, it } from "bun:test";
import { clampDescription, composeTitle, detailMeta, personMeta } from "./seo";

describe("composeTitle", () => {
  it("keeps every tail that fits and adds the brand when it is free", () => {
    expect(composeTitle("Inception (2010)", [": IMDb 8.8", ", Rotten Tomatoes 86%"])).toBe(
      "Inception (2010): IMDb 8.8, Rotten Tomatoes 86% | Balasaur",
    );
  });

  it("keeps the keywords and drops the brand, never the other way round", () => {
    // 45 characters of title leaves room for one score or the brand, not both.
    const out = composeTitle("Little Amélie or the Character of Rain (2025)", [": IMDb 7.6"]);
    expect(out).toBe("Little Amélie or the Character of Rain (2025): IMDb 7.6");
    expect(out).not.toContain("Balasaur");
  });

  it("drops tails from the least valuable end when nothing else fits", () => {
    const out = composeTitle("The Punisher: One Last Kill (2026)", [
      ": IMDb 6.9",
      ", Rotten Tomatoes 83%",
    ]);
    expect(out).toBe("The Punisher: One Last Kill (2026): IMDb 6.9 | Balasaur");
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

// Real rows from the catalog on 2026-10-15, trimmed to what the builders read.
// Episode counts and series status come from TMDB, not the catalog row.
const inception = {
  mediaType: "movie",
  title: "Inception",
  year: "2010",
  runtime: 148,
  streaming: [] as string[],
  voteCount: 39857,
  ratings: { balasaur: 84, imdb: 8.8, rottenTomatoes: 86, metacritic: 74, tmdb: 8.4 },
  overview: "A thief who steals corporate secrets through dream-sharing technology.",
};
const godfather = {
  mediaType: "movie",
  title: "The Godfather",
  year: "1972",
  runtime: 175,
  streaming: ["Prime", "Paramount+"],
  ratings: { balasaur: 94, imdb: 9.2, rottenTomatoes: 97, metacritic: 100, tmdb: 8.7 },
};
const anora = {
  mediaType: "movie",
  title: "Anora",
  year: "2024",
  runtime: 139,
  streaming: ["Hulu"],
  ratings: { balasaur: 81, imdb: 7.4, rottenTomatoes: 93, metacritic: 91, tmdb: 7.1 },
};
const darkKnight = {
  mediaType: "movie",
  title: "The Dark Knight",
  year: "2008",
  runtime: 152,
  streaming: ["Max"],
  ratings: { balasaur: 89, imdb: 9.1, rottenTomatoes: 94, metacritic: 85, tmdb: 8.5 },
};
const interstellar = {
  mediaType: "movie",
  title: "Interstellar",
  year: "2014",
  runtime: 169,
  streaming: ["Prime", "Paramount+"],
  ratings: { balasaur: 81, imdb: 8.7, rottenTomatoes: 73, metacritic: 74, tmdb: 8.5 },
};
const breakingBad = {
  mediaType: "tv",
  title: "Breaking Bad",
  year: "2008",
  numberOfSeasons: 5,
  numberOfEpisodes: 62,
  facts: { status: "Ended" },
  streaming: ["Netflix"],
  ratings: { balasaur: 94, imdb: 9.5, rottenTomatoes: 96, tmdb: 9 },
};
const got = {
  mediaType: "tv",
  title: "Game of Thrones",
  year: "2011",
  numberOfSeasons: 8,
  numberOfEpisodes: 73,
  facts: { status: "Ended" },
  streaming: ["Max"],
  ratings: { balasaur: 90, imdb: 9.2, tmdb: 8.5 },
};
const severance = {
  mediaType: "tv",
  title: "Severance",
  year: "2022",
  numberOfSeasons: 2,
  numberOfEpisodes: 19,
  facts: { status: "Returning Series" },
  streaming: ["Apple TV+"],
  ratings: { balasaur: 85, imdb: 8.6, tmdb: 8.4 },
};
const strangerThings = {
  mediaType: "tv",
  title: "Stranger Things",
  year: "2016",
  numberOfSeasons: 5,
  numberOfEpisodes: 42,
  facts: { status: "Ended" },
  streaming: ["Netflix"],
  ratings: { balasaur: 86, imdb: 8.6, tmdb: 8.5 },
};
// The ugly one: TMDB is the only source, the name is long, one season.
const dahmer = {
  mediaType: "tv",
  title: "DAHMER - Monster: The Jeffrey Dahmer Story",
  year: "2022",
  numberOfSeasons: 1,
  numberOfEpisodes: 10,
  facts: { status: "Ended" },
  streaming: ["Netflix"],
  voteCount: 2911,
  ratings: { balasaur: 80, tmdb: 8 },
};
// Longest name in the catalog among titles carrying both familiar scores.
const borat = {
  mediaType: "movie",
  title:
    "Borat Subsequent Moviefilm: Delivery of Prodigious Bribe to American Regime for Make Benefit Once Glorious Nation of Kazakhstan",
  year: "2020",
  runtime: 96,
  streaming: ["Prime"],
  ratings: { balasaur: 72, imdb: 6.6, rottenTomatoes: 85, metacritic: 68, tmdb: 6.7 },
};
const all = [
  inception,
  godfather,
  anora,
  darkKnight,
  interstellar,
  breakingBad,
  got,
  severance,
  strangerThings,
  dahmer,
  borat,
];

describe("detailMeta title", () => {
  it("names the scores people search for", () => {
    expect(detailMeta(inception).title).toBe(
      "Inception (2010): IMDb 8.8, Rotten Tomatoes 86% | Balasaur",
    );
    expect(detailMeta(breakingBad).title).toBe(
      "Breaking Bad (2008): IMDb 9.5, Rotten Tomatoes 96%",
    );
    expect(detailMeta(severance).title).toBe("Severance (2022): IMDb 8.6 | Balasaur");
  });

  it("drops the second score before the first when the name runs long", () => {
    expect(detailMeta(godfather).title).toBe("The Godfather (1972): IMDb 9.2, Rotten Tomatoes 97%");
    expect(
      detailMeta({ ...interstellar, title: "The Lord of the Rings: The Two Towers", year: "2002" })
        .title,
    ).toBe("The Lord of the Rings: The Two Towers (2002): IMDb 8.7");
  });

  it("falls back to the title and year when no familiar score exists", () => {
    // TMDB is not a score anyone types into a search box.
    expect(detailMeta(dahmer).title).toBe(
      "DAHMER - Monster: The Jeffrey Dahmer Story (2022) | Balasaur",
    );
    expect(detailMeta({ mediaType: "movie", title: "Obscure", ratings: {} }).title).toBe(
      "Obscure | Balasaur",
    );
  });

  it("lets Metacritic stand in only when a familiar score is missing", () => {
    expect(detailMeta({ ...anora, ratings: { imdb: 7.4, metacritic: 91 } }).title).toBe(
      "Anora (2024): IMDb 7.4, Metacritic 91 | Balasaur",
    );
    expect(detailMeta(anora).title).not.toContain("Metacritic");
  });

  it("no longer carries the blended rating or 'where to watch'", () => {
    for (const d of all) {
      const { title } = detailMeta(d);
      expect(title).not.toContain("/100");
      expect(title).not.toContain("where to watch");
      expect(title).not.toContain("—");
    }
  });

  it("stays inside the display budget unless the name alone overruns it", () => {
    for (const d of all) {
      const { title } = detailMeta(d);
      const head = `${d.title} (${d.year})`;
      if (head.length <= 60) expect(title.length).toBeLessThanOrEqual(60);
      else expect(title).toBe(head);
    }
  });
});

describe("detailMeta description", () => {
  it("leads with the length, then the familiar scores, then where it streams", () => {
    expect(detailMeta(godfather).description).toBe(
      "The Godfather (1972) runs 2h 55m. IMDb 9.2/10, Rotten Tomatoes 97%, Metacritic 100/100. Streaming on Prime and Paramount+. Balasaur Score 94 out of 100.",
    );
    expect(detailMeta(breakingBad).description).toBe(
      "Breaking Bad (2008) ran 5 seasons and 62 episodes. IMDb 9.5/10, Rotten Tomatoes 96%. Streaming on Netflix. Balasaur Score 94 out of 100.",
    );
    expect(detailMeta(severance).description).toStartWith(
      "Severance (2022) has 2 seasons and 19 episodes so far. IMDb 8.6/10.",
    );
  });

  it("does not open every page with the same words", () => {
    // Every description used to open "A Balasaur Score of N out of 100, drawn from".
    const openings = new Set(all.map((d) => detailMeta(d).description.slice(0, 24)));
    expect(openings.size).toBe(all.length);
    for (const d of all) {
      expect(detailMeta(d).description).not.toStartWith("A Balasaur Score");
    }
  });

  it("never mentions a critic and audience gap", () => {
    // Inception's description used to end "Audiences rate it 14 points higher
    // than critics do."
    for (const d of all) {
      expect(/\bcritics?\b|\baudiences\b|points higher/i.test(detailMeta(d).description)).toBe(
        false,
      );
    }
  });

  it("keeps every description under 160 characters with no em-dashes", () => {
    for (const d of all) {
      const { description } = detailMeta(d);
      expect(description.length).toBeLessThanOrEqual(160);
      expect(description).not.toContain("—");
    }
  });

  it("does not restate a one-source score as a blend", () => {
    expect(detailMeta(dahmer).description).toBe(
      "DAHMER - Monster: The Jeffrey Dahmer Story (2022) ran 1 season of 10 episodes. TMDB 8.0/10. Streaming on Netflix.",
    );
  });

  it("drops the name from the lead when it would crowd out the facts", () => {
    const out = detailMeta(borat).description;
    expect(out).toStartWith("It runs 1h 36m. IMDb 6.6/10, Rotten Tomatoes 85%");
    expect(out).toContain("Streaming on Prime.");
  });

  it("opens on the scores when there is no length to state", () => {
    const out = detailMeta({ ...inception, runtime: undefined }).description;
    expect(out).toStartWith(
      "Inception (2010): IMDb 8.8/10, Rotten Tomatoes 86%, Metacritic 74/100.",
    );
  });

  it("names the service in the lead when streaming is the only fact", () => {
    const quiet = {
      mediaType: "movie",
      title: "Quiet One",
      year: "2025",
      streaming: ["Netflix"],
      ratings: {},
    };
    expect(detailMeta(quiet).description).toBe("Quiet One (2025) is streaming on Netflix.");
  });

  it("does not claim a series is still running when its status is unknown", () => {
    const out = detailMeta({ ...breakingBad, facts: {} }).description;
    expect(out).toStartWith("Breaking Bad (2008) has 5 seasons and 62 episodes.");
    expect(out).not.toContain("so far");
  });

  it("adds series standing when there is room", () => {
    const franchise = { size: 3, rank: 1 };
    const out = detailMeta({ ...severance, context: { franchise } });
    expect(out.description).toContain("The highest scoring of the 3 titles in its series.");
    // A full movie row has no room left, and the facts ahead of it win.
    const full = detailMeta({ ...darkKnight, context: { franchise } }).description;
    expect(full).not.toContain("its series");
    expect(full.endsWith("Balasaur Score 89 out of 100.")).toBe(true);
  });

  it("falls back to the synopsis only when there is no fact to state", () => {
    const out = detailMeta({
      mediaType: "movie",
      title: "Obscure",
      ratings: {},
      overview: "Something happens to someone.",
    });
    expect(out.description).toBe("Something happens to someone.");
    expect(detailMeta(inception).description).not.toContain("dream-sharing");
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
