import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Flame } from "lucide-react";
import { hueVars, isNewGame } from "@/lib/arcade/games";
import type { GameDef } from "@/lib/arcade/types";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";
import { GameMark } from "./GameMark";

// One game as a flat tile in its own hue, the way a list tile is painted in
// its leader's colour: the name in the display face, the hook (a plain line
// of what the game is), and a footer with the minutes and, after mount, what
// this browser did today ("Solved in 3") or the streak it is protecting. The
// text is the hue's ink, which src/lib/palette.test.ts holds at 4.5:1 on
// every hue. The game's mark sits large in the corner at low weight. A hero
// tile can carry yesterday's single answer: its poster peeks from the corner,
// tilted, and one line names it, so the poster on the tile is never a
// mystery. A NEW ribbon comes only from the registry's isNewGame, computed
// after mount so cached HTML never disagrees with the clock. The whole tile
// is the link.

const PILL =
  "inline-flex items-center gap-1 rounded-full bg-swatch-noir px-2 py-0.5 text-xs font-semibold tabular-nums text-swatch-noir-ink";

export function ArcadeTile({
  game,
  size = "regular",
  playedLine,
  streak,
  yesterday,
  className,
}: {
  game: GameDef;
  /** Hero tiles are taller, set the name larger and can carry yesterday. */
  size?: "hero" | "regular";
  /** After mount: today's result, e.g. "Solved in 3", "4 of 5". */
  playedLine?: string | null;
  /** After mount: the current streak; shown from 2 up when nothing was
   *  played yet today. */
  streak?: number;
  /** Hero tiles only: yesterday's answer, when the round had exactly one. */
  yesterday?: { title: string; posterUrl: string } | null;
  className?: string;
}) {
  const hero = size === "hero";
  const [isNew, setIsNew] = useState(false);
  useEffect(() => {
    setIsNew(isNewGame(game));
  }, [game]);

  const answer = hero && yesterday?.posterUrl ? yesterday : null;
  const streakLine = !playedLine && (streak ?? 0) >= 2 ? `Streak ${streak}` : null;

  return (
    <Link
      to={game.path}
      style={hueVars(game.slug)}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-[var(--game)] p-4 text-[var(--game-ink)] transition-transform duration-base motion-safe:hover:-translate-y-0.5 md:rounded-2xl",
        hero ? "min-h-48 md:min-h-64 md:p-5" : "min-h-44",
        className,
      )}
    >
      {isNew && (
        <span
          aria-label="New game"
          className="absolute -right-9 top-4 w-32 rotate-45 bg-swatch-noir py-0.5 text-center font-mono text-xs font-semibold uppercase tracking-widest text-swatch-noir-ink"
        >
          New
        </span>
      )}

      {!answer && (
        <GameMark
          slug={game.slug}
          size={hero ? 132 : 84}
          className="pointer-events-none absolute -bottom-4 -right-4 opacity-15"
        />
      )}

      <span
        className={cn(
          "relative block text-balance font-display font-extrabold leading-none tracking-tight",
          hero ? "text-3xl md:text-4xl" : "text-2xl",
        )}
      >
        {game.name}
      </span>
      <p className="relative mt-1.5 text-base font-medium leading-snug">{game.hook}</p>

      <div className={cn("relative mt-auto pt-3", answer && "pr-16 md:pr-24")}>
        <div className="flex min-h-6 flex-wrap items-center gap-1.5">
          <span className={PILL}>{game.minutes}</span>
          {playedLine && (
            <span className={PILL}>
              <Check className="h-3 w-3" aria-hidden="true" />
              {playedLine}
            </span>
          )}
          {streakLine && (
            <span className={PILL}>
              <Flame className="h-3 w-3" aria-hidden="true" />
              {streakLine}
            </span>
          )}
        </div>
        {answer && (
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-tight">
            Yesterday: {answer.title}
          </p>
        )}
      </div>

      {answer && (
        <img
          src={tmdbImage(answer.posterUrl, "w185")}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          width={92}
          height={138}
          className="pointer-events-none absolute -bottom-3 -right-3 h-[84px] w-[56px] rotate-[18deg] rounded-md object-cover shadow-lg md:-bottom-4 md:h-[138px] md:w-[92px]"
        />
      )}
    </Link>
  );
}
