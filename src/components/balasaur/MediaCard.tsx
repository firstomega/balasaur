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

export function MediaCard({ item }: { item: MediaItem }) {
  const rating = primaryRating(item);

  return (
    <article className="group flex flex-col">
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

        {/* Media-type tag */}
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

        {/* Rating */}
        {rating && (
          <div className="absolute right-1.5 top-1.5 rounded-[4px] bg-background/85 px-1.5 py-0.5 backdrop-blur-sm">
            <span className="font-mono text-[10px] font-medium text-rating">
              ★ {rating.value}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 px-0.5">
        <h3 className="line-clamp-2 text-[12.5px] font-semibold leading-tight text-text-bright">
          {item.title}
        </h3>
        <p className="mt-1 font-mono text-[10.5px] text-text-muted">
          {item.year || "—"} · {TYPE_CAPTION[item.mediaType]}
        </p>
      </div>
    </article>
  );
}