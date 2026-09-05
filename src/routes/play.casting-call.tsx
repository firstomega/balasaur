import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { GameShell } from "@/components/arcade/GameShell";
import {
  OddOneOut,
  type OddOneOutChoice,
  type OddOneOutReveal,
} from "@/components/arcade/OddOneOut";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import type { EndScreenContent } from "@/components/arcade/EndScreen";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { castingCallPayout, totalComets } from "@/lib/arcade/comets";
import { shareCastingCall } from "@/lib/arcade/share";
import { recordResult } from "@/lib/arcade/stats";
import { ENABLED_SLUGS, GAMES, tierFor } from "@/lib/arcade/games";
import type { GameStats } from "@/lib/arcade/types";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import {
  getCastingRound,
  getYesterday,
  type ArcadeMediaCard,
  type ArcadeYesterday,
  type SolvedMedia,
} from "@/lib/arcade.functions";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";
import type { MediaItem } from "@/types/media";

// Casting Call. Eight movies, four actor names each, one name that was never
// in the cast, five seconds a call. One shared set per UTC day, pinned
// server-side; right calls in a row build the combo. The poster is the
// anchor, the four names are four tinted cards, the clock is a bar under
// them, and the reveal names the part each real actor played.

const GAME = GAMES["casting-call"];
const ROUNDS = 8;
const ROUND_SECONDS = 5;
// The reveal holds long enough to read three roles and one "never in it".
const REVEAL_BEAT_MS = 1600;
const HOW_TO = [
  "One movie, four actors. Tap the one who was never in it.",
  "Five seconds a call. The clock running out counts as a miss.",
  "Eight movies. Every right call pays 2 comets.",
];
const LOST_HINT = "A right call pays 2 comets. Eight of them pay 16.";

/** The server ships either bare names or {name, role} per actor; both read
 *  the same here so the board can show the part on reveal when it has it. */
type ActorInput = string | { name: string; role?: string | null };

function toChoice(a: ActorInput): OddOneOutChoice {
  return typeof a === "string" ? { name: a } : { name: a.name, role: a.role ?? null };
}

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
        image: `${SITE_ORIGIN}/og-play-casting-call.jpg`,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
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

function CastingCallPage() {
  const { round, yesterday } = Route.useLoaderData();
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();
  const viewerCountry = useViewerCountry();

  const [idx, setIdx] = useState(0);
  const [reveal, setReveal] = useState<OddOneOutReveal | null>(null);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [firstComets, setFirstComets] = useState(false);
  const idxRef = useRef(0);
  const resolvedRef = useRef(false);
  // One boolean per round in order, so the share grid shows where a miss
  // happened rather than only how many.
  const resultsRef = useRef<boolean[]>([]);
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);
  const beatRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (beatRef.current) window.clearTimeout(beatRef.current);
    },
    [],
  );

  // Each round's four names as the board reads them, in the server's
  // shuffled order.
  const choicesByRound = useMemo(
    () =>
      round
        ? round.rounds.map((r) => (r.actors as ActorInput[]).map(toChoice))
        : ([] as OddOneOutChoice[][]),
    [round],
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
          console.error("[arcade] submit failed:", r.error);
          return;
        }
        comets.creditLocal(GAME.slug, round.dayKey, r.comets ?? 0);
      })
      .catch((e) => console.error("[arcade] submit unreachable:", e));
  };

  const endRun = () => {
    if (!round) return;
    const correct = resultsRef.current.filter(Boolean).length;
    const lines = castingCallPayout({ correct });
    const won = correct === ROUNDS;
    setStats(recordResult(GAME.slug, round.dayKey, { won, bucket: correct }));
    api.finish(lines);
    submitRun({
      score: Math.round((correct * 100) / ROUNDS),
      won,
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
    const correctIndex = choicesByRound[i].findIndex((c) => c.name === item.impostor);
    const ok = picked === correctIndex;
    resultsRef.current.push(ok);
    if (ok) {
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
      resultsRef.current = [];
      submittedRef.current = false;
      startedAtRef.current = Date.now();
      beginRound(0);
    }
    prevPhase.current = api.phase;
  });

  const item = round?.rounds[Math.min(idx, ROUNDS - 1)];

  const end = useMemo<EndScreenContent>(() => {
    if (!round) return { headline: "", shareText: "" };
    const results = resultsRef.current;
    const correct = results.filter(Boolean).length;
    const text = shareCastingCall({ day: round.dayKey, results });
    const tier = correct === 0 ? undefined : tierFor(GAME.slug, correct / ROUNDS);
    const headline = `${correct} of ${ROUNDS} right`;
    return {
      tier,
      headline,
      grid: [text.split("\n")[1] ?? ""],
      stats: stats ?? undefined,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? GAME.hook },
      answers: round.rounds.map((r) => toMediaItem(r.movie)),
      answersLabel: "Today's eight",
      lost: correct === 0,
      lostHint: LOST_HINT,
      firstComets,
    };
    // resultsRef is complete by the time the phase flips; stats changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, stats, firstComets, api.phase]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8 lg:max-w-[880px]">
        {round && item ? (
          <GameShell
            game={GAME}
            api={api}
            comets={comets}
            dayNumber={round.dayKey}
            howTo={HOW_TO}
            end={end}
          >
            {/* The board caps itself at 800px inside the 840px column; lift
                the cap so it shares the band's left edge. */}
            <div className="[&>div]:max-w-none">
              <OddOneOut
                key={idx}
                title={item.movie.title}
                year={item.movie.year}
                posterUrl={item.movie.posterUrl}
                choices={choicesByRound[idx] ?? []}
                reveal={reveal}
                timer={api.timer}
                roundLabel={`Round ${idx + 1} of ${ROUNDS}`}
                onPick={(i) => resolveRound(i)}
              />
            </div>
          </GameShell>
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
        {api.phase !== "ended" && <MoreGames />}

        <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>
      </main>
    </div>
  );
}
