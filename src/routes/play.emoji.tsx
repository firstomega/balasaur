import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { GameShell } from "@/components/arcade/GameShell";
import { GuessBox } from "@/components/arcade/GuessBox";
import { EmojiStage } from "@/components/arcade/EmojiStage";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import type { EndScreenContent } from "@/components/arcade/EndScreen";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { emojiPayout, totalComets } from "@/lib/arcade/comets";
import { shareEmoji } from "@/lib/arcade/share";
import { recordResult } from "@/lib/arcade/stats";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
import type { GameStats } from "@/lib/arcade/types";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import type { SearchHit } from "@/lib/catalog.functions";
import {
  getEmojiRound,
  getYesterday,
  type ArcadeMediaCard,
  type ArcadeYesterday,
  type SolvedMedia,
} from "@/lib/arcade.functions";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";
import type { MediaItem } from "@/types/media";

// Emoji Plots. Five plots told in emoji, one shared set per UTC day, pinned
// server-side from the authored puzzle pack. Three guesses a plot. The emoji
// are the hero on a hue card; the authored decoys appear only on the third
// guess, as a lifeline, so a single miss does not turn the puzzle into a
// multiple choice. On solve the poster flips in beside the emoji.

const GAME = GAMES.emoji;
const PUZZLES = 5;
const MAX_GUESSES = 3;
// The pack runs three to five emoji a plot (most are four), so this page
// says "a few" where the registry's tile copy says four.
const HOOK = "A whole movie in a few emoji. Name it.";
const HOW_TO = [
  "A whole movie in a few emoji. Type the title; any movie or show in the catalog counts.",
  "Three guesses a plot. On the last one, a short list of suspects appears.",
  "Five plots. A solve pays 2 comets, 1 more when the first guess lands.",
];
const LOST_HINT = "A solved plot pays 2 comets, 3 when the first guess lands.";

export const Route = createFileRoute("/play/emoji")({
  loader: async () => {
    // Short fresh window AND short stale window: the set flips at midnight
    // UTC and must not be served long past it.
    await cacheSsrResponse(3600, 300);
    const [round, yesterday] = await Promise.all([
      getEmojiRound(),
      getYesterday({ data: { game: GAME.slug } }),
    ]);
    return { round, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}${GAME.path}`;
    return {
      meta: buildMeta({
        title: "Emoji Movie Game: Guess the Movie from Emoji",
        description:
          "A movie plot told in emoji, five puzzles a day. Three guesses each, then the answer. Yesterday's set stays up so you can settle arguments.",
        url,
        image: `${SITE_ORIGIN}/og-play-emoji.jpg`,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
    };
  },
  component: EmojiPage,
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

function MediaLink({ media, className }: { media: SolvedMedia; className?: string }) {
  return (
    <Link
      to={media.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
      params={{ id: mediaSlug(media.id.replace(/^(movie|tv)-/, ""), media.title) }}
      className={
        className ?? "font-semibold text-text-bright hover:text-[var(--game,var(--primary))]"
      }
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
        Yesterday's plots, solved
      </h2>
      <ul className="mt-2 space-y-1.5">
        {y.entries.map((e, i) => (
          <li
            key={i}
            className="rounded-[5px] border border-border bg-panel px-3 py-2 text-[13px] leading-snug"
          >
            {e.prompt && <span className="text-text-muted">{e.prompt} </span>}
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

const eqTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface PlotResult {
  solved: boolean;
  firstTry: boolean;
}

function tierFor(solved: number, firstTry: number): string | undefined {
  if (solved === PUZZLES) return firstTry === PUZZLES ? "Five first guesses" : "All five";
  if (solved >= PUZZLES - 1) return "Close";
  return undefined;
}

function EmojiPage() {
  const { round, yesterday } = Route.useLoaderData();
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();
  const viewerCountry = useViewerCountry();

  const [idx, setIdx] = useState(0);
  const [wrongTitles, setWrongTitles] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<null | { solved: boolean; guesses: number }>(null);
  const [misses, setMisses] = useState(0);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [firstComets, setFirstComets] = useState(false);
  const resultsRef = useRef<PlotResult[]>([]);
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);

  // Reset the run state on every ready -> playing transition.
  const prevPhase = useRef(api.phase);
  useEffect(() => {
    if (api.phase === "playing" && prevPhase.current !== "playing") {
      resultsRef.current = [];
      setIdx(0);
      setWrongTitles([]);
      setRevealed(null);
      submittedRef.current = false;
      startedAtRef.current = Date.now();
    }
    prevPhase.current = api.phase;
  }, [api.phase]);

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
    const results = resultsRef.current;
    const solved = results.filter((r) => r.solved).length;
    const firstTry = results.filter((r) => r.firstTry).length;
    const lines = emojiPayout({ solved, firstTry });
    const won = solved === PUZZLES;
    setStats(recordResult(GAME.slug, round.dayKey, { won, bucket: solved }));
    api.finish(lines);
    submitRun({ score: solved * 20, won, earned: totalComets(lines) });
  };

  const item = round?.items[Math.min(idx, PUZZLES - 1)];

  const resolvePlot = (solved: boolean) => {
    if (!item || revealed) return;
    resultsRef.current.push({ solved, firstTry: solved && wrongTitles.length === 0 });
    if (solved) {
      api.addScore(1);
      api.hitCombo();
    } else {
      api.breakCombo();
    }
    setRevealed({ solved, guesses: wrongTitles.length + 1 });
  };

  const miss = (title: string) => {
    api.breakCombo();
    setMisses((m) => m + 1);
    if (wrongTitles.length + 1 >= MAX_GUESSES) {
      resolvePlot(false);
      setWrongTitles((w) => [...w, title]);
      return;
    }
    setWrongTitles((w) => [...w, title]);
  };

  const onGuess = (hit: SearchHit) => {
    if (!item || revealed) return;
    if (hit.id === item.media.id || eqTitle(hit.title, item.answer)) resolvePlot(true);
    else miss(hit.title);
  };

  const guessChip = (title: string) => {
    if (!item || revealed) return;
    if (eqTitle(title, item.answer)) resolvePlot(true);
    else miss(title);
  };

  const advance = () => {
    if (idx < PUZZLES - 1) {
      setIdx(idx + 1);
      setWrongTitles([]);
      setRevealed(null);
      api.nextRound();
    } else {
      endRun();
    }
  };

  const results = resultsRef.current;
  const lastGuess = !revealed && wrongTitles.length === MAX_GUESSES - 1;

  const end = useMemo<EndScreenContent>(() => {
    if (!round) return { headline: "", shareText: "" };
    const done = resultsRef.current;
    const solved = done.filter((r) => r.solved).length;
    const firstTry = done.filter((r) => r.firstTry).length;
    const text = shareEmoji({ day: round.dayKey, results: done.map((r) => r.solved) });
    const tier = tierFor(solved, firstTry);
    const headline = `${solved} of ${PUZZLES} plots solved`;
    return {
      tier,
      headline,
      grid: [text.split("\n")[1] ?? ""],
      stats: stats ?? undefined,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? HOOK },
      answers: round.items.map((i) => toMediaItem(i.media)),
      answersLabel: "Today's five",
      lost: solved === 0,
      lostHint: LOST_HINT,
      firstComets,
    };
    // resultsRef is complete by the time the phase flips; stats changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, stats, firstComets, api.phase]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8">
        {round && item ? (
          <GameShell
            game={GAME}
            api={api}
            comets={comets}
            dayNumber={round.dayKey}
            howTo={HOW_TO}
            end={end}
            narrow
          >
            <div>
              <EmojiStage
                key={idx}
                emoji={item.emoji}
                plot={idx + 1}
                total={PUZZLES}
                results={results.map((r) => r.solved)}
                guess={wrongTitles.length + 1}
                maxGuesses={MAX_GUESSES}
                revealed={
                  revealed
                    ? {
                        posterUrl: item.media.posterUrl,
                        title: item.media.title,
                        solved: revealed.solved,
                      }
                    : null
                }
                lifelines={
                  lastGuess
                    ? { choices: item.choices, spent: wrongTitles, onPick: guessChip }
                    : null
                }
              >
                {!revealed ? (
                  <div className="space-y-2.5">
                    <GuessBox
                      onGuess={onGuess}
                      disabled={false}
                      placeholder="Name the title"
                      shake={misses}
                      autoFocus
                    />
                    {wrongTitles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5" aria-label="Wrong guesses">
                        {wrongTitles.map((t, i) => (
                          <span
                            key={i}
                            className="rounded-[4px] border border-border px-2 py-0.5 font-mono text-[12px] text-text-dim line-through"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => resolvePlot(false)}
                        className="inline-flex items-center rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-text-dim hover:border-text-dim hover:text-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--game,var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        Reveal the answer
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 rounded-[6px] border border-[var(--game,var(--primary))] [background:color-mix(in_oklab,var(--game,var(--primary))_14%,var(--color-panel))] p-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--game,var(--primary))]">
                        {revealed.solved ? `Solved in ${revealed.guesses}` : "It was"}
                      </p>
                      <MediaLink
                        media={item.media}
                        className="mt-1 block text-[20px] font-black leading-tight tracking-[-0.02em] text-text-bright hover:text-[var(--game,var(--primary))]"
                      />
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-text-muted">
                        {item.media.year}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={advance}
                      autoFocus
                      className="shrink-0 rounded-full bg-[var(--game,var(--primary))] px-5 py-2.5 text-[14px] font-black tracking-[-0.01em] text-[var(--game-ink,var(--primary-foreground))] hover:brightness-110"
                    >
                      {idx < PUZZLES - 1 ? "Next plot" : "See the results"}
                    </button>
                  </div>
                )}
              </EmojiStage>
            </div>
          </GameShell>
        ) : (
          <section>
            <h1 className="text-[22px] font-black tracking-[-0.02em] text-text-bright">
              {GAME.name}
            </h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.hook}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's puzzles did not load. Try again in a minute.
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
