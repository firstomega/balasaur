import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HIDDEN_GEM_MAX_VOTES,
  HIDDEN_GEM_MIN_SCORE,
  PROMO_TITLE_PATTERN,
  RANKED_MIN_FILM_MINUTES,
  RANKED_MIN_VOTES,
  SCORE_MIN_SOURCES,
  SCORE_MIN_VOTES,
  SINGLE_SOURCE_MIN_VOTES,
  SPECIAL_TITLE_PATTERN,
  isHiddenGem,
  isRankable,
  isScoreTrusted,
  listExclusion,
  scoreSourceCount,
  trustedScore,
  type ListInput,
} from "./trust";

const film = (over: Partial<ListInput> = {}): ListInput => ({
  mediaType: "movie",
  title: "Inception",
  genres: ["Action", "Science Fiction"],
  filmLengthMinutes: 148,
  ratings: { imdb: 8.8, rottenTomatoes: 87, metacritic: 74, tmdb: 8.4 },
  voteCount: 38000,
  ...over,
});

describe("score trust", () => {
  it("counts sources that carry a number", () => {
    expect(scoreSourceCount({ imdb: 7, tmdb: null, metacritic: undefined })).toBe(1);
    expect(scoreSourceCount({ imdb: 7, rottenTomatoes: 0 })).toBe(2);
  });

  it("hides a one-source score however many votes it has", () => {
    // The GTA VI trailer: TMDB only, 355 votes.
    expect(isScoreTrusted({ ratings: { tmdb: 8.8 }, voteCount: 355 })).toBe(false);
    expect(trustedScore({ ratings: { tmdb: 8.8 }, voteCount: 355 })).toBeUndefined();
  });

  it("accepts one source only with a crowd behind it", () => {
    // DAHMER - Monster: The Jeffrey Dahmer Story: TMDB only, 2,956 votes.
    expect(trustedScore({ ratings: { tmdb: 8.0 }, voteCount: 2956 })).toBe(80);
    expect(isScoreTrusted({ ratings: { tmdb: 8.0 }, voteCount: SINGLE_SOURCE_MIN_VOTES })).toBe(
      true,
    );
    expect(isScoreTrusted({ ratings: { tmdb: 8.0 }, voteCount: SINGLE_SOURCE_MIN_VOTES - 1 })).toBe(
      false,
    );
    // An unknown count never rescues a single source.
    expect(isScoreTrusted({ ratings: { tmdb: 8.0 } })).toBe(false);
    expect(isScoreTrusted({ ratings: {}, voteCount: 100000 })).toBe(false);
  });

  it("hides the 1-vote 100", () => {
    expect(trustedScore({ ratings: { tmdb: 10 }, voteCount: 1 })).toBeUndefined();
    expect(trustedScore({ ratings: { imdb: 10, tmdb: 10 }, voteCount: 1 })).toBeUndefined();
  });

  it("shows a two-source score at the vote floor", () => {
    const r = { imdb: 7.0, tmdb: 8.0 };
    expect(trustedScore({ ratings: r, voteCount: SCORE_MIN_VOTES - 1 })).toBeUndefined();
    expect(trustedScore({ ratings: r, voteCount: SCORE_MIN_VOTES })).toBe(73);
  });

  it("treats an unknown vote count as unknown, not zero", () => {
    expect(trustedScore({ ratings: { imdb: 7.0, tmdb: 8.0 } })).toBe(73);
    expect(trustedScore({ ratings: { imdb: 7.0, tmdb: 8.0 }, voteCount: null })).toBe(73);
  });

  it("prefers a precomputed blend when the title is trusted", () => {
    expect(trustedScore({ ratings: { imdb: 7, tmdb: 8, balasaur: 74 }, voteCount: 50 })).toBe(74);
    expect(trustedScore({ ratings: { tmdb: 8, balasaur: 80 }, voteCount: 50 })).toBeUndefined();
  });
});

describe("list exclusions", () => {
  it("drops movies under 40 minutes but keeps unknown runtimes", () => {
    expect(listExclusion(film({ filmLengthMinutes: 27 }))).toBe("short");
    expect(listExclusion(film({ filmLengthMinutes: RANKED_MIN_FILM_MINUTES }))).toBe(null);
    expect(listExclusion(film({ filmLengthMinutes: null }))).toBe(null);
    expect(listExclusion(film({ filmLengthMinutes: 0 }))).toBe(null);
    // TV runtime is per episode; never read it as a short.
    expect(listExclusion(film({ mediaType: "tv", filmLengthMinutes: 22 }))).toBe(null);
  });

  const promo = [
    "Grand Theft Auto VI: An Extended Look",
    "Dune: Part Two - Official Trailer",
    "Avatar: Fire and Ash (Trailer)",
    "Avatar 3 - Trailer 2",
    "Stranger Things 5 Teaser",
    "One Last Adventure: The Making of Stranger Things 5",
    "Our Planet: Behind the Scenes",
    "Wicked: A First Look",
  ];
  for (const title of promo) {
    it(`drops promo item ${title}`, () => {
      expect(listExclusion(film({ title }))).toBe("promo");
    });
  }

  const specials = [
    "The Guardians of the Galaxy Holiday Special",
    "The Trailer Park Boys Xmas Special",
    "Hannah Montana 20th Anniversary Special",
    "Harry Potter 20th Anniversary: Return to Hogwarts",
    "Friends: The Reunion",
  ];
  for (const title of specials) {
    it(`drops TV special ${title}`, () => {
      expect(listExclusion(film({ title }))).toBe("special");
    });
  }

  // Real titles that sit next to the patterns. Each one was in the live
  // catalog on 2026-10-15 and must stay rankable.
  const keep = [
    "Trailer Park Boys",
    "Trailer Park Boys: The Movie",
    "The Long, Long Trailer",
    "The Making of an Ordinary Woman",
    "Law & Order: Special Victims Unit",
    "Midnight Special",
    "Special Ops",
    "American Reunion",
    "Romy and Michele's High School Reunion",
    "Anniversary",
    "First Man",
    "The Wolf of Wall Street",
  ];
  for (const title of keep) {
    it(`keeps ${title}`, () => {
      expect(listExclusion(film({ title }))).toBe(null);
    });
  }

  it("drops talk, reality and news shows", () => {
    expect(listExclusion(film({ mediaType: "tv", genres: ["Comedy", "Talk"] }))).toBe(
      "talk-news-reality",
    );
    expect(listExclusion(film({ mediaType: "tv", genres: ["Reality TV"] }))).toBe(
      "talk-news-reality",
    );
    // News folds into "Documentary" in the stored genres; only TMDB's names show it.
    expect(
      listExclusion(
        film({ mediaType: "tv", genres: ["Documentary"], tmdbGenres: ["News", "Documentary"] }),
      ),
    ).toBe("talk-news-reality");
    expect(
      listExclusion(
        film({ mediaType: "tv", genres: ["Documentary"], tmdbGenres: ["Documentary"] }),
      ),
    ).toBe(null);
  });
});

describe("rankable", () => {
  it("ranks a famous, well-rated film", () => {
    expect(isRankable(film())).toBe(true);
  });

  it("refuses the GTA VI trailer on every count", () => {
    const gta = film({
      title: "Grand Theft Auto VI: An Extended Look",
      filmLengthMinutes: 27,
      ratings: { tmdb: 8.8 },
      voteCount: 355,
    });
    expect(isRankable(gta)).toBe(false);
  });

  it("asks a list for more votes than a badge, and unknown fails", () => {
    expect(isRankable(film({ voteCount: RANKED_MIN_VOTES - 1 }))).toBe(false);
    expect(isScoreTrusted(film({ voteCount: RANKED_MIN_VOTES - 1 }))).toBe(true);
    expect(isRankable(film({ voteCount: RANKED_MIN_VOTES }))).toBe(true);
    expect(isRankable(film({ voteCount: undefined }))).toBe(false);
  });

  it("calls a high score with few votes a hidden gem, never a one-source one", () => {
    const gem = film({ ratings: { imdb: 8.2, tmdb: 8.0 }, voteCount: 300 });
    expect(isHiddenGem(gem)).toBe(true);
    expect(isHiddenGem({ ...gem, voteCount: HIDDEN_GEM_MAX_VOTES })).toBe(false);
    expect(isHiddenGem({ ...gem, ratings: { tmdb: 9.5 } })).toBe(false);
    expect(isHiddenGem({ ...gem, ratings: { imdb: 6.0, tmdb: 6.0 } })).toBe(false);
    expect(HIDDEN_GEM_MIN_SCORE).toBeGreaterThan(70);
  });
});

describe("SQL mirror", () => {
  // The migration that writes the same rule into Postgres. If one side moves
  // without the other, a card and a list disagree about the same title.
  const sql = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../supabase/migrations/20261015120000_trust_gate.sql",
    ),
    "utf8",
  );

  it("carries both title patterns verbatim", () => {
    expect(sql).toContain(`'${PROMO_TITLE_PATTERN}'`);
    expect(sql).toContain(`'${SPECIAL_TITLE_PATTERN}'`);
  });

  it("carries every threshold", () => {
    expect(sql).toContain(`>= ${SCORE_MIN_SOURCES}`);
    expect(sql).toContain(`p_votes >= ${SCORE_MIN_VOTES}`);
    expect(sql).toContain(`p_sources = 1 and p_votes >= ${SINGLE_SOURCE_MIN_VOTES}`);
    expect(sql).toContain(`coalesce(p_votes, 0) >= ${RANKED_MIN_VOTES}`);
    expect(sql).toContain(`p_film_minutes between 1 and ${RANKED_MIN_FILM_MINUTES - 1}`);
    expect(sql).toContain(`e.rating_balasaur >= ${HIDDEN_GEM_MIN_SCORE}`);
    expect(sql).toContain(`coalesce(e.vote_count, 0) < ${HIDDEN_GEM_MAX_VOTES}`);
    expect(sql).toContain(`array['Talk', 'Reality TV']`);
    expect(sql).toContain(`'[{"name":"News"}]'`);
  });
});
