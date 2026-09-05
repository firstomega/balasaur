import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { GameShell } from "@/components/arcade/GameShell";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import { QuizBoard, type QuizMedia } from "@/components/arcade/QuizBoard";
import type { EndScreenContent } from "@/components/arcade/EndScreen";
import type { SnippetRow } from "@/components/arcade/LeaderboardSnippet";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { screeningPayout, totalComets } from "@/lib/arcade/comets";
import { shareScreening } from "@/lib/arcade/share";
import { recordResult } from "@/lib/arcade/stats";
import { ENABLED_SLUGS, GAMES, tierFor } from "@/lib/arcade/games";
import type { GameStats } from "@/lib/arcade/types";
import { arcadeSubmitRun, arcadeDayBoard } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import {
  getScreeningSet,
  getYesterday,
  judgeScreeningPick,
  type ArcadeYesterday,
  type ScreeningSet,
} from "@/lib/arcade.functions";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";

// The 8PM Screening. Ten trivia questions, one shared set per UTC day, one
// shared board. The same ten stand all day, so the board fills as people
// play. Twenty seconds a question; a pass scores nothing and moves on. The
// page carries no answers: every pick is judged on the server, because the
// night's board ranks people and a board anyone can top with a console is
// worth nothing.
//
// One number per run: right answers out of ten. The board is submitted in
// the server's units (a hundred a question) and mapped back to the same
// count before it renders.

const GAME = GAMES.screening;
const QUESTION_COUNT = 10;
const QUESTION_SECONDS = 20;
const SCORE_PER_RIGHT = 100;
const REVEAL_BEAT_MS = 1400;
const BOARD_POLL_MS = 30000;
const HOW_TO = [
  "Ten questions, four answers each, twenty seconds a question.",
  "A pick locks at once and the right answer shows before the next question.",
  "Every right answer pays 3 comets. A perfect ten pays 10 more.",
];
const LOST_HINT = "A right answer pays 3 comets.";

export const Route = createFileRoute("/play/screening")({
  loader: async () => {
    // Short fresh window AND short stale window: the set flips at midnight
    // UTC and must not be served long past it.
    await cacheSsrResponse(3600, 300);
    const [set, yesterday] = await Promise.all([
      getScreeningSet(),
      getYesterday({ data: { game: GAME.slug } }),
    ]);
    return { set, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}${GAME.path}`;
    return {
      meta: buildMeta({
        title: "The 8PM Screening: Ten Movie Trivia Questions a Day",
        description:
          "Ten questions a day drawn from 76,000 movies and shows: box office, Oscars, casts, years. Same ten for everyone, one shared board, new at midnight.",
        url,
        image: `${SITE_ORIGIN}/og-play-${GAME.slug}.jpg`,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
    };
  },
  component: ScreeningPage,
});

function YesterdaySolved({ y }: { y: ArcadeYesterday | null }) {
  if (!y || y.entries.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
        Yesterday's questions, answered
      </h2>
      <ol className="mt-2 space-y-1.5">
        {y.entries.map((e, i) => (
          <li
            key={i}
            className="rounded-[5px] border border-border bg-panel px-3 py-2 text-[13px] leading-snug"
          >
            <span className="text-text-muted">{e.prompt} </span>
            <span className="font-semibold text-text-bright">{e.answer}</span>
            {e.detail && <span className="block text-[12.5px] text-text-dim">{e.detail}</span>}
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

interface Verdict {
  correctIndex: number;
  note: string;
  media: QuizMedia | null;
}

function ScreeningPage() {
  const { set, yesterday } = Route.useLoaderData() as {
    set: ScreeningSet | null;
    yesterday: ArcadeYesterday | null;
  };
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();
  const viewerCountry = useViewerCountry();

  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [results, setResults] = useState<(boolean | null)[]>([]);
  const [board, setBoard] = useState<SnippetRow[]>([]);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [firstComets, setFirstComets] = useState(false);
  const answersRef = useRef<boolean[]>([]);
  const resolvedRef = useRef<boolean[]>([]);
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
    if (!set || submittedRef.current) return;
    submittedRef.current = true;
    if (o.earned > 0 && comets.ready && comets.total === 0) setFirstComets(true);
    if (!user) {
      comets.creditLocal(GAME.slug, set.dayKey, o.earned);
      return;
    }
    arcadeSubmitRun({
      game: GAME.slug,
      dayKey: set.dayKey,
      score: o.score,
      durationMs: Date.now() - startedAtRef.current,
      won: o.won,
      comets: o.earned,
      country: viewerCountry || null,
    })
      .then((r) => {
        // The RPC reports failure as {error}; it does not throw.
        if (r.error) {
          console.error("[screening] submit failed:", r.error);
          return;
        }
        comets.creditLocal(GAME.slug, set.dayKey, r.comets ?? 0);
      })
      .catch((e) => console.error("[screening] submit unreachable:", e));
  };

  const endRun = () => {
    if (!set) return;
    const correct = answersRef.current.filter(Boolean).length;
    const lines = screeningPayout({ correct });
    setStats(
      recordResult(GAME.slug, set.dayKey, { won: correct === QUESTION_COUNT, bucket: correct }),
    );
    api.finish(lines);
    submitRun({
      score: correct * SCORE_PER_RIGHT,
      won: correct === QUESTION_COUNT,
      earned: totalComets(lines),
    });
  };

  const startQuestion = (i: number) => {
    setQIndex(i);
    setPicked(null);
    setVerdict(null);
    api.startTimer(QUESTION_SECONDS, () => void resolveRef.current(null, i));
  };

  /** Lock the pick, ask the server, then color the board. A null choice is
   *  the clock: wrong, and the answer still shows. */
  const resolve = async (choice: number | null, i: number) => {
    if (!set || resolvedRef.current[i]) return;
    resolvedRef.current[i] = true;
    api.stopTimer();
    const item = set.items[i];
    if (choice !== null) setPicked(choice);

    let v: Awaited<ReturnType<typeof judgeScreeningPick>> = null;
    try {
      v = await judgeScreeningPick({ data: { itemId: item.itemId, choice } });
    } catch (e) {
      console.error("[screening] judge unreachable:", e);
    }
    const correct = v?.correct ?? false;
    setVerdict({
      correctIndex: v ? v.answer : -1,
      note: v ? v.note : "The answer did not come back. This one counts as a miss.",
      media: v?.media
        ? { title: v.media.title, year: v.media.year, posterUrl: v.media.posterUrl }
        : null,
    });
    answersRef.current[i] = correct;
    setResults(answersRef.current.slice());
    if (correct) {
      api.addScore(1);
      api.hitCombo();
    } else {
      api.breakCombo();
    }
    beatRef.current = window.setTimeout(() => {
      if (i + 1 < set.items.length) startQuestion(i + 1);
      else endRun();
    }, REVEAL_BEAT_MS);
  };
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  // Reset the run state on every ready -> playing transition.
  const prevPhase = useRef(api.phase);
  useEffect(() => {
    if (api.phase === "playing" && prevPhase.current !== "playing" && set) {
      answersRef.current = [];
      resolvedRef.current = [];
      setResults([]);
      submittedRef.current = false;
      startedAtRef.current = Date.now();
      startQuestion(0);
    }
    prevPhase.current = api.phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.phase, set]);

  // The shared board, polled while it is on screen (the end screen shows it).
  // Scores come back in the server's units and are mapped to right answers
  // so the board and the headline count the same thing.
  useEffect(() => {
    if (api.phase !== "ended") return;
    let dead = false;
    const load = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      arcadeDayBoard({ game: GAME.slug, limit: 25 })
        .then((b) => {
          if (dead || b.error) return;
          setBoard(
            b.rows.map((r) => ({
              rank: r.rank,
              name: r.display_name || r.username,
              handle: r.username,
              avatarPreset: r.avatar_preset,
              score: Math.round(r.score / SCORE_PER_RIGHT),
              durationMs: r.duration_ms ?? 0,
            })),
          );
        })
        .catch(() => {
          // The board is optional; a failed read renders nothing new.
        });
    };
    load();
    const t = window.setInterval(load, BOARD_POLL_MS);
    return () => {
      dead = true;
      window.clearInterval(t);
    };
  }, [api.phase]);

  const item = set?.items[qIndex] ?? null;

  const end = useMemo<EndScreenContent>(() => {
    if (!set) return { headline: "", shareText: "" };
    const answers = answersRef.current.slice(0, set.items.length);
    const correct = answers.filter(Boolean).length;
    const text = shareScreening({ day: set.dayKey, answers });
    const headline = `${correct} of ${QUESTION_COUNT} right`;
    const tier = correct === 0 ? undefined : tierFor(GAME.slug, correct / QUESTION_COUNT);
    return {
      tier,
      headline,
      grid: [text.split("\n")[1] ?? ""],
      stats: stats ?? undefined,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? "Same ten for everyone." },
      leaderboard: { rows: board, label: "Tonight's board. Right answers out of ten." },
      lost: correct === 0,
      lostHint: LOST_HINT,
      firstComets,
      moreGames: false,
    };
    // results is the render-time mirror of answersRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, results, board, stats, firstComets]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8 lg:max-w-[880px]">
        {set ? (
          <GameShell
            game={GAME}
            api={api}
            comets={comets}
            dayNumber={set.dayKey}
            howTo={HOW_TO}
            end={end}
          >
            {item && (
              <QuizBoard
                question={item.question}
                choices={item.choices}
                questionIndex={qIndex}
                questionCount={set.items.length}
                picked={picked}
                reveal={verdict ? { correctIndex: verdict.correctIndex } : null}
                note={verdict?.note ?? null}
                results={results}
                timer={api.timer}
                media={verdict?.media ?? null}
                onPick={(i) => void resolve(i, qIndex)}
              />
            )}
          </GameShell>
        ) : (
          <section>
            <h1 className="text-[22px] font-black tracking-[-0.02em] text-text-bright">
              {GAME.name}
            </h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.hook}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Tonight's questions did not load. Try again in a minute.
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
