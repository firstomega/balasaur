import { Link } from "@tanstack/react-router";
import { Bookmark, Check, MoreHorizontal } from "lucide-react";
import type { MediaItem } from "@/types/media";
import type { SwatchKey } from "@/lib/posterSwatch";
import type { QuickAction } from "./MediaCard";
import { ScoreBadge } from "./ScoreBadge";
import { cn } from "@/lib/utils";
import { mediaSlug } from "@/lib/slug";
import { swatchSurface } from "@/lib/swatchSurface";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The row's light tint: the swatch at 13% over the white ground, the strength
 * src/lib/palette.test.ts holds ink and muted ink to 4.5:1 on. Written out in
 * full so Tailwind finds every class.
 */
const TINT: Record<SwatchKey, string> = {
  red: "bg-swatch-red/13",
  orange: "bg-swatch-orange/13",
  gold: "bg-swatch-gold/13",
  lime: "bg-swatch-lime/13",
  green: "bg-swatch-green/13",
  teal: "bg-swatch-teal/13",
  sky: "bg-swatch-sky/13",
  blue: "bg-swatch-blue/13",
  violet: "bg-swatch-violet/13",
  pink: "bg-swatch-pink/13",
  wine: "bg-swatch-wine/13",
  rust: "bg-swatch-rust/13",
  navy: "bg-swatch-navy/13",
  noir: "bg-swatch-noir/13",
};

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
  /** The bits of the meta line, in order. Each bit never breaks inside. */
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
        {meta.length > 0 && (
          <p className="mt-0.5 text-sm text-text-muted md:text-base">
            {meta.map((bit, i) => (
              <span key={i} className="whitespace-nowrap">
                {/* The dot travels with the bit after it, so a wrap never
                    strands a separator at the end of a line. */}
                {i > 0 && "· "}
                {bit}
                {i < meta.length - 1 && " "}
              </span>
            ))}
          </p>
        )}
      </span>
    </>
  );

  return (
    <li className={cn("flex items-stretch overflow-hidden rounded-xl", sw ? TINT[sw] : "bg-panel")}>
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
          <RowMore
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

/** The row's "more" menu: Watchlist, Seen and Hide, as on the card. */
function RowMore({
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
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-text-bright bg-background text-text-bright transition-colors duration-fast hover:bg-text-bright hover:text-background data-[state=open]:bg-text-bright data-[state=open]:text-background"
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
