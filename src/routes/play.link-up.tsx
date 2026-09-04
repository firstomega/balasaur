import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { GameShell } from "@/components/arcade/GameShell";
import { ChainBoard, type ChainStep } from "@/components/arcade/ChainBoard";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { linkUpPayout, totalComets } from "@/lib/arcade/comets";
import { shareLinkUp } from "@/lib/arcade/share";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import {
  getLinkUpRound,
  getYesterday,
  type ArcadeMediaCard,
  type ArcadeYesterday,
  type LinkUpRound,
  type SolvedMedia,
} from "@/lib/arcade.functions";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";
import type { MediaItem } from "@/types/media";

// Link Up. One actor pair per UTC day, connected through the movies they
// share. Each step offers four titles; only one features the actor in hand.
// A wrong pick is a dead end you step back from, and every wrong pick counts
// against par.

const GAME = GAMES["link-up"];
const COMPLETE_BEAT_MS = 1400;

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
          "Two actors, one chain of movies between them. Pick the film that features the actor in hand until the chain closes, in as few picks as par. A new pair every day.",
        url,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
    };
  },
  component: LinkUpPage,
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
  const wrongRef = useRef(0);
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
          console.error("[link-up] submit failed:", r.error);
          return;
        }
        comets.creditLocal(GAME.slug, round.dayKey, r.comets ?? 0);
      })
      .catch((e) => console.error("[link-up] submit unreachable:", e));
  };

  const endRun = () => {
    if (!round) return;
    const wrong = wrongRef.current;
    const picks = round.par + wrong;
    const lines = linkUpPayout({ solved: true, steps: picks, par: round.par });
    api.finish(lines);
    submitRun({
      score: Math.max(20, 100 - wrong * 20),
      won: wrong === 0,
      earned: totalComets(lines),
    });
  };
  const endRef = useRef(endRun);
  endRef.current = endRun;

  // Reset the run state on every ready -> playing transition.
  const prevPhase = useRef(api.phase);
  useEffect(() => {
    if (api.phase === "playing" && prevPhase.current !== "playing" && round) {
      setChain([]);
      setStepIdx(0);
      setDeadEnd(false);
      setComplete(false);
      wrongRef.current = 0;
      submittedRef.current = false;
      startedAtRef.current = Date.now();
    }
    prevPhase.current = api.phase;
  }, [api, round]);

  const step = round?.steps[stepIdx] ?? null;

  const onChoose = (id: string) => {
    if (!round || !step || deadEnd || complete) return;
    const opt = step.options.find((o) => o.id === id);
    if (!opt) return;
    const movieStep: ChainStep = {
      kind: "movie",
      id: opt.id,
      label: opt.title,
      sub: opt.year,
      posterUrl: opt.posterUrl,
    };
    if (id === step.answerId) {
      const isLast = stepIdx === round.steps.length - 1;
      setChain((c) =>
        isLast
          ? [...c, movieStep]
          : [...c, movieStep, { kind: "actor", id: step.nextActor, label: step.nextActor }],
      );
      if (isLast) {
        setComplete(true);
        // Let the closed chain land before the end screen takes over.
        beatRef.current = window.setTimeout(() => endRef.current(), COMPLETE_BEAT_MS);
      } else {
        setStepIdx((i) => i + 1);
      }
    } else {
      wrongRef.current += 1;
      setChain((c) => [...c, movieStep]);
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
    // Undo the previous committed hop: its movie plus the actor chip it added.
    setChain((c) => (c[c.length - 1]?.kind === "actor" ? c.slice(0, -2) : c.slice(0, -1)));
    setStepIdx((i) => i - 1);
  };

  const wrong = wrongRef.current;
  const picks = round ? round.par + wrong : 0;

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
                Today: get from{" "}
                <span className="font-semibold text-text-bright">{round.start}</span> to{" "}
                <span className="font-semibold text-text-bright">{round.target}</span>. Par{" "}
                {round.par}.
              </p>
            }
            end={{
              headline: `Done in ${picks} pick${picks === 1 ? "" : "s"}. Par ${round.par}.`,
              shareText: shareLinkUp({ solved: true, steps: picks, par: round.par }),
              nextGameLine: "A new pair at midnight UTC.",
              answers: round.steps
                .map((s) => s.options.find((o) => o.id === s.answerId))
                .filter((o): o is NonNullable<typeof o> => !!o)
                .map(toMediaItem),
              answersLabel: "The chain",
            }}
          >
            <ChainBoard
              start={round.start}
              target={round.target}
              par={round.par}
              chain={chain}
              choosing="movie"
              choices={
                step
                  ? step.options.map((o) => ({
                      id: o.id,
                      label: o.title,
                      sub: o.year,
                      posterUrl: o.posterUrl,
                    }))
                  : []
              }
              deadEnd={deadEnd}
              complete={complete}
              onChoose={onChoose}
              onStepBack={onStepBack}
            />
          </GameShell>
        ) : (
          <section>
            <h1 className="text-[20px] font-bold tracking-tight text-text-bright">{GAME.name}</h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.tagline}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's pair did not load. Try again in a minute.
            </p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            How to play
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">
            Start from one actor and reach the other through movies they share. Each step offers
            four titles; pick the one that features the actor in hand, and it hands you the next
            actor in the chain. A wrong pick is a dead end you step back from, and every wrong pick
            counts against par. The pair is the same for everyone and changes at midnight UTC.
          </p>
        </section>

        <YesterdaySolved y={yesterday} />
        <MoreGames />

        <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>
      </main>
    </div>
  );
}
