import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { GameShell } from "@/components/arcade/GameShell";
import { OrderBoard, type OrderReveal } from "@/components/arcade/OrderBoard";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { timelinePayout, totalComets } from "@/lib/arcade/comets";
import { shareTimeline } from "@/lib/arcade/share";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
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
import type { MediaItem } from "@/types/media";

// Timeline. Five titles from one era, one shared set per UTC day, thirty
// seconds to put them in release order. Years stay hidden until submit; the
// reveal colors each row in place so the final order explains itself.

const GAME = GAMES.timeline;
const BOARD_SIZE = 5;
const TIMER_SECONDS = 30;
const REVEAL_BEAT_MS = 2200;

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
          "Five titles, one correct order, thirty seconds. Place each movie by release year and find out which decade you have all wrong. A new set every day.",
        url,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
    };
  },
  component: TimelinePage,
});

function toMediaItem(c: {
  id: string;
  mediaType: "movie" | "tv";
  title: string;
  year: string;
  posterUrl: string;
}): MediaItem {
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
  const orderRef = useRef<string[]>([]);
  const revealedRef = useRef(false);
  const slotsRef = useRef<boolean[]>([]);
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
          console.error("[timeline] submit failed:", r.error);
          return;
        }
        comets.creditLocal(GAME.slug, round.dayKey, r.comets ?? 0);
      })
      .catch((e) => console.error("[timeline] submit unreachable:", e));
  };

  const submitOrder = () => {
    if (!round || revealedRef.current) return;
    revealedRef.current = true;
    api.stopTimer();
    const correctOrder = [...round.titles]
      .sort((a, b) => Number(a.year) - Number(b.year))
      .map((t) => t.id);
    const slots = orderRef.current.map((id, i) => id === correctOrder[i]);
    slotsRef.current = slots;
    setReveal({ correctOrder });
    const correctSlots = slots.filter(Boolean).length;
    // Hold the colored reveal for a beat before the end screen takes over.
    beatRef.current = window.setTimeout(() => {
      const lines = timelinePayout({ correctSlots });
      api.finish(lines);
      submitRun({
        score: correctSlots * 20,
        won: correctSlots === BOARD_SIZE,
        earned: totalComets(lines),
      });
    }, REVEAL_BEAT_MS);
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
      revealedRef.current = false;
      slotsRef.current = [];
      submittedRef.current = false;
      startedAtRef.current = Date.now();
      api.startTimer(TIMER_SECONDS, () => submitRef.current());
    }
    prevPhase.current = api.phase;
  }, [api, round]);

  const byId = round ? new Map(round.titles.map((t) => [t.id, t])) : new Map();
  const correctSlots = slotsRef.current.filter(Boolean).length;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8">
        {round ? (
          <GameShell
            game={GAME}
            api={api}
            comets={comets}
            showScoreStrip={false}
            readyExtra={
              <p className="mt-2 text-[13.5px] text-text-muted">
                Today's five come from {round.era}. Thirty seconds on the clock.
              </p>
            }
            end={{
              headline: `${correctSlots} of ${BOARD_SIZE} in order`,
              shareText: shareTimeline({ slots: slotsRef.current }),
              nextGameLine: "A new set at midnight UTC.",
              answers: [...round.titles]
                .sort((a, b) => Number(a.year) - Number(b.year))
                .map(toMediaItem),
              answersLabel: "In release order",
            }}
          >
            <OrderBoard
              cards={order
                .map((id) => byId.get(id))
                .filter((t): t is NonNullable<typeof t> => !!t)
                .map((t) => ({
                  id: t.id,
                  title: t.title,
                  posterUrl: t.posterUrl,
                  year: t.year,
                }))}
              reveal={reveal}
              onReorder={(ids) => {
                orderRef.current = ids;
                setOrder(ids);
              }}
              onSubmit={submitOrder}
            />
          </GameShell>
        ) : (
          <section>
            <h1 className="text-[20px] font-bold tracking-tight text-text-bright">{GAME.name}</h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.tagline}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's set did not load. Try again in a minute.
            </p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            How to play
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">
            Five titles from one era appear shuffled, years hidden. Drag the rows, or use the
            arrows, until they run earliest to latest, then submit before the thirty seconds run
            out. Each row then shows its year, green in the right slot and orange in the wrong one.
            The set is the same for everyone and changes at midnight UTC.
          </p>
        </section>

        <YesterdaySolved y={yesterday} />
        <MoreGames />

        <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>
      </main>
    </div>
  );
}
