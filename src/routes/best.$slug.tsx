import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { MediaCard } from "@/components/balasaur/MediaCard";
import { useEffect, useState } from "react";
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
} from "@/lib/seo";
import { useUserStatus } from "@/hooks/useUserStatus";
import { mediaSlug } from "@/lib/slug";

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
      meta: buildMeta({
        // The item count used to ride in the title as "(60)", which reads as a
        // stray UI artifact in a search result and repeats the dek's opening
        // sentence. The title now spends its width on the words people type.
        title: composeTitle(d.row.title, []),
        description: clampDescription(dek, 160),
        url,
      }),
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

function CollectionPage() {
  const { row, items, related } = Route.useLoaderData();
  const { statuses, ready } = useUserStatus();
  const [mounted, setMounted] = useState(false);
  const [hideSeen, setHideSeen] = useState(false);
  // In-place filters over the ~60 loaded rows. Component state only, never
  // the URL: a filtered view of a ranked page must not mint its own URL.
  const [svc, setSvc] = useState<string | null>(null);
  const [decade, setDecade] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // A chip group renders only when it would change anything: at least two
  // distinct values, none covering the whole list. Service chips are also
  // suppressed on collections already scoped to a service, where every row
  // would carry the same chip.
  const serviceCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  for (const i of items as MediaItem[]) {
    for (const sv of i.streaming ?? []) serviceCounts.set(sv, (serviceCounts.get(sv) ?? 0) + 1);
    const d = decadeOf(i.year);
    if (d) decadeCounts.set(d, (decadeCounts.get(d) ?? 0) + 1);
  }
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
  const ranked = items.map((item: MediaItem, idx: number) => ({ item, rank: idx + 1 }));
  const displayItems = ranked
    .filter(({ item }) => !(hideSeen && mounted && statuses[item.id]?.status === "seen"))
    .filter(({ item }) => !svc || (item.streaming ?? []).includes(svc))
    .filter(({ item }) => !decade || decadeOf(item.year) === decade);
  const filtered = displayItems.length < ranked.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto max-w-[1160px] px-4 py-6">
        <nav
          aria-label="Breadcrumb"
          className="mb-3 font-mono text-[11px] uppercase tracking-wider text-text-dim"
        >
          <Link to="/collections" className="hover:text-primary">
            Collections
          </Link>
          <span className="mx-1.5 text-border-strong">›</span>
          <span className="text-text-muted">{row.title}</span>
        </nav>

        <h1 className="max-w-[30ch] text-[26px] font-bold leading-tight tracking-tight text-text-bright">
          {row.title}
        </h1>
        <p className="mt-2 max-w-[76ch] text-[15px] leading-relaxed text-text">{dek}</p>
        {composition && (
          <p className="mt-1.5 max-w-[76ch] text-[13px] leading-relaxed text-text-muted">
            {composition}
          </p>
        )}

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <MetaChip>{row.item_count.toLocaleString("en-US")} titles</MetaChip>
          {updated && <MetaChip>Updated {updated}</MetaChip>}
          <Link
            to="/methodology"
            className="rounded-[4px] border border-border bg-panel px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-text-muted transition-colors hover:border-primary hover:text-primary"
          >
            Ranked by Balasaur Score
          </Link>
          {mounted && ready && seenCount > 0 && (
            <>
              <MetaChip>
                You have seen {seenCount} of {row.item_count}
              </MetaChip>
              <button
                onClick={() => setHideSeen(!hideSeen)}
                className="rounded-[4px] border border-border bg-panel px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-text-muted transition-colors hover:border-primary hover:text-primary"
              >
                {hideSeen ? "Show seen" : "Hide seen"}
              </button>
            </>
          )}
        </div>

        {showChips && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
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
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
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
            {filtered && (
              <span className="ml-1 font-mono text-[11px] uppercase tracking-wider text-text-muted">
                Showing {displayItems.length} of {ranked.length}
              </span>
            )}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {displayItems.map(({ item, rank }, i) => (
            <MediaCard
              key={item.id}
              item={item}
              eager={i < 5}
              showVotes={true}
              posterOverlay={
                <span
                  aria-hidden="true"
                  className="font-mono text-[30px] font-bold leading-none text-white/95 [text-shadow:0_2px_10px_rgba(0,0,0,0.95)]"
                >
                  {rank}
                </span>
              }
            />
          ))}
        </div>

        <div className="mt-8 flex items-center gap-4 rounded-[6px] border border-primary/30 bg-primary/5 px-4 py-3.5">
          <p className="text-[13px] text-text">
            <b className="text-text-bright">Seen a few of these?</b> Track what you've watched and
            Balasaur learns your taste. It's free.
          </p>
          <Link
            to="/watched"
            className="ml-auto shrink-0 rounded-[5px] bg-primary px-3.5 py-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
          >
            Start rating
          </Link>
        </div>

        {related && related.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-4 text-[13px] font-bold uppercase tracking-wider text-text-bright">
              Related collections
            </h2>
            <div className="flex flex-wrap gap-2">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  to="/best/$slug"
                  params={{ slug: r.slug }}
                  className="rounded-[4px] border border-border bg-panel px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-muted transition-colors hover:border-primary hover:text-primary"
                >
                  {r.title} <span className="ml-1 opacity-70">{r.item_count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
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
      className={`cursor-pointer rounded-[4px] border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-panel text-text-muted hover:border-primary/60 hover:text-text-bright"
      }`}
    >
      {children}
    </button>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[4px] border border-border bg-panel px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-text-muted">
      {children}
    </span>
  );
}

function CollectionNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-text-bright">Collection not found</h1>
        <p className="mt-2 text-sm text-text-muted">
          It may have been retired in a refresh. Collections come and go with the catalog.
        </p>
        <Link
          to="/collections"
          className="mt-5 inline-block rounded-[5px] border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-bright hover:border-primary hover:text-primary"
        >
          All collections
        </Link>
      </div>
    </div>
  );
}
