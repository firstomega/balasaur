import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import type { GameDef } from "@/lib/arcade/types";

// One hub tile: name, what you do, a Daily tag when the game is one shared
// round a day, and after mount a single personal line when there is one
// ("BEST 14", "STREAK 6", a check once today's round is played). No
// thumbnails, no play counts. The whole tile is the link.

export function ArcadeTile({
  game,
  personalLine,
  playedToday = false,
}: {
  game: GameDef;
  /** One mount-only line, e.g. "Best 14" or "Streak 6". Omit when zero;
   *  the tile renders nothing rather than an empty stat. */
  personalLine?: string | null;
  /** True once today's round of a daily game is finished. */
  playedToday?: boolean;
}) {
  const line = personalLine ?? (playedToday ? "Played today" : null);

  return (
    <Link
      to={game.path}
      className="group flex flex-col rounded-[6px] border border-border bg-panel p-3.5 transition-colors hover:border-primary"
    >
      {/* No per-tile Daily badge: every arcade game is daily, and a badge on
          all eleven tiles distinguishes nothing. The hub dek says it once. */}
      <span className="text-[14.5px] font-semibold leading-tight text-text-bright group-hover:text-primary">
        {game.name}
      </span>
      <p className="mt-1 text-[12.5px] leading-snug text-text-muted">{game.tagline}</p>
      {line && (
        <p className="mt-2 flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
          {playedToday && <Check className="h-3 w-3 text-rating" aria-hidden="true" />}
          {line}
        </p>
      )}
    </Link>
  );
}
