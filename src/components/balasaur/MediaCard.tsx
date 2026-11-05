import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bookmark, Check, MoreHorizontal, Trophy } from "lucide-react";
import type { MediaItem } from "@/types/media";
import { cn } from "@/lib/utils";
import { displayYear } from "@/lib/mediaFormat";
import { mediaSlug } from "@/lib/slug";
import { trustedScore } from "@/lib/trust";
import { swatchSurface } from "@/lib/swatchSurface";
import { ScoreBadge } from "./ScoreBadge";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type QuickAction = "want" | "watched" | "notInterested";

/**
 * A title as a Colour Shelf card: the poster on a card painted in the poster's
 * own swatch, the title and year in that swatch's ink, and the score sticker on
 * the poster. A title whose poster has no swatch yet gets the same card on the
 * neutral paper surface.
 *
 * Personal state (Watchlist, Seen, Hide) arrives through props that callers
 * fill from client-only state, so the server HTML is the same for everyone and
 * the state appears after mount.
 */
export function MediaCard({
  item,
  onQuickAction,
  saved = false,
  watched = false,
  rejected = false,
  posterOverlay,
  imgSizes,
  eager = false,
  showVotes = false,
}: {
  item: MediaItem;
  /** When provided, the card carries one "more" control holding Watchlist,
   *  Seen and Hide. */
  onQuickAction?: (item: MediaItem, action: QuickAction) => void;
  /** Current watchlist state. */
  saved?: boolean;
  /** Current seen state. */
  watched?: boolean;
  /** Current hidden state. */
  rejected?: boolean;
  /** Rendered bottom-left on the poster (rail rank numerals, date chips, …). */
  posterOverlay?: React.ReactNode;
  /** Override the responsive `sizes` hint (rails render at a fixed width). */
  imgSizes?: string;
  /** Load the poster eagerly with high priority, for above-the-fold cards
   *  (the LCP element on grid-heavy pages). */
  eager?: boolean;
  /** Show the rating count under the score sticker. */
  showVotes?: boolean;
}) {
  const rawId = item.id.replace(/^(movie|tv)-/, "");
  // An id-less item must not render a link: an empty route param leaves the
  // raw "/tv/$id" pattern in the href, which Googlebot crawled and got a
  // server error from.
  const isLinkable = (item.mediaType === "movie" || item.mediaType === "tv") && /^\d+$/.test(rawId);
  const slug = mediaSlug(rawId, item.title);
  // A score from one source or a handful of votes is not shown at all.
  const score = trustedScore(item);
  const to = item.mediaType === "movie" ? "/movie/$id" : "/tv/$id";

  const seasons = item.mediaType === "tv" ? (item.seasonCount ?? item.seasons?.length ?? 0) : 0;
  const yearLine =
    displayYear(item) + (seasons > 0 ? ` · ${seasons} Season${seasons === 1 ? "" : "s"}` : "");

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-xl p-1.5 pb-2 transition-transform duration-base motion-safe:hover:-translate-y-0.5 md:p-2 md:pb-2.5",
        swatchSurface(item.swatch),
      )}
    >
      <div className="relative">
        {isLinkable ? (
          <Link to={to} params={{ id: slug }} className="block rounded-lg">
            <CardArt item={item} imgSizes={imgSizes} eager={eager} />
          </Link>
        ) : (
          <CardArt item={item} imgSizes={imgSizes} eager={eager} />
        )}

        {/* One score format everywhere: the sticker or nothing. */}
        {typeof score === "number" && (
          <div className="pointer-events-none absolute left-1 top-1 flex flex-col items-start gap-1">
            <ScoreBadge score={score} className="-rotate-6" />
            {showVotes && item.voteCount != null && (
              <span className="rounded-sm bg-background px-1 py-0.5 font-mono text-xs tabular-nums text-text-bright">
                {Intl.NumberFormat("en-US", { notation: "compact" }).format(item.voteCount)} ratings
              </span>
            )}
          </div>
        )}

        {onQuickAction && (
          <CardMore
            item={item}
            saved={saved}
            watched={watched}
            rejected={rejected}
            onQuickAction={onQuickAction}
          />
        )}

        {/* The awards pipeline earns a pixel: winners get a small trophy. */}
        {item.awardWinner && (
          <span
            title="Major award winner"
            className="absolute bottom-1 right-1 rounded-sm bg-background p-1"
          >
            <Trophy className="h-3 w-3 text-rating" aria-label="Award winner" />
          </span>
        )}
        {posterOverlay ? (
          <div className="pointer-events-none absolute bottom-1.5 left-1.5">{posterOverlay}</div>
        ) : (
          (watched || saved) && (
            <span className="pointer-events-none absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-text-bright py-0.5 pl-1 pr-2 text-xs font-bold text-background">
              {watched ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Bookmark className="h-3 w-3" aria-hidden="true" />
              )}
              {watched ? "Seen" : "Watchlist"}
            </span>
          )
        )}
      </div>

      <div className="mt-2 min-w-0 px-0.5">
        {isLinkable ? (
          <Link to={to} params={{ id: slug }} className="block">
            <h3 className="line-clamp-2 text-base font-bold leading-tight hover:underline">
              {item.title}
            </h3>
          </Link>
        ) : (
          <h3 className="line-clamp-2 text-base font-bold leading-tight">{item.title}</h3>
        )}
        <p className="mt-0.5 font-mono text-sm tabular-nums">{yearLine}</p>
        {item.matchReasons && item.matchReasons.length > 0 && (
          <p className="mt-1.5 line-clamp-2 border-t border-current/30 pt-1.5 text-sm leading-tight">
            {item.matchReasons[0] === "Same series"
              ? item.matchReasons.join(" · ")
              : `Shares: ${item.matchReasons.join(" · ")}`}
          </p>
        )}
      </div>
    </article>
  );
}

/** The card's one "more" control: Watchlist, Seen and Hide in one menu, so the
 *  poster carries one button instead of three, at every width. */
function CardMore({
  item,
  saved,
  watched,
  rejected,
  onQuickAction,
}: {
  item: MediaItem;
  saved: boolean;
  watched: boolean;
  rejected: boolean;
  onQuickAction: (item: MediaItem, action: QuickAction) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${item.title}`}
          className="absolute right-1 top-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-text-bright bg-background text-text-bright transition-colors duration-fast hover:bg-text-bright hover:text-background data-[state=open]:bg-text-bright data-[state=open]:text-background"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40 text-base">
        <DropdownMenuCheckboxItem
          checked={saved}
          onCheckedChange={() => onQuickAction(item, "want")}
          className="cursor-pointer"
        >
          Watchlist
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={watched}
          onCheckedChange={() => onQuickAction(item, "watched")}
          className="cursor-pointer"
        >
          Seen
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={rejected}
          onCheckedChange={() => onQuickAction(item, "notInterested")}
          className="cursor-pointer"
        >
          Hide
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CardArt({
  item,
  imgSizes,
  eager = false,
}: {
  item: MediaItem;
  imgSizes?: string;
  eager?: boolean;
}) {
  // A lazy poster fades up out of the card's own colour instead of cutting to
  // the photograph. Eager cards start visible: they are the largest thing
  // painted above the fold, and hiding them until React hydrates would push
  // that paint back by however long the bundle takes.
  const [revealed, setRevealed] = useState(eager);
  // A cached poster finishes loading before React attaches onLoad, so that
  // event never fires. Reading `complete` when the node mounts catches it, in
  // the same commit, so a re-visit never blinks from zero.
  const catchCached = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setRevealed(true);
  }, []);
  return (
    <div className="aspect-[2/3] w-full overflow-hidden rounded-lg bg-current/15 shadow-md">
      {item.posterUrl ? (
        <img
          src={tmdbImage(item.posterUrl, "w342")}
          srcSet={tmdbSrcSet(item.posterUrl, [
            { w: 185, size: "w185" },
            { w: 342, size: "w342" },
            { w: 500, size: "w500" },
          ])}
          sizes={
            imgSizes ??
            "(max-width: 640px) 46vw, (max-width: 768px) 30vw, (max-width: 1280px) 23vw, 200px"
          }
          alt={item.title}
          width={342}
          height={513}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          decoding="async"
          ref={catchCached}
          onLoad={() => setRevealed(true)}
          // A poster that fails to load still shows: otherwise the alt text
          // would sit at opacity 0 forever.
          onError={() => setRevealed(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-base ease-out motion-reduce:transition-none",
            revealed ? "opacity-100" : "opacity-0",
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="text-sm font-semibold">No art</span>
        </div>
      )}
    </div>
  );
}
