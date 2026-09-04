import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { GameShell } from "@/components/arcade/GameShell";
import { PosterBoard } from "@/components/arcade/PosterBoard";
import { GuessBox } from "@/components/arcade/GuessBox";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { posterRevealPayout, totalComets } from "@/lib/arcade/comets";
import { sharePosterReveal } from "@/lib/arcade/share";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import type { SearchHit } from "@/lib/catalog.functions";
import {
  getPosterRound,
  getYesterday,
  type ArcadeMediaCard,
  type ArcadeYesterday,
  type PosterRound,
  type SolvedMedia,
} from "@/lib/arcade.functions";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";
import type { MediaItem } from "@/types/media";

// Poster Reveal. One poster per UTC day, heavily blurred, six guesses. Every
// wrong guess sharpens it a step; the sixth wrong guess is the last. The
// answer title never renders while the run is live: the image is the puzzle.

const GAME = GAMES["poster-reveal"];
const MAX_GUESSES = 6;
// Solve on guess 1 through 6; the score falls with each blur step used.
const SCORE_BY_GUESS = [100, 85, 70, 55, 40, 25];

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
          "The poster starts as a blur and sharpens with every wrong guess. Name the movie or show in six guesses before it comes into focus. A new poster every day.",
        url,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
    };
  },
  component: PosterRevealPage,
});

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

function MoreGames() {
  return (
    <section className="mt-8">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">More games</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ENABLED_SLUGS.filter((s) => s !== GAME.slug).map((s) => (
          <Link
            key={s}
            to={GAMES[s].path}
            className="rounded-[5px] border border-border bg-panel px-2.5 py-1 text-[12.5px] text-text hover:border-primary hover:text-primary"
          >
            {GAMES[s].name}
          </Link>
        ))}
        <Link
          to="/play"
          className="rounded-[5px] border border-border bg-panel px-2.5 py-1 text-[12.5px] text-text hover:border-primary hover:text-primary"
        >
          All games
        </Link>
      </div>
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
          params={{ id: mediaSlug(media.id.replace(/^(movie|tv)-/, ""), media.title) }}
          className="font-semibold text-text-bright hover:text-primary"
        >
          {media.title}
        </Link>
        <span className="font-mono text-[11px] text-text-dim">
          {" "}
          {media.year} · game #{y.dayKey}
        </span>
      </div>
    </section>
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
  const wonRef = useRef(false);
  const guessesRef = useRef(0);
  const endedRef = useRef(false);
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);

  const submitRun = (o: { score: number; won: boolean; earned: number }) => {
    if (!round || submittedRef.current) return;
    submittedRef.current = true;
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

  const endRun = (won: boolean, guesses: number) => {
    if (endedRef.current) return;
    endedRef.current = true;
    wonRef.current = won;
    guessesRef.current = guesses;
    const lines = posterRevealPayout({ guesses, won });
    api.finish(lines);
    submitRun({
      score: won ? SCORE_BY_GUESS[guesses - 1] : 0,
      won,
      earned: totalComets(lines),
    });
  };

  // Reset the run state on every ready -> playing transition.
  const prevPhase = useRef(api.phase);
  useEffect(() => {
    if (api.phase === "playing" && prevPhase.current !== "playing" && round) {
      setWrongTitles([]);
      wonRef.current = false;
      guessesRef.current = 0;
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
    const next = [...wrongTitles, hit.title];
    setWrongTitles(next);
    if (next.length >= MAX_GUESSES) endRun(false, MAX_GUESSES);
  };

  const won = wonRef.current;
  const guesses = guessesRef.current;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8">
        {round ? (
          <GameShell
            game={GAME}
            api={api}
            comets={comets}
            dayNumber={round.dayKey}
            showScoreStrip={false}
            end={{
              headline: won ? `Solved in ${guesses} of ${MAX_GUESSES}` : "Not solved today",
              shareText: sharePosterReveal({ day: round.dayKey, guesses, won }),
              nextGameLine: "A new poster at midnight UTC.",
              answers: [toMediaItem(round.media)],
              answersLabel: "The answer",
            }}
          >
            <PosterBoard posterUrl={round.media.posterUrl} wrongGuesses={wrongTitles.length}>
              <GuessBox onGuess={onGuess} disabled={endedRef.current} />
              <div className="mt-2.5 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                  Guess {Math.min(wrongTitles.length + 1, MAX_GUESSES)} of {MAX_GUESSES}
                </span>
                <button
                  type="button"
                  onClick={() => endRun(false, MAX_GUESSES)}
                  className="font-mono text-[11px] uppercase tracking-wider text-text-dim underline hover:text-text-muted"
                >
                  Reveal the answer
                </button>
              </div>
              {wrongTitles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Wrong guesses">
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
            </PosterBoard>
          </GameShell>
        ) : (
          <section>
            <h1 className="text-[20px] font-bold tracking-tight text-text-bright">{GAME.name}</h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.tagline}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's poster did not load. Try again in a minute.
            </p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            How to play
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">
            One poster a day, blurred past recognition. Search any movie or show and guess; every
            wrong guess sharpens the poster one step, and the sixth wrong guess ends the run. The
            poster is the same for everyone and changes at midnight UTC.
          </p>
        </section>

        <YesterdayAnswer y={yesterday} />
        <MoreGames />

        <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>
      </main>
    </div>
  );
}
