import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RankedRow } from "@/components/balasaur/RankedRow";
import { ListTile } from "@/components/balasaur/ListTile";
import {
  getCollection,
  getCollectionRedirect,
  getRelatedCollections,
} from "@/lib/collections.functions";
import type { MediaItem } from "@/types/media";
import { collectionComposition, collectionDek } from "@/lib/collectionsProse";
import {
  SITE_ORIGIN,
  canonicalLink,
  buildMeta,
  cacheSsrResponse,
  jsonLdScript,
  composeTitle,
  clampDescription,
  noindexMeta,
} from "@/lib/seo";
import { isIndexableList } from "@/lib/indexKeep";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useQuickAction } from "@/hooks/useQuickAction";
import { mediaSlug } from "@/lib/slug";
import { displayYear } from "@/lib/mediaFormat";
import { rankByShownScore } from "@/lib/sharedRank";
import { swatchSurface } from "@/lib/swatchSurface";
import { paintTiles } from "@/lib/paintWall";
import { isNotInterested, primaryOf } from "@/lib/userStatus";
import { cn } from "@/lib/utils";

// /best/<slug> — one programmatically minted ranked collection. SSR'd,
// CDN-cached, ItemList-marked-up: this leaf family is the SEO engine.

export const Route = createFileRoute("/best/$slug")({
  loader: async ({ params }) => {
    await cacheSsrResponse();
    const data = await getCollection({ data: { slug: params.slug } });
    if (!data) {
      // The v8 media-type split renamed ~200 slugs that Google already knows.
      // A retired slug permanently redirects rather than 404ing, so the
      // indexing those URLs earned transfers instead of evaporating.
      const to = await getCollectionRedirect({ data: { slug: params.slug } });
      if (to) throw redirect({ to: "/best/$slug", params: { slug: to }, statusCode: 301 });
      throw notFound();
    }
    const related = await getRelatedCollections({
      data: { slug: params.slug, kind: data.row.kind },
    });
    return { ...data, related };
  },
  head: ({ loaderData, params }) => {
    const d = loaderData;
    const url = `${SITE_ORIGIN}/best/${params.slug}`;
    if (!d) return { meta: buildMeta({ title: "Balasaur", description: "", url }) };
    const dek = collectionDek(
      d.row,
      d.items.slice(0, 3).map((i) => ({ title: i.title, score: i.ratings.balasaur })),
    );
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: d.row.title,
      url,
      numberOfItems: d.row.item_count,
      itemListElement: d.items.slice(0, 25).map((i, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: i.title,
        // The canonical URL carries the slug. Emitting the bare-id form handed
        // Google 25 URLs per page that immediately 301 elsewhere, so the
        // structured data and the visible links disagreed on every ranked page.
        url: `${SITE_ORIGIN}/${i.mediaType === "tv" ? "tv" : "movie"}/${mediaSlug(i.id.replace(/^(movie|tv)-/, ""), i.title)}`,
      })),
    };
    return {
      meta: [
        ...buildMeta({
          // The item count used to ride in the title as "(60)", which reads as
          // a stray UI artifact in a search result and repeats the dek's
          // opening sentence. The title spends its width on the words people
          // type.
          title: composeTitle(d.row.title, []),
          description: clampDescription(dek, 160),
          url,
        }),
        // Only lists that do not repeat a broader one are offered to Google,
        // the same set the sitemap and IndexNow read (collection_index_kept).
        // The rest stay linked and followed.
        ...(isIndexableList(d) ? [] : [noindexMeta()]),
      ],
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(itemList)],
    };
  },
  component: CollectionPage,
  notFoundComponent: CollectionNotFound,
});

/** Decade label for a year string, "1994" → "1990s". */
function decadeOf(year: string | undefined): string | null {
  if (!year || !/^\d{4}/.test(year)) return null;
  return `${year.slice(0, 3)}0s`;
}

/**
 * The meta line of one row: years, season count, and up to two genres. A genre
 * every row on the list carries ("Action" on an action list) tells one row
 * from another nothing, so it is left out.
 */
function rowMeta(item: MediaItem, everywhere: ReadonlySet<string>): string[] {
  const bits: string[] = [];
  if (item.year) bits.push(displayYear(item));
  const seasons = item.mediaType === "tv" ? (item.seasonCount ?? 0) : 0;
  if (seasons > 0) bits.push(`${seasons} Season${seasons === 1 ? "" : "s"}`);
  bits.push(...item.genres.filter((g) => !everywhere.has(g)).slice(0, 2));
  return bits;
}

function CollectionPage() {
  const { row, items, related, person } = Route.useLoaderData();
  const { statuses, ready, recordStatus } = useUserStatus();
  const onQuickAction = useQuickAction(statuses, recordStatus);
  const [mounted, setMounted] = useState(false);
  const [hideSeen, setHideSeen] = useState(false);
  // In-place filters over the ~60 loaded rows. Component state only, never
  // the URL: a filtered view of a ranked page must not mint its own URL.
  const [svc, setSvc] = useState<string | null>(null);
  const [decade, setDecade] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // The route component survives a $slug change (related-collection links),
  // so filters chosen on one collection must not silently trim the next.
  useEffect(() => {
    setSvc(null);
    setDecade(null);
    setHideSeen(false);
  }, [row.slug]);

  // A chip group renders only when it would change anything: at least two
  // distinct values, none covering the whole list. Service chips are also
  // suppressed on collections already scoped to a service, where every row
  // would carry the same chip.
  const serviceCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  for (const i of items as MediaItem[]) {
    for (const sv of i.streaming ?? []) serviceCounts.set(sv, (serviceCounts.get(sv) ?? 0) + 1);
    const d = decadeOf(i.year);
    if (d) decadeCounts.set(d, (decadeCounts.get(d) ?? 0) + 1);
    for (const g of new Set(i.genres)) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
  }
  const everywhere = new Set(
    [...genreCounts.entries()].filter(([, n]) => n === items.length).map(([g]) => g),
  );
  const serviceScoped = row.kind === "service" || row.kind === "genre-service";
  const serviceChips = serviceScoped
    ? []
    : [...serviceCounts.entries()]
        .filter(([, n]) => n < items.length)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
  const decadeChips =
    decadeCounts.size > 1 ? [...decadeCounts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)) : [];
  const showChips = serviceChips.length >= 2 || decadeChips.length >= 2;
  const dek = collectionDek(
    row,
    items.slice(0, 3).map((i: MediaItem) => ({ title: i.title, score: i.ratings.balasaur })),
  );
  // What the list is made of: spread, decade concentration, service overlap.
  // Every number is countable from the rows below it.
  const composition = collectionComposition(
    items.map((i: MediaItem) => ({
      score: i.ratings.balasaur,
      year: i.year,
      streaming: i.streaming,
    })),
  );
  // The shelf's own refresh stamp (nightly rebuild), not the render date.
  const updated = (row.updated_at ?? "").slice(0, 10);

  const seenCount = items.filter((i: MediaItem) => statuses[i.id]?.status === "seen").length;
  // Rank is assigned BEFORE any filter runs and survives every filter:
  // filtered-out titles collapse, survivors keep their numerals, and the
  // gaps in the numbers (#3, #7, #12) are the proof the order never changed.
  // Equal scores share a number, so the order never claims a hidden value.
  const ranked = rankByShownScore(items as MediaItem[], (i) => i.ratings.balasaur);
  const displayItems = ranked
    .filter(({ item }) => !(mounted && isNotInterested(statuses[item.id])))
    .filter(({ item }) => !(hideSeen && mounted && statuses[item.id]?.status === "seen"))
    .filter(({ item }) => !svc || (item.streaming ?? []).includes(svc))
    .filter(({ item }) => !decade || decadeOf(item.year) === decade);
  const filtered = displayItems.length < ranked.length;

  // The page wears its leader's colour, the same poster that paints the list's
  // tile on /collections. No swatch: the same band on the wash.
  const band = swatchSurface(ranked[0]?.item.swatch);
  const relatedPaint = paintTiles((related ?? []).map((r) => r.lead));

  return (
    <div className="min-h-screen bg-background text-text-bright">
      <main id="main">
        <div className={band}>
          {/* At lg the band splits on the same columns as the list below, so
              the heading block, the ranked rows and the related tiles share
              one right edge instead of leaving the band's right half empty. */}
          <div className="mx-auto max-w-content px-4 pb-7 pt-4 md:pb-10 md:pt-7 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-x-10">
            <div className="min-w-0">
              <nav aria-label="Breadcrumb" className="text-base font-semibold">
                <Link to="/collections" className="underline-offset-2 hover:underline">
                  Collections
                </Link>
              </nav>
              <h1 className="mt-2 max-w-[18ch] text-balance font-display text-4xl font-extrabold leading-[0.95] tracking-tight md:mt-3 md:text-[80px]">
                {row.title}
              </h1>
              <p className="mt-3 max-w-[68ch] text-lg leading-relaxed md:mt-4">{dek}</p>
            </div>
            <div className="min-w-0 lg:self-end">
              {composition && (
                <p className="mt-1.5 max-w-[68ch] text-lg leading-relaxed lg:mt-0">{composition}</p>
              )}
              <p className="mt-3 text-base font-semibold">
                {updated && <span className="whitespace-nowrap">Updated {updated} </span>}
                <span className="whitespace-nowrap">
                  {updated && "· "}
                  <Link to="/methodology" className="underline underline-offset-2">
                    Ranked by Balasaur Score
                  </Link>
                </span>
                {/* A person list links to that person's page, which links back. */}
                {person && (
                  <span>
                    {" · "}
                    <Link
                      to="/person/$id"
                      params={{ id: String(person.id) }}
                      className="underline underline-offset-2"
                    >
                      Every {person.name} credit
                    </Link>
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-content px-4 pb-6">
          {/* At lg the filter chips move into a sticky column beside the rows,
              on the same columns as the band above. Chosen from what the
              server renders, so the grid never shifts after mount. */}
          <div
            className={cn(
              showChips && "lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-x-10",
            )}
          >
            {(showChips || (mounted && ready && seenCount > 0)) && (
              <div
                className={cn(
                  "mt-4 flex flex-wrap items-center gap-1.5 md:mt-5",
                  showChips && "lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1",
                )}
              >
                {serviceChips.length >= 2 &&
                  serviceChips.map(([name, n]) => (
                    <FilterChip
                      key={name}
                      active={svc === name}
                      onClick={() => setSvc(svc === name ? null : name)}
                    >
                      {name} {n}
                    </FilterChip>
                  ))}
                {serviceChips.length >= 2 && decadeChips.length >= 2 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mx-1 h-4 w-px bg-border-strong",
                      showChips && "lg:mx-0 lg:my-1 lg:h-px lg:basis-full",
                    )}
                  />
                )}
                {decadeChips.length >= 2 &&
                  decadeChips.map(([name, n]) => (
                    <FilterChip
                      key={name}
                      active={decade === name}
                      onClick={() => setDecade(decade === name ? null : name)}
                    >
                      {name} {n}
                    </FilterChip>
                  ))}
                {mounted && ready && seenCount > 0 && (
                  <>
                    <span className="ml-1 text-sm font-semibold tabular-nums text-text-muted">
                      You have seen {seenCount} of {row.item_count}
                    </span>
                    <FilterChip active={hideSeen} onClick={() => setHideSeen(!hideSeen)}>
                      Hide seen
                    </FilterChip>
                  </>
                )}
                {filtered && (
                  <span className="ml-1 text-sm font-semibold tabular-nums text-text-muted">
                    Showing {displayItems.length} of {ranked.length}
                  </span>
                )}
              </div>
            )}

            <ol
              className={cn(
                "mt-4 flex flex-col gap-1.5 md:mt-5 md:gap-2",
                showChips && "lg:col-start-1 lg:row-start-1",
              )}
            >
              {displayItems.map(({ item, rank }, i) => {
                const rec = mounted ? statuses[item.id] : undefined;
                return (
                  <RankedRow
                    key={item.id}
                    item={item}
                    rank={rank}
                    meta={rowMeta(item, everywhere)}
                    eager={i < 3}
                    saved={primaryOf(rec) === "want"}
                    watched={primaryOf(rec) === "watched"}
                    rejected={isNotInterested(rec)}
                    onQuickAction={onQuickAction}
                  />
                );
              })}
            </ol>
          </div>

          <p className="mt-4 text-base font-semibold">
            <Link to="/watched" className="underline underline-offset-2">
              Rate the titles you have seen
            </Link>
          </p>

          {related && related.length > 0 && (
            <section className="mt-10 md:mt-14">
              <h2 className="font-display text-2xl font-extrabold leading-none tracking-tight md:text-3xl">
                Related collections
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:mt-4 md:gap-3.5 lg:grid-cols-4">
                {related.map((r, i) => (
                  <ListTile
                    key={r.slug}
                    slug={r.slug}
                    title={r.title}
                    itemCount={r.item_count}
                    lead={r.lead}
                    swatch={relatedPaint[i]}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`cursor-pointer rounded-full px-3 py-1.5 text-base font-semibold tabular-nums transition-colors duration-fast ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-panel text-text-bright hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function CollectionNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-text-bright">
          Collection not found
        </h1>
        <Link
          to="/collections"
          className="mt-5 inline-block rounded-full bg-primary px-4 py-2 text-base font-bold text-primary-foreground"
        >
          All collections
        </Link>
      </div>
    </div>
  );
}
