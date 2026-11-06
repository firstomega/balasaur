import { Link } from "@tanstack/react-router";
import { Bookmark, Check } from "lucide-react";
import type { MediaItem } from "@/types/media";
import { CardMore, type QuickAction } from "./MediaCard";
import { MetaLine } from "./MetaLine";
import { ScoreBadge } from "./ScoreBadge";
import { cn } from "@/lib/utils";
import { mediaSlug } from "@/lib/slug";
import { swatchSurface, swatchTint } from "@/lib/swatchSurface";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";

/**
 * One place on a best-of list: the rank in a cell painted with the poster's
 * swatch, the poster, the title and a meta line, the score sticker and the
 * "more" menu. The row behind the text is the same swatch, tinted light, so
 * the body text stays ink. A title with no swatch yet gets the same row on the
 * wash with a grey rank cell.
 *
 * Personal state (Seen, Watchlist, Hide) arrives through props the page fills
 * after mount, so the server HTML is the same for every visitor.
 */
export function RankedRow({
  item,
  rank,
  meta,
  eager = false,
  saved = false,
  watched = false,
  rejected = false,
  onQuickAction,
}: {
  item: MediaItem;
  rank: number;
  /** The bits of the meta line, in order. Each bit never breaks inside, and
   *  no line starts with a separator. */
  meta: string[];
  eager?: boolean;
  saved?: boolean;
  watched?: boolean;
  rejected?: boolean;
  onQuickAction?: (item: MediaItem, action: QuickAction) => void;
}) {
  const rawId = item.id.replace(/^(movie|tv)-/, "");
  // An id-less item renders no link: an empty param leaves "/tv/$id" in the href.
  const isLinkable = (item.mediaType === "movie" || item.mediaType === "tv") && /^\d+$/.test(rawId);
  const to = item.mediaType === "movie" ? "/movie/$id" : "/tv/$id";
  const score = item.ratings.balasaur;
  const sw = item.swatch ?? null;

  const body = (
    <>
      <span className="relative shrink-0">
        <span className="block h-[69px] w-[46px] overflow-hidden rounded-md bg-current/10 md:h-[90px] md:w-[60px]">
          {item.posterUrl && (
            <img
              src={tmdbImage(item.posterUrl, "w154")}
              srcSet={tmdbSrcSet(item.posterUrl, [
                { w: 92, size: "w92" },
                { w: 154, size: "w154" },
              ])}
              sizes="60px"
              alt=""
              width={60}
              height={90}
              loading={eager ? "eager" : "lazy"}
              fetchPriority={eager ? "high" : undefined}
              decoding="async"
              className="h-full w-full object-cover"
            />
          )}
        </span>
        {(watched || saved) && (
          <span
            className="absolute -bottom-1 -right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-text-bright text-background ring-2 ring-background"
            title={watched ? "Seen" : "Watchlist"}
          >
            {watched ? (
              <Check className="h-3 w-3" aria-label="Seen" />
            ) : (
              <Bookmark className="h-3 w-3" aria-label="Watchlist" />
            )}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <h3 className="line-clamp-2 text-lg font-bold leading-tight text-text-bright group-hover:underline md:text-xl">
          {item.title}
        </h3>
        <MetaLine bits={meta} className="mt-0.5 text-sm text-text-muted md:text-base" />
      </span>
    </>
  );

  return (
    <li className={cn("flex items-stretch overflow-hidden rounded-xl", swatchTint(sw))}>
      <span
        className={cn(
          "flex w-11 shrink-0 items-center justify-center font-display text-2xl font-extrabold tabular-nums leading-none md:w-[76px] md:text-4xl",
          sw ? swatchSurface(sw) : "bg-secondary text-text-bright",
        )}
      >
        <span className="sr-only">Rank </span>
        {rank}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2.5 pr-2 md:gap-4 md:py-2.5 md:pl-5 md:pr-4">
        {isLinkable ? (
          <Link
            to={to}
            params={{ id: mediaSlug(rawId, item.title) }}
            className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg md:gap-5"
          >
            {body}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 md:gap-5">{body}</div>
        )}
        {typeof score === "number" && (
          <ScoreBadge score={score} className="md:h-9 md:min-w-10 md:px-1.5 md:text-xl" />
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
      </div>
    </li>
  );
}
