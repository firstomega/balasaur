import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { GameShell } from "@/components/arcade/GameShell";
import { GuessBox } from "@/components/arcade/GuessBox";
import { ChipStrip, REVEAL_HOLD_MS } from "@/components/arcade/PosterBoard";
import { PosterFlip } from "@/components/arcade/EmojiStage";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import { getDailyChallenge, type DailyChallenge } from "@/lib/daily.functions";
import { getYesterday, type ArcadeYesterday } from "@/lib/arcade.functions";
import type { SearchHit } from "@/lib/catalog.functions";
import { useViewerCountry } from "@/hooks/useCatalog";
import { useAuth } from "@/hooks/useAuth";
import { arcadeSubmitRun } from "@/lib/arcade";
import { GAMES, ENABLED_SLUGS } from "@/lib/arcade/games";
import { balasaurdlePayout, totalComets } from "@/lib/arcade/comets";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { distribution, recordResult } from "@/lib/arcade/stats";
import { shareBalasaurdle } from "@/lib/arcade/share";
import type { GameStats, PayoutLine } from "@/lib/arcade/types";
import type { EndScreenContent } from "@/components/arcade/EndScreen";
import {
  MAX_GUESSES,
  MAX_HINTS,
  dayNumber,
  loadDaily,
  saveDaily,
  type DailyState,
} from "@/lib/daily";
import { tmdbImage } from "@/lib/tmdbImage";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types/media";

// Balasaurdle. One title a day for everyone, six clues, guess by search.
// The ritual is the point: a reason to come back tomorrow that no catalog
// page provides. State lives in localStorage; no account required.
//
// The page runs inside GameShell like every other game: a ready panel, the
// board, the sequenced end screen. A run in progress or already finished
// today is restored after mount and skips the ready panel. Each new clue
// flips in, a six-chip strip fills as clues are spent, a miss shakes the
// guess box, and the answer's poster flips in for a beat before the end
// screen counts the comets up and flies them to the header chip.
//
// A hint is the poster, blurred, as a small card beside the guess box; each
// further hint sharpens it one step. No panel, no second box.

const GAME = GAMES.balasaurdle;
// Blur radius of the hint poster after the first, second and third hint.
const HINT_BLUR_PX = [18, 10, 5];
const TIERS = ["First try", "Two", "Sharp", "Solid", "Close", "Phew"];
const DIST_LABELS = ["1", "2", "3", "4", "5", "6"];
const HOW_TO = [
  "One clue at a time. Type any movie or show to guess.",
  "A wrong guess opens the next clue. Six clues, six guesses.",
  "Clue one pays 12 comets, clue six pays 2. A hint costs 2.",
];
const LOST_HINT = "Solving on clue six pays 2 comets. Clue one pays 12.";
// The answer's poster holds on the board before the end screen takes over.
const HOLD_MS = REVEAL_HOLD_MS + 500;

export const Route = createFileRoute("/play/balasaurdle")({
  loader: async () => {
    // Short fresh window AND short stale window: the puzzle flips at midnight
    // UTC, and the default 24-hour stale-while-revalidate would let the CDN
    // hand out yesterday's game long past the flip.
    await cacheSsrResponse(3600, 300);
    const [challenge, yesterday] = await Promise.all([
      getDailyChallenge(),
      getYesterday({ data: { game: "balasaurdle" } }),
    ]);
    return { challenge, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}/play/balasaurdle`;
    return {
      meta: buildMeta({
        title: "Balasaurdle: The Daily Movie and TV Guessing Game",
        description:
          "One title a day, six clues. How few do you need? The same clues for everyone, new at midnight.",
        url,
        image: `${SITE_ORIGIN}/og-play-balasaurdle.png`,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd("Balasaurdle", url))],
    };
  },
  component: PlayPage,
});

/** The server-rendered state: nothing guessed. localStorage replaces it
 *  after mount, never during hydration. */
function blank(day: number): DailyState {
  return {
    day,
    guessedIds: [],
    guesses: [],
    solved: false,
    gaveUp: false,
    streak: 0,
    best: 0,
    played: 0,
    wins: 0,
    hintsUsed: 0,
  };
}

function isFinished(s: DailyState): boolean {
  return s.solved || s.gaveUp || s.guessedIds.length >= MAX_GUESSES;
}

function payoutOf(s: DailyState): PayoutLine[] {
  return balasaurdlePayout({ guesses: s.guessedIds.length, won: s.solved, hints: s.hintsUsed });
}

function toMediaItem(c: DailyChallenge): MediaItem {
  return {
    id: c.id,
    mediaType: c.mediaType,
    title: c.title,
    year: c.year,
    overview: "",
    posterUrl: c.posterUrl,
    ratings: typeof c.score === "number" ? { balasaur: c.score } : {},
    genres: [],
    streaming: [],
    lengthLabel: "",
    people: [],
  };
}

/** The clues shown so far. The newest flips in and reads bright; the ones
 *  already seen dim. A batch present at mount (a restored run, or the ready
 *  to playing switch) staggers 60ms per row. */
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

function MoreGames() {
  return (
    <section className="mt-8">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">More games</h2>
      <ScrollRail className="mt-2 gap-2.5">
        {ENABLED_SLUGS.filter((slug) => slug !== GAME.slug).map((slug) => (
          <ArcadeTile key={slug} game={GAMES[slug]} className="w-[168px] shrink-0" />
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

function PlayPage() {
  const { challenge, yesterday } = Route.useLoaderData() as {
    challenge: DailyChallenge | null;
    yesterday: ArcadeYesterday | null;
  };
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();
  const viewerCountry = useViewerCountry();

  const [state, setState] = useState<DailyState | null>(() =>
    challenge ? blank(challenge.number) : null,
  );
  const [stats, setStats] = useState<GameStats | null>(null);
  const [misses, setMisses] = useState(0);
  const [holding, setHolding] = useState(false);
  const [firstComets, setFirstComets] = useState(false);
  const [staleDay, setStaleDay] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const creditedRef = useRef(false);
  const holdTimer = useRef<number | null>(null);

  // Restore after mount. A finished day goes straight to the end screen; a
  // run with guesses or hints already spent goes straight to the board.
  useEffect(() => {
    if (!challenge) return;
    const s = loadDaily(challenge.number);
    setState(s);
    startedAtRef.current = Date.now();
    // The CDN can hand the first post-midnight visitors yesterday's page.
    // Say so instead of letting them play a mislabeled game.
    if (dayNumber() !== challenge.number) setStaleDay(true);
    if (isFinished(s)) {
      // An earlier session credited this run; never submit it twice.
      creditedRef.current = true;
      setStats(
        recordResult(GAME.slug, s.day, {
          won: s.solved,
          bucket: s.solved ? s.guessedIds.length : "X",
        }),
      );
      api.start();
      api.finish(payoutOf(s));
    } else if (s.guessedIds.length > 0 || s.hintsUsed > 0) {
      api.start();
    }
    // api.start and api.finish are stable callbacks; the api object itself
    // changes identity with every score tick and must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge]);

  useEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    },
    [],
  );

  const finished = !!state && isFinished(state);
  const wrong = state ? state.guessedIds.length - (state.solved ? 1 : 0) : 0;
  const cluesShown = state ? Math.min(wrong + 1, MAX_GUESSES) : 1;

  const update = (next: DailyState) => {
    setState(next);
    saveDaily(next);
  };

  /** Credit a run the moment it finishes in this session. Guests write the
   *  comet blob (idempotent per day); signed-in runs go to the server, which
   *  clamps the payout to the daily cap and credits the first run per day. */
  const creditFinish = (next: DailyState, lines: PayoutLine[]) => {
    if (creditedRef.current) return;
    creditedRef.current = true;
    const earned = totalComets(lines);
    if (earned > 0 && comets.ready && comets.total === 0) setFirstComets(true);
    const durationMs = Date.now() - startedAtRef.current;
    if (user) {
      void arcadeSubmitRun({
        game: GAME.slug,
        dayKey: next.day,
        score: earned,
        durationMs,
        won: next.solved,
        comets: earned,
        country: viewerCountry || null,
      })
        .then((res) => {
          // The RPC reports failure as {error}; it does not throw.
          if (res.error) {
            console.error("[balasaurdle] submit failed:", res.error);
            return;
          }
          comets.creditLocal(GAME.slug, next.day, res.comets ?? 0);
        })
        .catch((e) => console.error("[balasaurdle] submit unreachable:", e));
    } else {
      comets.creditLocal(GAME.slug, next.day, earned);
    }
  };

  /** The run is over: credit it, record the day, hold the board on the
   *  answer's poster for a beat, then hand the shell the payout. */
  const finishRun = (next: DailyState) => {
    const lines = payoutOf(next);
    creditFinish(next, lines);
    setStats(
      recordResult(GAME.slug, next.day, {
        won: next.solved,
        bucket: next.solved ? next.guessedIds.length : "X",
      }),
    );
    setHolding(true);
    holdTimer.current = window.setTimeout(() => {
      setHolding(false);
      api.finish(lines);
    }, HOLD_MS);
  };

  const onGuess = (hit: SearchHit) => {
    if (!challenge || !state || finished || holding) return;
    const guess = { id: hit.id, title: hit.title };
    if (hit.id === challenge.id) {
      const streak = state.streak + 1;
      const next: DailyState = {
        ...state,
        guessedIds: [...state.guessedIds, hit.id],
        guesses: [...state.guesses, guess],
        solved: true,
        streak,
        best: Math.max(state.best, streak),
        played: state.played + 1,
        wins: state.wins + 1,
      };
      update(next);
      finishRun(next);
    } else {
      setMisses((m) => m + 1);
      const guessedIds = [...state.guessedIds, hit.id];
      const out = guessedIds.length >= MAX_GUESSES;
      const next: DailyState = {
        ...state,
        guessedIds,
        guesses: [...state.guesses, guess],
        played: out ? state.played + 1 : state.played,
        streak: out ? 0 : state.streak,
      };
      update(next);
      if (out) finishRun(next);
    }
  };

  const giveUp = () => {
    if (!state || finished || holding) return;
    const next: DailyState = { ...state, gaveUp: true, played: state.played + 1, streak: 0 };
    update(next);
    finishRun(next);
  };

  const hintsUsed = state?.hintsUsed ?? 0;
  const takeHint = () => {
    if (!state || finished || holding || hintsUsed >= MAX_HINTS) return;
    update({ ...state, hintsUsed: hintsUsed + 1 });
  };

  const detailSlug = useMemo(
    () => (challenge ? mediaSlug(challenge.id.replace(/^(movie|tv)-/, ""), challenge.title) : ""),
    [challenge],
  );

  // Deterministic from the finished state, so a restored game reads the same
  // as a just-finished one.
  const end = useMemo<EndScreenContent>(() => {
    if (!challenge || !state) return { headline: "", shareText: "" };
    const guesses = state.guessedIds.length;
    const won = state.solved;
    const text = shareBalasaurdle({
      day: challenge.number,
      guesses,
      won,
      hints: state.hintsUsed,
    });
    const tier = won ? TIERS[guesses - 1] : undefined;
    const headline = won
      ? `Solved in ${guesses} of ${MAX_GUESSES}`
      : state.gaveUp
        ? `Revealed on clue ${Math.min(guesses + 1, MAX_GUESSES)}`
        : "Six guesses, no match";
    const hintTag =
      state.hintsUsed > 0 ? `, ${state.hintsUsed} hint${state.hintsUsed === 1 ? "" : "s"}` : "";
    return {
      tier,
      headline,
      grid: [text.split("\n")[1] ?? ""],
      stats: stats ?? undefined,
      distribution: stats
        ? { ...distribution(stats, DIST_LABELS), today: won ? guesses - 1 : undefined }
        : undefined,
      shareText: text,
      shareImage: {
        title: headline,
        subtitle: won ? `${tier}${hintTag}` : "Same six clues for everyone.",
      },
      answers: [toMediaItem(challenge)],
      answersLabel: won ? "The answer" : "It was",
      lost: !won,
      lostHint: LOST_HINT,
      firstComets,
    };
  }, [challenge, state, stats, firstComets]);

  const yesterdayEntry = yesterday?.entries[0] ?? null;
  const yesterdaySlug = yesterdayEntry?.media
    ? mediaSlug(yesterdayEntry.media.id.replace(/^(movie|tv)-/, ""), yesterdayEntry.media.title)
    : "";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8">
        {staleDay && (
          <p
            role="status"
            className="mb-4 rounded-[5px] border border-border bg-panel px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-text-muted"
          >
            A new game is out.{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-primary underline"
            >
              Load it
            </button>
          </p>
        )}

        {!challenge || !state ? (
          <section>
            <h1 className="text-[22px] font-black tracking-[-0.02em] text-text-bright">
              {GAME.name}
            </h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.hook}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's game did not load. Try again in a minute.
            </p>
          </section>
        ) : (
          <GameShell
            game={GAME}
            api={api}
            comets={comets}
            dayNumber={challenge.number}
            showScoreStrip={false}
            howTo={HOW_TO}
            end={end}
            narrow
          >
            <div>
              <ChipStrip
                total={MAX_GUESSES}
                spent={Math.min(wrong, MAX_GUESSES)}
                active={finished ? undefined : wrong}
                label="Clues"
              />

              <ClueList
                clues={challenge.clues.slice(0, finished ? MAX_GUESSES : cluesShown)}
                latest={finished ? -1 : cluesShown - 1}
              />

              <p aria-live="polite" className="sr-only">
                {state.solved
                  ? `Correct. Solved in ${state.guessedIds.length} guesses.`
                  : wrong > 0
                    ? `Wrong. Clue ${cluesShown} revealed.`
                    : ""}
              </p>

              {state.guesses.some((g) => g.title) && !finished && (
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Wrong guesses">
                  {state.guesses
                    .filter((g) => g.title)
                    .map((g, i) => (
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
                      {state.solved ? TIERS[state.guessedIds.length - 1] : "The answer"}
                    </p>
                    <Link
                      to={challenge.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
                      params={{ id: detailSlug }}
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
                        <button
                          type="button"
                          onClick={takeHint}
                          className="inline-flex items-center rounded-full border border-[var(--game,var(--primary))] px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--game,var(--primary))] hover:[background:color-mix(in_oklab,var(--game,var(--primary))_14%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--game,var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          Take a hint ({MAX_HINTS - hintsUsed} left)
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={giveUp}
                        className="ml-auto inline-flex items-center rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-text-dim hover:border-text-dim hover:text-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--game,var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        Reveal the answer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </GameShell>
        )}

        {yesterday && yesterdayEntry && yesterdayEntry.media && (
          <section className="mt-10">
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
              Yesterday's answer
            </h2>
            <div className="mt-2 flex items-center gap-3 rounded-[6px] border border-border bg-panel p-3">
              <img
                src={tmdbImage(yesterdayEntry.media.posterUrl, "w185")}
                alt={`Poster for ${yesterdayEntry.media.title}`}
                className="h-[72px] w-[48px] shrink-0 rounded-[4px] object-cover"
              />
              <div className="min-w-0">
                <Link
                  to={yesterdayEntry.media.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
                  params={{ id: yesterdaySlug }}
                  className="block truncate text-[15px] font-semibold text-text-bright hover:text-[var(--game,var(--primary))]"
                >
                  {yesterdayEntry.media.title}
                </Link>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-text-muted">
                  {yesterdayEntry.media.year} · No. {yesterday.dayKey}
                </p>
              </div>
            </div>
          </section>
        )}

        {api.phase !== "ended" && <MoreGames />}

        <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>
      </main>
    </div>
  );
}
