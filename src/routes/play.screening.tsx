import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { GameShell } from "@/components/arcade/GameShell";
import { QuizBoard } from "@/components/arcade/QuizBoard";
import type { SnippetRow } from "@/components/arcade/LeaderboardSnippet";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { screeningPayout, totalComets } from "@/lib/arcade/comets";
import { shareScreening } from "@/lib/arcade/share";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
import { arcadeSubmitRun, arcadeDayBoard } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import {
  getScreeningSet,
  getYesterday,
  type ArcadeYesterday,
  type ScreeningSet,
} from "@/lib/arcade.functions";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";

// The 8PM Screening. Ten trivia questions, one shared set per UTC day, one
// shared score board. Doors open at 8PM Eastern as the nightly ritual, and
// the same ten questions stand all day, so the board fills as people play.
// Twenty seconds a question; a pass scores nothing and moves on.

const GAME = GAMES.screening;
const QUESTION_SECONDS = 20;
const REVEAL_BEAT_MS = 1400;
const BOARD_POLL_MS = 30000;

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
          "Ten questions a day drawn from 76,000 movies and shows: box office, Oscars, casts, years. Doors open at 8PM Eastern, one shared board, one score to beat.",
        url,
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
  const [reveal, setReveal] = useState<{ correctIndex: number } | null>(null);
  const [board, setBoard] = useState<SnippetRow[]>([]);
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
    api.finish(lines);
    submitRun({ score: correct * 100, won: correct === 10, earned: totalComets(lines) });
  };

  const startQuestion = (i: number) => {
    setQIndex(i);
    setPicked(null);
    setReveal(null);
    api.startTimer(QUESTION_SECONDS, () => resolveRef.current(null, i));
  };

  const resolve = (choice: number | null, i: number) => {
    if (!set || resolvedRef.current[i]) return;
    resolvedRef.current[i] = true;
    api.stopTimer();
    const item = set.items[i];
    const correct = choice === item.answer;
    if (choice !== null) setPicked(choice);
    setReveal({ correctIndex: item.answer });
    answersRef.current[i] = correct;
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
      submittedRef.current = false;
      startedAtRef.current = Date.now();
      startQuestion(0);
    }
    prevPhase.current = api.phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.phase, set]);

  // The shared board, polled while it is on screen (the end screen shows it).
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
              score: r.score,
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
  const correct = answersRef.current.filter(Boolean).length;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8">
        {set ? (
          <GameShell
            game={GAME}
            api={api}
            comets={comets}
            dayNumber={set.dayKey}
            readyExtra={
              <p className="mt-2 text-[13.5px] text-text-muted">
                Doors open at 8PM Eastern. The same ten questions stand all day, twenty seconds
                each, one shared board.
              </p>
            }
            end={{
              headline: `${correct} of ${set.items.length} right`,
              shareText: shareScreening({ day: set.dayKey, answers: answersRef.current }),
              nextGameLine: "Next screening at 8PM Eastern.",
              leaderboard: { rows: board, label: "Tonight's board" },
            }}
          >
            {item && (
              <QuizBoard
                question={item.question}
                choices={item.choices}
                questionIndex={qIndex}
                questionCount={set.items.length}
                picked={picked}
                reveal={reveal}
                note={item.note}
                onPick={(i) => resolve(i, qIndex)}
              />
            )}
          </GameShell>
        ) : (
          <section>
            <h1 className="text-[20px] font-bold tracking-tight text-text-bright">{GAME.name}</h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.tagline}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Tonight's questions did not load. Try again in a minute.
            </p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            How to play
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">
            Ten questions, four answers each, twenty seconds a question. A pick locks instantly and
            the right answer shows before the next question lands; letting the clock run scores
            nothing and moves on. Everyone answers the same ten, and the night's board ranks the
            scores.
          </p>
        </section>

        <YesterdaySolved y={yesterday} />
        <MoreGames />

        <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>
      </main>
    </div>
  );
}
