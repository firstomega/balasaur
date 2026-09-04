import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { GameShell } from "@/components/arcade/GameShell";
import { OddOneOut, type OddOneOutReveal } from "@/components/arcade/OddOneOut";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { castingCallPayout, totalComets } from "@/lib/arcade/comets";
import { shareCastingCall } from "@/lib/arcade/share";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import {
  getCastingRound,
  getYesterday,
  type ArcadeMediaCard,
  type ArcadeYesterday,
  type SolvedMedia,
} from "@/lib/arcade.functions";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import type { MediaItem } from "@/types/media";

// Casting Call. Eight movies, four actor names each, one name that was never
// in the cast, five seconds a call. One shared set per UTC day, pinned
// server-side; right calls in a row build the combo.

const GAME = GAMES["casting-call"];
const ROUNDS = 8;
const ROUND_SECONDS = 5;
const REVEAL_BEAT_MS = 1400;

export const Route = createFileRoute("/play/casting-call")({
  loader: async () => {
    // Short fresh window AND short stale window: the set flips at midnight
    // UTC and must not be served long past it.
    await cacheSsrResponse(3600, 300);
    const [round, yesterday] = await Promise.all([
      getCastingRound(),
      getYesterday({ data: { game: GAME.slug } }),
    ]);
    return { round, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}${GAME.path}`;
    return {
      meta: buildMeta({
        title: "Casting Call: Spot the Actor Who Was Never in It",
        description:
          "One movie, four actors, one was never in it. Five seconds to call each of eight movies. Right calls build a combo. A new eight every day.",
        url,
      }),
      links: [canonicalLink(url)],
      scripts: [
        jsonLdScript({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Balasaur", item: SITE_ORIGIN },
            { "@type": "ListItem", position: 2, name: "Play", item: `${SITE_ORIGIN}/play` },
            { "@type": "ListItem", position: 3, name: GAME.name, item: url },
          ],
        }),
      ],
    };
  },
  component: CastingCallPage,
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
        Yesterday's eight, solved
      </h2>
      <ul className="mt-2 space-y-1.5">
        {y.entries.map((e, i) => (
          <li
            key={i}
            className="rounded-[5px] border border-border bg-panel px-3 py-2 text-[13px] leading-snug"
          >
            {e.media ? (
              <MediaLink media={e.media} />
            ) : (
              <span className="text-text-muted">{e.prompt} </span>
            )}
            <span className="text-text-muted"> was missing </span>
            <span className="font-semibold text-text-bright">{e.answer}</span>
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

function CastingCallPage() {
  const { round, yesterday } = Route.useLoaderData();
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();

  const [idx, setIdx] = useState(0);
  const [reveal, setReveal] = useState<OddOneOutReveal | null>(null);
  const idxRef = useRef(0);
  const resolvedRef = useRef(false);
  const correctRef = useRef(0);
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
    })
      .then((r) => {
        // The RPC reports failure as {error}; it does not throw.
        if (r.error) {
          console.error("[arcade] submit failed:", r.error);
          return;
        }
        comets.creditLocal(GAME.slug, round.dayKey, r.comets ?? 0);
      })
      .catch((e) => console.error("[arcade] submit unreachable:", e));
  };

  const endRun = () => {
    const correct = correctRef.current;
    const lines = castingCallPayout({ correct });
    api.finish(lines);
    submitRun({
      score: Math.round((correct * 100) / ROUNDS),
      won: correct === ROUNDS,
      earned: totalComets(lines),
    });
  };

  function beginRound(i: number) {
    idxRef.current = i;
    resolvedRef.current = false;
    setIdx(i);
    setReveal(null);
    api.startTimer(ROUND_SECONDS, () => resolveRound(null));
  }

  function resolveRound(picked: number | null) {
    if (!round || resolvedRef.current) return;
    resolvedRef.current = true;
    api.stopTimer();
    const i = idxRef.current;
    const item = round.rounds[i];
    const correctIndex = item.actors.indexOf(item.impostor);
    const ok = picked === correctIndex;
    if (ok) {
      correctRef.current += 1;
      api.addScore(1);
      api.hitCombo();
    } else {
      api.breakCombo();
    }
    setReveal({ correctIndex, pickedIndex: picked });
    beatRef.current = window.setTimeout(() => {
      if (i < ROUNDS - 1) {
        api.nextRound();
        beginRound(i + 1);
      } else {
        endRun();
      }
    }, REVEAL_BEAT_MS);
  }

  // Kick off round one on every ready -> playing transition.
  const prevPhase = useRef(api.phase);
  useEffect(() => {
    if (api.phase === "playing" && prevPhase.current !== "playing") {
      correctRef.current = 0;
      submittedRef.current = false;
      startedAtRef.current = Date.now();
      beginRound(0);
    }
    prevPhase.current = api.phase;
  });

  const item = round?.rounds[Math.min(idx, ROUNDS - 1)];
  const correct = correctRef.current;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8">
        {round && item ? (
          <GameShell
            game={GAME}
            api={api}
            comets={comets}
            end={{
              headline: `${correct} of ${ROUNDS} right`,
              shareText: shareCastingCall({ streak: correct }),
              nextGameLine: "New movies at midnight UTC.",
              answers: round.rounds.map((r) => toMediaItem(r.movie)),
              answersLabel: "Today's eight",
            }}
          >
            <OddOneOut
              title={item.movie.title}
              year={item.movie.year}
              choices={item.actors.map((name) => ({ name }))}
              reveal={reveal}
              onPick={(i) => resolveRound(i)}
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
            Each round names one movie and four actors. Three were in it, one never was, and you
            have five seconds to tap the odd one out. Eight movies a day, the same eight for
            everyone.
          </p>
        </section>

        <YesterdaySolved y={yesterday} />
        <MoreGames />
      </main>
    </div>
  );
}
