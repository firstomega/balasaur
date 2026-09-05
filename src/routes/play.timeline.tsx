import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { GameShell } from "@/components/arcade/GameShell";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import { OrderBoard, type OrderReveal } from "@/components/arcade/OrderBoard";
import type { EndScreenContent } from "@/components/arcade/EndScreen";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { timelinePayout, totalComets } from "@/lib/arcade/comets";
import { shareTimeline } from "@/lib/arcade/share";
import { recordResult } from "@/lib/arcade/stats";
import { ENABLED_SLUGS, GAMES, hueVars } from "@/lib/arcade/games";
import type { GameStats } from "@/lib/arcade/types";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import {
  getTimelineRound,
  getYesterday,
  type ArcadeYesterday,
  type SolvedMedia,
  type TimelineRound,
} from "@/lib/arcade.functions";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";

// Timeline. Five titles from one era, one shared set per UTC day, thirty
// seconds to put them in release order. Years stay hidden until the lock;
// the board is then judged in place and stays on screen under the end
// panel, so the player can study the order they chose next to the summary.
// The judged strip carries every year and verdict, so it is the answer;
// the end screen renders no second row of the same five posters.
// Whatever the board shows at the lock is what gets scored: the board
// reports its live order on every move, including mid-drag.

const GAME = GAMES.timeline;
const BOARD_SIZE = 5;
const TIMER_SECONDS = 30;
const HOW_TO = [
  "Five titles from one era, years hidden. Drag a row by its grip, or use the arrows.",
  "Earliest first, latest last. Thirty seconds, then lock it in.",
  "Every title in its right slot pays 2 comets. All five pays 5 more.",
];
const LOST_HINT = "A title in its right slot pays 2 comets.";

export const Route = createFileRoute("/play/timeline")({
  loader: async () => {
    // Short fresh window AND short stale window: the set flips at midnight
    // UTC and must not be served long past it.
    await cacheSsrResponse(3600, 300);
    const [round, yesterday] = await Promise.all([
      getTimelineRound(),
      getYesterday({ data: { game: GAME.slug } }),
    ]);
    return { round, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}${GAME.path}`;
    return {
      meta: buildMeta({
        title: "The Timeline Game: Put Movies in Release Order",
        description:
          "Five titles, one correct order, thirty seconds. Place each movie by release year and find out which decade you have all wrong. Same five for everyone, new at midnight.",
        url,
        image: `${SITE_ORIGIN}/og-play-${GAME.slug}.jpg`,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
    };
  },
  component: TimelinePage,
});

function MediaLink({ media }: { media: SolvedMedia }) {
  return (
    <Link
      to={media.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
      params={{ id: mediaSlug(media.id.replace(/^(movie|tv)-/, ""), media.title) }}
      className="font-semibold text-text-bright hover:text-[var(--game,var(--primary))]"
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
        Yesterday's order, solved
      </h2>
      <ol className="mt-2 space-y-1.5">
        {y.entries.map((e, i) => (
          <li
            key={i}
            className="flex items-baseline gap-2.5 rounded-[5px] border border-border bg-panel px-3 py-2 text-[13px] leading-snug"
          >
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-text-dim">
              {e.prompt}
            </span>
            {e.media ? (
              <MediaLink media={e.media} />
            ) : (
              <span className="font-semibold text-text-bright">{e.answer}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
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

function tierFor(correctSlots: number): string | undefined {
  if (correctSlots === BOARD_SIZE) return "Perfect order";
  if (correctSlots === BOARD_SIZE - 1) return "Close";
  return undefined;
}

function TimelinePage() {
  const { round, yesterday } = Route.useLoaderData() as {
    round: TimelineRound | null;
    yesterday: ArcadeYesterday | null;
  };
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();
  const viewerCountry = useViewerCountry();

  const [order, setOrder] = useState<string[]>([]);
  const [reveal, setReveal] = useState<OrderReveal | null>(null);
  const [slots, setSlots] = useState<boolean[]>([]);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [firstComets, setFirstComets] = useState(false);
  const orderRef = useRef<string[]>([]);
  const revealedRef = useRef(false);
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);

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
          console.error("[timeline] submit failed:", r.error);
          return;
        }
        comets.creditLocal(GAME.slug, round.dayKey, r.comets ?? 0);
      })
      .catch((e) => console.error("[timeline] submit unreachable:", e));
  };

  /** Lock the board: judge exactly the order on screen (the board reports
   *  every move, drag included), reveal in place, and hand the shell the
   *  payout at once. The judged board stays mounted under the end panel. */
  const submitOrder = () => {
    if (!round || revealedRef.current) return;
    revealedRef.current = true;
    api.stopTimer();
    const correctOrder = [...round.titles]
      .sort((a, b) => Number(a.year) - Number(b.year))
      .map((t) => t.id);
    const judged = orderRef.current.map((id, i) => id === correctOrder[i]);
    setSlots(judged);
    setReveal({ correctOrder });
    const correctSlots = judged.filter(Boolean).length;
    const lines = timelinePayout({ correctSlots });
    setStats(
      recordResult(GAME.slug, round.dayKey, {
        won: correctSlots === BOARD_SIZE,
        bucket: correctSlots,
      }),
    );
    api.finish(lines);
    submitRun({
      score: correctSlots * 20,
      won: correctSlots === BOARD_SIZE,
      earned: totalComets(lines),
    });
  };
  const submitRef = useRef(submitOrder);
  submitRef.current = submitOrder;

  // Reset the run state on every ready -> playing transition.
  const prevPhase = useRef(api.phase);
  useEffect(() => {
    if (api.phase === "playing" && prevPhase.current !== "playing" && round) {
      const ids = round.titles.map((t) => t.id);
      orderRef.current = ids;
      setOrder(ids);
      setReveal(null);
      setSlots([]);
      revealedRef.current = false;
      submittedRef.current = false;
      startedAtRef.current = Date.now();
      api.startTimer(TIMER_SECONDS, () => submitRef.current());
    }
    prevPhase.current = api.phase;
  }, [api, round]);

  const byId = useMemo(() => new Map((round?.titles ?? []).map((t) => [t.id, t])), [round]);
  const cards = order
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({ id: t.id, title: t.title, posterUrl: t.posterUrl, year: t.year }));

  const end = useMemo<EndScreenContent>(() => {
    if (!round) return { headline: "", shareText: "" };
    const correctSlots = slots.filter(Boolean).length;
    const text = shareTimeline({ day: round.dayKey, slots });
    const headline = `${correctSlots} of ${BOARD_SIZE} in order`;
    const tier = tierFor(correctSlots);
    return {
      tier,
      headline,
      grid: [text.split("\n")[1] ?? ""],
      stats: stats ?? undefined,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? `Titles from ${round.era}.` },
      lost: correctSlots === 0,
      lostHint: LOST_HINT,
      firstComets,
      moreGames: false,
    };
  }, [round, slots, stats, firstComets]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8 lg:max-w-[880px]">
        {round ? (
          <>
            <GameShell
              game={GAME}
              api={api}
              comets={comets}
              dayNumber={round.dayKey}
              showScoreStrip={false}
              howTo={HOW_TO}
              readyExtra={
                <p className="text-center text-[13.5px] text-text-muted">
                  Today's five come from {round.era}.
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
                <OrderBoard
                  cards={cards}
                  reveal={reveal}
                  onReorder={() => {}}
                  onSubmit={() => {}}
                />
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
              Today's set did not load. Try again in a minute.
            </p>
          </section>
        )}

        <YesterdaySolved y={yesterday} />
        <MoreGames />

        <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>
      </main>
    </div>
  );
}
