import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { GameShell } from "@/components/arcade/GameShell";
import { BinSort, type BinDef } from "@/components/arcade/BinSort";
import { useArcadeGame } from "@/lib/arcade/useArcadeGame";
import { useComets } from "@/lib/arcade/useComets";
import { sequelOrFakePayout, totalComets } from "@/lib/arcade/comets";
import { shareSequelOrFake } from "@/lib/arcade/share";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
import { arcadeSubmitRun } from "@/lib/arcade";
import { useAuth } from "@/hooks/useAuth";
import {
  getSequelRound,
  getYesterday,
  type ArcadeYesterday,
  type SequelRoundItem,
} from "@/lib/arcade.functions";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";

// Sequel or Fake. Ten sequel titles, half real, half invented, one shared
// deck per UTC day from the authored pack. Sort each into Real or Fake and
// read the story behind it; right calls in a row build the combo.

const GAME = GAMES["sequel-or-fake"];
const DECK = 10;
const BINS: [BinDef, BinDef] = [
  { key: "real", label: "Real" },
  { key: "fake", label: "Fake" },
];

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
  component: SequelOrFakePage,
});

function YesterdaySolved({ y }: { y: ArcadeYesterday | null }) {
  if (!y || y.entries.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
        Yesterday's ten, revealed
      </h2>
      <ul className="mt-2 space-y-1.5">
        {y.entries.map((e, i) => (
          <li key={i} className="rounded-[5px] border border-border bg-panel px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold leading-snug text-text-bright">
                {e.prompt}
              </span>
              <span
                className={`shrink-0 font-mono text-[11px] uppercase tracking-wider ${
                  e.answer === "Real" ? "text-emerald-300" : "text-orange-300"
                }`}
              >
                {e.answer}
              </span>
            </div>
            {e.detail && (
              <p className="mt-0.5 text-[12px] leading-snug text-text-muted">{e.detail}</p>
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

interface Call {
  item: SequelRoundItem;
  ok: boolean;
}

function SequelOrFakePage() {
  const { round, yesterday } = Route.useLoaderData();
  const api = useArcadeGame();
  const comets = useComets();
  const { user } = useAuth();

  const [idx, setIdx] = useState(0);
  const [calls, setCalls] = useState<Call[]>([]);
  const statRef = useRef({ correct: 0, streak: 0, best: 0 });
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
    const { correct, best } = statRef.current;
    const lines = sequelOrFakePayout({ correct, bestStreak: best });
    api.finish(lines);
    submitRun({ score: correct * 10, won: correct === DECK, earned: totalComets(lines) });
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
    setCalls((c) => [...c, { item, ok }]);
    setIdx(idx + 1);
    if (idx + 1 < DECK) {
      api.nextRound();
    } else {
      // Let the last card fly (and a wrong call flash its bin) first.
      beatRef.current = window.setTimeout(endRun, ok ? 500 : 1000);
    }
    return ok;
  };

  const toCard = (item: SequelRoundItem | undefined) =>
    item ? { id: String(item.itemId), label: item.title, sub: `sequel to ${item.anchor}` } : null;

  const last = calls.length > 0 ? calls[calls.length - 1] : null;
  const { correct, best } = statRef.current;

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
              headline: `${correct} of ${DECK} right`,
              shareText: shareSequelOrFake({ streak: best }),
              nextGameLine: "A new ten at midnight UTC.",
            }}
          >
            <div>
              <BinSort
                card={toCard(round.items[idx])}
                nextCard={toCard(round.items[idx + 1])}
                bins={BINS}
                onChoose={onChoose}
              />
              {last && (
                <p className="mt-3 rounded-[5px] border border-border bg-panel px-3 py-2 text-[12.5px] leading-snug text-text-muted">
                  <span
                    className={`font-mono text-[11px] uppercase tracking-wider ${
                      last.ok ? "text-emerald-300" : "text-orange-300"
                    }`}
                  >
                    {last.ok ? "Right" : "Wrong"}
                  </span>{" "}
                  <span className="font-semibold text-text-bright">{last.item.title}</span> is{" "}
                  {last.item.real ? "real" : "fake"}. {last.item.reveal}
                </p>
              )}
            </div>
          </GameShell>
        ) : (
          <section>
            <h1 className="text-[20px] font-bold tracking-tight text-text-bright">{GAME.name}</h1>
            <p className="mt-1 text-[13.5px] text-text-muted">{GAME.tagline}</p>
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
                <li key={i} className="rounded-[5px] border border-border bg-panel px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold leading-snug text-text-bright">
                      {c.item.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider">
                      <span className={c.item.real ? "text-emerald-300" : "text-orange-300"}>
                        {c.item.real ? "Real" : "Fake"}
                      </span>
                      <span className="text-text-dim">{c.ok ? " · called it" : " · missed"}</span>
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-text-muted">{c.item.reveal}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
            How to play
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">
            Each card names a sequel and the film it claims to follow. Sort it into Real or Fake
            with a tap, a swipe, or the arrow keys. Ten cards a day, and every answer comes with the
            story behind it.
          </p>
        </section>

        <YesterdaySolved y={yesterday} />
        <MoreGames />
      </main>
    </div>
  );
}
