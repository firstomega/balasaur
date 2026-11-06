import { Link } from "@tanstack/react-router";
import type { SwatchKey } from "@/lib/posterSwatch";
import { swatchSurface } from "@/lib/swatchSurface";
import { tileFactLine, type TileLead } from "@/lib/tileLead";
import { tmdbImage } from "@/lib/tmdbImage";
import { cn } from "@/lib/utils";

/**
 * One tile for every ranked list and mood: a flat block in the colour of the
 * list's leading poster, the list's name in the display face, that poster
 * peeking from the bottom-right corner, and one line of fact underneath.
 *
 * The caller paints it: `swatch` comes from paintTiles() over the whole row, so
 * neighbours do not repeat a colour. Null is the neutral paper tile, same
 * layout. Width comes from the caller (a rail sets it, a grid stretches it).
 */
/** A leader's name this short sits on one line with "leads at N". */
const SHORT_LEAD = 14;

export function ListTile({
  slug,
  title,
  itemCount,
  lead,
  swatch,
  progress,
  className,
}: {
  slug: string;
  title: string;
  itemCount: number;
  lead: TileLead | null;
  swatch: SwatchKey | null;
  /** One more line under the fact: the visitor's own standing in the list
   *  (rendered client-side), or on a title page that title's place in it,
   *  "#2 of 60". */
  progress?: string | null;
  className?: string;
}) {
  return (
    <Link
      to="/best/$slug"
      params={{ slug }}
      className={cn(
        "group relative flex min-h-28 flex-col items-start overflow-hidden rounded-xl p-3 transition-transform duration-base motion-safe:hover:-translate-y-0.5 md:min-h-40 md:rounded-2xl md:p-4",
        swatchSurface(swatch),
        className,
      )}
    >
      <span className="relative z-10 max-w-[68%] md:max-w-3/5 text-balance font-display text-xl font-extrabold leading-none tracking-tight md:text-2xl">
        {title}
      </span>
      <span className="relative z-10 mt-auto max-w-[68%] md:max-w-3/5 pt-2 text-sm font-semibold leading-tight">
        {lead && lead.first && lead.score !== null ? (
          lead.title.length <= SHORT_LEAD ? (
            // A short name and its score share a line where the tile has room.
            <span className="block">
              {lead.title} <span className="whitespace-nowrap">leads at {lead.score}</span>
            </span>
          ) : (
            // A long name may clamp; "leads at N" never does, so the number is
            // always on the tile.
            <>
              <span className="line-clamp-2">{lead.title}</span>
              <span className="block">leads at {lead.score}</span>
            </>
          )
        ) : (
          <span className="block">{tileFactLine(lead, itemCount)}</span>
        )}
        {progress && <span className="mt-0.5 block font-mono tabular-nums">{progress}</span>}
      </span>
      {lead && (
        <img
          src={tmdbImage(lead.posterUrl, "w185")}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          width={92}
          height={138}
          className="absolute -bottom-4 -right-5 h-21 w-14 rotate-[24deg] rounded-md object-cover shadow-lg md:-bottom-5 md:h-30 md:w-20"
        />
      )}
    </Link>
  );
}
