import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { GameShell } from "@/components/arcade/GameShell";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import { PosterBoard, POSTER_MAX_GUESSES, REVEAL_HOLD_MS } from "@/components/arcade/PosterBoard";
import { GuessBox } from "@/components/arcade/GuessBox";
import type { EndScreenContent } from "@/components/arcade/EndScreen";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { posterRevealPayout, totalComets } from "@/lib/arcade/comets";
import { sharePosterReveal } from "@/lib/arcade/share";
import { distribution, recordResult } from "@/lib/arcade/stats";
import { ENABLED_SLUGS, GAMES, hueVars } from "@/lib/arcade/games";
import type { GameStats } from "@/lib/arcade/types";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import type { SearchHit } from "@/lib/catalog.functions";
import {
  getPosterRound,
  getYesterday,
  type ArcadeYesterday,
  type PosterRound,
  type SolvedMedia,
} from "@/lib/arcade.functions";
import { mediaSlug } from "@/lib/slug";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";

// Poster Reveal. One poster per UTC day, heavily blurred, six guesses. Every
// wrong guess sharpens it a step; the sixth wrong guess is the last. The
// answer title never renders while the run is live: the image is the puzzle.
// On the last guess the poster snaps sharp and the board holds for a beat
// before the end screen, and the sharp poster stays under the end panel,
// centered, with the guesses beneath it: the thing being guessed at is the
// reward.

const GAME = GAMES["poster-reveal"];
const MAX_GUESSES = POSTER_MAX_GUESSES;
// Solve on guess 1 through 6; the score falls with each blur step used.
const SCORE_BY_GUESS = [100, 85, 70, 55, 40, 25];
const TIERS = ["First try", "Two", "Sharp", "Solid", "Close", "Phew"];
const DIST_LABELS = ["1", "2", "3", "4", "5", "6"];
const HOW_TO = [
  "One poster a day, blurred past recognition. Type any movie or show to guess.",
  "A wrong guess sharpens it one step. Six guesses.",
  "Guess one pays 12 comets, guess six pays 2.",
];
const LOST_HINT = "Solving on guess six pays 2 comets. Guess one pays 12.";

export const Route = createFileRoute("/play/poster-reveal")({
  loader: async () => {
    // Short fresh window AND short stale window: the poster flips at midnight
    // UTC and must not be served long past it.
    await cacheSsrResponse(3600, 300);
    const [round, yesterday] = await Promise.all([
      getPosterRound(),
      getYesterday({ data: { game: GAME.slug } }),
    ]);
    return { round, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}${GAME.path}`;
    return {
      meta: buildMeta({
        title: "Poster Reveal: Guess the Movie from Its Poster",
        description:
          "The poster starts as a blur and sharpens with every wrong guess. Name the movie or show in six guesses before it comes into focus. Same poster for everyone, new at midnight.",
        url,
        image: `${SITE_ORIGIN}/og-play-${GAME.slug}.jpg`,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
    };
  },
  component: PosterRevealPage,
});

function detailSlug(media: SolvedMedia): string {
  return mediaSlug(media.id.replace(/^(movie|tv)-/, ""), media.title);
}

function MoreGames() {
  return (
    <section className="mt-8">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">More games</h2>
      <ScrollRail className="mt-2 gap-2.5">
        {ENABLED_SLUGS.filter((s) => s !== GAME.slug).map((s) => (
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

function YesterdayAnswer({ y }: { y: ArcadeYesterday | null }) {
  const media: SolvedMedia | undefined = y?.entries[0]?.media;
  if (!y || !media) return null;
  return (
    <section className="mt-10">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
        Yesterday's poster
      </h2>
      <div className="mt-2 rounded-[5px] border border-border bg-panel px-3 py-2 text-[13px] leading-snug">
        <Link
          to={media.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
          params={{ id: detailSlug(media) }}
          className="font-semibold text-text-bright hover:text-[var(--game,var(--primary))]"
        >
          {media.title}
        </Link>
        <span className="font-mono text-[11px] tabular-nums text-text-dim">
          {" "}
          {media.year} · No. {y.dayKey}
        </span>
      </div>
    </section>
  );
}

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

function PosterRevealPage() {
  const { round, yesterday } = Route.useLoaderData() as {
    round: PosterRound | null;
    yesterday: ArcadeYesterday | null;
  };
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();
  const viewerCountry = useViewerCountry();

  const [wrongTitles, setWrongTitles] = useState<string[]>([]);
  const [misses, setMisses] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [outcome, setOutcome] = useState<{ won: boolean; guesses: number; gaveUp: boolean }>({
    won: false,
    guesses: 0,
    gaveUp: false,
  });
  const [stats, setStats] = useState<GameStats | null>(null);
  const [firstComets, setFirstComets] = useState(false);
  const endedRef = useRef(false);
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);
  const holdTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    },
    [],
  );

  const submitRun = (o: { score: number; won: boolean; earned: number }) => {
    if (!round || submittedRef.current) return;
    submittedRef.current = true;
    if (o.earned > 0 && comets.ready && comets.total === 0) setFirstComets(true);
    if (!user) {
      comets.creditLocal(GAME.slug, round.dayKey, o.earned);
      return;
    }
    arcadeSubmitRun({
      game: GAME.slug,
      dayKey: round.dayKey,
      score: o.score,
      durationMs: Date.now() - startedAtRef.current,
      won: o.won,
      comets: o.earned,
      country: viewerCountry || null,
    })
      .then((r) => {
        // The RPC reports failure as {error}; it does not throw.
        if (r.error) {
          console.error("[poster-reveal] submit failed:", r.error);
          return;
        }
        comets.creditLocal(GAME.slug, round.dayKey, r.comets ?? 0);
      })
      .catch((e) => console.error("[poster-reveal] submit unreachable:", e));
  };

  /** The run is over: snap the poster sharp, credit and record the day,
   *  hold the board for a beat so the reveal lands, then hand the shell the
   *  payout. */
  const endRun = (won: boolean, guesses: number, gaveUp = false) => {
    if (!round || endedRef.current) return;
    endedRef.current = true;
    setOutcome({ won, guesses, gaveUp });
    setRevealed(true);
    const lines = posterRevealPayout({ guesses, won });
    setStats(recordResult(GAME.slug, round.dayKey, { won, bucket: won ? guesses : "X" }));
    submitRun({
      score: won ? SCORE_BY_GUESS[guesses - 1] : 0,
      won,
      earned: totalComets(lines),
    });
    holdTimer.current = window.setTimeout(() => api.finish(lines), REVEAL_HOLD_MS);
  };

  // Reset the run state on every ready -> playing transition.
  const prevPhase = useRef(api.phase);
  useEffect(() => {
    if (api.phase === "playing" && prevPhase.current !== "playing" && round) {
      setWrongTitles([]);
      setMisses(0);
      setRevealed(false);
      setOutcome({ won: false, guesses: 0, gaveUp: false });
      endedRef.current = false;
      submittedRef.current = false;
      startedAtRef.current = Date.now();
    }
    prevPhase.current = api.phase;
  }, [api.phase, round]);

  const onGuess = (hit: SearchHit) => {
    if (!round || endedRef.current) return;
    if (hit.id === round.media.id) {
      endRun(true, wrongTitles.length + 1);
      return;
    }
    setMisses((m) => m + 1);
    const next = [...wrongTitles, hit.title];
    setWrongTitles(next);
    if (next.length >= MAX_GUESSES) endRun(false, MAX_GUESSES);
  };

  const end = useMemo<EndScreenContent>(() => {
    if (!round) return { headline: "", shareText: "" };
    const { won, guesses, gaveUp } = outcome;
    const text = sharePosterReveal({ day: round.dayKey, guesses, won });
    const tier = won ? TIERS[guesses - 1] : undefined;
    const headline = won
      ? `Solved in ${guesses} of ${MAX_GUESSES}`
      : gaveUp
        ? `Revealed on guess ${Math.min(wrongTitles.length + 1, MAX_GUESSES)}`
        : "Six guesses, no match";
    return {
      tier,
      headline,
      grid: [text.split("\n")[1] ?? ""],
      stats: stats ?? undefined,
      distribution: stats
        ? { ...distribution(stats, DIST_LABELS), today: won ? guesses - 1 : undefined }
        : undefined,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? "Same poster for everyone." },
      lost: !won,
      lostHint: LOST_HINT,
      firstComets,
      moreGames: false,
    };
  }, [round, outcome, wrongTitles.length, stats, firstComets]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8">
        {round ? (
          <>
            <GameShell
              game={GAME}
              api={api}
              comets={comets}
              dayNumber={round.dayKey}
              showScoreStrip={false}
              howTo={HOW_TO}
              end={end}
              narrow
            >
              <PosterBoard
                posterUrl={round.media.posterUrl}
                // On a solve the chip strip counts the solving guess too, so
                // the chip that won lights with the rest.
                wrongGuesses={revealed && outcome.won ? outcome.guesses : wrongTitles.length}
                maxGuesses={MAX_GUESSES}
                revealed={revealed}
                revealedAlt={round.media.title}
              >
                <GuessBox onGuess={onGuess} disabled={revealed} shake={misses} autoFocus />
                {!revealed && (
                  <div className="mt-2.5 flex items-center justify-end whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => endRun(false, MAX_GUESSES, true)}
                      className="inline-flex items-center rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-text-dim hover:border-text-dim hover:text-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--game,var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                  to={round.media.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
                  params={{ id: detailSlug(round.media) }}
                  className="mx-auto block w-full max-w-[320px]"
                  aria-label={round.media.title}
                >
                  <img
                    src={tmdbImage(round.media.posterUrl, "w500")}
                    alt=""
                    width={500}
                    height={750}
                    draggable={false}
                    className="aspect-[2/3] w-full rounded-[6px] border border-[var(--game,var(--primary))] object-cover shadow-[0_0_0_4px_color-mix(in_oklab,var(--game,var(--primary))_25%,transparent)]"
                  />
                </Link>
                <div className="mt-4 text-center">
                  <Link
                    to={round.media.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
                    params={{ id: detailSlug(round.media) }}
                    className="inline-block text-[24px] font-black leading-tight tracking-[-0.02em] text-text-bright hover:text-[var(--game,var(--primary))]"
                  >
                    {round.media.title}
                  </Link>
                  <p className="mt-1 font-mono text-[12px] tabular-nums text-text-muted">
                    {round.media.year}
                  </p>
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
          </>
        ) : (
          <section>
            <h1 className="text-[22px] font-black tracking-[-0.02em] text-text-bright">
              {GAME.name}
            </h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.hook}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's poster did not load. Try again in a minute.
            </p>
          </section>
        )}

        <YesterdayAnswer y={yesterday} />
        <MoreGames />

        <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>
      </main>
    </div>
  );
}
