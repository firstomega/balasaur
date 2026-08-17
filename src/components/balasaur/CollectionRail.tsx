import { Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { homeCollectionsOptions } from "@/hooks/useCatalog";
import { tmdbImage } from "@/lib/tmdbImage";
import { ScrollRail } from "./ScrollRail";

// A rail of COLLECTIONS, not titles: the answer to "what am I in the mood
// for" sits above the answer to "what is popular". Each card fans three
// posters from the list it links to, so the shelf reads as a place to go
// rather than another row of movies.
//
// Ordering is handled server-side: any collection whose season covers the
// current month leads, so October opens with the Halloween list without
// anyone touching it.

function PosterFan({ posters, title }: { posters: string[]; title: string }) {
  if (posters.length === 0) {
    return <div className="h-[104px] w-full rounded-[5px] border border-border bg-background" />;
  }
  return (
    <div className="flex h-[104px] items-stretch gap-1 overflow-hidden rounded-[5px]">
      {posters.slice(0, 3).map((p, i) => (
        <img
          key={i}
          src={tmdbImage(p, "w185")}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="h-full w-1/3 object-cover"
        />
      ))}
      <span className="sr-only">{title}</span>
    </div>
  );
}

export function CollectionRail() {
  const { data } = useQuery(homeCollectionsOptions());
  if (!data || data.length === 0) return null;

  return (
    <section aria-label="Collections">
      <h2 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-bright">
        <Layers className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        What are you in the mood for
      </h2>
      <ScrollRail className="gap-3">
        {data.map((c) => (
          <Link
            key={c.slug}
            to="/best/$slug"
            params={{ slug: c.slug }}
            className="group w-[188px] shrink-0 rounded-[6px] border border-border bg-panel p-2 transition-colors hover:border-primary sm:w-[210px]"
          >
            <PosterFan posters={c.posters} title={c.title} />
            <div className="mt-2 flex items-start justify-between gap-2">
              <span className="text-[13px] font-semibold leading-tight text-text-bright group-hover:text-primary">
                {c.title}
              </span>
              {c.inSeason && (
                <span className="mt-0.5 shrink-0 rounded-[3px] bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                  Now
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-text-dim">
              {c.media_type && (
                <span className={c.media_type === "tv" ? "text-media-tv" : "text-media-movie"}>
                  {c.media_type === "tv" ? "Shows" : "Movies"}
                </span>
              )}
              <span>{c.item_count} picks</span>
            </div>
          </Link>
        ))}
        <Link
          to="/collections"
          className="flex w-[140px] shrink-0 items-center justify-center rounded-[6px] border border-dashed border-border font-mono text-[11px] uppercase tracking-wider text-text-muted transition-colors hover:border-primary hover:text-primary"
        >
          All collections
        </Link>
      </ScrollRail>
    </section>
  );
}
