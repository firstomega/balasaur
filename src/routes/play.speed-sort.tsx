import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { GameShell } from "@/components/arcade/GameShell";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import { BinSort, type BinDef } from "@/components/arcade/BinSort";
import type { EndScreenContent } from "@/components/arcade/EndScreen";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { speedSortPayout, totalComets } from "@/lib/arcade/comets";
import { shareSpeedSort } from "@/lib/arcade/share";
import { recordResult } from "@/lib/arcade/stats";
import { ENABLED_SLUGS, GAMES, hueVars } from "@/lib/arcade/games";
import type { GameStats } from "@/lib/arcade/types";
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
import { tmdbImage } from "@/lib/tmdbImage";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";

// Speed Sort. Sixty seconds, two bins, thirty titles, one shared deck per
// UTC day. Swipe or tap each title into its bin; a wrong sort shows the bin
// it belonged in before the next card lands, and every miss is kept so the
// end screen can list it with its right bin.

const GAME = GAMES["speed-sort"];
const TIMER_SECONDS = 60;
const HOW_TO = [
  "One title at a time. Swipe it toward its bin, tap the bin, or use the arrow keys.",
  "A wrong sort shows the bin it belonged in, then the next card lands.",
  "Sixty seconds. A right sort pays 1 comet, a clean minute pays 5 more.",
];
const LOST_HINT = "A right sort pays 1 comet. A clean minute pays 5 more.";

type SpeedTitle = SpeedSortRound["titles"][number];

interface Miss {
  title: SpeedTitle;
  /** The bin it belonged in. */
  bin: string;
}

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
          "Two bins, sixty seconds, thirty titles. Sort each movie or show into the right bin before the clock runs out. Same deck for everyone, new bins at midnight.",
        url,
        image: `${SITE_ORIGIN}/og-play-${GAME.slug}.jpg`,
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

/** Every miss with the bin it belonged in. The whole reason to look at the
 *  end screen twice: the deck is the same for everyone, so a miss is a fact
 *  worth knowing before a friend asks. */
function MissList({ misses }: { misses: Miss[] }) {
  if (misses.length === 0) return null;
  return (
    <section
      style={hueVars(GAME.slug)}
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

function tierFor(sorted: number, missed: number, deck: number): string | undefined {
  if (sorted === deck && missed === 0) return "Whole deck, clean";
  if (sorted > 0 && missed === 0) return "Clean minute";
  if (sorted === deck) return "Whole deck";
  return undefined;
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
  const [result, setResult] = useState<{ sorted: number; misses: Miss[] }>({
    sorted: 0,
    misses: [],
  });
  const [stats, setStats] = useState<GameStats | null>(null);
  const [firstComets, setFirstComets] = useState(false);
  const indexRef = useRef(0);
  const sortedRef = useRef(0);
  const missesRef = useRef<Miss[]>([]);
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
    const misses = missesRef.current.slice();
    const missed = misses.length;
    setResult({ sorted, misses });
    const lines = speedSortPayout({ sorted, missed });
    const won = sorted === round.titles.length && missed === 0;
    setStats(recordResult(GAME.slug, round.dayKey, { won, bucket: sorted }));
    api.finish(lines);
    submitRun({
      score: Math.round((sorted / round.titles.length) * 100),
      won,
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
      missesRef.current = [];
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
      missesRef.current.push({ title: card, bin: card.bin === "a" ? round.bins.a : round.bins.b });
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

  const toCard = (t: SpeedTitle | undefined) =>
    t ? { id: t.id, label: t.title, posterUrl: t.posterUrl } : null;

  const end = useMemo<EndScreenContent>(() => {
    if (!round) return { headline: "", shareText: "" };
    const { sorted, misses } = result;
    const missed = misses.length;
    const text = shareSpeedSort({ day: round.dayKey, sorted, missed });
    const headline =
      sorted === 0
        ? "Nothing sorted"
        : missed === 0
          ? `${sorted} sorted, none missed`
          : `${sorted} sorted, ${missed} missed`;
    const tier = tierFor(sorted, missed, round.titles.length);
    return {
      tier,
      headline,
      grid: [text.split("\n")[1] ?? ""],
      stats: stats ?? undefined,
      shareText: text,
      shareImage: { title: headline, subtitle: `${round.bins.a} or ${round.bins.b}` },
      lost: sorted === 0,
      lostHint: LOST_HINT,
      firstComets,
      moreGames: false,
    };
  }, [round, result, stats, firstComets]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8 lg:max-w-[880px]">
        {round && bins ? (
          <>
            <GameShell
              game={GAME}
              api={api}
              comets={comets}
              dayNumber={round.dayKey}
              howTo={HOW_TO}
              readyExtra={
                <p className="text-center text-[13.5px] text-text-muted">
                  Today's bins:{" "}
                  <span className="font-semibold text-text-bright">{round.bins.a}</span> or{" "}
                  <span className="font-semibold text-text-bright">{round.bins.b}</span>.
                </p>
              }
              end={end}
            >
              <BinSort
                card={toCard(round.titles[index])}
                nextCard={toCard(round.titles[index + 1])}
                bins={bins}
                timer={api.timer}
                onChoose={onChoose}
              />
            </GameShell>

            {api.phase === "ended" && <MissList misses={result.misses} />}
          </>
        ) : (
          <section>
            <h1 className="text-[22px] font-black tracking-[-0.02em] text-text-bright">
              {GAME.name}
            </h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.hook}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's deck did not load. Try again in a minute.
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
