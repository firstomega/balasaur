import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { GameShell } from "@/components/arcade/GameShell";
import { BinSort, type BinCard, type BinDef } from "@/components/arcade/BinSort";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import type { EndScreenContent } from "@/components/arcade/EndScreen";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { sequelOrFakePayout, totalComets } from "@/lib/arcade/comets";
import { shareSequelOrFake } from "@/lib/arcade/share";
import { recordResult } from "@/lib/arcade/stats";
import { ENABLED_SLUGS, GAMES, tierFor } from "@/lib/arcade/games";
import type { GameStats } from "@/lib/arcade/types";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import { useViewerCountry } from "@/hooks/useCatalog";
import {
  getSequelRound,
  getYesterday,
  type ArcadeYesterday,
  type SequelRoundItem,
} from "@/lib/arcade.functions";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { arcadeBreadcrumbJsonLd } from "@/lib/jsonld";

// Sequel or Fake. Ten sequel titles, half real, half invented, one shared
// deck per UTC day from the authored pack. Sort each into Real or Fake; the
// verdict lands on the card itself (a REAL or FAKE stamp, then the card
// flips to the story and holds until a tap). Right calls in a row build the
// combo, and the ten stories are listed again under the end screen.

const GAME = GAMES["sequel-or-fake"];
const DECK = 10;
const BINS: [BinDef, BinDef] = [
  { key: "real", label: "Real" },
  { key: "fake", label: "Fake" },
];
const HOW_TO = [
  "Each card names a sequel and the film it claims to follow.",
  "Swipe left for Real, right for Fake. Tap a bin or use the arrow keys.",
  "The card turns over with the story. Ten cards, 1 comet a right call.",
];
const LOST_HINT = "A right call pays 1 comet. Ten in a row pay 15.";
// How long a verdict card holds on screen: stamp, flip, story hold, exit.
// The last card gets this long before the end screen takes over.
const VERDICT_HOLD_MS = 2500;
const LAST_CARD_BEAT_MS = 650 + 420 + VERDICT_HOLD_MS + 320;

export const Route = createFileRoute("/play/sequel-or-fake")({
  loader: async () => {
    // Short fresh window AND short stale window: the deck flips at midnight
    // UTC and must not be served long past it.
    await cacheSsrResponse(3600, 300);
    const [round, yesterday] = await Promise.all([
      getSequelRound(),
      getYesterday({ data: { game: GAME.slug } }),
    ]);
    return { round, yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}${GAME.path}`;
    return {
      meta: buildMeta({
        title: "Sequel or Fake: Call the Real Movie Sequels",
        description:
          "Ten sequel titles, some real, some made up. Call each one, then read the story behind it. Disney really made a sequel to Old Yeller. A new ten every day.",
        url,
        image: `${SITE_ORIGIN}/og-play-sequel-or-fake.jpg`,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(arcadeBreadcrumbJsonLd(GAME.name, url))],
    };
  },
  component: SequelOrFakePage,
});

/** One authored story with its verdict, the row shape both lists share. */
function StoryRow({
  title,
  real,
  story,
  called,
}: {
  title: string;
  real: boolean;
  story?: string | null;
  /** Set on today's list: whether the player called it. */
  called?: boolean;
}) {
  return (
    <li className="rounded-[5px] border border-border bg-panel px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold leading-snug text-text-bright">{title}</span>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider">
          <span className={real ? "text-rating" : "text-warn"}>{real ? "Real" : "Fake"}</span>
          {called !== undefined && (
            <span className={called ? "text-text-dim" : "text-destructive"}>
              {called ? " · called it" : " · missed"}
            </span>
          )}
        </span>
      </div>
      {story && <p className="mt-0.5 text-[12px] leading-snug text-text-muted">{story}</p>}
    </li>
  );
}

function YesterdaySolved({ y }: { y: ArcadeYesterday | null }) {
  if (!y || y.entries.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
        Yesterday's ten, revealed
      </h2>
      <ul className="mt-2 space-y-1.5">
        {y.entries.map((e, i) => (
          <StoryRow
            key={i}
            title={e.prompt ?? e.answer}
            real={e.answer === "Real"}
            story={e.detail}
          />
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

interface Call {
  item: SequelRoundItem;
  ok: boolean;
}

function toCard(item: SequelRoundItem | undefined): BinCard | null {
  if (!item) return null;
  return {
    id: String(item.itemId),
    label: item.title,
    sub: `sequel to ${item.anchor}`,
    // Fake sequels have no poster; the face is drawn from the anchor title so
    // every claimed sequel to the same film shares a look.
    faceKey: item.anchor,
    verdict: { stamp: item.real ? "REAL" : "FAKE", story: item.reveal },
  };
}

function SequelOrFakePage() {
  const { round, yesterday } = Route.useLoaderData();
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();
  const viewerCountry = useViewerCountry();

  const [idx, setIdx] = useState(0);
  const [calls, setCalls] = useState<Call[]>([]);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [firstComets, setFirstComets] = useState(false);
  const statRef = useRef({ correct: 0, streak: 0, best: 0 });
  // One boolean per call in order, for the share grid.
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

  // Reset the run state on every ready -> playing transition.
  const prevPhase = useRef(api.phase);
  useEffect(() => {
    if (api.phase === "playing" && prevPhase.current !== "playing") {
      statRef.current = { correct: 0, streak: 0, best: 0 };
      resultsRef.current = [];
      setIdx(0);
      setCalls([]);
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
    const { correct, best } = statRef.current;
    const lines = sequelOrFakePayout({ correct, bestStreak: best });
    const won = correct === DECK;
    setStats(recordResult(GAME.slug, round.dayKey, { won, bucket: correct }));
    api.finish(lines);
    submitRun({ score: correct * 10, won, earned: totalComets(lines) });
  };

  const onChoose = (bin: 0 | 1): boolean => {
    if (!round) return false;
    const item = round.items[idx];
    if (!item) return false;
    const ok = (bin === 0) === item.real;
    const s = statRef.current;
    if (ok) {
      s.correct += 1;
      s.streak += 1;
      s.best = Math.max(s.best, s.streak);
      api.addScore(1);
      api.hitCombo();
    } else {
      s.streak = 0;
      api.breakCombo();
    }
    resultsRef.current.push(ok);
    setCalls((c) => [...c, { item, ok }]);
    setIdx(idx + 1);
    if (idx + 1 >= DECK) {
      // The last card stamps, flips to its story and holds before the end
      // screen takes over.
      beatRef.current = window.setTimeout(endRun, LAST_CARD_BEAT_MS);
    }
    return ok;
  };

  const end = useMemo<EndScreenContent>(() => {
    if (!round) return { headline: "", shareText: "" };
    const results = resultsRef.current;
    const correct = results.filter(Boolean).length;
    const text = shareSequelOrFake({ day: round.dayKey, results });
    const tier = correct === 0 ? undefined : tierFor(GAME.slug, correct / DECK);
    const headline = `${correct} of ${DECK} right`;
    return {
      tier,
      headline,
      grid: [text.split("\n")[1] ?? ""],
      stats: stats ?? undefined,
      shareText: text,
      shareImage: { title: headline, subtitle: tier ?? GAME.hook },
      lost: correct === 0,
      lostHint: LOST_HINT,
      firstComets,
      // The ten stories render under the shell; the tiles follow them.
      moreGames: false,
    };
    // resultsRef is complete by the time the phase flips; stats changes with it.
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
            <BinSort
              card={toCard(round.items[idx])}
              nextCard={toCard(round.items[idx + 1])}
              bins={BINS}
              onChoose={onChoose}
              verdictHoldMs={VERDICT_HOLD_MS}
            />
          </GameShell>
        ) : (
          <section>
            <h1 className="text-[22px] font-black tracking-[-0.02em] text-text-bright">
              {GAME.name}
            </h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.hook}</p>
            <p className="mt-6 text-[14px] text-text-muted">
              Today's deck did not load. Try again in a minute.
            </p>
          </section>
        )}

        {api.phase === "ended" && calls.length > 0 && (
          <section className="mt-6">
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
              The ten, revealed
            </h2>
            <ul className="mt-2 space-y-1.5">
              {calls.map((c, i) => (
                <StoryRow
                  key={i}
                  title={c.item.title}
                  real={c.item.real}
                  story={c.item.reveal}
                  called={c.ok}
                />
              ))}
            </ul>
          </section>
        )}

        <YesterdaySolved y={yesterday} />
        <MoreGames />

        <p className="mt-8 font-mono text-[11px] text-text-dim">Title data from TMDB and OMDb</p>
      </main>
    </div>
  );
}
