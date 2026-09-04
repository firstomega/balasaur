import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import { CometChip } from "@/components/arcade/CometChip";
import { GAMES, ENABLED_SLUGS } from "@/lib/arcade/games";
import { arcadeWeeklyBoard, type ArcadeWeeklyBoard } from "@/lib/arcade";
import { MAX_GUESSES, dayNumber, loadDaily } from "@/lib/daily";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { itemListJsonLd } from "@/lib/jsonld";

// The arcade hub at /play. The grid is the whole page: every enabled game
// from the registry, server-rendered so a crawler sees each game's name and
// rule line. Personal state (comet balance, played-today ticks, the weekly
// board) renders after mount, per the CDN cache rule.
//
// This is an INDEX route ("/play/"), the /night pattern: the games live at
// /play/<slug> as path siblings, so /play stays a 200 for every
// "balasaur.com/play" link already in the wild.

export const Route = createFileRoute("/play/")({
  loader: async () => {
    // Same short cache window as the games: the tiles name daily games that
    // flip at midnight UTC.
    await cacheSsrResponse(3600, 300);
    return null;
  },
  head: () => {
    const url = `${SITE_ORIGIN}/play`;
    return {
      meta: buildMeta({
        title: "Movie Games: Free Daily Trivia and Guessing Games",
        description:
          "Free movie and TV games with new rounds every day: trivia, quotes, taglines, posters, emoji plots and the daily Balasaurdle. No sign-up.",
        url,
      }),
      links: [canonicalLink(url)],
      scripts: [
        jsonLdScript(
          itemListJsonLd({
            name: "Movie Games",
            url,
            items: ENABLED_SLUGS.map((slug) => ({
              name: GAMES[slug].name,
              url: `${SITE_ORIGIN}${GAMES[slug].path}`,
            })),
          }),
        ),
      ],
    };
  },
  component: ArcadeHub,
});

// The guest comet blob's key and shape, read here only to tick tiles that
// were finished today. Mirrors the KEY in src/lib/arcade/useComets.ts.
const COMETS_KEY = "balasaur:comets";

/** Which games this browser finished today. Balasaurdle keeps its own state
 *  blob; every other game records a credited (day, game) entry in the comet
 *  blob when a run finishes. Best-effort: signed-in players' runs live
 *  server-side and may not tick here. */
function playedTodayMap(): Record<string, boolean> {
  const today = dayNumber();
  const map: Record<string, boolean> = {};
  const d = loadDaily(today);
  if (d.solved || d.gaveUp || d.guessedIds.length >= MAX_GUESSES) map["balasaurdle"] = true;
  try {
    const raw = window.localStorage.getItem(COMETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { byDay?: Record<string, Record<string, number>> } | null;
      for (const slug of Object.keys(parsed?.byDay?.[String(today)] ?? {})) map[slug] = true;
    }
  } catch {
    // storage blocked or malformed: tiles simply show no tick
  }
  return map;
}

function ArcadeHub() {
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [board, setBoard] = useState<ArcadeWeeklyBoard | null>(null);

  useEffect(() => {
    setTicks(playedTodayMap());
  }, []);

  useEffect(() => {
    let dead = false;
    arcadeWeeklyBoard({ limit: 5 })
      .then((b) => {
        if (!dead && !b.error) setBoard(b);
      })
      .catch(() => {
        // The teaser is optional; a failed read renders nothing.
      });
    return () => {
      dead = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[1100px] flex-1 px-5 py-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold tracking-tight text-text-bright">Movie Games</h1>
            <p className="mt-1 text-[13.5px] text-text-muted">
              Trivia, quotes, taglines, posters and the daily Balasaurdle. New rounds every day, no
              sign-up.
            </p>
          </div>
          <CometChip className="mt-1 shrink-0" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {ENABLED_SLUGS.map((slug) => (
            <ArcadeTile key={slug} game={GAMES[slug]} playedToday={!!ticks[slug]} />
          ))}
        </div>

        {board && board.rows.length > 0 && (
          <section className="mt-10 max-w-[560px]">
            <div className="flex items-baseline justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                This week's comets
              </h2>
              <Link
                to="/play/leaderboard"
                className="font-mono text-[11px] uppercase tracking-wider text-primary hover:text-primary/80"
              >
                Full board
              </Link>
            </div>
            <div className="mt-2 rounded-[6px] border border-border bg-panel px-3 py-2">
              {board.rows.slice(0, 5).map((row) => (
                <div
                  key={row.rank}
                  className="flex items-baseline gap-2 py-1 font-mono text-[12.5px] text-text"
                >
                  <span className="w-6 shrink-0 tabular-nums text-text-dim">{row.rank}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {row.display_name || row.username}
                  </span>
                  <span className="shrink-0 tabular-nums">{row.comets}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
