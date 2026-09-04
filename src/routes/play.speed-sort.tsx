import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { GameShell } from "@/components/arcade/GameShell";
import { BinSort, type BinDef } from "@/components/arcade/BinSort";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { speedSortPayout, totalComets } from "@/lib/arcade/comets";
import { shareSpeedSort } from "@/lib/arcade/share";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import {
  getSpeedSortRound,
  getYesterday,
  type ArcadeYesterday,
  type SolvedMedia,
  type SpeedSortRound,
} from "@/lib/arcade.functions";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";

// Speed Sort. Sixty seconds, two bins, thirty titles, one shared deck per
// UTC day. Swipe or tap each title into its bin; a wrong sort shows the bin
// it belonged in before the next card lands.

const GAME = GAMES["speed-sort"];
const TIMER_SECONDS = 60;

export const Route = createFileRoute("/play/speed-sort")({
  loader: async () => {
    // Short fresh window AND short stale window: the bins flip at midnight
    // UTC and must not be served long past it.
    await cacheSsrResponse(3600, 300);
    const [round, yesterday] = await Promise.all([
      getSpeedSortRound(),
      getYesterday({ data: { game: GAME.slug } }),
    ]);
    return { round, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}${GAME.path}`;
    return {
      meta: buildMeta({
        title: "Speed Sort: The Sixty Second Movie Sorting Game",
        description:
          "Two bins, sixty seconds, thirty titles. Sort each movie or show into the right bin before the clock runs out. A new pair of bins every day at midnight UTC.",
        url,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
    };
  },
  component: SpeedSortPage,
});

function MediaLink({ media }: { media: SolvedMedia }) {
  return (
    <Link
      to={media.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
      params={{ id: mediaSlug(media.id.replace(/^(movie|tv)-/, ""), media.title) }}
      className="font-semibold text-text-bright hover:text-primary"
    >
      {media.title}
    </Link>
  );
}

function YesterdaySolved({ y }: { y: ArcadeYesterday | null }) {
  if (!y || y.entries.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
        Yesterday's deck, sorted
      </h2>
      <ul className="mt-2 space-y-1.5">
        {y.entries.map((e, i) => (
          <li
            key={i}
            className="flex items-baseline justify-between gap-3 rounded-[5px] border border-border bg-panel px-3 py-2 text-[13px] leading-snug"
          >
            {e.media ? (
              <MediaLink media={e.media} />
            ) : (
              <span className="font-semibold text-text-bright">{e.answer}</span>
            )}
            <span className="shrink-0 font-mono text-[11px] text-text-dim">{e.prompt}</span>
          </li>
        ))}
      </ul>
    </section>
  );
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

function SpeedSortPage() {
  const { round, yesterday } = Route.useLoaderData() as {
    round: SpeedSortRound | null;
    yesterday: ArcadeYesterday | null;
  };
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();
  const viewerCountry = useViewerCountry();

  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const sortedRef = useRef(0);
  const missedRef = useRef(0);
  const endedRef = useRef(false);
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);
  const beatRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (beatRef.current) window.clearTimeout(beatRef.current);
    },
    [],
  );

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
          console.error("[speed-sort] submit failed:", r.error);
          return;
        }
        comets.creditLocal(GAME.slug, round.dayKey, r.comets ?? 0);
      })
      .catch((e) => console.error("[speed-sort] submit unreachable:", e));
  };

  const endRun = () => {
    if (!round || endedRef.current) return;
    endedRef.current = true;
    api.stopTimer();
    const sorted = sortedRef.current;
    const missed = missedRef.current;
    const lines = speedSortPayout({ sorted, missed });
    api.finish(lines);
    submitRun({
      score: Math.round((sorted / round.titles.length) * 100),
      won: sorted === round.titles.length && missed === 0,
      earned: totalComets(lines),
    });
  };
  const endRef = useRef(endRun);
  endRef.current = endRun;

  // Reset the run state on every ready -> playing transition.
  const prevPhase = useRef(api.phase);
  useEffect(() => {
    if (api.phase === "playing" && prevPhase.current !== "playing" && round) {
      indexRef.current = 0;
      setIndex(0);
      sortedRef.current = 0;
      missedRef.current = 0;
      endedRef.current = false;
      submittedRef.current = false;
      startedAtRef.current = Date.now();
      api.startTimer(TIMER_SECONDS, () => endRef.current());
    }
    prevPhase.current = api.phase;
  }, [api, round]);

  const onChoose = (binIndex: 0 | 1): boolean => {
    if (!round || endedRef.current) return false;
    const card = round.titles[indexRef.current];
    if (!card) return false;
    const correct = card.bin === (binIndex === 0 ? "a" : "b");
    if (correct) {
      sortedRef.current += 1;
      api.addScore(1);
      api.hitCombo();
    } else {
      missedRef.current += 1;
      api.breakCombo();
    }
    const next = indexRef.current + 1;
    indexRef.current = next;
    setIndex(next);
    // Cleared the whole deck before the clock: let the last card's exit
    // resolve, then end the run.
    if (next >= round.titles.length) {
      beatRef.current = window.setTimeout(() => endRef.current(), 650);
    }
    return correct;
  };

  const bins: [BinDef, BinDef] | null = round
    ? [
        { key: "a", label: round.bins.a },
        { key: "b", label: round.bins.b },
      ]
    : null;
  const sorted = sortedRef.current;
  const missed = missedRef.current;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8">
        {round && bins ? (
          <GameShell
            game={GAME}
            api={api}
            comets={comets}
            dayNumber={round.dayKey}
            readyExtra={
              <p className="mt-2 text-[13.5px] text-text-muted">
                Today's bins: <span className="font-semibold text-text-bright">{round.bins.a}</span>{" "}
                or <span className="font-semibold text-text-bright">{round.bins.b}</span>.
              </p>
            }
            end={{
              headline: `${sorted} of ${round.titles.length} sorted right`,
              shareText: shareSpeedSort({ day: round.dayKey, sorted, missed }),
              nextGameLine: "New bins at midnight UTC.",
            }}
          >
            <BinSort
              card={
                round.titles[index]
                  ? {
                      id: round.titles[index].id,
                      label: round.titles[index].title,
                      posterUrl: round.titles[index].posterUrl,
                    }
                  : null
              }
              nextCard={
                round.titles[index + 1]
                  ? {
                      id: round.titles[index + 1].id,
                      label: round.titles[index + 1].title,
                      posterUrl: round.titles[index + 1].posterUrl,
                    }
                  : null
              }
              bins={bins}
              onChoose={onChoose}
            />
          </GameShell>
        ) : (
          <section>
            <h1 className="text-[20px] font-bold tracking-tight text-text-bright">{GAME.name}</h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.tagline}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's deck did not load. Try again in a minute.
            </p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            How to play
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">
            One title at a time, two bins, sixty seconds. Swipe the card toward its bin, tap the
            bin, or use the arrow keys; a wrong sort shows the bin it belonged in before the next
            card lands. The deck and the bins are the same for everyone and change at midnight UTC.
          </p>
        </section>

        <YesterdaySolved y={yesterday} />
        <MoreGames />

        <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>
      </main>
    </div>
  );
}
