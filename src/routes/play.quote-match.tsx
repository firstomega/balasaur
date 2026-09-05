import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { GameShell } from "@/components/arcade/GameShell";
import { MatchBoard, type MatchPair } from "@/components/arcade/MatchBoard";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import type { EndScreenContent } from "@/components/arcade/EndScreen";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { quoteMatchPayout, totalComets } from "@/lib/arcade/comets";
import { shareQuoteMatch } from "@/lib/arcade/share";
import { recordResult } from "@/lib/arcade/stats";
import { ENABLED_SLUGS, GAMES, tierFor } from "@/lib/arcade/games";
import type { GameStats } from "@/lib/arcade/types";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import {
  daySeed,
  getQuoteRound,
  getYesterday,
  seededShuffle,
  type ArcadeMediaCard,
  type ArcadeYesterday,
  type SolvedMedia,
} from "@/lib/arcade.functions";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";
import type { MediaItem } from "@/types/media";

// Quote Match. Five famous lines against the five movies they come from, one
// shared board per UTC day, pinned server-side from the authored quote pack.
// Pairing on the first try is what scores; the board plays to completion.

const GAME = GAMES["quote-match"];
const BOARD_SIZE = 5;
const HOW_TO = [
  "Tap a line, then tap the poster of the movie that said it.",
  "A right pair locks. A wrong pair shakes and stays open.",
  "Only first-try pairs score. Five clean pairs is the best board.",
];
const LOST_HINT = "A first-try match pays 2 comets. Five of them pay 15.";
// How long the last pair's glow and stamp hold before the end screen.
const LAST_PAIR_BEAT_MS = 1500;

export const Route = createFileRoute("/play/quote-match")({
  loader: async () => {
    // Short fresh window AND short stale window: the board flips at midnight
    // UTC and must not be served long past it.
    await cacheSsrResponse(3600, 300);
    const [round, yesterday] = await Promise.all([
      getQuoteRound(),
      getYesterday({ data: { game: GAME.slug } }),
    ]);
    return { round, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}${GAME.path}`;
    return {
      meta: buildMeta({
        title: "Movie Quote Game: Match the Quote to the Movie",
        description:
          "Five famous lines, five movies, one board a day. Match each quote to the movie it comes from. May the Force be with you. You know where that one goes.",
        url,
        image: `${SITE_ORIGIN}/og-play-quote-match.jpg`,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
    };
  },
  component: QuoteMatchPage,
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
        Yesterday's board, solved
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

function QuoteMatchPage() {
  const { round, yesterday } = Route.useLoaderData();
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();
  const viewerCountry = useViewerCountry();

  // The payload keeps quotes and their movies in the same pinned order, so
  // the poster column is reshuffled here, seeded on the day: stable across
  // renders and identical for everyone, but no longer a giveaway.
  const titles = useMemo(
    () =>
      round
        ? seededShuffle(
            round.items.map((i) => i.media),
            daySeed(round.dayKey, 7),
          )
        : [],
    [round],
  );

  const [matched, setMatched] = useState<MatchPair[]>([]);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [firstComets, setFirstComets] = useState(false);
  const matchedRef = useRef<MatchPair[]>([]);
  const wrongRef = useRef<Set<string>>(new Set());
  const firstTryRef = useRef(0);
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);
  const beatRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (beatRef.current) window.clearTimeout(beatRef.current);
    },
    [],
  );

  // Reset the run state on every ready -> playing transition.
  const prevPhase = useRef(api.phase);
  useEffect(() => {
    if (api.phase === "playing" && prevPhase.current !== "playing") {
      matchedRef.current = [];
      setMatched([]);
      wrongRef.current = new Set();
      firstTryRef.current = 0;
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
    const matches = firstTryRef.current;
    const clean = matches === BOARD_SIZE;
    const lines = quoteMatchPayout({ matches, clean });
    setStats(recordResult(GAME.slug, round.dayKey, { won: clean, bucket: matches }));
    api.finish(lines);
    submitRun({ score: matches * 20, won: clean, earned: totalComets(lines) });
  };

  const onPair = (promptId: string, titleId: string): boolean => {
    if (!round) return false;
    // A quote's pair key is the media id of the movie that says it.
    const ok = promptId === titleId;
    if (!ok) {
      wrongRef.current.add(promptId);
      api.breakCombo();
      return false;
    }
    api.hitCombo();
    if (!wrongRef.current.has(promptId)) {
      firstTryRef.current += 1;
      api.addScore(1);
    }
    const next = [...matchedRef.current, { promptId, titleId }];
    matchedRef.current = next;
    setMatched(next);
    if (next.length === round.items.length) {
      // Let the last poster land and its check stamp in before the end
      // screen takes over.
      beatRef.current = window.setTimeout(endRun, LAST_PAIR_BEAT_MS);
    }
    return true;
  };

  const end = useMemo<EndScreenContent>(() => {
    if (!round) return { headline: "", shareText: "" };
    const matches = firstTryRef.current;
    const clean = matches === BOARD_SIZE;
    const text = shareQuoteMatch({ day: round.dayKey, matches, clean });
    const tier = matches === 0 ? undefined : tierFor(GAME.slug, matches / BOARD_SIZE);
    const headline = `${matches} of ${BOARD_SIZE} on the first try`;
    return {
      tier,
      headline,
      grid: [text.split("\n")[1] ?? ""],
      stats: stats ?? undefined,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? GAME.hook },
      answers: round.items.map((i) => toMediaItem(i.media)),
      answersLabel: "Today's five",
      lost: matches === 0,
      lostHint: LOST_HINT,
      firstComets,
    };
    // firstTryRef is settled by the time the phase flips; stats changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, stats, firstComets, api.phase]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8 lg:max-w-[880px]">
        {round ? (
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
              <MatchBoard
                prompts={round.items.map((i) => ({ id: i.media.id, text: i.quote }))}
                titles={titles}
                matched={matched}
                onPair={onPair}
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
              Today's board did not load. Try again in a minute.
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
