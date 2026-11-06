import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { homeCollectionsOptions } from "@/hooks/useCatalog";
import { paintTiles } from "@/lib/paintWall";
import { ListTile } from "./ListTile";
import { ScrollRail } from "./ScrollRail";
import { cn } from "@/lib/utils";

// A rail of COLLECTIONS, not titles, above the catalog. Each tile is painted
// in the colour of the poster that leads its list.
//
// Ordering is handled server-side: any collection whose season covers the
// current month leads, so October opens with the Halloween list without
// anyone touching it.
//
// Three layouts from one markup. On a phone, a two-column wall of the first
// five lists and the "All collections" tile, so the first screen is mostly
// colour and the way to the rest is a tile, not a hidden swipe. From 768px a
// swipeable rail, and from 1280px a five-column wall: 14 tiles plus "All
// collections" fill three rows. The same links at every width, and paintTiles
// takes no width, so the colours never change with the layout. The "All
// collections" tile is outlined rather than filled, so it never reads as one
// more list beside a black (noir) tile.

/** Lists shown on a phone before the "All collections" tile. */
const PHONE_TILES = 5;

export function CollectionRail() {
  const { data } = useQuery(homeCollectionsOptions());
  if (!data || data.length === 0) return null;
  const paint = paintTiles(data.map((c) => c.lead));

  return (
    <section aria-labelledby="collection-rail-h">
      <h2
        id="collection-rail-h"
        className="mb-3 font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright md:text-3xl"
      >
        Ranked lists
      </h2>
      <ScrollRail
        label="Ranked lists"
        className="max-md:grid max-md:grid-cols-2 max-md:overflow-visible max-md:pr-0 xl:grid xl:grid-cols-5 xl:gap-4 xl:overflow-visible xl:pr-0"
      >
        {data.map((c, i) => (
          <ListTile
            key={c.slug}
            slug={c.slug}
            title={c.title}
            itemCount={c.item_count}
            lead={c.lead}
            swatch={paint[i]}
            className={cn("shrink-0 md:w-[220px] xl:w-auto", i >= PHONE_TILES && "max-md:hidden")}
          />
        ))}
        <Link
          to="/collections"
          className="flex min-h-28 shrink-0 items-end rounded-xl border-2 border-text-bright bg-background p-3 font-display text-xl font-extrabold leading-none tracking-tight text-text-bright transition-transform duration-base motion-safe:hover:-translate-y-0.5 md:w-[140px] md:rounded-2xl md:p-4 md:text-2xl xl:w-auto"
        >
          All collections
        </Link>
      </ScrollRail>
    </section>
  );
}
