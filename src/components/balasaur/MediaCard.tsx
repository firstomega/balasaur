import { Link } from "@tanstack/react-router";
import { Check, Eye } from "lucide-react";
import type { MediaItem, MediaType } from "@/types/media";
import { cn } from "@/lib/utils";
import { displayYear } from "@/lib/mediaFormat";
import { ScoreBadge } from "./ScoreBadge";

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

const TYPE_CAPTION: Record<MediaType, string> = {
  movie: "Movie",
  tv: "TV",
  book: "Book",
  podcast: "Podcast",
};

function primaryRating(item: MediaItem): { value: string; raw: number } | null {
  const { imdb, tmdb } = item.ratings;
  if (typeof imdb === "number") return { value: imdb.toFixed(1), raw: imdb };
  if (typeof tmdb === "number") return { value: tmdb.toFixed(1), raw: tmdb };
  return null;
}

export function MediaCard({
  item,
  onQuickWatch,
  watched = false,
}: {
  item: MediaItem;
  /** When provided, shows a desktop hover "Watched" quick-add button on the poster. */
  onQuickWatch?: (item: MediaItem) => void;
  /** Current watched state, to style the quick-add button as active. */
  watched?: boolean;
}) {
  const rating = primaryRating(item);
  const isLinkable = item.mediaType === "movie" || item.mediaType === "tv";
  const rawId = item.id.replace(/^(movie|tv)-/, "");

  return (
    <article className="group flex flex-col">
      <div className="relative">
        {isLinkable ? (
          <Link
            to={item.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
            params={{ id: rawId }}
            className="block"
          >
            <CardArt item={item} rating={rating} />
          </Link>
        ) : (
          <CardArt item={item} rating={rating} />
        )}

        {onQuickWatch && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickWatch(item);
            }}
            aria-label={watched ? "Watched — click to remove" : "Mark as watched"}
            aria-pressed={watched}
            className={cn(
              // desktop-only quick action; mobile uses the swipe deck
              "absolute bottom-2 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 rounded-[5px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider backdrop-blur-sm transition-all md:flex",
              watched
                ? "border-rating/60 bg-rating/25 text-rating opacity-100"
                : "border-white/30 bg-black/70 text-white opacity-0 hover:border-primary hover:bg-primary hover:text-primary-foreground group-hover:opacity-100",
            )}
          >
            {watched ? <Check className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            Watched
          </button>
        )}
      </div>

      <div className="mt-2 px-0.5">
        {isLinkable ? (
          <Link
            to={item.mediaType === "movie" ? "/movie/$id" : "/tv/$id"}
            params={{ id: rawId }}
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
          {displayYear(item)} · {TYPE_CAPTION[item.mediaType]}
          {item.mediaType === "tv" && (item.seasonCount ?? item.seasons?.length ?? 0) > 0
            ? ` · ${item.seasonCount ?? item.seasons?.length}S`
            : ""}
        </p>
      </div>
    </article>
  );
}

function CardArt({
  item,
  rating,
}: {
  item: MediaItem;
  rating: { value: string; raw: number } | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-[5px] border border-border bg-panel shadow-sm transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-border-strong group-hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)]">
      <div className="aspect-[2/3] w-full">
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-accent text-text-dim">
            <span className="font-mono text-[10px] uppercase">No art</span>
          </div>
        )}
      </div>
      <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-[4px] bg-background/85 px-1.5 py-0.5 backdrop-blur-sm">
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
      {typeof item.ratings.balasaur === "number" ? (
        <div className="absolute right-1.5 top-1.5">
          <ScoreBadge score={item.ratings.balasaur} />
        </div>
      ) : rating ? (
        <div className="absolute right-1.5 top-1.5 rounded-[4px] bg-background/85 px-1.5 py-0.5 backdrop-blur-sm">
          <span className="font-mono text-[10px] font-medium text-rating">★ {rating.value}</span>
        </div>
      ) : null}
    </div>
  );
}
