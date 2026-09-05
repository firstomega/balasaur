import { useEffect, useState, type CSSProperties } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { TopBar } from "@/components/balasaur/TopBar";
import { ArcadeTile } from "@/components/arcade/ArcadeTile";
import { CometChip } from "@/components/arcade/CometChip";
import { GameMark } from "@/components/arcade/GameMark";
import { NextCountdown } from "@/components/arcade/NextCountdown";
import { WeeklyBoardList } from "@/components/arcade/WeeklyBoard";
import { GAMES, ENABLED_SLUGS, HUB_SECTIONS, hueVars } from "@/lib/arcade/games";
import { STATS_EVENT, bestLiveStreak, liveStreak, readAllStats } from "@/lib/arcade/stats";
import type { GameSlug } from "@/lib/arcade/types";
import { arcadeWeeklyBoard, type ArcadeWeeklyBoard } from "@/lib/arcade";
import { getYesterday } from "@/lib/arcade.functions";
import { MAX_GUESSES, dayNumber, loadDaily } from "@/lib/daily";
import { useMyProfile } from "@/hooks/useMyProfile";
import { SITE_ORIGIN, buildMeta, cacheSsrResponse, canonicalLink, jsonLdScript } from "@/lib/seo";
import { itemListJsonLd } from "@/lib/jsonld";

// The arcade hub at /play. A hero band sells the nightly ritual (at lg its
// right half is a constellation of every game's mark in its hue, drifting),
// then three sections from the registry: Tonight (hero tiles fanning
// yesterday's posters), Quick rounds, and Pair and order. Server-rendered so a crawler
// sees every game's name and hook. Everything personal (comets, the streak,
// the clock, played chips, the unplayed-first sort, the weekly board)
// renders after mount, per the CDN cache rule, in rows whose height is
// reserved so nothing shifts. The one exception is the weekly board at the
// bottom: it renders nothing at all until it has rows, because a reserved
// gray block that says "did not load" is worse than a late arrival below
// the fold.
//
// This is an INDEX route ("/play/"), the /night pattern: the games live at
// /play/<slug> as path siblings, so /play stays a 200 for every
// "balasaur.com/play" link already in the wild.

const TONIGHT = HUB_SECTIONS[0].slugs;

export const Route = createFileRoute("/play/")({
  loader: async () => {
    // Same short cache window as the games: the tiles name daily games that
    // flip at midnight UTC.
    await cacheSsrResponse(3600, 300);
    // Yesterday's answers are public once the day is over, so the hero
    // tiles can wear real posters. Any game that has no pin yet fans nothing.
    const settled = await Promise.allSettled(
      TONIGHT.map((slug) => getYesterday({ data: { game: slug } })),
    );
    const posters: Partial<Record<GameSlug, string[]>> = {};
    settled.forEach((r, i) => {
      if (r.status !== "fulfilled" || !r.value) return;
      const urls = r.value.entries
        .map((e) => e.media?.posterUrl ?? "")
        .filter(Boolean)
        .slice(0, 3);
      if (urls.length > 0) posters[TONIGHT[i]] = urls;
    });
    return { posters };
  },
  head: () => {
    const url = `${SITE_ORIGIN}/play`;
    return {
      meta: buildMeta({
        title: "Movie Games: Eleven Daily Games, New at Midnight",
        description:
          "Eleven movie games drawn from 76,000 titles and the Balasaur Score. Same board for everyone, new at midnight. No sign-up.",
        url,
        image: `${SITE_ORIGIN}/og-play.png`,
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
  const { posters } = Route.useLoaderData();
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
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[1100px] flex-1 px-5 pb-20 pt-5">
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
            <section key={section.title} className="mt-8" aria-label={section.title}>
              <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
                {section.title}
              </h2>
              <div
                className={
                  hero
                    ? "mt-3 grid grid-cols-1 gap-3 md:grid-cols-3"
                    : "mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4"
                }
              >
                {ordered.map((slug) => (
                  <TileSlot
                    key={slug}
                    slug={slug}
                    hero={hero}
                    mounted={mounted}
                    playedLine={personal.played[slug] ?? null}
                    streak={personal.streaks[slug]}
                    posters={posters[slug]}
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

/** One tile, with the Screening's doors clock laid over its footer row
 *  after mount. The set flips at 00:00 UTC, shown in the viewer's clock so
 *  the copy never names an hour in a timezone. */
function TileSlot({
  slug,
  hero,
  mounted,
  playedLine,
  streak,
  posters,
}: {
  slug: GameSlug;
  hero: boolean;
  mounted: boolean;
  playedLine: string | null;
  streak?: number;
  posters?: string[];
}) {
  const tile = (
    <ArcadeTile
      game={GAMES[slug]}
      size={hero ? "hero" : "regular"}
      playedLine={playedLine}
      streak={streak}
      posters={posters}
      className="h-full"
    />
  );
  if (slug !== "screening") return tile;
  return (
    <div className="relative">
      {tile}
      {mounted && (
        <NextCountdown
          label="Doors close in"
          format="short"
          className="pointer-events-none absolute bottom-5 right-5 rounded-full bg-black/35 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-white/85"
        />
      )}
    </div>
  );
}

const HERO_GLOW: CSSProperties = {
  backgroundImage:
    "radial-gradient(60% 80% at 8% 0%, color-mix(in oklab, var(--hue-blue) 26%, transparent), transparent 70%), radial-gradient(45% 70% at 60% 100%, color-mix(in oklab, var(--hue-ruby) 18%, transparent), transparent 70%), radial-gradient(40% 60% at 100% 10%, color-mix(in oklab, var(--hue-ice) 16%, transparent), transparent 70%)",
};

/** Every game's mark scattered over the hero's right half at lg. Positions
 *  are percentages of that half; sizes 48 to 72; opacity 70 to 90 percent.
 *  Each drifts on its own period so the cluster never moves as one. Fixed
 *  numbers, so the server and the client draw the same sky. */
const CONSTELLATION: {
  slug: GameSlug;
  x: number;
  y: number;
  size: number;
  opacity: number;
  period: number;
  delay: number;
}[] = [
  { slug: "balasaurdle", x: 6, y: 10, size: 64, opacity: 0.9, period: 7.5, delay: 0 },
  { slug: "poster-reveal", x: 32, y: 4, size: 52, opacity: 0.75, period: 8.5, delay: -2 },
  { slug: "screening", x: 56, y: 12, size: 72, opacity: 0.9, period: 9, delay: -4 },
  { slug: "quote-match", x: 84, y: 6, size: 48, opacity: 0.7, period: 7, delay: -1 },
  { slug: "taglines", x: 18, y: 40, size: 56, opacity: 0.8, period: 8, delay: -3 },
  { slug: "casting-call", x: 46, y: 38, size: 48, opacity: 0.85, period: 7.8, delay: -5 },
  { slug: "link-up", x: 72, y: 44, size: 60, opacity: 0.8, period: 8.8, delay: -2.5 },
  { slug: "timeline", x: 88, y: 60, size: 48, opacity: 0.7, period: 7.2, delay: -6 },
  { slug: "emoji", x: 8, y: 72, size: 48, opacity: 0.85, period: 8.2, delay: -1.5 },
  { slug: "speed-sort", x: 36, y: 70, size: 72, opacity: 0.9, period: 9.4, delay: -3.5 },
  { slug: "sequel-or-fake", x: 64, y: 78, size: 56, opacity: 0.75, period: 7.6, delay: -4.5 },
];

// The drift lives here rather than in styles.css so the hub owns it. Under
// prefers-reduced-motion the marks hold still (the global rule also clamps
// every animation to nothing, this makes it explicit).
const FLOAT_CSS = `@keyframes play-hero-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-10px,0)}}
.play-hero-float{animation:play-hero-float var(--period) ease-in-out infinite;animation-delay:var(--delay)}
@media (prefers-reduced-motion:reduce){.play-hero-float{animation:none}}`;

function Hero({ mounted, best }: { mounted: boolean; best: Personal["best"] }) {
  return (
    <section
      aria-label="Movie games"
      className="relative overflow-hidden rounded-[6px] border border-white/10 bg-[#0b0d10] px-5 py-7 text-white sm:px-8 sm:py-9 lg:px-10 lg:py-12"
    >
      <style>{FLOAT_CSS}</style>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={HERO_GLOW} />
      {/* the landing hero's grid texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* The constellation: every game's mark, right half, lg only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 lg:block"
      >
        {CONSTELLATION.map((m) => (
          <span
            key={m.slug}
            style={
              {
                ...hueVars(m.slug),
                left: `${m.x}%`,
                top: `${m.y}%`,
                opacity: m.opacity,
                "--period": `${m.period}s`,
                "--delay": `${m.delay}s`,
                filter: "drop-shadow(0 0 18px color-mix(in oklab, var(--game) 45%, transparent))",
              } as CSSProperties
            }
            className="play-hero-float absolute text-[var(--game)]"
          >
            <GameMark slug={m.slug} size={m.size} />
          </span>
        ))}
      </div>

      <div className="relative lg:w-1/2">
        <h1 className="max-w-[12ch] text-[40px] font-black leading-[0.98] tracking-[-0.02em] text-white lg:text-[64px]">
          Eleven movie games. New at midnight.
        </h1>
        <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-white/70 lg:text-[17px]">
          Same board for everyone. Share without spoiling.
        </p>

        {/* Personal row: reserved height, filled after mount. */}
        <div className="mt-5 flex min-h-[32px] flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-white/70">
          {mounted && (
            <>
              <CometChip />
              {best && (
                <span className="inline-flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-[var(--hue-orange)]" aria-hidden="true" />
                  <span className="font-mono tabular-nums text-white">Streak {best.streak}</span>
                  {best.keptToday ? (
                    <span>Kept for today</span>
                  ) : (
                    <span>
                      Play{" "}
                      <Link
                        to={GAMES[best.slug].path}
                        className="text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
                      >
                        {GAMES[best.slug].name}
                      </Link>{" "}
                      to keep it
                    </span>
                  )}
                </span>
              )}
              <NextCountdown label="Next games in" format="clock" />
            </>
          )}
        </div>
      </div>
    </section>
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
    <section className="mt-10 max-w-[560px]" aria-label="This week's comets">
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
      <WeeklyBoardList
        rows={rows}
        me={myName}
        limit={5}
        className="mt-2 rounded-[6px] border border-border bg-panel px-3 py-1"
      />
      {!myName && (
        <p className="mt-2 text-[12.5px] text-text-dim">Sign in and your comets go on the board.</p>
      )}
    </section>
  );
}
