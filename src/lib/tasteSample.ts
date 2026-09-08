// The example library the taste page draws a card from before it has yours.
//
// WHY THIS EXISTS. /taste is the page a shared card links back to, so most of
// its visitors arrive having just seen a card and having rated nothing. The old
// page met them with a locked panel, which is the one thing guaranteed not to
// make anybody want one. This is seventeen real catalog rows, run through the
// same `computeTaste` as a real list, so the example card is drawn by the real
// rule table rather than typed out by hand: the name, the sentence, the four
// posters and the disagreement are all consequences of these rows.
//
// It lives in its own module so the rows never reach the profile page or any
// other importer of `@/lib/taste`.
//
// Every number here is the catalog's own on 2026-09-08. Scores are omitted and
// recomputed nowhere: they are `computeBalasaurScore` of the stored ratings, so
// the example card carries the same scores the title pages do. Colours are not
// listed, because the card reads them off the posters it draws.

import type { StatusMap } from "@/hooks/useUserStatus";
import { computeTaste, type TasteProfile, type TitleFact } from "@/lib/taste";

const P = "https://image.tmdb.org/t/p/w500";

interface Seed extends TitleFact {
  state: "liked" | "seen";
}

/** The ten Loved titles, the three merely watched, in catalog order. */
const WATCHED: Seed[] = [
  {
    id: "movie-348",
    title: "Alien",
    year: "1979",
    mediaType: "movie",
    genres: ["Horror", "Science Fiction"],
    origins: ["British", "American"],
    posterUrl: `${P}/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg`,
    score: 87,
    critic: 89,
    criticSource: "Metacritic",
    state: "liked",
  },
  {
    id: "movie-948",
    title: "Halloween",
    year: "1978",
    mediaType: "movie",
    genres: ["Horror", "Thriller"],
    origins: ["American"],
    posterUrl: `${P}/wijlZ3HaYMvlDTPqJoTCWKFkCPU.jpg`,
    score: 84,
    critic: 91,
    criticSource: "Metacritic",
    state: "liked",
  },
  {
    id: "movie-141",
    title: "Donnie Darko",
    year: "2001",
    mediaType: "movie",
    genres: ["Fantasy", "Drama", "Mystery"],
    origins: ["American"],
    posterUrl: `${P}/j2AtZFsflxiluaNtajMTI0Avm8C.jpg`,
    score: 83,
    critic: 88,
    criticSource: "Metacritic",
    state: "liked",
  },
  {
    id: "movie-419430",
    title: "Get Out",
    year: "2017",
    mediaType: "movie",
    genres: ["Mystery", "Thriller", "Horror"],
    origins: ["American"],
    posterUrl: `${P}/tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg`,
    score: 83,
    critic: 85,
    criticSource: "Metacritic",
    state: "liked",
  },
  {
    id: "movie-694",
    title: "The Shining",
    year: "1980",
    mediaType: "movie",
    genres: ["Horror", "Thriller"],
    origins: ["British", "American"],
    posterUrl: `${P}/uAR0AWqhQL1hQa69UDEbb2rE5Wx.jpg`,
    score: 80,
    critic: 68,
    criticSource: "Metacritic",
    state: "liked",
  },
  {
    id: "movie-264660",
    title: "Ex Machina",
    year: "2015",
    mediaType: "movie",
    genres: ["Drama", "Science Fiction"],
    origins: ["British", "American"],
    posterUrl: `${P}/dmJW8IAKHKxFNiUnoDR7JfsK7Rp.jpg`,
    score: 80,
    critic: 78,
    criticSource: "Metacritic",
    state: "liked",
  },
  {
    id: "movie-493922",
    title: "Hereditary",
    year: "2018",
    mediaType: "movie",
    genres: ["Horror", "Mystery", "Thriller"],
    origins: ["British", "American"],
    posterUrl: `${P}/4GFPuL14eXi66V96xBWY73Y9PfR.jpg`,
    score: 79,
    critic: 87,
    criticSource: "Metacritic",
    state: "liked",
  },
  {
    id: "movie-1091",
    title: "The Thing",
    year: "1982",
    mediaType: "movie",
    genres: ["Horror", "Mystery", "Science Fiction"],
    origins: ["American"],
    posterUrl: `${P}/tzGY49kseSE9QAKk47uuDGwnSCu.jpg`,
    score: 77,
    critic: 57,
    criticSource: "Metacritic",
    state: "liked",
  },
  {
    id: "movie-152603",
    title: "Only Lovers Left Alive",
    year: "2013",
    mediaType: "movie",
    genres: ["Drama", "Romance", "Fantasy"],
    origins: ["British", "American"],
    posterUrl: `${P}/6siwECwpRbNX70ybF8iqZqnspGP.jpg`,
    score: 76,
    critic: 79,
    criticSource: "Metacritic",
    state: "liked",
  },
  {
    id: "movie-8413",
    title: "Event Horizon",
    year: "1997",
    mediaType: "movie",
    genres: ["Horror", "Science Fiction", "Mystery"],
    origins: ["British", "American"],
    posterUrl: `${P}/qfluaDXv0cIdLwgQWzNB2piHL2q.jpg`,
    score: 53,
    critic: 35,
    criticSource: "Metacritic",
    state: "liked",
  },
  {
    id: "movie-11906",
    title: "Suspiria",
    year: "1977",
    mediaType: "movie",
    genres: ["Horror"],
    origins: [],
    posterUrl: `${P}/sEcvc9h1X3hYZdFgtiiKMm6RB3f.jpg`,
    score: 79,
    critic: 79,
    criticSource: "Metacritic",
    state: "seen",
  },
  {
    id: "movie-138843",
    title: "The Conjuring",
    year: "2013",
    mediaType: "movie",
    genres: ["Horror", "Thriller"],
    origins: ["American"],
    posterUrl: `${P}/wVYREutTvI2tmxr6ujrHT704wGF.jpg`,
    score: 76,
    critic: 68,
    criticSource: "Metacritic",
    state: "seen",
  },
  {
    id: "movie-530385",
    title: "Midsommar",
    year: "2019",
    mediaType: "movie",
    genres: ["Horror", "Drama", "Mystery"],
    origins: ["American"],
    posterUrl: `${P}/7LEI8ulZzO5gy9Ww2NVCrKmHeDZ.jpg`,
    score: 74,
    critic: 72,
    criticSource: "Metacritic",
    state: "seen",
  },
];

/** Four on the watchlist. They are counted and never described, exactly as a
 *  real card counts them: nothing unwatched can be evidence of taste. */
const WANTED = ["movie-503919", "movie-300668", "movie-242224", "movie-396535"];

export const SAMPLE_STATUSES: StatusMap = Object.fromEntries([
  ...WATCHED.map((s) => [
    s.id,
    s.state === "liked"
      ? { status: "seen" as const, sentiment: "liked" as const, ts: 1 }
      : { status: "seen" as const, ts: 1 },
  ]),
  ...WANTED.map((id) => [id, { status: "unseen" as const, intent: "want" as const, ts: 1 }]),
]);

export const SAMPLE_FACTS: readonly TitleFact[] = WATCHED.map(({ state: _state, ...fact }) => fact);

/** Titles in the example library, for the line that says so on the page. */
export const SAMPLE_SIZE = WATCHED.length + WANTED.length;

/** The example card's profile, from the same function a real list goes through. */
export function sampleTasteProfile(): TasteProfile {
  return computeTaste(SAMPLE_STATUSES, SAMPLE_FACTS);
}
