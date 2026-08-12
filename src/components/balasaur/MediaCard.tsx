import { Link } from "@tanstack/react-router";
import { Bookmark, Check, EyeOff, MoreHorizontal, Trophy } from "lucide-react";
import type { MediaItem, MediaType } from "@/types/media";
import { cn } from "@/lib/utils";
import { displayYear } from "@/lib/mediaFormat";
import { mediaSlug } from "@/lib/slug";
import { ScoreBadge } from "./ScoreBadge";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";

const TYPE_LABEL: Record<MediaType, string> = {
  movie: "MOVIE",
  tv: "TV",
  book: "BOOK",
  podcast: "POD",
};

const TYPE_COLOR_CLASS: Record<MediaType, string> = {
  movie: "text-media-movie",
  tv: "text-media-tv",
  book: "text-media-book",
  podcast: "text-media-podcast",
};

export type QuickAction = "want" | "watched" | "notInterested";

export function MediaCard({
  item,
  onQuickAction,
  onOpenActions,
  saved = false,
  watched = false,
  rejected = false,
  posterOverlay,
}: {
  item: MediaItem;
  /** When provided, shows desktop hover quick actions on the poster: save to
   *  Watchlist (primary — the high-intent action while browsing) and Watched. */
  onQuickAction?: (item: MediaItem, action: QuickAction) => void;
  /** Mobile: opens the bottom action sheet for this title (hover doesn't exist
   *  on touch, so saving from the grid needs an explicit affordance). */
  onOpenActions?: (item: MediaItem) => void;
  /** Current watchlist state, to style the save button as active. */
  saved?: boolean;
  /** Current watched state, to style the watched button as active. */
  watched?: boolean;
  /** Current not-interested state, to style the hide button as active. */
  rejected?: boolean;
  /** Rendered bottom-left on the poster (rail rank numerals, date chips, …). */
  posterOverlay?: React.ReactNode;
}) {
  const isLinkable = item.mediaType === "movie" || item.mediaType === "tv";
  const rawId = item.id.replace(/^(movie|tv)-/, "");
  const slug = mediaSlug(rawId, item.title);

  return (
    <article className="group flex flex-col">
      <div className="relative">
        {isLinkable ? (
          <Link
            to={item.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
            params={{ id: slug }}
            className="block"
          >
            <CardArt item={item} posterOverlay={posterOverlay} />
          </Link>
        ) : (
          <CardArt item={item} posterOverlay={posterOverlay} />
        )}

        {onQuickAction && (
          // Desktop-only quick actions; mobile uses the swipe deck / detail page.
          // Want to Watch leads — while browsing, "save for later" is the
          // high-intent action; Watched is what you do after.
          <div className="absolute bottom-2 left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickAction(item, "want");
              }}
              aria-label={saved ? "On your watchlist — click to remove" : "Save to watchlist"}
              aria-pressed={saved}
              title={saved ? "On your watchlist" : "Want to Watch"}
              className={cn(
                "flex items-center gap-1 rounded-[5px] border px-2 py-1 font-mono text-[10px] uppercase tracking-wider backdrop-blur-sm transition-all",
                saved
                  ? "border-[#e8b84b]/70 bg-[#e8b84b]/25 text-[#e8b84b] opacity-100"
                  : "border-white/30 bg-black/70 text-white opacity-0 hover:border-[#e8b84b] hover:bg-[#e8b84b] hover:text-black group-hover:opacity-100",
              )}
            >
              <Bookmark className="h-3 w-3" />
              Save
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickAction(item, "watched");
              }}
              aria-label={watched ? "Watched — click to remove" : "Mark as watched"}
              aria-pressed={watched}
              title={watched ? "Watched" : "Mark as watched"}
              className={cn(
                "flex items-center gap-1 rounded-[5px] border px-2 py-1 font-mono text-[10px] uppercase tracking-wider backdrop-blur-sm transition-all",
                watched
                  ? "border-rating/60 bg-rating/25 text-rating opacity-100"
                  : "border-white/30 bg-black/70 text-white opacity-0 hover:border-primary hover:bg-primary hover:text-primary-foreground group-hover:opacity-100",
              )}
            >
              <Check className="h-3 w-3" />
              Seen
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickAction(item, "notInterested");
              }}
              aria-label={rejected ? "Not interested — click to undo" : "Not interested"}
              aria-pressed={rejected}
              title={rejected ? "Not interested — click to undo" : "Not interested"}
              className={cn(
                "flex items-center rounded-[5px] border p-1 backdrop-blur-sm transition-all",
                rejected
                  ? "border-[#c75d6e]/70 bg-[#c75d6e]/25 text-[#c75d6e] opacity-100"
                  : "border-white/30 bg-black/70 text-white opacity-0 hover:border-[#c75d6e] hover:bg-[#c75d6e] hover:text-white group-hover:opacity-100",
              )}
            >
              <EyeOff className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-start gap-1 px-0.5">
        <div className="min-w-0 flex-1">
          {isLinkable ? (
            <Link
              to={item.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
              params={{ id: slug }}
              className="block"
            >
              <h3 className="line-clamp-2 text-[12.5px] font-semibold leading-tight text-text-bright hover:text-primary">
                {item.title}
              </h3>
            </Link>
          ) : (
            <h3 className="line-clamp-2 text-[12.5px] font-semibold leading-tight text-text-bright">
              {item.title}
            </h3>
          )}
          <p className="mt-1 font-mono text-[10.5px] text-text-muted">
            {displayYear(item)}
            {(() => {
              // Media type already shown as the tag on the poster, so the caption only
              // adds the season count for TV (spelled out, e.g. "2 Seasons").
              if (item.mediaType !== "tv") return "";
              const seasons = item.seasonCount ?? item.seasons?.length ?? 0;
              return seasons > 0 ? ` · ${seasons} Season${seasons === 1 ? "" : "s"}` : "";
            })()}
          </p>
        </div>
        {onOpenActions && (
          <button
            type="button"
            onClick={() => onOpenActions(item)}
            aria-label={`Actions for ${item.title}`}
            className="shrink-0 cursor-pointer rounded-[4px] p-1 text-text-dim hover:text-text-bright md:hidden"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}

function CardArt({ item, posterOverlay }: { item: MediaItem; posterOverlay?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[5px] border border-border bg-panel shadow-sm transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-border-strong group-hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)]">
      <div className="aspect-[2/3] w-full">
        {item.posterUrl ? (
          <img
            src={tmdbImage(item.posterUrl, "w342")}
            srcSet={tmdbSrcSet(item.posterUrl, [
              { w: 185, size: "w185" },
              { w: 342, size: "w342" },
              { w: 500, size: "w500" },
            ])}
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 22vw, 160px"
            alt={item.title}
            width={342}
            height={513}
            loading="lazy"
            decoding="async"
            // Subtle inner zoom on hover (the container clips it) — signals
            // interactivity without the layout shift a card-scale would cause.
            className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.045] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-accent text-text-dim">
            <span className="font-mono text-[10px] uppercase">No art</span>
          </div>
        )}
      </div>
      <div className="absolute left-1.5 top-1.5 flex h-[18px] items-center gap-1 rounded-[4px] bg-background/85 px-1.5 backdrop-blur-sm">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${TYPE_COLOR_CLASS[item.mediaType]}`}
          aria-hidden="true"
        />
        <span
          className={`font-mono text-[9px] font-medium uppercase tracking-wider ${TYPE_COLOR_CLASS[item.mediaType]}`}
        >
          {TYPE_LABEL[item.mediaType]}
        </span>
      </div>
      {/* One score format everywhere: the Balasaur badge or nothing. (The old
          "★ 7.0" raw-IMDb/TMDB fallback is gone — with TMDB in the blend, a
          card without a badge genuinely has no rating data.) */}
      {typeof item.ratings.balasaur === "number" && (
        <div className="absolute right-1.5 top-1.5">
          <ScoreBadge score={item.ratings.balasaur} />
        </div>
      )}
      {/* The awards pipeline earns a pixel: winners get a small trophy. */}
      {item.awardWinner && (
        <span
          title="Major award winner"
          className="absolute bottom-1.5 right-1.5 rounded-[4px] bg-background/85 p-1 backdrop-blur-sm"
        >
          <Trophy className="h-3 w-3 text-rating" aria-label="Award winner" />
        </span>
      )}
      {posterOverlay && (
        <div className="pointer-events-none absolute bottom-1.5 left-1.5">{posterOverlay}</div>
      )}
    </div>
  );
}
