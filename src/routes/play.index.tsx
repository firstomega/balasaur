import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import { CometChip } from "@/components/arcade/CometChip";
import { NextCountdown } from "@/components/arcade/NextCountdown";
import { WeeklyBoardList } from "@/components/arcade/WeeklyBoard";
import { GAMES, ENABLED_SLUGS, HUB_SECTIONS } from "@/lib/arcade/games";
import { STATS_EVENT, bestLiveStreak, liveStreak, readAllStats } from "@/lib/arcade/stats";
import type { GameSlug } from "@/lib/arcade/types";
import { arcadeWeeklyBoard, type ArcadeWeeklyBoard } from "@/lib/arcade";
import { getYesterday } from "@/lib/arcade.functions";
import { MAX_GUESSES, dayNumber, loadDaily } from "@/lib/daily";
import { useMyProfile } from "@/hooks/useMyProfile";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { itemListJsonLd } from "@/lib/jsonld";

// The arcade hub at /play: a heading that counts the games, the clock to
// the next boards, then the registry's three sections as walls of flat tiles,
// each painted in its game's own hue. Server-rendered so a crawler sees every
// game's name and hook. Everything personal (comets, the streak, the clock,
// played chips, the unplayed-first sort, the weekly board) renders after
// mount, per the CDN cache rule, in space that is reserved so nothing
// shifts. The one exception is the weekly board at the bottom: it renders
// nothing at all until it has rows, because a reserved gray block that says
// "did not load" is worse than a late arrival below the fold.
//
// This is an INDEX route ("/play/"), the /night pattern: the games live at
// /play/<slug> as path siblings, so /play stays a 200 for every
// "balasaur.com/play" link already in the wild.

const TONIGHT = HUB_SECTIONS[0].slugs;

/** The title promises daily games, so it counts only the ones that are. */
const DAILY_COUNT = ENABLED_SLUGS.filter((slug) => GAMES[slug].daily).length;

export const Route = createFileRoute("/play/")({
  loader: async () => {
    // Same short cache window as the games: the tiles name daily games that
    // flip at midnight UTC.
    await cacheSsrResponse(3600, 300);
    // Yesterday's answers are public once the day is over. A Tonight tile
    // shows one only when its round had a single answer, so the poster on
    // the tile and the line naming it are the same title.
    const settled = await Promise.allSettled(
      TONIGHT.map((slug) => getYesterday({ data: { game: slug } })),
    );
    const yesterday: Partial<Record<GameSlug, { title: string; posterUrl: string }>> = {};
    settled.forEach((r, i) => {
      if (r.status !== "fulfilled" || !r.value || r.value.entries.length !== 1) return;
      const media = r.value.entries[0].media;
      if (media?.posterUrl && media.title) {
        yesterday[TONIGHT[i]] = { title: media.title, posterUrl: media.posterUrl };
      }
    });
    return { yesterday };
  },
  head: () => {
    const url = `${SITE_ORIGIN}/play`;
    return {
      meta: buildMeta({
        title: `Movie Games: ${DAILY_COUNT} Daily Games, New at Midnight`,
        // No catalog count here. The games pick from a popular pool
        // (ARCADE_POOL_MIN_VOTES in arcade.functions.ts), not the whole
        // catalog, so "drawn from 117,000 titles" was not true.
        description: `${ENABLED_SLUGS.length} movie and TV games, from naming a title in six clues to putting five movies in release order. Same board for everyone, new at midnight. No sign-up.`,
        url,
        image: `${SITE_ORIGIN}/og-play.jpg`,
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

// The guest comet blob's key and shape, read here only for what each game
// paid today. Mirrors the KEY in src/lib/arcade/useComets.ts.
const COMETS_KEY = "balasaur:comets";

interface Personal {
  /** Per slug: what happened today, or null when not played yet. */
  played: Partial<Record<GameSlug, string>>;
  /** Per slug: the streak still alive, from 2 up. */
  streaks: Partial<Record<GameSlug, number>>;
  /** The longest streak alive across every game, for the hero. */
  best: { slug: GameSlug; streak: number; keptToday: boolean } | null;
}

function cometsToday(today: number): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(COMETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { byDay?: Record<string, Record<string, number>> } | null;
    return parsed?.byDay?.[String(today)] ?? {};
  } catch {
    return {};
  }
}

/** What this browser did today and which streaks are alive. Balasaurdle
 *  keeps its own state blob; every other game records through stats.ts.
 *  Best-effort: signed-in runs live server-side and may not show here. */
function readPersonal(): Personal {
  const today = dayNumber();
  const played: Personal["played"] = {};
  const streaks: Personal["streaks"] = {};

  const d = loadDaily(today);
  const finished = d.solved || d.gaveUp || d.guessedIds.length >= MAX_GUESSES;
  if (d.solved) played.balasaurdle = `Solved in ${d.guessedIds.length}`;
  else if (finished) played.balasaurdle = "Not solved";
  if (d.streak >= 2) streaks.balasaurdle = d.streak;

  const blob = readAllStats();
  const paid = cometsToday(today);
  for (const slug of ENABLED_SLUGS) {
    if (slug === "balasaurdle") continue;
    const s = blob[slug];
    const done = (s && s.lastDay === today) || paid[slug] !== undefined;
    if (done) {
      const n = paid[slug];
      played[slug] = n && n > 0 ? `${n} ${n === 1 ? "comet" : "comets"}` : "Played";
    }
    const streak = s ? liveStreak(s, today) : 0;
    if (streak >= 2) streaks[slug] = streak;
  }

  let best = bestLiveStreak(blob, today);
  if (
    d.streak > 0 &&
    (!best || d.streak > best.streak || (d.streak === best.streak && finished && !best.keptToday))
  ) {
    best = { slug: "balasaurdle", streak: d.streak, keptToday: finished };
  }
  return { played, streaks, best };
}

const EMPTY: Personal = { played: {}, streaks: {}, best: null };

function ArcadeHub() {
  const { yesterday } = Route.useLoaderData();
  const [personal, setPersonal] = useState<Personal>(EMPTY);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPersonal(readPersonal());
    setMounted(true);
    const refresh = () => setPersonal(readPersonal());
    window.addEventListener(STATS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STATS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main
        id="main"
        className="mx-auto w-full max-w-content flex-1 px-4 pb-20 pt-6 md:px-6 md:pt-10"
      >
        <Hero mounted={mounted} best={personal.best} />

        {HUB_SECTIONS.map((section, i) => {
          const hero = i === 0;
          const slugs = section.slugs.filter((s) => GAMES[s].enabled);
          // Unplayed first, otherwise registry order. Stable, so the
          // server order survives until something was played.
          const ordered = mounted
            ? [...slugs].sort((a, b) => Number(!!personal.played[a]) - Number(!!personal.played[b]))
            : slugs;
          return (
            <section key={section.title} className="mt-10 md:mt-14" aria-label={section.title}>
              <h2 className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright md:text-3xl">
                {section.title}
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2.5 md:mt-4 md:grid-cols-4 md:gap-3.5">
                {ordered.map((slug) => (
                  <ArcadeTile
                    key={slug}
                    game={GAMES[slug]}
                    size={hero ? "hero" : "regular"}
                    playedLine={personal.played[slug] ?? null}
                    streak={personal.streaks[slug]}
                    yesterday={hero ? yesterday[slug] : null}
                    className={hero && slug === "balasaurdle" ? "col-span-2" : undefined}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <WeeklyComets />
      </main>
    </div>
  );
}

/** The heading counts the games from the registry, so it cannot drift from
 *  the walls below it. The clock to the next boards sits in a black block
 *  beside it on desktop and under it on a phone; its digits arrive after
 *  mount in reserved space. */
function Hero({ mounted, best }: { mounted: boolean; best: Personal["best"] }) {
  return (
    <header className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end md:gap-10">
      <div>
        <h1 className="text-balance font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-text-bright md:text-[64px]">
          {ENABLED_SLUGS.length} movie games, new at midnight
        </h1>
        <p className="mt-3 text-lg text-text-muted">Each board is the same for every player.</p>

        {/* Personal row: reserved height, filled after mount. */}
        <div className="mt-2 flex min-h-8 flex-wrap items-center gap-x-5 gap-y-2 text-base text-text-muted">
          {mounted && (
            <>
              <CometChip />
              {best && (
                <span className="inline-flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-warn" aria-hidden="true" />
                  <span className="font-semibold tabular-nums text-text-bright">
                    Streak {best.streak}
                  </span>
                  {best.keptToday ? (
                    <span>Kept for today</span>
                  ) : (
                    <span>
                      Play{" "}
                      <Link
                        to={GAMES[best.slug].path}
                        className="font-semibold text-text-bright underline underline-offset-2"
                      >
                        {GAMES[best.slug].name}
                      </Link>{" "}
                      to keep it
                    </span>
                  )}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-swatch-noir px-5 py-4 text-swatch-noir-ink md:min-w-72 md:px-6 md:py-5">
        <p className="text-sm font-semibold">Next games in</p>
        <div className="mt-1 min-h-10">
          <NextCountdown
            label={null}
            format="clock"
            timeClassName="font-display text-4xl font-extrabold leading-none tabular-nums text-swatch-gold"
          />
        </div>
      </div>
    </header>
  );
}

/** This week's board, top five with the viewer pinned. Nothing renders
 *  until the rows are here: no skeleton, no "did not load", no empty-board
 *  line. A signed-out first visit ends at the last tile. */
function WeeklyComets() {
  const { data: me } = useMyProfile();
  const [board, setBoard] = useState<ArcadeWeeklyBoard | null>(null);

  useEffect(() => {
    let dead = false;
    arcadeWeeklyBoard({ limit: 50 })
      .then((b) => {
        if (!dead && !b.error) setBoard(b);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);

  const rows = board?.rows ?? [];
  if (rows.length === 0) return null;
  const myName = me?.username ?? null;

  return (
    <section className="mt-10 max-w-xl md:mt-14" aria-label="This week's comets">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright md:text-3xl">
          This week's comets
        </h2>
        <Link
          to="/play/leaderboard"
          className="text-sm font-semibold text-text-bright underline underline-offset-2"
        >
          Full board
        </Link>
      </div>
      <WeeklyBoardList
        rows={rows}
        me={myName}
        limit={5}
        className="mt-3 rounded-xl bg-panel px-3 py-1"
      />
      {!myName && (
        <p className="mt-2 text-sm text-text-dim">Sign in and your comets go on the board.</p>
      )}
    </section>
  );
}
