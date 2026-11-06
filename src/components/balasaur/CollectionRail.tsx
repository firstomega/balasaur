import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { homeCollectionsOptions } from "@/hooks/useCatalog";
import { paintTiles } from "@/lib/paintWall";
import { ListTile } from "./ListTile";
import { ScrollRail } from "./ScrollRail";

// A rail of COLLECTIONS, not titles, above the catalog. Each tile is painted
// in the colour of the poster that leads its list.
//
// Ordering is handled server-side: any collection whose season covers the
// current month leads, so October opens with the Halloween list without
// anyone touching it.
//
// A swipeable rail below 1280px, so the catalog stays one short scroll away on
// a phone. From 1280px the same rail lays out as a five-column wall: 14 tiles
// plus the "All collections" tile fill three rows. Same markup and links at
// every width, and paintTiles takes no width, so the colours never change with
// the layout.

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
        className="xl:grid xl:grid-cols-5 xl:gap-4 xl:overflow-visible xl:pr-0"
      >
        {data.map((c, i) => (
          <ListTile
            key={c.slug}
            slug={c.slug}
            title={c.title}
            itemCount={c.item_count}
            lead={c.lead}
            swatch={paint[i]}
            className="w-[168px] shrink-0 md:w-[220px] xl:w-auto"
          />
        ))}
        <Link
          to="/collections"
          className="flex min-h-28 w-[140px] shrink-0 items-end xl:w-auto rounded-xl bg-text-bright p-3 font-display text-xl font-extrabold leading-none tracking-tight text-background transition-transform duration-base motion-safe:hover:-translate-y-0.5 md:rounded-2xl md:p-4 md:text-2xl"
        >
          All collections
        </Link>
      </ScrollRail>
    </section>
  );
}
