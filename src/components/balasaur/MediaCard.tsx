import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { MediaItem, MediaType } from "@/types/media";

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

function displayYear(item: MediaItem): string {
  // TV: show a start–end range using the latest season's air year.
  if (item.mediaType === "tv" && item.seasons && item.seasons.length > 0) {
    let end = "";
    for (const s of item.seasons) {
      const y = s.airDate ? s.airDate.slice(0, 4) : "";
      if (y && y > end) end = y;
    }
    if (item.year && end && end !== item.year) return `${item.year}–${end}`;
  }
  return item.year || "—";
}

export function MediaCard({ item }: { item: MediaItem }) {
  const rating = primaryRating(item);
  const [expanded, setExpanded] = useState(false);
  const hasSeasons = item.mediaType === "tv" && (item.seasons?.length ?? 0) > 0;
  const isLinkable = item.mediaType === "movie" || item.mediaType === "tv";
  const rawId = item.id.replace(/^(movie|tv)-/, "");

  return (
    <article className="group flex flex-col">
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
          {item.mediaType === "tv" && item.seasons && item.seasons.length > 0
            ? ` · ${item.seasons.length}S`
            : ""}
        </p>
        {hasSeasons && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="mt-1.5 flex w-full cursor-pointer items-center justify-between rounded-[4px] border border-border bg-panel px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:border-border-strong hover:text-text-bright"
            aria-expanded={expanded}
          >
            <span>{expanded ? "Hide seasons" : "Seasons"}</span>
            <ChevronDown
              className={"h-3 w-3 transition-transform " + (expanded ? "rotate-180" : "")}
            />
          </button>
        )}
        {hasSeasons && expanded && (
          <ul className="mt-1.5 space-y-1 rounded-[4px] border border-border bg-panel px-1.5 py-1.5">
            {item.seasons!.map((s) => (
              <li
                key={s.seasonNumber}
                className="flex items-baseline justify-between gap-2 font-mono text-[10.5px]"
              >
                <span className="truncate text-text-bright">{s.name}</span>
                <span className="shrink-0 text-text-dim">
                  {s.episodeCount > 0 ? `${s.episodeCount}ep` : ""}
                  {s.airDate ? ` · ${s.airDate.slice(0, 4)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
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
        {rating && (
          <div className="absolute right-1.5 top-1.5 rounded-[4px] bg-background/85 px-1.5 py-0.5 backdrop-blur-sm">
            <span className="font-mono text-[10px] font-medium text-rating">
              ★ {rating.value}
            </span>
          </div>
        )}
      </div>
  );
}