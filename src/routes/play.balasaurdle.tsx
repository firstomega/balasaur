import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScoreBadge } from "@/components/balasaur/ScoreBadge";
import { CometChip } from "@/components/arcade/CometChip";
import { GuessBox } from "@/components/arcade/GuessBox";
import { getDailyChallenge, type DailyChallenge } from "@/lib/daily.functions";
import { getYesterday, type ArcadeYesterday } from "@/lib/arcade.functions";
import type { SearchHit } from "@/lib/catalog.functions";
import { useViewerCountry } from "@/hooks/useCatalog";
import { useAuth } from "@/hooks/useAuth";
import { arcadeSubmitRun } from "@/lib/arcade";
import { GAMES, ENABLED_SLUGS } from "@/lib/arcade/games";
import { balasaurdlePayout, totalComets } from "@/lib/arcade/comets";
import { useComets } from "@/lib/arcade/useComets";
import type { PayoutLine } from "@/lib/arcade/types";
import {
  MAX_GUESSES,
  MAX_HINTS,
  dayNumber,
  loadDaily,
  saveDaily,
  shareText,
  titlePattern,
  type DailyState,
} from "@/lib/daily";
import { tmdbImage } from "@/lib/tmdbImage";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";

// Balasaurdle. One title a day for everyone, six clues, guess by search.
// The ritual is the point: a reason to come back tomorrow that no catalog
// page provides. State lives in localStorage; no account required.
//
// Moved from /play when the arcade hub took that URL. Same game, same
// localStorage blob, same title; the canonical now lives here, and a finished
// run earns comets (guest blob or wallet).

export const Route = createFileRoute("/play/balasaurdle")({
  loader: async () => {
    // Short fresh window AND short stale window: the puzzle flips at midnight
    // UTC, and the default 24-hour stale-while-revalidate would let the CDN
    // hand out yesterday's game long past the flip.
    await cacheSsrResponse(3600, 300);
    const [challenge, yesterday] = await Promise.all([
      getDailyChallenge(),
      getYesterday({ data: { game: "balasaurdle" } }),
    ]);
    return { challenge, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}/play/balasaurdle`;
    return {
      meta: buildMeta({
        title: "Balasaurdle: The Daily Movie and TV Guessing Game",
        description:
          "Six clues, one title, a new game every day. Guess the movie or show from its facts.",
        url,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd("Balasaurdle", url))],
    };
  },
  component: PlayPage,
});

/** One payout line's arithmetic, e.g. "4 x 2 = 8" or "+5". */
function lineMath(line: PayoutLine): string {
  if (line.count !== undefined && line.per !== undefined) {
    return `${line.count} x ${line.per} = ${line.value}`;
  }
  return line.value >= 0 ? `+${line.value}` : `${line.value}`;
}

function PlayPage() {
  const { challenge, yesterday } = Route.useLoaderData() as {
    challenge: DailyChallenge | null;
    yesterday: ArcadeYesterday | null;
  };
  const { user } = useAuth();
  const { total, ready, creditLocal } = useComets();
  const viewerCountry = useViewerCountry();
  // Synchronous default so the server renders a playable page (crawlers see
  // clue one, not a skeleton); localStorage state replaces it after mount.
  const [state, setState] = useState<DailyState | null>(() =>
    challenge
      ? {
          day: challenge.number,
          guessedIds: [],
          solved: false,
          gaveUp: false,
          streak: 0,
          best: 0,
          played: 0,
          wins: 0,
          hintsUsed: 0,
        }
      : null,
  );
  const [wrongTitles, setWrongTitles] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [staleDay, setStaleDay] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const creditedRef = useRef(false);

  useEffect(() => {
    if (!challenge) return;
    setState(loadDaily(challenge.number));
    startedAtRef.current = Date.now();
    // The CDN can hand the first post-midnight visitors yesterday's page.
    // Say so instead of letting them play a mislabeled game.
    if (dayNumber() !== challenge.number) setStaleDay(true);
  }, [challenge]);

  const finished =
    !!state && (state.solved || state.gaveUp || state.guessedIds.length >= MAX_GUESSES);
  const cluesShown = state ? Math.min(state.guessedIds.length + 1, MAX_GUESSES) : 1;

  const update = (next: DailyState) => {
    setState(next);
    saveDaily(next);
  };

  /** Credit a run the moment it finishes in this session. Guests write the
   *  comet blob (idempotent per day); signed-in runs go to the server, which
   *  clamps the payout to the daily cap and credits the first run per day. */
  const creditFinish = (next: DailyState) => {
    if (creditedRef.current) return;
    creditedRef.current = true;
    const lines = balasaurdlePayout({
      guesses: next.guessedIds.length,
      won: next.solved,
      hints: next.hintsUsed,
    });
    const earned = totalComets(lines);
    const durationMs = Date.now() - startedAtRef.current;
    if (user) {
      void arcadeSubmitRun({
        game: "balasaurdle",
        dayKey: next.day,
        score: earned,
        durationMs,
        won: next.solved,
        comets: earned,
        country: viewerCountry || null,
      })
        .then((res) => {
          // The RPC reports failure as {error}; it does not throw.
          if (res.error) {
            console.error("[balasaurdle] submit failed:", res.error);
            return;
          }
          creditLocal("balasaurdle", next.day, res.comets ?? 0);
        })
        .catch((e) => console.error("[balasaurdle] submit unreachable:", e));
    } else {
      creditLocal("balasaurdle", next.day, earned);
    }
  };

  const onGuess = (hit: SearchHit) => {
    if (!challenge || !state || finished) return;
    if (hit.id === challenge.id) {
      const played = state.played + 1;
      const wins = state.wins + 1;
      const streak = state.streak + 1;
      const next = {
        ...state,
        guessedIds: [...state.guessedIds, hit.id],
        solved: true,
        streak,
        best: Math.max(state.best, streak),
        played,
        wins,
      };
      update(next);
      creditFinish(next);
    } else {
      setWrongTitles((w) => [...w, hit.title]);
      const guessedIds = [...state.guessedIds, hit.id];
      const out = guessedIds.length >= MAX_GUESSES;
      const next = {
        ...state,
        guessedIds,
        played: out ? state.played + 1 : state.played,
        streak: out ? 0 : state.streak,
      };
      update(next);
      if (out) creditFinish(next);
    }
  };

  const giveUp = () => {
    if (!state || finished) return;
    const next = { ...state, gaveUp: true, played: state.played + 1, streak: 0 };
    update(next);
    creditFinish(next);
  };

  const hintsUsed = state?.hintsUsed ?? 0;
  const takeHint = () => {
    if (!state || finished || hintsUsed >= MAX_HINTS) return;
    update({ ...state, hintsUsed: hintsUsed + 1 });
  };

  const share = async () => {
    if (!challenge || !state) return;
    try {
      await navigator.clipboard.writeText(
        shareText(challenge.number, state.guessedIds.length, state.solved, state.hintsUsed),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the button simply does nothing visible */
    }
  };

  const detailSlug = useMemo(() => {
    if (!challenge) return "";
    return mediaSlug(challenge.id.replace(/^(movie|tv)-/, ""), challenge.title);
  }, [challenge]);

  // Deterministic from the finished state, so a restored game shows the same
  // arithmetic as a just-finished one. A loss pays nothing and shows nothing.
  const payoutLines = useMemo(
    () =>
      state && finished
        ? balasaurdlePayout({
            guesses: state.guessedIds.length,
            won: state.solved,
            hints: state.hintsUsed,
          })
        : [],
    [state, finished],
  );
  const earnedComets = totalComets(payoutLines);

  const yesterdayEntry = yesterday?.entries[0] ?? null;
  const yesterdaySlug = yesterdayEntry?.media
    ? mediaSlug(yesterdayEntry.media.id.replace(/^(movie|tv)-/, ""), yesterdayEntry.media.title)
    : "";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[560px] flex-1 px-5 py-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[24px] font-bold tracking-tight text-text-bright">Balasaurdle</h1>
          <div className="flex shrink-0 items-center gap-2 pt-1.5">
            {challenge && (
              <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                #{challenge.number}
              </span>
            )}
            <CometChip total={total} ready={ready} />
          </div>
        </div>
        <p className="mt-1 text-[13.5px] text-text-muted">
          One title a day. Six clues. Guess it in as few as you can.
        </p>

        {staleDay && (
          <p
            role="status"
            className="mt-4 rounded-[5px] border border-border bg-panel px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-text-muted"
          >
            A new game is out.{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-primary underline"
            >
              Load it
            </button>
          </p>
        )}
        {!challenge ? (
          <p className="mt-8 text-[14px] text-text-muted">
            Today's game did not load. Try again in a minute.
          </p>
        ) : !state ? (
          <div className="mt-8 h-40 animate-pulse rounded-[6px] border border-border bg-panel" />
        ) : (
          <>
            <ol className="mt-6 space-y-2" aria-label="Clues">
              {challenge.clues.slice(0, finished ? MAX_GUESSES : cluesShown).map((clue, i) => (
                <li
                  key={i}
                  className="flex gap-2.5 rounded-[5px] border border-border bg-panel px-3 py-2.5 text-[13.5px] leading-relaxed text-text"
                >
                  <span className="font-mono text-[11px] font-semibold text-text-dim">{i + 1}</span>
                  <span>{clue}</span>
                </li>
              ))}
            </ol>

            <p aria-live="polite" className="sr-only">
              {state.solved
                ? `Correct. Solved in ${state.guessedIds.length} guesses.`
                : state.guessedIds.length > 0
                  ? `Wrong. Clue ${Math.min(state.guessedIds.length + 1, MAX_GUESSES)} revealed.`
                  : ""}
            </p>
            {wrongTitles.length > 0 && !finished && (
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Wrong guesses">
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

            {hintsUsed > 0 && !finished && (
              <div className="mt-3 space-y-2" aria-label="Hints" aria-live="polite">
                {hintsUsed >= 2 && (
                  <div className="flex gap-2.5 rounded-[5px] border border-primary/40 bg-primary/5 px-3 py-2.5">
                    <span className="font-mono text-[11px] font-semibold text-primary">hint</span>
                    <span className="font-mono text-[14px] tracking-[0.08em] text-text">
                      {titlePattern(challenge.title)}
                    </span>
                  </div>
                )}
                <div className="flex gap-2.5 rounded-[5px] border border-primary/40 bg-primary/5 px-3 py-2.5">
                  <span className="font-mono text-[11px] font-semibold text-primary">hint</span>
                  <img
                    src={tmdbImage(challenge.posterUrl, "w185")}
                    alt="Today's poster, blurred"
                    draggable={false}
                    className={`pointer-events-none h-[96px] w-[64px] select-none rounded-[4px] object-cover ${
                      hintsUsed >= 3 ? "blur-[6px]" : "blur-[18px]"
                    }`}
                  />
                </div>
              </div>
            )}

            {!finished ? (
              <div className="mt-5 space-y-2.5">
                <GuessBox onGuess={onGuess} disabled={finished} />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                    Guess {state.guessedIds.length + 1} of {MAX_GUESSES}
                  </span>
                  <div className="flex items-center gap-3">
                    {hintsUsed < MAX_HINTS && (
                      <button
                        type="button"
                        onClick={takeHint}
                        className="font-mono text-[11px] uppercase tracking-wider text-primary underline hover:text-primary/80"
                      >
                        Take a hint ({MAX_HINTS - hintsUsed} left)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={giveUp}
                      className="font-mono text-[11px] uppercase tracking-wider text-text-dim underline hover:text-text-muted"
                    >
                      Reveal the answer
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[6px] border border-border bg-panel p-4">
                <div className="flex gap-4">
                  <img
                    src={tmdbImage(challenge.posterUrl, "w185")}
                    alt={`Poster for ${challenge.title}`}
                    className="h-[132px] w-[88px] shrink-0 rounded-[4px] object-cover"
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                      {state.solved
                        ? `Solved in ${state.guessedIds.length} of ${MAX_GUESSES}`
                        : "The answer was"}
                    </p>
                    <Link
                      to={challenge.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
                      params={{ id: detailSlug }}
                      className="mt-1 block text-[17px] font-semibold leading-tight text-text-bright hover:text-primary"
                    >
                      {challenge.title}
                    </Link>
                    <p className="mt-0.5 font-mono text-[11px] text-text-muted">{challenge.year}</p>
                    {typeof challenge.score === "number" && (
                      <ScoreBadge score={challenge.score} size="md" className="mt-2" />
                    )}
                  </div>
                </div>
                {payoutLines.length > 0 && (
                  <div className="mt-4 space-y-1 border-t border-border pt-3">
                    {payoutLines.map((line, i) => (
                      <div
                        key={i}
                        className="flex items-baseline justify-between gap-3 font-mono text-[12.5px]"
                      >
                        <span className="text-text-muted">{line.label}</span>
                        <span className="tabular-nums text-text">{lineMath(line)}</span>
                      </div>
                    ))}
                    <div className="flex items-baseline justify-between gap-3 pt-1 font-mono text-[12.5px] font-semibold text-text-bright">
                      <span>Comets</span>
                      <span className="tabular-nums">
                        = {earnedComets} comet{earnedComets === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={share}
                    className="inline-flex items-center gap-1.5 rounded-[5px] bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {copied ? "Copied" : "Share result"}
                  </button>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                    Streak {state.streak} · Best {state.best} · Won {state.wins} of {state.played}
                  </span>
                </div>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                  Next game at midnight UTC.
                </p>
              </div>
            )}
          </>
        )}

        {yesterday && yesterdayEntry && yesterdayEntry.media && (
          <section className="mt-10">
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
              Yesterday's answer
            </h2>
            <div className="mt-2 flex items-center gap-3 rounded-[6px] border border-border bg-panel p-3">
              <img
                src={tmdbImage(yesterdayEntry.media.posterUrl, "w185")}
                alt={`Poster for ${yesterdayEntry.media.title}`}
                className="h-[72px] w-[48px] shrink-0 rounded-[4px] object-cover"
              />
              <div className="min-w-0">
                <Link
                  to={yesterdayEntry.media.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
                  params={{ id: yesterdaySlug }}
                  className="block truncate text-[14.5px] font-semibold text-text-bright hover:text-primary"
                >
                  {yesterdayEntry.media.title}
                </Link>
                <p className="mt-0.5 font-mono text-[11px] text-text-muted">
                  {yesterdayEntry.media.year} · game #{yesterday.dayKey}
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            More games
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ENABLED_SLUGS.filter((slug) => slug !== "balasaurdle").map((slug) => (
              <Link
                key={slug}
                to={GAMES[slug].path}
                className="rounded-[5px] border border-border bg-panel px-2.5 py-1.5 font-mono text-[12px] text-text hover:border-primary hover:text-primary"
              >
                {GAMES[slug].name}
              </Link>
            ))}
            <Link
              to="/play"
              className="rounded-[5px] border border-border bg-panel px-2.5 py-1.5 font-mono text-[12px] text-text hover:border-primary hover:text-primary"
            >
              All games
            </Link>
          </div>
        </section>

        <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>
      </main>
    </div>
  );
}
