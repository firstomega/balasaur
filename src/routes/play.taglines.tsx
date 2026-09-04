import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { GameShell } from "@/components/arcade/GameShell";
import { MatchBoard, type MatchPair } from "@/components/arcade/MatchBoard";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { taglinesPayout, totalComets } from "@/lib/arcade/comets";
import { shareTaglines } from "@/lib/arcade/share";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import {
  getTaglineRound,
  getYesterday,
  type ArcadeMediaCard,
  type ArcadeYesterday,
  type SolvedMedia,
} from "@/lib/arcade.functions";
import { mediaSlug } from "@/lib/slug";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import type { MediaItem } from "@/types/media";

// Tagline Roulette. Five real taglines against five posters, one shared board
// per UTC day, pinned server-side. Pairing on the first try is what scores;
// the board always plays to completion so nobody leaves without the answers.

const GAME = GAMES.taglines;
const BOARD_SIZE = 5;

export const Route = createFileRoute("/play/taglines")({
  loader: async () => {
    // Short fresh window AND short stale window: the board flips at midnight
    // UTC and must not be served long past it.
    await cacheSsrResponse(3600, 300);
    const [round, yesterday] = await Promise.all([
      getTaglineRound(),
      getYesterday({ data: { game: GAME.slug } }),
    ]);
    return { round, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}${GAME.path}`;
    return {
      meta: buildMeta({
        title: "Movie Tagline Game: Match the Tagline to the Movie",
        description:
          "Five real taglines, five posters, one board a day. Pair each line with its movie. Sin is a choice. One man saw it coming. You know more of these than you think.",
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
  component: TaglinesPage,
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

function TaglinesPage() {
  const { round, yesterday } = Route.useLoaderData();
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();

  const [matched, setMatched] = useState<MatchPair[]>([]);
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
    const matches = firstTryRef.current;
    const clean = matches === BOARD_SIZE;
    const lines = taglinesPayout({ matches, clean });
    api.finish(lines);
    submitRun({ score: matches * 20, won: clean, earned: totalComets(lines) });
  };

  const onPair = (promptId: string, titleId: string): boolean => {
    if (!round) return false;
    // A tagline's id IS the media id of its matching title.
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
    if (next.length === round.taglines.length) {
      // Let the last pair collapse before the end screen takes over.
      beatRef.current = window.setTimeout(endRun, 700);
    }
    return true;
  };

  const matches = firstTryRef.current;
  const clean = matches === BOARD_SIZE;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[600px] flex-1 px-5 py-8">
        {round ? (
          <GameShell
            game={GAME}
            api={api}
            comets={comets}
            end={{
              headline: `${matches} of ${BOARD_SIZE} on the first try`,
              shareText: shareTaglines({ matches, clean }),
              nextGameLine: "New taglines at midnight UTC.",
              answers: round.titles.map(toMediaItem),
              answersLabel: "Today's five",
            }}
          >
            <MatchBoard
              prompts={round.taglines.map((t) => ({ id: t.id, text: t.text }))}
              titles={round.titles}
              matched={matched}
              onPair={onPair}
            />
          </GameShell>
        ) : (
          <section>
            <h1 className="text-[20px] font-bold tracking-tight text-text-bright">{GAME.name}</h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.tagline}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's board did not load. Try again in a minute.
            </p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            How to play
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">
            Five taglines sit beside five posters. Tap a tagline, then tap the poster it belongs to;
            pairing on the first try is what scores. The board is the same for everyone and changes
            at midnight UTC.
          </p>
        </section>

        <YesterdaySolved y={yesterday} />
        <MoreGames />
      </main>
    </div>
  );
}
