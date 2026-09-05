import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { GameShell } from "@/components/arcade/GameShell";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import { ChainBoard, type ChainStep } from "@/components/arcade/ChainBoard";
import type { EndScreenContent } from "@/components/arcade/EndScreen";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { linkUpPayout, totalComets } from "@/lib/arcade/comets";
import { shareLinkUp } from "@/lib/arcade/share";
import { recordResult } from "@/lib/arcade/stats";
import { ENABLED_SLUGS, GAMES, hueVars, tierFor } from "@/lib/arcade/games";
import type { GameStats } from "@/lib/arcade/types";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import {
  getLinkUpRound,
  getYesterday,
  judgeLinkPick,
  type ArcadeMediaCard,
  type ArcadeYesterday,
  type LinkUpRound,
  type SolvedMedia,
} from "@/lib/arcade.functions";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";

// Link Up. One actor pair per UTC day, connected through the movies they
// share. Each step offers four titles; only one features the actor in hand,
// and which one is decided on the server (the page carries no answer id and
// no cast list). A wrong pick is a dead end: the movie's cast shows so the
// miss teaches, the option stays marked, and stepping back is the only way
// on. The run has one number, picks, stated once on the end screen. The
// closed chain stays on screen under the end panel.

const GAME = GAMES["link-up"];
const HOW_TO = [
  "Start from one actor. Four movies are offered; pick the one they were in.",
  "A right pick hands you the next actor. A wrong pick is a dead end: step back, try another.",
  "Reach the second actor to close the chain. Par is the shortest chain; every dead end adds a pick.",
];

export const Route = createFileRoute("/play/link-up")({
  loader: async () => {
    // Short fresh window AND short stale window: the pair flips at midnight
    // UTC and must not be served long past it.
    await cacheSsrResponse(3600, 300);
    const [round, yesterday] = await Promise.all([
      getLinkUpRound(),
      getYesterday({ data: { game: GAME.slug } }),
    ]);
    return { round, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}${GAME.path}`;
    return {
      meta: buildMeta({
        title: "Link Up: Connect Two Actors Through Their Movies",
        description:
          "Two actors, one chain of movies between them. Pick the film that features the actor in hand until the chain closes, in as few picks as par. Same pair for everyone, new at midnight.",
        url,
        image: `${SITE_ORIGIN}/og-play-${GAME.slug}.jpg`,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
    };
  },
  component: LinkUpPage,
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
        Yesterday's chain, solved
      </h2>
      <ol className="mt-2 space-y-1.5">
        {y.entries.map((e, i) => (
          <li
            key={i}
            className="rounded-[5px] border border-border bg-panel px-3 py-2 text-[13px] leading-snug"
          >
            {e.prompt && <span className="text-text-muted">{e.prompt}: </span>}
            {e.media ? (
              <MediaLink media={e.media} />
            ) : (
              <span className="font-semibold text-text-bright">{e.answer}</span>
            )}
            {e.media?.year && (
              <span className="font-mono text-[11px] text-text-dim"> {e.media.year}</span>
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

function movieStep(opt: ArcadeMediaCard, cast?: string[]): ChainStep {
  return {
    kind: "movie",
    id: opt.id,
    label: opt.title,
    sub: opt.year,
    posterUrl: opt.posterUrl,
    cast: cast ?? null,
  };
}

function LinkUpPage() {
  const { round, yesterday } = Route.useLoaderData() as {
    round: LinkUpRound | null;
    yesterday: ArcadeYesterday | null;
  };
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();
  const viewerCountry = useViewerCountry();

  const [chain, setChain] = useState<ChainStep[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [deadEnd, setDeadEnd] = useState(false);
  const [complete, setComplete] = useState(false);
  /** Option ids dead-ended at each step. Cleared for a step once it is
   *  passed on a right pick. */
  const [tried, setTried] = useState<Record<number, string[]>>({});
  const [wrong, setWrong] = useState(0);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [firstComets, setFirstComets] = useState(false);
  const judgingRef = useRef(false);
  const wrongRef = useRef(0);
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
          console.error("[link-up] submit failed:", r.error);
          return;
        }
        comets.creditLocal(GAME.slug, round.dayKey, r.comets ?? 0);
      })
      .catch((e) => console.error("[link-up] submit unreachable:", e));
  };

  /** The chain closed: credit it, record the day, and hand the shell the
   *  payout at once. The closed chain stays mounted under the end panel. */
  const endRun = (wrongPicks: number) => {
    if (!round) return;
    const picks = round.par + wrongPicks;
    const lines = linkUpPayout({ solved: true, steps: picks, par: round.par });
    setStats(recordResult(GAME.slug, round.dayKey, { won: wrongPicks === 0, bucket: picks }));
    api.finish(lines);
    submitRun({
      score: Math.max(20, 100 - wrongPicks * 20),
      won: wrongPicks === 0,
      earned: totalComets(lines),
    });
  };

  // Reset the run state on every ready -> playing transition.
  const prevPhase = useRef(api.phase);
  useEffect(() => {
    if (api.phase === "playing" && prevPhase.current !== "playing" && round) {
      setChain([]);
      setStepIdx(0);
      setDeadEnd(false);
      setComplete(false);
      setTried({});
      setWrong(0);
      wrongRef.current = 0;
      judgingRef.current = false;
      submittedRef.current = false;
      startedAtRef.current = Date.now();
    }
    prevPhase.current = api.phase;
  }, [api, round]);

  const step = round?.steps[stepIdx] ?? null;

  const onChoose = async (id: string) => {
    if (!round || !step || deadEnd || complete || judgingRef.current) return;
    const opt = step.options.find((o) => o.id === id);
    if (!opt || tried[stepIdx]?.includes(id)) return;
    judgingRef.current = true;
    let verdict: Awaited<ReturnType<typeof judgeLinkPick>> = null;
    try {
      verdict = await judgeLinkPick({
        data: { dayKey: round.dayKey, step: stepIdx, optionId: id },
      });
    } catch (e) {
      console.error("[link-up] judge unreachable:", e);
    }
    judgingRef.current = false;
    if (!verdict) return;

    if (verdict.correct) {
      const isLast = stepIdx === round.steps.length - 1;
      const nextActor = verdict.nextActor ?? round.target;
      setChain((c) =>
        isLast
          ? [...c, movieStep(opt)]
          : [...c, movieStep(opt), { kind: "actor", id: nextActor, label: nextActor }],
      );
      setTried((t) => {
        const next = { ...t };
        delete next[stepIdx];
        return next;
      });
      if (isLast) {
        setComplete(true);
        endRun(wrongRef.current);
      } else {
        setStepIdx((i) => i + 1);
      }
    } else {
      wrongRef.current += 1;
      setWrong(wrongRef.current);
      setTried((t) => ({ ...t, [stepIdx]: [...(t[stepIdx] ?? []), id] }));
      setChain((c) => [...c, movieStep(opt, verdict.cast)]);
      setDeadEnd(true);
    }
  };

  const onStepBack = () => {
    if (complete || judgingRef.current) return;
    if (deadEnd) {
      setChain((c) => c.slice(0, -1));
      setDeadEnd(false);
      return;
    }
    if (stepIdx === 0 || chain.length === 0) return;
    // Undo the previous committed hop: its movie plus the actor chip it added.
    setChain((c) => (c[c.length - 1]?.kind === "actor" ? c.slice(0, -2) : c.slice(0, -1)));
    setStepIdx((i) => i - 1);
  };

  const picks = round ? round.par + wrong : 0;

  const end = useMemo<EndScreenContent>(() => {
    if (!round) return { headline: "", shareText: "" };
    const text = shareLinkUp({ day: round.dayKey, solved: true, steps: picks, par: round.par });
    const headline = `Done in ${picks} pick${picks === 1 ? "" : "s"}, par ${round.par}`;
    // Par over picks: the share of picks that counted. On par is Perfect.
    const tier = tierFor(GAME.slug, round.par / picks);
    return {
      tier,
      headline,
      grid: [text.split("\n")[1] ?? ""],
      stats: stats ?? undefined,
      shareText: text,
      shareImage: { title: headline, subtitle: `${round.start} to ${round.target}` },
      firstComets,
      moreGames: false,
    };
  }, [round, picks, stats, firstComets]);

  const board = round ? (
    <ChainBoard
      start={round.start}
      target={round.target}
      par={round.par}
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
      onChoose={(id) => void onChoose(id)}
      onStepBack={onStepBack}
    />
  ) : null;

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
                  Today: <span className="font-semibold text-text-bright">{round.start}</span> to{" "}
                  <span className="font-semibold text-text-bright">{round.target}</span>. Par{" "}
                  {round.par}.
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
          </>
        ) : (
          <section>
            <h1 className="text-[22px] font-black tracking-[-0.02em] text-text-bright">
              {GAME.name}
            </h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.hook}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's pair did not load. Try again in a minute.
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
