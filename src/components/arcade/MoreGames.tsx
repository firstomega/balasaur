import { Link } from "@tanstack/react-router";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";
import type { GameSlug } from "@/lib/arcade/types";
import { cn } from "@/lib/utils";
import { ArcadeTile } from "./ArcadeTile";

/** Every other game as a rail of tiles, under a plain label. Game pages show
 *  it below the board with a link to the hub; the end screen shows it
 *  without one. One component, so the eleven pages cannot drift apart. */
export function MoreGames({
  exclude,
  allLink = true,
  className,
}: {
  exclude: GameSlug;
  allLink?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("mt-10", className)}>
      <h2 className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright">
        More games
      </h2>
      <ScrollRail className="mt-3" label="More games">
        {ENABLED_SLUGS.filter((slug) => slug !== exclude).map((slug) => (
          <ArcadeTile key={slug} game={GAMES[slug]} className="w-44 shrink-0" />
        ))}
      </ScrollRail>
      {allLink && (
        <Link
          to="/play"
          className="mt-3 inline-block text-sm font-semibold text-text-bright underline underline-offset-2 hover:decoration-2"
        >
          All games
        </Link>
      )}
    </section>
  );
}
