import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Flame } from "lucide-react";
import { hueVars, isNewGame, tileHook } from "@/lib/arcade/games";
import type { ArcadeHue, GameDef } from "@/lib/arcade/types";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";
import { GameMark } from "./GameMark";

// One hub tile, the game's face: a full-bleed hue ground with a dot
// texture, the mark large, the name in the display weight under it, the
// hook, and a footer with the minutes pill and, after mount, either what
// you did today ("Solved in 3") or the streak you are protecting. The name
// sits at a fixed distance under the mark so every tile in a row shares one
// baseline; the hook reserves two lines and may grow to three, so a long
// hook is shown whole rather than cut mid-sentence. Regular tiles use the
// short form from tileHook, which fits two lines at the narrowest tile
// (129px of text at 390); hero tiles have room for the registry hook. A NEW
// ribbon comes only from the registry's isNewGame, computed after mount so
// cached HTML never disagrees with the clock. Hero tiles fan three real
// posters from yesterday's round, or a large faint mark when there is no
// round to show. The whole tile is the link.

// Yellows and oranges lose their identity when darkened: 55 percent gold is
// mustard, 55 percent lime is olive. The warm hues keep more of themselves
// in the ground; the cool ones can afford to sit deeper. Gold and orange
// need one more step, because darkened toward neutral black they both land
// on brown: gold is mixed into a deep amber instead, which keeps the ground
// yellow-amber, and orange is mixed from a red-orange source into a deep
// red, which pulls it away from gold. White text stays at or above 4.5:1
// across the name and hook zone (the 30 to 50 percent stretch of the
// gradient) on every hue; the numbers here were checked in oklch.
const WARM: ReadonlySet<ArcadeHue> = new Set(["gold", "sun", "lime", "orange"]);

const GROUND: Partial<
  Record<ArcadeHue, { source?: string; base: string; hi: number; lo: number }>
> = {
  gold: { base: "#2a1600", hi: 66, lo: 30 },
  orange: { source: "oklch(0.70 0.19 44)", base: "#2a0a00", hi: 70, lo: 30 },
};

function ground(hue: ArcadeHue): CSSProperties {
  const warm = WARM.has(hue);
  const tint = GROUND[hue];
  const source = tint?.source ?? "var(--game, var(--primary))";
  const base = tint?.base ?? "#0b0d10";
  const hi = tint?.hi ?? (warm ? 70 : 55);
  const lo = tint?.lo ?? (warm ? 30 : 22);
  return {
    backgroundImage: `radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px), linear-gradient(165deg, color-mix(in oklch, ${source} ${hi}%, ${base}), color-mix(in oklch, ${source} ${lo}%, ${base}))`,
    backgroundSize: "14px 14px, 100% 100%",
  };
}

export function ArcadeTile({
  game,
  size = "regular",
  playedLine,
  streak,
  posters,
  className,
}: {
  game: GameDef;
  /** Hero tiles are full width at 390 and carry the poster fan. */
  size?: "hero" | "regular";
  /** After mount: today's result, e.g. "Solved in 3", "4 of 5". */
  playedLine?: string | null;
  /** After mount: the current streak; shown from 2 up when nothing was
   *  played yet today. */
  streak?: number;
  /** Poster URLs from yesterday's round, hero tiles only. Up to three. */
  posters?: string[];
  className?: string;
}) {
  const hero = size === "hero";
  const [isNew, setIsNew] = useState(false);
  useEffect(() => {
    setIsNew(isNewGame(game));
  }, [game]);

  const fan = hero ? (posters ?? []).filter(Boolean).slice(0, 3) : [];
  const streakLine = !playedLine && (streak ?? 0) >= 2 ? `Streak ${streak}` : null;

  return (
    <Link
      to={game.path}
      style={{ ...hueVars(game.slug), ...ground(game.hue) }}
      className={cn(
        "group @container relative flex flex-col overflow-hidden rounded-[6px] border border-white/10 text-white transition-[transform,box-shadow] duration-200",
        "hover:-translate-y-0.5 hover:[box-shadow:0_10px_30px_-10px_var(--game,var(--primary))] motion-reduce:hover:translate-y-0 active:translate-y-0",
        hero ? "min-h-[232px] p-5 sm:min-h-[260px]" : "min-h-[176px] p-4",
        className,
      )}
    >
      {isNew && (
        <span
          aria-label="New game"
          className="absolute -right-9 top-4 w-32 rotate-45 bg-[var(--hue-sun,#fde047)] py-0.5 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0b0d10] shadow-md"
        >
          New
        </span>
      )}

      {hero && fan.length === 0 && (
        <GameMark
          slug={game.slug}
          size={160}
          className="pointer-events-none absolute -bottom-6 -right-4 text-[var(--game,var(--primary))] opacity-[0.12]"
        />
      )}

      <GameMark
        slug={game.slug}
        size={hero ? 72 : 44}
        className="relative shrink-0 text-[var(--game,var(--primary))] drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] transition-transform duration-200 group-hover:scale-105 motion-reduce:group-hover:scale-100"
      />

      <div className={cn("relative min-w-0", hero ? "pt-5" : "pt-4", fan.length > 0 && "pr-28")}>
        <span
          className={cn(
            "block text-balance font-black leading-[1.02] tracking-[-0.02em] text-white",
            hero ? "text-[26px] sm:text-[30px]" : "text-[17px] @max-[199px]:text-[15px]",
          )}
        >
          {game.name}
        </span>
        <p
          className={cn(
            "mt-1.5 line-clamp-3 text-white/85",
            hero
              ? "min-h-[41px] text-[14.5px] leading-[1.4]"
              : "min-h-[35px] text-[13px] leading-[1.35]",
          )}
        >
          {hero ? game.hook : tileHook(game)}
        </p>
      </div>

      <div className="relative mt-auto flex min-h-[36px] items-center gap-2 pt-3">
        <span className="rounded-full border border-white/20 bg-black/25 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-white/85">
          {game.minutes}
        </span>
        {playedLine && (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-white">
            <Check className="h-3 w-3 text-rating" aria-hidden="true" />
            {playedLine}
          </span>
        )}
        {streakLine && (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-white">
            <Flame className="h-3 w-3 text-media-movie" aria-hidden="true" />
            {streakLine}
          </span>
        )}
      </div>

      {fan.length > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-3 right-4 flex items-end"
        >
          {fan.map((url, i) => (
            <img
              key={i}
              src={tmdbImage(url, "w185")}
              alt=""
              loading="lazy"
              width={56}
              height={84}
              className={cn(
                "h-[84px] w-[56px] rounded-[4px] border border-white/20 object-cover shadow-lg",
                i === 0 && "rotate-[-10deg] translate-y-1",
                i === 1 && "-mx-3 z-10 -translate-y-1",
                i === 2 && "rotate-[10deg] translate-y-1",
              )}
            />
          ))}
        </div>
      )}
    </Link>
  );
}
