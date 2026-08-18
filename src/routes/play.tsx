import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Search } from "lucide-react";
import { TopBar } from "@/components/balasaur/TopBar";
import { Footer } from "@/components/balasaur/Footer";
import { ScoreBadge } from "@/components/balasaur/ScoreBadge";
import { getDailyChallenge, type DailyChallenge } from "@/lib/daily.functions";
import { searchTitles, type SearchHit } from "@/lib/catalog.functions";
import {
  MAX_GUESSES,
  dayNumber,
  loadDaily,
  saveDaily,
  shareText,
  type DailyState,
} from "@/lib/daily";
import { tmdbImage } from "@/lib/tmdbImage";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse } from "@/lib/seo";

// Balasaurdle. One title a day for everyone, six clues, guess by search.
// The ritual is the point: a reason to come back tomorrow that no catalog
// page provides. State lives in localStorage; no account required.

export const Route = createFileRoute("/play")({
  loader: async () => {
    // Short fresh window AND short stale window: the puzzle flips at midnight
    // UTC, and the default 24-hour stale-while-revalidate would let the CDN
    // hand out yesterday's game long past the flip.
    await cacheSsrResponse(3600, 300);
    return getDailyChallenge();
  },
  head: () => {
    const url = `${SITE_ORIGIN}/play`;
    return {
      meta: buildMeta({
        title: "Balasaurdle: The Daily Movie and TV Guessing Game",
        description:
          "Six clues, one title, a new game every day. Guess the movie or show from its facts.",
        url,
      }),
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PlayPage,
});

function GuessInput({
  onGuess,
  disabled,
}: {
  onGuess: (hit: SearchHit) => void;
  disabled: boolean;
}) {
  const search = useServerFn(searchTitles);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = q.trim();
    if (!t) {
      setHits([]);
      return;
    }
    let dead = false;
    const timer = setTimeout(async () => {
      try {
        const r = await search({ data: { query: t } });
        if (!dead) {
          setHits(r.slice(0, 6));
          setActive(0);
        }
      } catch {
        if (!dead) setHits([]);
      }
    }, 180);
    return () => {
      dead = true;
      clearTimeout(timer);
    };
  }, [q, search]);

  function pick(hit: SearchHit) {
    setQ("");
    setHits([]);
    onGuess(hit);
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim"
          aria-hidden="true"
        />
        <input
          type="search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="guess-listbox"
          aria-autocomplete="list"
          aria-activedescendant={hits.length > 0 ? `guess-opt-${active}` : undefined}
          value={q}
          disabled={disabled}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => setTimeout(() => setHits([]), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setHits([]);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              pick(hits[active]);
            }
          }}
          placeholder="Guess a movie or show"
          aria-label="Guess a movie or show"
          className="h-10 w-full rounded-[5px] border border-border bg-panel pl-8 pr-3 font-mono text-[13px] text-foreground placeholder:text-text-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
        />
      </label>
      {hits.length > 0 && (
        <ul
          id="guess-listbox"
          role="listbox"
          aria-label="Matches"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-[5px] border border-border bg-panel shadow-lg"
        >
          {hits.map((h, i) => (
            <li key={h.id} id={`guess-opt-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(h)}
                className={
                  "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[13px] " +
                  (i === active ? "bg-background text-text-bright" : "text-text")
                }
              >
                <span className="truncate">{h.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-text-dim">
                  {h.year || h.mediaType}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlayPage() {
  const challenge = Route.useLoaderData() as DailyChallenge | null;
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
        }
      : null,
  );
  const [wrongTitles, setWrongTitles] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [staleDay, setStaleDay] = useState(false);

  useEffect(() => {
    if (!challenge) return;
    setState(loadDaily(challenge.number));
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

  const onGuess = (hit: SearchHit) => {
    if (!challenge || !state || finished) return;
    if (hit.id === challenge.id) {
      const played = state.played + 1;
      const wins = state.wins + 1;
      const streak = state.streak + 1;
      update({
        ...state,
        guessedIds: [...state.guessedIds, hit.id],
        solved: true,
        streak,
        best: Math.max(state.best, streak),
        played,
        wins,
      });
    } else {
      setWrongTitles((w) => [...w, hit.title]);
      const guessedIds = [...state.guessedIds, hit.id];
      const out = guessedIds.length >= MAX_GUESSES;
      update({
        ...state,
        guessedIds,
        played: out ? state.played + 1 : state.played,
        streak: out ? 0 : state.streak,
      });
    }
  };

  const giveUp = () => {
    if (!state || finished) return;
    update({ ...state, gaveUp: true, played: state.played + 1, streak: 0 });
  };

  const share = async () => {
    if (!challenge || !state) return;
    try {
      await navigator.clipboard.writeText(
        shareText(challenge.number, state.guessedIds.length, state.solved),
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

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[560px] flex-1 px-5 py-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[24px] font-bold tracking-tight text-text-bright">Balasaurdle</h1>
          {challenge && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
              #{challenge.number}
            </span>
          )}
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
                    className="rounded-[4px] border border-border px-2 py-0.5 font-mono text-[10.5px] text-text-dim line-through"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {!finished ? (
              <div className="mt-5 space-y-2.5">
                <GuessInput onGuess={onGuess} disabled={finished} />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
                    Guess {state.guessedIds.length + 1} of {MAX_GUESSES}
                  </span>
                  <button
                    type="button"
                    onClick={giveUp}
                    className="font-mono text-[10.5px] uppercase tracking-wider text-text-dim underline hover:text-text-muted"
                  >
                    Reveal the answer
                  </button>
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
                    <p className="font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
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
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
                    Streak {state.streak} · Best {state.best} · Won {state.wins} of {state.played}
                  </span>
                </div>
                <p className="mt-3 font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
                  Next game at midnight UTC.
                </p>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
