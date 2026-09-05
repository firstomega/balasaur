import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { GameShell } from "@/components/arcade/GameShell";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import { GuessBox } from "@/components/arcade/GuessBox";
import { MatchBoard, type MatchPair } from "@/components/arcade/MatchBoard";
import {
  OddOneOut,
  type OddOneOutChoice,
  type OddOneOutReveal,
} from "@/components/arcade/OddOneOut";
import { ChainBoard, type ChainStep } from "@/components/arcade/ChainBoard";
import { OrderBoard, type OrderReveal } from "@/components/arcade/OrderBoard";
import { QuizBoard, type QuizMedia } from "@/components/arcade/QuizBoard";
import { BinSort, type BinCard, type BinDef } from "@/components/arcade/BinSort";
import {
  ChipStrip,
  PosterBoard,
  POSTER_MAX_GUESSES,
  REVEAL_HOLD_MS,
} from "@/components/arcade/PosterBoard";
import { EmojiStage, PosterFlip } from "@/components/arcade/EmojiStage";
import type { EndScreenContent } from "@/components/arcade/EndScreen";
import type { SnippetRow } from "@/components/arcade/LeaderboardSnippet";
import { useArcadeGame, type ArcadeGameApi } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import {
  balasaurdlePayout,
  castingCallPayout,
  emojiPayout,
  linkUpPayout,
  posterRevealPayout,
  quoteMatchPayout,
  screeningPayout,
  sequelOrFakePayout,
  speedSortPayout,
  taglinesPayout,
  timelinePayout,
} from "@/lib/arcade/comets";
import {
  shareBalasaurdle,
  shareCastingCall,
  shareEmoji,
  shareLinkUp,
  sharePosterReveal,
  shareQuoteMatch,
  shareScreening,
  shareSequelOrFake,
  shareSpeedSort,
  shareTaglines,
  shareTimeline,
} from "@/lib/arcade/share";
import { distribution } from "@/lib/arcade/stats";
import { ENABLED_SLUGS, GAMES, hueVars } from "@/lib/arcade/games";
import type { GameSlug, GameStats, PayoutLine } from "@/lib/arcade/types";
import type { ArcadeMediaCard, SequelRoundItem } from "@/lib/arcade.functions";
import type { SearchHit } from "@/lib/catalog.functions";
import { MAX_GUESSES as DAILY_MAX_GUESSES, MAX_HINTS } from "@/lib/daily";
import { noindexMeta } from "@/lib/seo";
import { tmdbImage } from "@/lib/tmdbImage";
import { mediaSlug } from "@/lib/slug";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types/media";

// Dev-only preview harness for the arcade. /dev/arcade?game=<slug>&state=
// <ready|playing|ended> renders the real GameShell, the real board primitive,
// and the real engine hook for one game, seeded with fixture rounds so every
// phase can be looked at without a database or a clock. The composition of
// each game mirrors its play.<slug>.tsx route: same shell props, same board
// props, same end-screen content shape, same blocks under the shell. Nothing
// here is new UI. The yesterday block is loader data and is not mirrored.
//
// Production builds 404 this route from the loader and it is not in the
// sitemap. Posters are inline SVG data URIs so the cards render offline.

type HarnessState = "ready" | "playing" | "ended";

const STATES: HarnessState[] = ["ready", "playing", "ended"];
const DAY = 18;

/** One fixture record, so every end screen shows a full StatsBlock. */
const STATS: GameStats = {
  played: 17,
  wins: 14,
  streak: 4,
  best: 9,
  lastDay: DAY,
  dist: { "1": 1, "2": 3, "3": 5, "4": 3, "5": 2, "6": 0, X: 3 },
};
const DIST_LABELS = ["1", "2", "3", "4", "5", "6"];

function isSlug(v: unknown): v is GameSlug {
  return typeof v === "string" && v in GAMES;
}

/** The share text's second line, drawn as squares on the end screen. */
function gridOf(text: string): string[] {
  return [text.split("\n")[1] ?? ""];
}

export const Route = createFileRoute("/dev/arcade")({
  validateSearch: (s: Record<string, unknown>): { game: GameSlug; state: HarnessState } => ({
    game: isSlug(s.game) ? s.game : "quote-match",
    state: STATES.includes(s.state as HarnessState) ? (s.state as HarnessState) : "ready",
  }),
  loader: async () => {
    if (!import.meta.env.DEV) throw notFound();
    return null;
  },
  head: () => ({
    meta: [{ title: "Arcade preview" }, noindexMeta()],
  }),
  component: DevArcadePage,
});

// ---------------------------------------------------------------------------
// Fixture posters: a 2:3 card with a two-tone gradient and the title, so a
// human can tell cards apart in a screenshot.

function wrapTitle(title: string, max = 12): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of title.split(" ")) {
    if (cur && (cur + " " + word).length > max) {
      lines.push(cur);
      cur = word;
    } else {
      cur = cur ? cur + " " + word : word;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

function poster(title: string, year: string, from: string, to: string): string {
  const lines = wrapTitle(title);
  const startY = 150 - ((lines.length - 1) * 26) / 2;
  const text = lines
    .map(
      (l, i) =>
        `<text x="100" y="${startY + i * 26}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#fff">${l
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</text>`,
    )
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="200" height="300" fill="url(#g)"/>` +
    `<rect x="12" y="12" width="176" height="276" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>` +
    text +
    `<text x="100" y="270" text-anchor="middle" font-family="monospace" font-size="14" fill="rgba(255,255,255,0.8)">${year}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function card(
  id: string,
  title: string,
  year: string,
  from: string,
  to: string,
  mediaType: "movie" | "tv" = "movie",
): ArcadeMediaCard {
  return { id, mediaType, title, year, posterUrl: poster(title, year, from, to) };
}

const MATRIX = card("movie-603", "The Matrix", "1999", "#0f3d2e", "#1fa36b");
const INCEPTION = card("movie-27205", "Inception", "2010", "#1b2a4a", "#4a7bd0");
const JURASSIC = card("movie-329", "Jurassic Park", "1993", "#3a2a0f", "#c98a1e");
const TITANIC = card("movie-597", "Titanic", "1997", "#2a123a", "#9a4fd6");
const GODFATHER = card("movie-238", "The Godfather", "1972", "#3a0f14", "#b8332f");
const PULP = card("movie-680", "Pulp Fiction", "1994", "#3a2f0f", "#d6b12f");
const HEAT = card("movie-949", "Heat", "1995", "#0f2a3a", "#2f8fb8");
const ALIEN = card("movie-348", "Alien", "1979", "#101010", "#5a6b5f");
const APOCALYPSE = card("movie-28", "Apocalypse Now", "1979", "#3a1f0f", "#d0642f");
const SPEED = card("movie-1637", "Speed", "1994", "#1f1f3a", "#6f6fd6");
const JAWS = card("movie-578", "Jaws", "1975", "#0f1f3a", "#2f5fb8");
const BREAKING_BAD = card("tv-1396", "Breaking Bad", "2008", "#1f3a0f", "#8fb82f", "tv");
const DARK_KNIGHT = card("movie-155", "The Dark Knight", "2008", "#101828", "#3a4a6b");

const FIVE = [MATRIX, INCEPTION, JURASSIC, TITANIC, GODFATHER];

function toMediaItem(c: ArcadeMediaCard): MediaItem {
  return {
    id: c.id,
    mediaType: c.mediaType,
    title: c.title,
    year: c.year,
    overview: "",
    posterUrl: c.posterUrl,
    ratings: {},
    genres: [],
    streaming: [],
    lengthLabel: "",
    people: [],
  };
}

function detailPath(media: ArcadeMediaCard) {
  return {
    to: media.mediaType === "movie" ? ("/movie/$id" as const) : ("/tv/$id" as const),
    params: { id: mediaSlug(media.id.replace(/^(movie|tv)-/, ""), media.title) },
  };
}

function MediaLink({ media, className }: { media: ArcadeMediaCard; className?: string }) {
  const { to, params } = detailPath(media);
  return (
    <Link
      to={to}
      params={params}
      className={
        className ?? "font-semibold text-text-bright hover:text-[var(--game,var(--primary))]"
      }
    >
      {media.title}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Engine seeding: the real hook, pushed into the requested phase on mount.

interface Seed {
  score?: number;
  combo?: number;
  round?: number;
  /** Seconds on the clock while playing. */
  timer?: number;
  /** What the clock running out does, read through a ref so it sees the
   *  latest closure. */
  onExpire?: () => void;
  /** Payout lines for the ended phase. */
  lines?: PayoutLine[];
}

function useSeededEngine(state: HarnessState, seed: Seed): ArcadeGameApi {
  const api = useArcadeGame();
  const seededRef = useRef(false);
  const expireRef = useRef(seed.onExpire);
  expireRef.current = seed.onExpire;
  useEffect(() => {
    if (seededRef.current || state === "ready") return;
    seededRef.current = true;
    api.start();
    if (seed.score) api.addScore(seed.score);
    for (let i = 0; i < (seed.combo ?? 0); i++) api.hitCombo();
    for (let i = 1; i < (seed.round ?? 1); i++) api.nextRound();
    if (state === "playing" && seed.timer) api.startTimer(seed.timer, () => expireRef.current?.());
    if (state === "ended") api.finish(seed.lines ?? []);
    // Seeds once per mount; the search params remount the harness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return api;
}

// ---------------------------------------------------------------------------
// Shared page chrome, mirrored from the play routes.

function MoreGames({ slug }: { slug: GameSlug }) {
  return (
    <section className="mt-8">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">More games</h2>
      <ScrollRail className="mt-2 gap-2.5">
        {ENABLED_SLUGS.filter((s) => s !== slug).map((s) => (
          <ArcadeTile key={s} game={GAMES[s]} className="w-[168px] shrink-0" />
        ))}
      </ScrollRail>
      <Link
        to="/play"
        className="mt-2 inline-block font-mono text-[11px] uppercase tracking-wider text-text-dim underline hover:text-text-bright"
      >
        All games
      </Link>
    </section>
  );
}

/** The small muted pill under the guess games (Reveal the answer). */
const PILL_MUTED =
  "inline-flex items-center rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-text-dim hover:border-text-dim hover:text-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--game,var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-background";
/** The hue pill (Take a hint). */
const PILL_HUE =
  "inline-flex items-center rounded-full border border-[var(--game,var(--primary))] px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--game,var(--primary))] hover:[background:color-mix(in_oklab,var(--game,var(--primary))_14%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--game,var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function Attribution() {
  return <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>;
}

// ---------------------------------------------------------------------------
// Quote Match and Tagline Roulette: MatchBoard, 2 of 5 paired mid-round.

const QUOTES: { media: ArcadeMediaCard; quote: string }[] = [
  { media: MATRIX, quote: "I know kung fu." },
  { media: INCEPTION, quote: "You mustn't be afraid to dream a little bigger, darling." },
  { media: JURASSIC, quote: "Hold on to your butts." },
  { media: TITANIC, quote: "I'm the king of the world!" },
  { media: GODFATHER, quote: "I'm gonna make him an offer he can't refuse." },
];

const TAGLINES: { media: ArcadeMediaCard; text: string }[] = [
  { media: MATRIX, text: "Welcome to the Real World." },
  { media: INCEPTION, text: "Your mind is the scene of the crime." },
  { media: JURASSIC, text: "An adventure 65 million years in the making." },
  { media: TITANIC, text: "Nothing on Earth could come between them." },
  { media: GODFATHER, text: "An offer you can't refuse." },
];

// Poster column order differs from the prompt order, as the day-seeded
// shuffle does on the real board.
const SHUFFLED_FIVE = [TITANIC, GODFATHER, MATRIX, JURASSIC, INCEPTION];

const MATCH_HOW_TO: Record<"quote-match" | "taglines", string[]> = {
  "quote-match": [
    "Tap a line, then tap the poster of the movie that said it.",
    "A right pair locks. A wrong pair shakes and stays open.",
    "Only first-try pairs score. Five clean pairs is the best board.",
  ],
  taglines: [
    "Tap a tagline, then tap the poster it was printed on.",
    "A right pair locks. A wrong pair shakes and stays open.",
    "Only first-try pairs score. Five clean pairs is the best board.",
  ],
};
const MATCH_LOST_HINT = "A first-try match pays 2 comets. Five of them pay 15.";
const MATCH_SIZE = 5;
const LAST_PAIR_BEAT_MS = 1500;

function matchTier(matches: number, clean: boolean): string | undefined {
  if (matches === MATCH_SIZE) return clean ? "Clean board" : "All five";
  if (matches >= 3) return "Close";
  return undefined;
}

function MatchHarness({ slug, state }: { slug: "quote-match" | "taglines"; state: HarnessState }) {
  const GAME = GAMES[slug];
  const payout = slug === "quote-match" ? quoteMatchPayout : taglinesPayout;
  const share = slug === "quote-match" ? shareQuoteMatch : shareTaglines;
  const prompts =
    slug === "quote-match"
      ? QUOTES.map((q) => ({ id: q.media.id, text: q.quote }))
      : TAGLINES.map((t) => ({ id: t.media.id, text: t.text }));
  const initialMatched: MatchPair[] =
    state === "playing"
      ? [
          { promptId: JURASSIC.id, titleId: JURASSIC.id },
          { promptId: GODFATHER.id, titleId: GODFATHER.id },
        ]
      : [];
  const END = { matches: 4, clean: false };
  const api = useSeededEngine(state, { score: 2, combo: 2, lines: payout(END) });
  const comets = useComets();

  const [matched, setMatched] = useState<MatchPair[]>(initialMatched);
  const [result, setResult] = useState(state === "ended" ? END : null);
  const matchedRef = useRef<MatchPair[]>(initialMatched);
  const wrongRef = useRef<Set<string>>(new Set());
  const firstTryRef = useRef(state === "playing" ? 2 : 0);
  const beatRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (beatRef.current) window.clearTimeout(beatRef.current);
    },
    [],
  );

  const endRun = () => {
    const matches = firstTryRef.current;
    const clean = matches === MATCH_SIZE;
    setResult({ matches, clean });
    api.finish(payout({ matches, clean }));
  };

  const onPair = (promptId: string, titleId: string): boolean => {
    const ok = promptId === titleId;
    if (!ok) {
      wrongRef.current.add(promptId);
      api.breakCombo();
      return false;
    }
    api.hitCombo();
    if (!wrongRef.current.has(promptId)) {
      firstTryRef.current += 1;
      api.addScore(1);
    }
    const next = [...matchedRef.current, { promptId, titleId }];
    matchedRef.current = next;
    setMatched(next);
    if (next.length === MATCH_SIZE) {
      beatRef.current = window.setTimeout(endRun, LAST_PAIR_BEAT_MS);
    }
    return true;
  };

  const end = useMemo<EndScreenContent>(() => {
    const matches = result?.matches ?? 0;
    const clean = result?.clean ?? false;
    const text = share({ day: DAY, matches, clean });
    const tier = matchTier(matches, clean);
    const headline = `${matches} of ${MATCH_SIZE} on the first try`;
    return {
      tier,
      headline,
      grid: gridOf(text),
      stats: STATS,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? GAME.hook },
      answers: FIVE.map(toMediaItem),
      answersLabel: "Today's five",
      lost: matches === 0,
      lostHint: MATCH_LOST_HINT,
    };
  }, [result, share, GAME.hook]);

  return (
    <>
      <GameShell
        game={GAME}
        api={api}
        comets={comets}
        dayNumber={DAY}
        howTo={MATCH_HOW_TO[slug]}
        end={end}
      >
        {/* The board caps itself at 800px inside the 840px column; lift
            the cap so it shares the band's left edge. */}
        <div className="[&>div]:max-w-none">
          <MatchBoard prompts={prompts} titles={SHUFFLED_FIVE} matched={matched} onPair={onPair} />
        </div>
      </GameShell>
      {api.phase !== "ended" && <MoreGames slug={slug} />}
      <Attribution />
    </>
  );
}

// ---------------------------------------------------------------------------
// Casting Call: OddOneOut, round 4 of 8 open, five seconds on the bar.

const CASTING: { movie: ArcadeMediaCard; actors: OddOneOutChoice[]; impostor: string }[] = [
  {
    movie: MATRIX,
    actors: [
      { name: "Keanu Reeves", role: "Neo" },
      { name: "Laurence Fishburne", role: "Morpheus" },
      { name: "Tom Cruise" },
      { name: "Carrie-Anne Moss", role: "Trinity" },
    ],
    impostor: "Tom Cruise",
  },
  {
    movie: INCEPTION,
    actors: [
      { name: "Leonardo DiCaprio", role: "Cobb" },
      { name: "Matt Damon" },
      { name: "Joseph Gordon-Levitt", role: "Arthur" },
      { name: "Tom Hardy", role: "Eames" },
    ],
    impostor: "Matt Damon",
  },
  {
    movie: JURASSIC,
    actors: [
      { name: "Sam Neill", role: "Dr. Alan Grant" },
      { name: "Laura Dern", role: "Dr. Ellie Sattler" },
      { name: "Jeff Goldblum", role: "Dr. Ian Malcolm" },
      { name: "Harrison Ford" },
    ],
    impostor: "Harrison Ford",
  },
  {
    movie: TITANIC,
    actors: [
      { name: "Kate Winslet", role: "Rose DeWitt Bukater" },
      { name: "Brad Pitt" },
      { name: "Billy Zane", role: "Cal Hockley" },
      { name: "Kathy Bates", role: "Molly Brown" },
    ],
    impostor: "Brad Pitt",
  },
  {
    movie: GODFATHER,
    actors: [
      { name: "Marlon Brando", role: "Don Vito Corleone" },
      { name: "Al Pacino", role: "Michael Corleone" },
      { name: "Robert De Niro" },
      { name: "James Caan", role: "Sonny Corleone" },
    ],
    impostor: "Robert De Niro",
  },
  {
    movie: PULP,
    actors: [
      { name: "John Travolta", role: "Vincent Vega" },
      { name: "Nicolas Cage" },
      { name: "Samuel L. Jackson", role: "Jules Winnfield" },
      { name: "Uma Thurman", role: "Mia Wallace" },
    ],
    impostor: "Nicolas Cage",
  },
  {
    movie: HEAT,
    actors: [
      { name: "Al Pacino", role: "Lt. Vincent Hanna" },
      { name: "Robert De Niro", role: "Neil McCauley" },
      { name: "Val Kilmer", role: "Chris Shiherlis" },
      { name: "Kevin Costner" },
    ],
    impostor: "Kevin Costner",
  },
  {
    movie: ALIEN,
    actors: [
      { name: "Sigourney Weaver", role: "Ripley" },
      { name: "Harrison Ford" },
      { name: "John Hurt", role: "Kane" },
      { name: "Ian Holm", role: "Ash" },
    ],
    impostor: "Harrison Ford",
  },
];
const CASTING_ROUNDS = 8;
const CASTING_SECONDS = 5;
const CASTING_REVEAL_MS = 1600;
const CASTING_HOW_TO = [
  "One movie, four actors. Tap the one who was never in it.",
  "Five seconds a call. The clock running out counts as a miss.",
  "Eight movies. Every right call pays 2 comets.",
];
const CASTING_LOST_HINT = "A right call pays 2 comets. Eight of them pay 16.";
const CASTING_END_RESULTS = [true, true, false, true, true, true, false, true];

function castingTier(correct: number): string | undefined {
  if (correct === CASTING_ROUNDS) return "Perfect eight";
  if (correct >= CASTING_ROUNDS - 2) return "Close";
  return undefined;
}

function CastingHarness({ state }: { state: HarnessState }) {
  const GAME = GAMES["casting-call"];
  const resultsRef = useRef<boolean[]>(
    state === "ended" ? CASTING_END_RESULTS : state === "playing" ? [true, true, false] : [],
  );
  const [done, setDone] = useState(state === "ended");
  const [idx, setIdx] = useState(state === "playing" ? 3 : 0);
  const idxRef = useRef(idx);
  const resolvedRef = useRef(false);
  const beatRef = useRef<number | null>(null);
  const [reveal, setReveal] = useState<OddOneOutReveal | null>(null);

  const api = useSeededEngine(state, {
    score: 2,
    combo: 0,
    round: 4,
    timer: CASTING_SECONDS,
    onExpire: () => resolveRound(null),
    lines: castingCallPayout({ correct: CASTING_END_RESULTS.filter(Boolean).length }),
  });
  const comets = useComets();

  useEffect(
    () => () => {
      if (beatRef.current) window.clearTimeout(beatRef.current);
    },
    [],
  );

  const endRun = () => {
    const correct = resultsRef.current.filter(Boolean).length;
    setDone(true);
    api.finish(castingCallPayout({ correct }));
  };

  function beginRound(i: number) {
    idxRef.current = i;
    resolvedRef.current = false;
    setIdx(i);
    setReveal(null);
    api.startTimer(CASTING_SECONDS, () => resolveRound(null));
  }

  function resolveRound(picked: number | null) {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    api.stopTimer();
    const i = idxRef.current;
    const item = CASTING[i];
    const correctIndex = item.actors.findIndex((a) => a.name === item.impostor);
    const ok = picked === correctIndex;
    resultsRef.current.push(ok);
    if (ok) {
      api.addScore(1);
      api.hitCombo();
    } else {
      api.breakCombo();
    }
    setReveal({ correctIndex, pickedIndex: picked });
    beatRef.current = window.setTimeout(() => {
      if (i < CASTING_ROUNDS - 1) {
        api.nextRound();
        beginRound(i + 1);
      } else {
        endRun();
      }
    }, CASTING_REVEAL_MS);
  }

  const item = CASTING[idx];

  const end = useMemo<EndScreenContent>(() => {
    const results = resultsRef.current;
    const correct = results.filter(Boolean).length;
    const text = shareCastingCall({ day: DAY, results });
    const tier = castingTier(correct);
    const headline = `${correct} of ${CASTING_ROUNDS} right`;
    return {
      tier,
      headline,
      grid: gridOf(text),
      stats: STATS,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? GAME.hook },
      answers: CASTING.map((r) => toMediaItem(r.movie)),
      answersLabel: "Today's eight",
      lost: correct === 0,
      lostHint: CASTING_LOST_HINT,
    };
    // resultsRef is complete once done flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, GAME.hook]);

  return (
    <>
      <GameShell
        game={GAME}
        api={api}
        comets={comets}
        dayNumber={DAY}
        howTo={CASTING_HOW_TO}
        end={end}
      >
        {/* The board caps itself at 800px inside the 840px column; lift
            the cap so it shares the band's left edge. */}
        <div className="[&>div]:max-w-none">
          <OddOneOut
            key={idx}
            title={item.movie.title}
            year={item.movie.year}
            posterUrl={item.movie.posterUrl}
            choices={item.actors}
            reveal={reveal}
            timer={api.timer}
            roundLabel={`Round ${idx + 1} of ${CASTING_ROUNDS}`}
            onPick={(i) => resolveRound(i)}
          />
        </div>
      </GameShell>
      {api.phase !== "ended" && <MoreGames slug="casting-call" />}
      <Attribution />
    </>
  );
}

// ---------------------------------------------------------------------------
// Link Up: ChainBoard, one hop committed, choosing the second.

const LINK_STEPS = [
  {
    actor: "Keanu Reeves",
    options: [TITANIC, MATRIX, JURASSIC, GODFATHER],
    answer: MATRIX,
    next: "Laurence Fishburne",
  },
  {
    actor: "Laurence Fishburne",
    options: [APOCALYPSE, INCEPTION, HEAT, ALIEN],
    answer: APOCALYPSE,
    next: "Marlon Brando",
  },
  {
    actor: "Marlon Brando",
    options: [PULP, SPEED, GODFATHER, JAWS],
    answer: GODFATHER,
    next: "Al Pacino",
  },
];
const LINK_START = "Keanu Reeves";
const LINK_TARGET = "Al Pacino";
const LINK_PAR = 3;
/** The cast a dead end shows, so the miss teaches. */
const LINK_CAST: Record<string, string[]> = {
  [TITANIC.id]: ["Leonardo DiCaprio", "Kate Winslet", "Billy Zane"],
  [JURASSIC.id]: ["Sam Neill", "Laura Dern", "Jeff Goldblum"],
  [GODFATHER.id]: ["Marlon Brando", "Al Pacino", "James Caan"],
  [INCEPTION.id]: ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page"],
  [HEAT.id]: ["Al Pacino", "Robert De Niro", "Val Kilmer"],
  [ALIEN.id]: ["Sigourney Weaver", "Tom Skerritt", "John Hurt"],
  [PULP.id]: ["John Travolta", "Samuel L. Jackson", "Uma Thurman"],
  [SPEED.id]: ["Keanu Reeves", "Sandra Bullock", "Dennis Hopper"],
  [JAWS.id]: ["Roy Scheider", "Robert Shaw", "Richard Dreyfuss"],
};
const LINK_HOW_TO = [
  "Start from one actor. Four movies are offered; pick the one they were in.",
  "A right pick hands you the next actor. A wrong pick is a dead end: step back, try another.",
  "Reach the second actor to close the chain. Par is the shortest chain; every dead end adds a pick.",
];

function movieStep(c: ArcadeMediaCard, cast?: string[]): ChainStep {
  return {
    kind: "movie",
    id: c.id,
    label: c.title,
    sub: c.year,
    posterUrl: c.posterUrl,
    cast: cast ?? null,
  };
}

function actorStep(name: string): ChainStep {
  return { kind: "actor", id: name, label: name };
}

function LinkUpHarness({ state }: { state: HarnessState }) {
  const GAME = GAMES["link-up"];
  const END_WRONG = 1;
  const api = useSeededEngine(state, {
    lines: linkUpPayout({ solved: true, steps: LINK_PAR + END_WRONG, par: LINK_PAR }),
  });
  const comets = useComets();

  const [chain, setChain] = useState<ChainStep[]>(
    state === "playing"
      ? [movieStep(MATRIX), actorStep("Laurence Fishburne")]
      : state === "ended"
        ? [
            movieStep(MATRIX),
            actorStep("Laurence Fishburne"),
            movieStep(APOCALYPSE),
            actorStep("Marlon Brando"),
            movieStep(GODFATHER),
          ]
        : [],
  );
  const [stepIdx, setStepIdx] = useState(state === "playing" ? 1 : 0);
  const [deadEnd, setDeadEnd] = useState(false);
  const [complete, setComplete] = useState(state === "ended");
  const [tried, setTried] = useState<Record<number, string[]>>({});
  const [wrong, setWrong] = useState(state === "ended" ? END_WRONG : 0);
  const step = LINK_STEPS[stepIdx] ?? null;

  const onChoose = (id: string) => {
    if (!step || deadEnd || complete) return;
    const opt = step.options.find((o) => o.id === id);
    if (!opt || tried[stepIdx]?.includes(id)) return;
    if (id === step.answer.id) {
      const isLast = stepIdx === LINK_STEPS.length - 1;
      setChain((c) =>
        isLast ? [...c, movieStep(opt)] : [...c, movieStep(opt), actorStep(step.next)],
      );
      setTried((t) => {
        const next = { ...t };
        delete next[stepIdx];
        return next;
      });
      if (isLast) {
        setComplete(true);
        api.finish(linkUpPayout({ solved: true, steps: LINK_PAR + wrong, par: LINK_PAR }));
      } else {
        setStepIdx((i) => i + 1);
      }
    } else {
      setWrong((w) => w + 1);
      setTried((t) => ({ ...t, [stepIdx]: [...(t[stepIdx] ?? []), id] }));
      setChain((c) => [...c, movieStep(opt, LINK_CAST[opt.id])]);
      setDeadEnd(true);
    }
  };

  const onStepBack = () => {
    if (complete) return;
    if (deadEnd) {
      setChain((c) => c.slice(0, -1));
      setDeadEnd(false);
      return;
    }
    if (stepIdx === 0 || chain.length === 0) return;
    setChain((c) => (c[c.length - 1]?.kind === "actor" ? c.slice(0, -2) : c.slice(0, -1)));
    setStepIdx((i) => i - 1);
  };

  const picks = LINK_PAR + wrong;

  const end = useMemo<EndScreenContent>(() => {
    const text = shareLinkUp({ day: DAY, solved: true, steps: picks, par: LINK_PAR });
    const headline = `Done in ${picks} pick${picks === 1 ? "" : "s"}, par ${LINK_PAR}`;
    const tier = wrong === 0 ? "Par" : `${wrong} over par`;
    return {
      tier,
      headline,
      grid: gridOf(text),
      stats: STATS,
      shareText: text,
      shareImage: { title: headline, subtitle: `${LINK_START} to ${LINK_TARGET}` },
      moreGames: false,
    };
  }, [picks, wrong]);

  const board = (
    <ChainBoard
      start={LINK_START}
      target={LINK_TARGET}
      par={LINK_PAR}
      chain={chain}
      choices={
        step && !complete
          ? step.options.map((o) => ({
              id: o.id,
              label: o.title,
              sub: o.year,
              posterUrl: o.posterUrl,
            }))
          : []
      }
      tried={tried[stepIdx] ?? []}
      deadEnd={deadEnd}
      complete={complete}
      disabled={api.phase !== "playing"}
      onChoose={onChoose}
      onStepBack={onStepBack}
    />
  );

  return (
    <>
      <GameShell
        game={GAME}
        api={api}
        comets={comets}
        dayNumber={DAY}
        showScoreStrip={false}
        howTo={LINK_HOW_TO}
        readyExtra={
          <p className="text-center text-[13.5px] text-text-muted">
            Today: <span className="font-semibold text-text-bright">{LINK_START}</span> to{" "}
            <span className="font-semibold text-text-bright">{LINK_TARGET}</span>. Par {LINK_PAR}.
          </p>
        }
        end={end}
      >
        {board}
      </GameShell>

      {api.phase === "ended" && complete && (
        <section
          style={hueVars(GAME.slug)}
          className="mx-auto mt-8 w-full border-t border-border pt-5 lg:max-w-[880px]"
        >
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            Your chain
          </h2>
          {board}
        </section>
      )}

      <MoreGames slug="link-up" />
      <Attribution />
    </>
  );
}

// ---------------------------------------------------------------------------
// Timeline: OrderBoard, five 1990s titles half-ordered, 30 seconds up.

const TIMELINE_TITLES = [JURASSIC, PULP, HEAT, TITANIC, MATRIX];
const TIMELINE_START_ORDER = [JURASSIC, TITANIC, HEAT, PULP, MATRIX].map((t) => t.id);
const TIMELINE_CORRECT = [...TIMELINE_TITLES]
  .sort((a, b) => Number(a.year) - Number(b.year))
  .map((t) => t.id);
const TIMELINE_SIZE = 5;
const TIMELINE_SECONDS = 30;
const TIMELINE_ERA = "the 1990s";
const TIMELINE_HOW_TO = [
  "Five titles from one era, years hidden. Drag a row by its grip, or use the arrows.",
  "Earliest first, latest last. Thirty seconds, then lock it in.",
  "Every title in its right slot pays 2 comets. All five pays 5 more.",
];
const TIMELINE_LOST_HINT = "A title in its right slot pays 2 comets.";

function timelineTier(correctSlots: number): string | undefined {
  if (correctSlots === TIMELINE_SIZE) return "Perfect order";
  if (correctSlots === TIMELINE_SIZE - 1) return "Close";
  return undefined;
}

function TimelineHarness({ state }: { state: HarnessState }) {
  const GAME = GAMES.timeline;
  const endSlots = TIMELINE_START_ORDER.map((id, i) => id === TIMELINE_CORRECT[i]);
  const [order, setOrder] = useState<string[]>(TIMELINE_START_ORDER);
  const [reveal, setReveal] = useState<OrderReveal | null>(
    state === "ended" ? { correctOrder: TIMELINE_CORRECT } : null,
  );
  const [slots, setSlots] = useState<boolean[]>(state === "ended" ? endSlots : []);
  const orderRef = useRef<string[]>(TIMELINE_START_ORDER);
  const revealedRef = useRef(state === "ended");

  const submitOrder = () => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    api.stopTimer();
    const judged = orderRef.current.map((id, i) => id === TIMELINE_CORRECT[i]);
    setSlots(judged);
    setReveal({ correctOrder: TIMELINE_CORRECT });
    api.finish(timelinePayout({ correctSlots: judged.filter(Boolean).length }));
  };

  const api = useSeededEngine(state, {
    timer: TIMELINE_SECONDS,
    onExpire: submitOrder,
    lines: timelinePayout({ correctSlots: endSlots.filter(Boolean).length }),
  });
  const comets = useComets();

  const byId = useMemo(() => new Map(TIMELINE_TITLES.map((t) => [t.id, t])), []);
  const cards = order
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({ id: t.id, title: t.title, posterUrl: t.posterUrl, year: t.year }));

  const end = useMemo<EndScreenContent>(() => {
    const correctSlots = slots.filter(Boolean).length;
    const text = shareTimeline({ day: DAY, slots });
    const headline = `${correctSlots} of ${TIMELINE_SIZE} in order`;
    const tier = timelineTier(correctSlots);
    return {
      tier,
      headline,
      grid: gridOf(text),
      stats: STATS,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? `Titles from ${TIMELINE_ERA}.` },
      lost: correctSlots === 0,
      lostHint: TIMELINE_LOST_HINT,
      moreGames: false,
    };
  }, [slots]);

  return (
    <>
      <GameShell
        game={GAME}
        api={api}
        comets={comets}
        dayNumber={DAY}
        showScoreStrip={false}
        howTo={TIMELINE_HOW_TO}
        readyExtra={
          <p className="text-center text-[13.5px] text-text-muted">
            Today's five come from {TIMELINE_ERA}.
          </p>
        }
        end={end}
      >
        <OrderBoard
          cards={cards}
          reveal={reveal}
          timer={api.timer}
          onReorder={(ids) => {
            orderRef.current = ids;
            setOrder(ids);
          }}
          onSubmit={submitOrder}
        />
      </GameShell>

      {api.phase === "ended" && reveal && (
        <section
          style={hueVars(GAME.slug)}
          className="mx-auto mt-8 w-full border-t border-border pt-5 lg:max-w-[880px]"
        >
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            Your order, judged
          </h2>
          <OrderBoard cards={cards} reveal={reveal} onReorder={() => {}} onSubmit={() => {}} />
        </section>
      )}

      <MoreGames slug="timeline" />
      <Attribution />
    </>
  );
}

// ---------------------------------------------------------------------------
// The 8PM Screening: QuizBoard, question 4 of 10 open, 20 seconds up. The
// open question names a title so the poster flip shows on reveal.

const SCREENING: {
  question: string;
  choices: string[];
  answer: number;
  note: string;
  media?: QuizMedia;
}[] = [
  {
    question: "Which of these actors was NOT in Pulp Fiction?",
    choices: ["Bruce Willis", "Tim Roth", "Christopher Walken", "Nicolas Cage"],
    answer: 3,
    note: "Cage and Travolta swapped faces three years later in Face/Off.",
  },
  {
    question: "Who directed Heat?",
    choices: ["Martin Scorsese", "Michael Mann", "Ridley Scott", "Tony Scott"],
    answer: 1,
    note: "Mann first shot the story as the 1989 TV movie L.A. Takedown.",
  },
  {
    question: "In what year was Jurassic Park released?",
    choices: ["1991", "1992", "1993", "1994"],
    answer: 2,
    note: "It held the worldwide box office record until Titanic.",
  },
  {
    question: "Which movie won Best Picture at the 1998 Oscars?",
    choices: ["Titanic", "L.A. Confidential", "Good Will Hunting", "As Good as It Gets"],
    answer: 0,
    note: "Titanic took 11 Oscars that night, tying Ben-Hur.",
    media: { title: TITANIC.title, year: TITANIC.year, posterUrl: TITANIC.posterUrl },
  },
  {
    question: "How many Oscars did The Matrix win?",
    choices: ["0", "2", "4", "6"],
    answer: 2,
    note: "All four were technical: editing, sound, sound effects, visual effects.",
    media: { title: MATRIX.title, year: MATRIX.year, posterUrl: MATRIX.posterUrl },
  },
  {
    question: "Who composed the score for Inception?",
    choices: ["John Williams", "Hans Zimmer", "Howard Shore", "James Newton Howard"],
    answer: 1,
    note: "The slowed-down Piaf record is the film's own trick.",
  },
  {
    question: "Which Godfather film did NOT win Best Picture?",
    choices: ["The Godfather", "The Godfather Part II", "The Godfather Part III", "All three won"],
    answer: 2,
    note: "Part III was nominated and lost to Dances with Wolves.",
  },
  {
    question: "What ship does Ripley serve on in Alien?",
    choices: ["Sulaco", "Nostromo", "Prometheus", "Covenant"],
    answer: 1,
    note: "Named after the Joseph Conrad novel.",
    media: { title: ALIEN.title, year: ALIEN.year, posterUrl: ALIEN.posterUrl },
  },
  {
    question: "Which studio released Jaws?",
    choices: ["Paramount", "Warner Bros.", "Universal", "Columbia"],
    answer: 2,
    note: "The first film to pass $100 million at the US box office.",
  },
  {
    question: "Breaking Bad ran for how many seasons?",
    choices: ["4", "5", "6", "7"],
    answer: 1,
    note: "62 episodes, the last aired in September 2013.",
  },
];
const SCREENING_COUNT = 10;
const SCREENING_SECONDS = 20;
const SCREENING_REVEAL_MS = 1400;
const SCREENING_HOW_TO = [
  "Ten questions, four answers each, twenty seconds a question.",
  "A pick locks at once and the right answer shows before the next question.",
  "Every right answer pays 3 comets. A perfect ten pays 10 more.",
];
const SCREENING_LOST_HINT = "A right answer pays 3 comets.";
const SCREENING_END = [true, true, false, true, true, true, false, true, true, true];

/** Right answers out of ten, the same units as the headline. */
const BOARD_ROWS: SnippetRow[] = [
  { rank: 1, name: "filmnerd_88", handle: "filmnerd_88", score: 10, durationMs: 94_000 },
  { rank: 2, name: "Priya", handle: "priya", score: 9, durationMs: 101_000 },
  { rank: 3, name: "cinemartin", handle: "cinemartin", score: 9, durationMs: 133_000 },
  { rank: 4, name: "Dana K.", handle: "danak", score: 8, durationMs: 88_000 },
  { rank: 5, name: "popcorn_pat", handle: "popcorn_pat", score: 7, durationMs: 120_000 },
];

function screeningTier(correct: number): string | undefined {
  if (correct === SCREENING_COUNT) return "Perfect ten";
  if (correct >= 8) return "Sharp";
  return undefined;
}

function ScreeningHarness({ state }: { state: HarnessState }) {
  const GAME = GAMES.screening;
  const answersRef = useRef<boolean[]>(
    state === "ended" ? SCREENING_END : state === "playing" ? [true, true, false] : [],
  );
  const [results, setResults] = useState<(boolean | null)[]>(answersRef.current.slice());
  const [qIndex, setQIndex] = useState(state === "playing" ? 3 : 0);
  const [picked, setPicked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<{ correctIndex: number; note: string } | null>(null);
  const resolvedRef = useRef<boolean[]>([]);
  const beatRef = useRef<number | null>(null);

  const api = useSeededEngine(state, {
    score: 2,
    combo: 0,
    round: 4,
    timer: SCREENING_SECONDS,
    onExpire: () => resolve(null, 3),
    lines: screeningPayout({ correct: SCREENING_END.filter(Boolean).length }),
  });
  const comets = useComets();

  useEffect(
    () => () => {
      if (beatRef.current) window.clearTimeout(beatRef.current);
    },
    [],
  );

  const endRun = () => {
    const correct = answersRef.current.filter(Boolean).length;
    api.finish(screeningPayout({ correct }));
  };

  const startQuestion = (i: number) => {
    setQIndex(i);
    setPicked(null);
    setVerdict(null);
    api.nextRound();
    api.startTimer(SCREENING_SECONDS, () => resolve(null, i));
  };

  const resolve = (choice: number | null, i: number) => {
    if (resolvedRef.current[i]) return;
    resolvedRef.current[i] = true;
    api.stopTimer();
    const item = SCREENING[i];
    if (choice !== null) setPicked(choice);
    const correct = choice === item.answer;
    setVerdict({ correctIndex: item.answer, note: item.note });
    answersRef.current[i] = correct;
    setResults(answersRef.current.slice());
    if (correct) {
      api.addScore(1);
      api.hitCombo();
    } else {
      api.breakCombo();
    }
    beatRef.current = window.setTimeout(() => {
      if (i + 1 < SCREENING.length) startQuestion(i + 1);
      else endRun();
    }, SCREENING_REVEAL_MS);
  };

  const item = SCREENING[qIndex];

  const end = useMemo<EndScreenContent>(() => {
    const answers = answersRef.current.slice(0, SCREENING_COUNT);
    const correct = answers.filter(Boolean).length;
    const text = shareScreening({ day: DAY, answers });
    const headline = `${correct} of ${SCREENING_COUNT} right`;
    const tier = screeningTier(correct);
    return {
      tier,
      headline,
      grid: gridOf(text),
      stats: STATS,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? "Same ten for everyone." },
      leaderboard: { rows: BOARD_ROWS, label: "Tonight's board. Right answers out of ten." },
      lost: correct === 0,
      lostHint: SCREENING_LOST_HINT,
      moreGames: false,
    };
    // results is the render-time mirror of answersRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  return (
    <>
      <GameShell
        game={GAME}
        api={api}
        comets={comets}
        dayNumber={DAY}
        howTo={SCREENING_HOW_TO}
        end={end}
      >
        <QuizBoard
          question={item.question}
          choices={item.choices}
          questionIndex={qIndex}
          questionCount={SCREENING.length}
          picked={picked}
          reveal={verdict ? { correctIndex: verdict.correctIndex } : null}
          note={verdict?.note ?? null}
          results={results}
          timer={api.timer}
          media={verdict ? (item.media ?? null) : null}
          onPick={(i) => resolve(i, qIndex)}
        />
      </GameShell>
      <MoreGames slug="screening" />
      <Attribution />
    </>
  );
}

// ---------------------------------------------------------------------------
// Emoji Plots: plot 3 of 5, two misses in so the third-guess lifeline is up.

const EMOJI: { media: ArcadeMediaCard; emoji: string; choices: string[] }[] = [
  {
    media: MATRIX,
    emoji: "🐇🕳️💊🔴🔵🕶️",
    choices: ["The Matrix", "Blade Runner", "Total Recall", "Dark City"],
  },
  {
    media: INCEPTION,
    emoji: "🌀🛌💭🎯🏙️",
    choices: ["Inception", "Paprika", "Shutter Island", "Tenet"],
  },
  {
    media: JURASSIC,
    emoji: "🦖🏝️🧬⛈️🚙",
    choices: ["Jurassic Park", "King Kong", "The Lost World", "Godzilla"],
  },
  {
    media: TITANIC,
    emoji: "🚢🧊💔🎻🌊",
    choices: ["Titanic", "The Poseidon Adventure", "Life of Pi", "The Perfect Storm"],
  },
  {
    media: GODFATHER,
    emoji: "🍊🐴🛏️🔫👨‍👦",
    choices: ["The Godfather", "Goodfellas", "Casino", "Scarface"],
  },
];
const EMOJI_PUZZLES = 5;
const EMOJI_MAX_GUESSES = 3;
const EMOJI_HOW_TO = [
  "Read the emoji, type the title. Any movie or show in the catalog counts.",
  "Three guesses a plot. On the last one, a short list of suspects appears.",
  "Five plots. A solve pays 2 comets, 1 more when the first guess lands.",
];
const EMOJI_LOST_HINT = "A solved plot pays 2 comets, 3 when the first guess lands.";
const eqTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface PlotResult {
  solved: boolean;
  firstTry: boolean;
}

const EMOJI_END: PlotResult[] = [
  { solved: true, firstTry: true },
  { solved: true, firstTry: true },
  { solved: false, firstTry: false },
  { solved: true, firstTry: true },
  { solved: true, firstTry: false },
];

function emojiTier(solved: number, firstTry: number): string | undefined {
  if (solved === EMOJI_PUZZLES) {
    return firstTry === EMOJI_PUZZLES ? "Five first guesses" : "All five";
  }
  if (solved >= EMOJI_PUZZLES - 1) return "Close";
  return undefined;
}

function EmojiHarness({ state }: { state: HarnessState }) {
  const GAME = GAMES.emoji;
  const resultsRef = useRef<PlotResult[]>(
    state === "ended"
      ? EMOJI_END
      : state === "playing"
        ? [
            { solved: true, firstTry: true },
            { solved: true, firstTry: true },
          ]
        : [],
  );
  const api = useSeededEngine(state, {
    score: 2,
    combo: 0,
    round: 3,
    lines: emojiPayout({
      solved: EMOJI_END.filter((r) => r.solved).length,
      firstTry: EMOJI_END.filter((r) => r.firstTry).length,
    }),
  });
  const comets = useComets();
  const [idx, setIdx] = useState(state === "playing" ? 2 : 0);
  const [wrongTitles, setWrongTitles] = useState<string[]>(
    state === "playing" ? ["King Kong", "Godzilla"] : [],
  );
  const [revealed, setRevealed] = useState<null | { solved: boolean; guesses: number }>(null);
  const [misses, setMisses] = useState(0);
  const [done, setDone] = useState(state === "ended");
  const item = EMOJI[idx];

  const endRun = () => {
    const results = resultsRef.current;
    const solved = results.filter((r) => r.solved).length;
    const firstTry = results.filter((r) => r.firstTry).length;
    setDone(true);
    api.finish(emojiPayout({ solved, firstTry }));
  };

  const resolvePlot = (solved: boolean) => {
    if (revealed) return;
    resultsRef.current.push({ solved, firstTry: solved && wrongTitles.length === 0 });
    if (solved) {
      api.addScore(1);
      api.hitCombo();
    } else {
      api.breakCombo();
    }
    setRevealed({ solved, guesses: wrongTitles.length + 1 });
  };

  const miss = (title: string) => {
    api.breakCombo();
    setMisses((m) => m + 1);
    if (wrongTitles.length + 1 >= EMOJI_MAX_GUESSES) {
      resolvePlot(false);
      setWrongTitles((w) => [...w, title]);
      return;
    }
    setWrongTitles((w) => [...w, title]);
  };

  const onGuess = (hit: SearchHit) => {
    if (revealed) return;
    if (hit.id === item.media.id || eqTitle(hit.title, item.media.title)) resolvePlot(true);
    else miss(hit.title);
  };

  const guessChip = (title: string) => {
    if (revealed) return;
    if (eqTitle(title, item.media.title)) resolvePlot(true);
    else miss(title);
  };

  const advance = () => {
    if (idx < EMOJI_PUZZLES - 1) {
      setIdx(idx + 1);
      setWrongTitles([]);
      setRevealed(null);
      api.nextRound();
    } else {
      endRun();
    }
  };

  const results = resultsRef.current;
  const lastGuess = !revealed && wrongTitles.length === EMOJI_MAX_GUESSES - 1;

  const end = useMemo<EndScreenContent>(() => {
    const finished = resultsRef.current;
    const solved = finished.filter((r) => r.solved).length;
    const firstTry = finished.filter((r) => r.firstTry).length;
    const text = shareEmoji({ day: DAY, results: finished.map((r) => r.solved) });
    const tier = emojiTier(solved, firstTry);
    const headline = `${solved} of ${EMOJI_PUZZLES} plots solved`;
    return {
      tier,
      headline,
      grid: gridOf(text),
      stats: STATS,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? GAME.hook },
      answers: EMOJI.map((i) => toMediaItem(i.media)),
      answersLabel: "Today's five",
      lost: solved === 0,
      lostHint: EMOJI_LOST_HINT,
    };
    // resultsRef is complete once done flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, GAME.hook]);

  return (
    <>
      <GameShell
        game={GAME}
        api={api}
        comets={comets}
        dayNumber={DAY}
        howTo={EMOJI_HOW_TO}
        end={end}
        narrow
      >
        <div>
          <EmojiStage
            key={idx}
            emoji={item.emoji}
            plot={idx + 1}
            total={EMOJI_PUZZLES}
            results={results.map((r) => r.solved)}
            guess={wrongTitles.length + 1}
            maxGuesses={EMOJI_MAX_GUESSES}
            revealed={
              revealed
                ? {
                    posterUrl: item.media.posterUrl,
                    title: item.media.title,
                    solved: revealed.solved,
                  }
                : null
            }
            lifelines={
              lastGuess ? { choices: item.choices, spent: wrongTitles, onPick: guessChip } : null
            }
          >
            {!revealed ? (
              <div className="space-y-2.5">
                <GuessBox
                  onGuess={onGuess}
                  disabled={false}
                  placeholder="Name the title"
                  shake={misses}
                  autoFocus
                />
                {wrongTitles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" aria-label="Wrong guesses">
                    {wrongTitles.map((t, i) => (
                      <span
                        key={i}
                        className="rounded-[4px] border border-border px-2 py-0.5 font-mono text-[12px] text-text-dim line-through"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex justify-end whitespace-nowrap">
                  <button type="button" onClick={() => resolvePlot(false)} className={PILL_MUTED}>
                    Reveal the answer
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 rounded-[6px] border border-[var(--game,var(--primary))] [background:color-mix(in_oklab,var(--game,var(--primary))_14%,var(--color-panel))] p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--game,var(--primary))]">
                    {revealed.solved ? `Solved in ${revealed.guesses}` : "It was"}
                  </p>
                  <MediaLink
                    media={item.media}
                    className="mt-1 block text-[20px] font-black leading-tight tracking-[-0.02em] text-text-bright hover:text-[var(--game,var(--primary))]"
                  />
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-text-muted">
                    {item.media.year}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={advance}
                  autoFocus
                  className="shrink-0 rounded-full bg-[var(--game,var(--primary))] px-5 py-2.5 text-[14px] font-black tracking-[-0.01em] text-[var(--game-ink,var(--primary-foreground))] hover:brightness-110"
                >
                  {idx < EMOJI_PUZZLES - 1 ? "Next plot" : "See the results"}
                </button>
              </div>
            )}
          </EmojiStage>
        </div>
      </GameShell>
      {api.phase !== "ended" && <MoreGames slug="emoji" />}
      <Attribution />
    </>
  );
}

// ---------------------------------------------------------------------------
// Speed Sort: BinSort, card 8 of 12, 1990s or 2000s, 60 seconds up.

const SPEED_DECK: { c: ArcadeMediaCard; bin: "a" | "b" }[] = [
  { c: MATRIX, bin: "a" },
  { c: INCEPTION, bin: "b" },
  { c: JURASSIC, bin: "a" },
  { c: TITANIC, bin: "a" },
  { c: PULP, bin: "a" },
  { c: HEAT, bin: "a" },
  { c: BREAKING_BAD, bin: "b" },
  { c: DARK_KNIGHT, bin: "b" },
  {
    c: card(
      "movie-120",
      "The Lord of the Rings: The Fellowship of the Ring",
      "2001",
      "#1f2a10",
      "#6b8a2f",
    ),
    bin: "b",
  },
  { c: card("movie-13", "Forrest Gump", "1994", "#2a2a10", "#a89a2f"), bin: "a" },
  { c: card("movie-278", "The Shawshank Redemption", "1994", "#2a1a10", "#8a5a2f"), bin: "a" },
  {
    c: card(
      "movie-122",
      "The Lord of the Rings: The Return of the King",
      "2003",
      "#2a1f10",
      "#b88a2f",
    ),
    bin: "b",
  },
];
const SPEED_BINS: [BinDef, BinDef] = [
  { key: "a", label: "1990s" },
  { key: "b", label: "2000s" },
];
const SPEED_SECONDS = 60;
const SPEED_HOW_TO = [
  "One title at a time. Swipe it toward its bin, tap the bin, or use the arrow keys.",
  "A wrong sort shows the bin it belonged in, then the next card lands.",
  "Sixty seconds. A right sort pays 1 comet, a clean minute pays 5 more.",
];
const SPEED_LOST_HINT = "A right sort pays 1 comet. A clean minute pays 5 more.";

interface SpeedMiss {
  title: ArcadeMediaCard;
  /** The bin it belonged in. */
  bin: string;
}

const SPEED_END: { sorted: number; misses: SpeedMiss[] } = {
  sorted: 21,
  misses: [
    { title: DARK_KNIGHT, bin: "2000s" },
    { title: HEAT, bin: "1990s" },
    { title: BREAKING_BAD, bin: "2000s" },
  ],
};

function speedTier(sorted: number, missed: number, deck: number): string | undefined {
  if (sorted === deck && missed === 0) return "Whole deck, clean";
  if (sorted > 0 && missed === 0) return "Clean minute";
  if (sorted === deck) return "Whole deck";
  return undefined;
}

/** Every miss with the bin it belonged in, under the end screen. */
function MissList({ misses }: { misses: SpeedMiss[] }) {
  if (misses.length === 0) return null;
  return (
    <section
      style={hueVars("speed-sort")}
      className="mx-auto mt-8 w-full border-t border-border pt-5 lg:max-w-[880px]"
    >
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
        Missed, and where they belonged
      </h2>
      <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {misses.map(({ title, bin }) => (
          <li
            key={title.id}
            className="flex items-center gap-3 rounded-[6px] border border-warn/40 bg-warn/5 p-2 pr-3"
          >
            <img
              src={tmdbImage(title.posterUrl, "w185")}
              alt=""
              className="h-[54px] w-[36px] shrink-0 rounded-[3px] object-cover"
            />
            <div className="min-w-0 flex-1">
              <MediaLink media={title} />
              <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-wider text-warn">
                Goes {bin}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SpeedSortHarness({ state }: { state: HarnessState }) {
  const GAME = GAMES["speed-sort"];
  const [index, setIndex] = useState(state === "playing" ? 7 : 0);
  const [result, setResult] = useState<{ sorted: number; misses: SpeedMiss[] }>(
    state === "ended" ? SPEED_END : { sorted: 0, misses: [] },
  );
  const indexRef = useRef(index);
  const sortedRef = useRef(state === "playing" ? 6 : 0);
  const missesRef = useRef<SpeedMiss[]>(state === "playing" ? [{ title: HEAT, bin: "1990s" }] : []);
  const endedRef = useRef(false);
  const beatRef = useRef<number | null>(null);

  const endRun = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    api.stopTimer();
    const sorted = sortedRef.current;
    const misses = missesRef.current.slice();
    setResult({ sorted, misses });
    api.finish(speedSortPayout({ sorted, missed: misses.length }));
  };

  const api = useSeededEngine(state, {
    score: 6,
    combo: 3,
    timer: SPEED_SECONDS,
    onExpire: endRun,
    lines: speedSortPayout({ sorted: SPEED_END.sorted, missed: SPEED_END.misses.length }),
  });
  const comets = useComets();

  useEffect(
    () => () => {
      if (beatRef.current) window.clearTimeout(beatRef.current);
    },
    [],
  );

  const onChoose = (binIndex: 0 | 1): boolean => {
    if (endedRef.current) return false;
    const d = SPEED_DECK[indexRef.current];
    if (!d) return false;
    const correct = d.bin === (binIndex === 0 ? "a" : "b");
    if (correct) {
      sortedRef.current += 1;
      api.addScore(1);
      api.hitCombo();
    } else {
      missesRef.current.push({ title: d.c, bin: d.bin === "a" ? "1990s" : "2000s" });
      api.breakCombo();
    }
    const next = indexRef.current + 1;
    indexRef.current = next;
    setIndex(next);
    if (next >= SPEED_DECK.length) {
      beatRef.current = window.setTimeout(endRun, 650);
    }
    return correct;
  };

  const toCard = (d: { c: ArcadeMediaCard } | undefined): BinCard | null =>
    d ? { id: d.c.id, label: d.c.title, posterUrl: d.c.posterUrl } : null;

  const end = useMemo<EndScreenContent>(() => {
    const { sorted, misses } = result;
    const missed = misses.length;
    const text = shareSpeedSort({ day: DAY, sorted, missed });
    const headline =
      sorted === 0
        ? "Nothing sorted"
        : missed === 0
          ? `${sorted} sorted, none missed`
          : `${sorted} sorted, ${missed} missed`;
    const tier = speedTier(sorted, missed, 30);
    return {
      tier,
      headline,
      grid: gridOf(text),
      stats: STATS,
      shareText: text,
      shareImage: { title: headline, subtitle: `${SPEED_BINS[0].label} or ${SPEED_BINS[1].label}` },
      lost: sorted === 0,
      lostHint: SPEED_LOST_HINT,
      moreGames: false,
    };
  }, [result]);

  return (
    <>
      <GameShell
        game={GAME}
        api={api}
        comets={comets}
        dayNumber={DAY}
        howTo={SPEED_HOW_TO}
        readyExtra={
          <p className="text-center text-[13.5px] text-text-muted">
            Today's bins: <span className="font-semibold text-text-bright">1990s</span> or{" "}
            <span className="font-semibold text-text-bright">2000s</span>.
          </p>
        }
        end={end}
      >
        <BinSort
          card={toCard(SPEED_DECK[index])}
          nextCard={toCard(SPEED_DECK[index + 1])}
          bins={SPEED_BINS}
          timer={api.timer}
          onChoose={onChoose}
        />
      </GameShell>

      {api.phase === "ended" && <MissList misses={result.misses} />}

      <MoreGames slug="speed-sort" />
      <Attribution />
    </>
  );
}

// ---------------------------------------------------------------------------
// Sequel or Fake: BinSort with verdict cards, card 5 of 10, four calls made.

const SEQUELS: SequelRoundItem[] = [
  {
    itemId: 1,
    title: "Speed 2: Cruise Control",
    anchor: "Speed",
    year: 1997,
    real: true,
    reveal: "Sandra Bullock came back for a cruise ship. Keanu Reeves did not.",
  },
  {
    itemId: 2,
    title: "The Shawshank Reckoning",
    anchor: "The Shawshank Redemption",
    year: null,
    real: false,
    reveal: "Stephen King's novella ends where the film does. Nobody has gone back.",
  },
  {
    itemId: 3,
    title: "S. Darko",
    anchor: "Donnie Darko",
    year: 2009,
    real: true,
    reveal: "A direct-to-video follow-up about Donnie's sister. Richard Kelly had no part in it.",
  },
  {
    itemId: 4,
    title: "Forrest Gump: Run Again",
    anchor: "Forrest Gump",
    year: null,
    real: false,
    reveal:
      "A sequel script was written and shelved after September 2001. It never got a title like this.",
  },
  {
    itemId: 5,
    title: "Jaws: The Revenge",
    anchor: "Jaws",
    year: 1987,
    real: true,
    reveal: "The fourth Jaws film. Michael Caine missed collecting his Oscar to shoot it.",
  },
  {
    itemId: 6,
    title: "Se7en Again",
    anchor: "Se7en",
    year: null,
    real: false,
    reveal: "A sequel script called Ei8ht existed. David Fincher refused it.",
  },
  {
    itemId: 7,
    title: "Home Alone 4: Taking Back the House",
    anchor: "Home Alone",
    year: 2002,
    real: true,
    reveal: "A TV movie with a recast Kevin. There is a fifth and a sixth as well.",
  },
  {
    itemId: 8,
    title: "Titanic: Resurface",
    anchor: "Titanic",
    year: null,
    real: false,
    reveal: "James Cameron has said the ship sank and that was the end of it.",
  },
  {
    itemId: 9,
    title: "American Psycho II: All American Girl",
    anchor: "American Psycho",
    year: 2002,
    real: true,
    reveal: "Mila Kunis starred. She later said she regretted it.",
  },
  {
    itemId: 10,
    title: "Gladiator: Rise of Lucius",
    anchor: "Gladiator",
    year: null,
    real: false,
    reveal: "The real sequel, Gladiator II, arrived in 2024 with a shorter name.",
  },
];
const SEQUEL_DECK = 10;
const SEQUEL_BINS: [BinDef, BinDef] = [
  { key: "real", label: "Real" },
  { key: "fake", label: "Fake" },
];
const SEQUEL_HOW_TO = [
  "Each card names a sequel and the film it claims to follow.",
  "Swipe left for Real, right for Fake. Tap a bin or use the arrow keys.",
  "The card turns over with the story. Ten cards, 1 comet a right call.",
];
const SEQUEL_LOST_HINT = "A right call pays 1 comet. Ten in a row pay 15.";
const VERDICT_HOLD_MS = 2500;
const LAST_CARD_BEAT_MS = 650 + 420 + VERDICT_HOLD_MS + 320;

interface Call {
  item: SequelRoundItem;
  ok: boolean;
}

/** The ended fixture: two misses, best streak six. */
const SEQUEL_END_CALLS: Call[] = SEQUELS.map((item, i) => ({ item, ok: i !== 2 && i !== 7 }));

function sequelTier(correct: number): string | undefined {
  if (correct === SEQUEL_DECK) return "Perfect ten";
  if (correct >= SEQUEL_DECK - 2) return "Close";
  return undefined;
}

function sequelCard(item: SequelRoundItem | undefined): BinCard | null {
  if (!item) return null;
  return {
    id: String(item.itemId),
    label: item.title,
    sub: `sequel to ${item.anchor}`,
    faceKey: item.anchor,
    verdict: { stamp: item.real ? "REAL" : "FAKE", story: item.reveal },
  };
}

function StoryRow({
  title,
  real,
  story,
  called,
}: {
  title: string;
  real: boolean;
  story?: string | null;
  called?: boolean;
}) {
  return (
    <li className="rounded-[5px] border border-border bg-panel px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold leading-snug text-text-bright">{title}</span>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider">
          <span className={real ? "text-rating" : "text-warn"}>{real ? "Real" : "Fake"}</span>
          {called !== undefined && (
            <span className={called ? "text-text-dim" : "text-destructive"}>
              {called ? " · called it" : " · missed"}
            </span>
          )}
        </span>
      </div>
      {story && <p className="mt-0.5 text-[12px] leading-snug text-text-muted">{story}</p>}
    </li>
  );
}

function SequelHarness({ state }: { state: HarnessState }) {
  const GAME = GAMES["sequel-or-fake"];
  const seededCalls: Call[] =
    state === "playing"
      ? [
          { item: SEQUELS[0], ok: true },
          { item: SEQUELS[1], ok: true },
          { item: SEQUELS[2], ok: false },
          { item: SEQUELS[3], ok: true },
        ]
      : state === "ended"
        ? SEQUEL_END_CALLS
        : [];
  const api = useSeededEngine(state, {
    score: 3,
    combo: 1,
    round: 5,
    lines: sequelOrFakePayout({
      correct: SEQUEL_END_CALLS.filter((c) => c.ok).length,
      bestStreak: 6,
    }),
  });
  const comets = useComets();
  const [idx, setIdx] = useState(state === "playing" ? 4 : 0);
  const [calls, setCalls] = useState<Call[]>(seededCalls);
  const [done, setDone] = useState(state === "ended");
  const statRef = useRef(
    state === "playing" ? { correct: 3, streak: 1, best: 2 } : { correct: 0, streak: 0, best: 0 },
  );
  const callsRef = useRef<Call[]>(seededCalls);
  const beatRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (beatRef.current) window.clearTimeout(beatRef.current);
    },
    [],
  );

  const endRun = () => {
    const { correct, best } = statRef.current;
    setDone(true);
    api.finish(sequelOrFakePayout({ correct, bestStreak: best }));
  };

  const onChoose = (bin: 0 | 1): boolean => {
    const item = SEQUELS[idx];
    if (!item) return false;
    const ok = (bin === 0) === item.real;
    const s = statRef.current;
    if (ok) {
      s.correct += 1;
      s.streak += 1;
      s.best = Math.max(s.best, s.streak);
      api.addScore(1);
      api.hitCombo();
    } else {
      s.streak = 0;
      api.breakCombo();
    }
    callsRef.current = [...callsRef.current, { item, ok }];
    setCalls(callsRef.current);
    setIdx(idx + 1);
    if (idx + 1 >= SEQUEL_DECK) {
      beatRef.current = window.setTimeout(endRun, LAST_CARD_BEAT_MS);
    }
    return ok;
  };

  const end = useMemo<EndScreenContent>(() => {
    const results = callsRef.current.map((c) => c.ok);
    const correct = results.filter(Boolean).length;
    const text = shareSequelOrFake({ day: DAY, results });
    const tier = sequelTier(correct);
    const headline = `${correct} of ${SEQUEL_DECK} right`;
    return {
      tier,
      headline,
      grid: gridOf(text),
      stats: STATS,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? GAME.hook },
      lost: correct === 0,
      lostHint: SEQUEL_LOST_HINT,
      moreGames: false,
    };
    // callsRef is complete once done flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, GAME.hook]);

  return (
    <>
      <GameShell
        game={GAME}
        api={api}
        comets={comets}
        dayNumber={DAY}
        howTo={SEQUEL_HOW_TO}
        end={end}
      >
        <BinSort
          card={sequelCard(SEQUELS[idx])}
          nextCard={sequelCard(SEQUELS[idx + 1])}
          bins={SEQUEL_BINS}
          onChoose={onChoose}
          verdictHoldMs={VERDICT_HOLD_MS}
        />
      </GameShell>

      {api.phase === "ended" && calls.length > 0 && (
        <section className="mt-6">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            The ten, revealed
          </h2>
          <ul className="mt-2 space-y-1.5">
            {calls.map((c, i) => (
              <StoryRow
                key={i}
                title={c.item.title}
                real={c.item.real}
                story={c.item.reveal}
                called={c.ok}
              />
            ))}
          </ul>
        </section>
      )}

      <MoreGames slug="sequel-or-fake" />
      <Attribution />
    </>
  );
}

// ---------------------------------------------------------------------------
// Poster Reveal: PosterBoard two wrong guesses in; ended = solved on three.

const POSTER_TIERS = ["First try", "Two", "Sharp", "Solid", "Close", "Phew"];
const POSTER_HOW_TO = [
  "One poster a day, blurred past recognition. Type any movie or show to guess.",
  "A wrong guess sharpens it one step. Six guesses.",
  "Guess one pays 12 comets, guess six pays 2.",
];
const POSTER_LOST_HINT = "Solving on guess six pays 2 comets. Guess one pays 12.";

function WrongGuesses({ titles, className }: { titles: string[]; className?: string }) {
  if (titles.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} aria-label="Wrong guesses">
      {titles.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="rounded-[4px] border border-border px-2 py-0.5 font-mono text-[12px] text-text-dim line-through"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function PosterRevealHarness({ state }: { state: HarnessState }) {
  const GAME = GAMES["poster-reveal"];
  const answer = MATRIX;
  const END = { won: true, guesses: 3, gaveUp: false };
  const api = useSeededEngine(state, {
    lines: posterRevealPayout({ guesses: END.guesses, won: END.won }),
  });
  const comets = useComets();
  const [wrongTitles, setWrongTitles] = useState<string[]>(
    state === "ready" ? [] : ["Blade Runner", "Dark City"],
  );
  const [misses, setMisses] = useState(0);
  const [revealed, setRevealed] = useState(state === "ended");
  const [outcome, setOutcome] = useState(
    state === "ended" ? END : { won: false, guesses: 0, gaveUp: false },
  );
  const endedRef = useRef(state === "ended");
  const holdTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    },
    [],
  );

  const endRun = (won: boolean, guesses: number, gaveUp = false) => {
    if (endedRef.current) return;
    endedRef.current = true;
    setOutcome({ won, guesses, gaveUp });
    setRevealed(true);
    const lines = posterRevealPayout({ guesses, won });
    holdTimer.current = window.setTimeout(() => api.finish(lines), REVEAL_HOLD_MS);
  };

  const onGuess = (hit: SearchHit) => {
    if (endedRef.current) return;
    if (hit.id === answer.id) {
      endRun(true, wrongTitles.length + 1);
      return;
    }
    setMisses((m) => m + 1);
    const next = [...wrongTitles, hit.title];
    setWrongTitles(next);
    if (next.length >= POSTER_MAX_GUESSES) endRun(false, POSTER_MAX_GUESSES);
  };

  const end = useMemo<EndScreenContent>(() => {
    const { won, guesses, gaveUp } = outcome;
    const text = sharePosterReveal({ day: DAY, guesses, won });
    const tier = won ? POSTER_TIERS[guesses - 1] : undefined;
    const headline = won
      ? `Solved in ${guesses} of ${POSTER_MAX_GUESSES}`
      : gaveUp
        ? `Revealed on guess ${Math.min(wrongTitles.length + 1, POSTER_MAX_GUESSES)}`
        : "Six guesses, no match";
    return {
      tier,
      headline,
      grid: gridOf(text),
      stats: STATS,
      distribution: {
        ...distribution(STATS, DIST_LABELS),
        today: won ? guesses - 1 : undefined,
      },
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? "Same poster for everyone." },
      lost: !won,
      lostHint: POSTER_LOST_HINT,
      moreGames: false,
    };
  }, [outcome, wrongTitles.length]);

  const { to, params } = detailPath(answer);

  return (
    <>
      <GameShell
        game={GAME}
        api={api}
        comets={comets}
        dayNumber={DAY}
        showScoreStrip={false}
        howTo={POSTER_HOW_TO}
        end={end}
        narrow
      >
        <PosterBoard
          posterUrl={answer.posterUrl}
          // On a solve the chip strip counts the solving guess too, so the
          // chip that won lights with the rest.
          wrongGuesses={revealed && outcome.won ? outcome.guesses : wrongTitles.length}
          maxGuesses={POSTER_MAX_GUESSES}
          revealed={revealed}
          revealedAlt={answer.title}
        >
          <GuessBox onGuess={onGuess} disabled={revealed} shake={misses} autoFocus />
          {!revealed && (
            <div className="mt-2.5 flex items-center justify-end whitespace-nowrap">
              <button
                type="button"
                onClick={() => endRun(false, POSTER_MAX_GUESSES, true)}
                className={PILL_MUTED}
              >
                Reveal the answer
              </button>
            </div>
          )}
          <WrongGuesses titles={wrongTitles} className="mt-3" />
        </PosterBoard>
      </GameShell>

      {api.phase === "ended" && (
        <section
          style={hueVars(GAME.slug)}
          className="mx-auto mt-8 w-full max-w-[600px] border-t border-border pt-5"
        >
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            {outcome.won ? "The answer" : "It was"}
          </h2>
          <Link
            to={to}
            params={params}
            className="mx-auto block w-full max-w-[320px]"
            aria-label={answer.title}
          >
            <img
              src={tmdbImage(answer.posterUrl, "w500")}
              alt=""
              width={500}
              height={750}
              draggable={false}
              className="aspect-[2/3] w-full rounded-[6px] border border-[var(--game,var(--primary))] object-cover shadow-[0_0_0_4px_color-mix(in_oklab,var(--game,var(--primary))_25%,transparent)]"
            />
          </Link>
          <div className="mt-4 text-center">
            <Link
              to={to}
              params={params}
              className="inline-block text-[24px] font-black leading-tight tracking-[-0.02em] text-text-bright hover:text-[var(--game,var(--primary))]"
            >
              {answer.title}
            </Link>
            <p className="mt-1 font-mono text-[12px] tabular-nums text-text-muted">{answer.year}</p>
          </div>
          {wrongTitles.length > 0 && (
            <div className="mt-4 text-center">
              <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                Your guesses
              </p>
              <WrongGuesses titles={wrongTitles} className="justify-center" />
            </div>
          )}
        </section>
      )}

      <MoreGames slug="poster-reveal" />
      <Attribution />
    </>
  );
}

// ---------------------------------------------------------------------------
// Balasaurdle: the GameShell board from the route. ready = clue one up,
// playing = three misses and a hint in, ended = solved on guess four.

const DAILY_CLUES = [
  "A movie from the 1990s.",
  "Action and science fiction, 136 minutes long.",
  "Made $467 million at the box office.",
  "Won 4 Oscars.",
  "Directed by the Wachowskis, with Laurence Fishburne in the cast.",
  "Keanu Reeves stars. The tagline: Welcome to the Real World.",
];
const DAILY_TIERS = ["First try", "Two", "Sharp", "Solid", "Close", "Phew"];
// Blur radius of the hint poster after the first, second and third hint.
const HINT_BLUR_PX = [18, 10, 5];
const DAILY_HOW_TO = [
  "One clue at a time. Type any movie or show to guess.",
  "A wrong guess opens the next clue. Six clues, six guesses.",
  "Clue one pays 12 comets, clue six pays 2. A hint costs 2.",
];
const DAILY_LOST_HINT = "Solving on clue six pays 2 comets. Clue one pays 12.";
const DAILY_HOLD_MS = REVEAL_HOLD_MS + 500;

interface DailyRun {
  guesses: { id: string; title: string }[];
  solved: boolean;
  gaveUp: boolean;
  hintsUsed: number;
}

function dailyFinished(s: DailyRun): boolean {
  return s.solved || s.gaveUp || s.guesses.length >= DAILY_MAX_GUESSES;
}

function dailyPayout(s: DailyRun): PayoutLine[] {
  return balasaurdlePayout({ guesses: s.guesses.length, won: s.solved, hints: s.hintsUsed });
}

const DAILY_MISSES = [
  { id: "movie-78", title: "Blade Runner" },
  { id: "movie-861", title: "Total Recall" },
  { id: "movie-2666", title: "Dark City" },
];

function ClueList({ clues, latest }: { clues: string[]; latest: number }) {
  const initial = useRef(clues.length);
  return (
    <ol className="mt-4 space-y-2" aria-label="Clues">
      {clues.map((clue, i) => {
        const bright = i === latest;
        return (
          <li
            key={i}
            className={cn(
              "arcade-flip-in flex gap-3 rounded-[6px] border px-3.5 py-3 text-[15px] leading-snug",
              bright
                ? "border-[var(--game,var(--primary))] [background:color-mix(in_oklab,var(--game,var(--primary))_14%,var(--color-panel))] text-text-bright"
                : "border-border bg-panel text-text-muted",
            )}
            style={{ animationDelay: i < initial.current ? `${i * 60}ms` : "0ms" }}
          >
            <span className="pt-[2px] font-mono text-[11px] font-semibold tabular-nums text-[var(--game,var(--primary))]">
              {i + 1}
            </span>
            <span>{clue}</span>
          </li>
        );
      })}
    </ol>
  );
}

function BalasaurdleHarness({ state }: { state: HarnessState }) {
  const GAME = GAMES.balasaurdle;
  const challenge = MATRIX;
  const END_RUN: DailyRun = {
    guesses: [...DAILY_MISSES, { id: challenge.id, title: challenge.title }],
    solved: true,
    gaveUp: false,
    hintsUsed: 1,
  };
  const [run, setRun] = useState<DailyRun>(
    state === "ended"
      ? END_RUN
      : state === "playing"
        ? { guesses: DAILY_MISSES, solved: false, gaveUp: false, hintsUsed: 1 }
        : { guesses: [], solved: false, gaveUp: false, hintsUsed: 0 },
  );
  const [misses, setMisses] = useState(0);
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const api = useSeededEngine(state, { lines: dailyPayout(END_RUN) });
  const comets = useComets();

  useEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    },
    [],
  );

  const finished = dailyFinished(run);
  const wrong = run.guesses.length - (run.solved ? 1 : 0);
  const cluesShown = Math.min(wrong + 1, DAILY_MAX_GUESSES);
  const hintsUsed = run.hintsUsed;

  const finishRun = (next: DailyRun) => {
    setHolding(true);
    holdTimer.current = window.setTimeout(() => {
      setHolding(false);
      api.finish(dailyPayout(next));
    }, DAILY_HOLD_MS);
  };

  const onGuess = (hit: SearchHit) => {
    if (finished || holding) return;
    const guess = { id: hit.id, title: hit.title };
    if (hit.id === challenge.id) {
      const next = { ...run, guesses: [...run.guesses, guess], solved: true };
      setRun(next);
      finishRun(next);
    } else {
      setMisses((m) => m + 1);
      const next = { ...run, guesses: [...run.guesses, guess] };
      setRun(next);
      if (next.guesses.length >= DAILY_MAX_GUESSES) finishRun(next);
    }
  };

  const giveUp = () => {
    if (finished || holding) return;
    const next = { ...run, gaveUp: true };
    setRun(next);
    finishRun(next);
  };

  const takeHint = () => {
    if (finished || holding || hintsUsed >= MAX_HINTS) return;
    setRun({ ...run, hintsUsed: hintsUsed + 1 });
  };

  const { to, params } = detailPath(challenge);

  const end = useMemo<EndScreenContent>(() => {
    const guesses = run.guesses.length;
    const won = run.solved;
    const text = shareBalasaurdle({ day: DAY, guesses, won, hints: run.hintsUsed });
    const tier = won ? DAILY_TIERS[guesses - 1] : undefined;
    const headline = won
      ? `Solved in ${guesses} of ${DAILY_MAX_GUESSES}`
      : run.gaveUp
        ? `Revealed on clue ${Math.min(guesses + 1, DAILY_MAX_GUESSES)}`
        : "Six guesses, no match";
    const hintTag =
      run.hintsUsed > 0 ? `, ${run.hintsUsed} hint${run.hintsUsed === 1 ? "" : "s"}` : "";
    return {
      tier,
      headline,
      grid: gridOf(text),
      stats: STATS,
      distribution: {
        ...distribution(STATS, DIST_LABELS),
        today: won ? guesses - 1 : undefined,
      },
      shareText: text,
      shareImage: {
        title: headline,
        subtitle: won ? `${tier}${hintTag}` : "Same six clues for everyone.",
      },
      answers: [toMediaItem(challenge)],
      answersLabel: won ? "The answer" : "It was",
      lost: !won,
      lostHint: DAILY_LOST_HINT,
    };
  }, [run, challenge]);

  return (
    <>
      <GameShell
        game={GAME}
        api={api}
        comets={comets}
        dayNumber={DAY}
        showScoreStrip={false}
        howTo={DAILY_HOW_TO}
        end={end}
        narrow
      >
        <div>
          <ChipStrip
            total={DAILY_MAX_GUESSES}
            spent={Math.min(wrong, DAILY_MAX_GUESSES)}
            active={finished ? undefined : wrong}
            label="Clues"
          />

          <ClueList
            clues={DAILY_CLUES.slice(0, finished ? DAILY_MAX_GUESSES : cluesShown)}
            latest={finished ? -1 : cluesShown - 1}
          />

          {run.guesses.length > 0 && !finished && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Wrong guesses">
              {run.guesses.map((g, i) => (
                <span
                  key={`${g.id}-${i}`}
                  className="rounded-[4px] border border-border px-2 py-0.5 font-mono text-[12px] text-text-dim line-through"
                >
                  {g.title}
                </span>
              ))}
            </div>
          )}

          {finished ? (
            <div className="mt-4 flex items-center gap-4 rounded-[6px] border border-[var(--game,var(--primary))] [background:color-mix(in_oklab,var(--game,var(--primary))_14%,var(--color-panel))] p-3.5">
              <PosterFlip
                posterUrl={challenge.posterUrl}
                title={challenge.title}
                className="w-[72px] shrink-0"
              />
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--game,var(--primary))]">
                  {run.solved ? DAILY_TIERS[run.guesses.length - 1] : "The answer"}
                </p>
                <Link
                  to={to}
                  params={params}
                  className="mt-1 block text-[20px] font-black leading-tight tracking-[-0.02em] text-text-bright hover:text-[var(--game,var(--primary))]"
                >
                  {challenge.title}
                </Link>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-text-muted">
                  {challenge.year}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
              {hintsUsed > 0 && (
                <div className="shrink-0" aria-live="polite">
                  <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--game,var(--primary))]">
                    Hint
                  </p>
                  <div className="h-[144px] w-[96px] overflow-hidden rounded-[5px] bg-panel">
                    <img
                      src={tmdbImage(challenge.posterUrl, "w185")}
                      alt="Today's poster, blurred"
                      draggable={false}
                      className="pointer-events-none h-full w-full scale-110 select-none object-cover transition-[filter] duration-[400ms] ease-out motion-reduce:transition-none"
                      style={{
                        filter: `blur(${HINT_BLUR_PX[Math.min(hintsUsed, MAX_HINTS) - 1]}px)`,
                      }}
                    />
                  </div>
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-2.5">
                <GuessBox onGuess={onGuess} disabled={finished} shake={misses} autoFocus />
                <div className="flex items-center gap-2 whitespace-nowrap">
                  {hintsUsed < MAX_HINTS && (
                    <button type="button" onClick={takeHint} className={PILL_HUE}>
                      Take a hint ({MAX_HINTS - hintsUsed} left)
                    </button>
                  )}
                  <button type="button" onClick={giveUp} className={cn("ml-auto", PILL_MUTED)}>
                    Reveal the answer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </GameShell>

      {api.phase !== "ended" && <MoreGames slug="balasaurdle" />}
      <Attribution />
    </>
  );
}

// ---------------------------------------------------------------------------

/** Balasaurdle, Poster Reveal and Emoji Plots are 600px pages at every
 *  width; the other routes widen to 880px at lg. */
const NARROW: ReadonlySet<GameSlug> = new Set(["balasaurdle", "poster-reveal", "emoji"]);

function DevArcadePage() {
  const { game, state } = Route.useSearch();
  const key = `${game}:${state}`;

  let body: React.ReactNode;
  switch (game) {
    case "quote-match":
    case "taglines":
      body = <MatchHarness key={key} slug={game} state={state} />;
      break;
    case "casting-call":
      body = <CastingHarness key={key} state={state} />;
      break;
    case "link-up":
      body = <LinkUpHarness key={key} state={state} />;
      break;
    case "timeline":
      body = <TimelineHarness key={key} state={state} />;
      break;
    case "screening":
      body = <ScreeningHarness key={key} state={state} />;
      break;
    case "emoji":
      body = <EmojiHarness key={key} state={state} />;
      break;
    case "speed-sort":
      body = <SpeedSortHarness key={key} state={state} />;
      break;
    case "sequel-or-fake":
      body = <SequelHarness key={key} state={state} />;
      break;
    case "poster-reveal":
      body = <PosterRevealHarness key={key} state={state} />;
      break;
    case "balasaurdle":
      body = <BalasaurdleHarness key={key} state={state} />;
      break;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main
        id="main"
        className={cn(
          "mx-auto w-full max-w-[600px] flex-1 px-5 py-8",
          !NARROW.has(game) && "lg:max-w-[880px]",
        )}
      >
        {body}
      </main>
    </div>
  );
}
