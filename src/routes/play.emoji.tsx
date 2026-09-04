import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { GameShell } from "@/components/arcade/GameShell";
import { GuessBox } from "@/components/arcade/GuessBox";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { emojiPayout, totalComets } from "@/lib/arcade/comets";
import { shareEmoji } from "@/lib/arcade/share";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
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
import type { MediaItem } from "@/types/media";

// Emoji Plots. Five plots told in emoji, one shared set per UTC day, pinned
// server-side from the authored puzzle pack. Three guesses a plot; after the
// first miss the authored decoys appear as tappable chips.

const GAME = GAMES.emoji;
const PUZZLES = 5;
const MAX_GUESSES = 3;

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

const eqTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface PlotResult {
  solved: boolean;
  firstTry: boolean;
}

function EmojiPage() {
  const { round, yesterday } = Route.useLoaderData();
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();

  const [idx, setIdx] = useState(0);
  const [wrongTitles, setWrongTitles] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<null | { solved: boolean; guesses: number }>(null);
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
    const results = resultsRef.current;
    const solved = results.filter((r) => r.solved).length;
    const firstTry = results.filter((r) => r.firstTry).length;
    const lines = emojiPayout({ solved, firstTry });
    api.finish(lines);
    submitRun({ score: solved * 20, won: solved === PUZZLES, earned: totalComets(lines) });
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
  const solvedCount = results.filter((r) => r.solved).length;

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
              headline: `${solvedCount} of ${PUZZLES} plots solved`,
              shareText: shareEmoji({ results: results.map((r) => r.solved) }),
              nextGameLine: "New plots at midnight UTC.",
              answers: round.items.map((i) => toMediaItem(i.media)),
              answersLabel: "Today's five",
            }}
          >
            <div>
              <p className="text-center text-[44px] leading-relaxed" aria-label="The plot in emoji">
                {item.emoji}
              </p>

              {!revealed ? (
                <div className="mt-4 space-y-3">
                  <GuessBox onGuess={onGuess} disabled={false} placeholder="Name the title" />

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

                  {wrongTitles.length > 0 && (
                    <div aria-label="Possible answers">
                      <p className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                        It is one of these
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.choices.map((c) => {
                          const spent = wrongTitles.some((w) => eqTitle(w, c));
                          return (
                            <button
                              key={c}
                              type="button"
                              disabled={spent}
                              onClick={() => guessChip(c)}
                              className={`min-h-[32px] rounded-[5px] border border-border bg-panel px-2.5 py-1 text-[13px] text-text hover:border-primary hover:text-primary disabled:opacity-50 ${
                                spent ? "line-through" : ""
                              }`}
                            >
                              {c}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                      Guess {wrongTitles.length + 1} of {MAX_GUESSES}
                    </span>
                    <button
                      type="button"
                      onClick={() => resolvePlot(false)}
                      className="font-mono text-[11px] uppercase tracking-wider text-text-dim underline hover:text-text-muted"
                    >
                      Reveal the answer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[6px] border border-border bg-panel p-4">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                    {revealed.solved ? `Solved in ${revealed.guesses}` : "The answer was"}
                  </p>
                  <p className="mt-1 text-[16px]">
                    <MediaLink media={item.media} />{" "}
                    <span className="font-mono text-[11px] text-text-dim">{item.media.year}</span>
                  </p>
                  <button
                    type="button"
                    onClick={advance}
                    className="mt-3 w-full rounded-[5px] bg-primary px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
                  >
                    {idx < PUZZLES - 1 ? "Next plot" : "See the results"}
                  </button>
                </div>
              )}
            </div>
          </GameShell>
        ) : (
          <section>
            <h1 className="text-[20px] font-bold tracking-tight text-text-bright">{GAME.name}</h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.tagline}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's puzzles did not load. Try again in a minute.
            </p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            How to play
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">
            Each puzzle is one plot told in emoji. Type the title you think it is; after a miss the
            possible answers appear as chips, and three misses reveal it. Five puzzles a day, the
            same five for everyone.
          </p>
        </section>

        <YesterdaySolved y={yesterday} />
        <MoreGames />
      </main>
    </div>
  );
}
