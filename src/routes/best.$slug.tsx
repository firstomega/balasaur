import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { MediaCard } from "@/components/balasaur/MediaCard";
import { useEffect, useState } from "react";
import { getCollection, getRelatedCollections } from "@/lib/collections.functions";
import type { MediaItem } from "@/types/media";
import { collectionDek } from "@/lib/collectionsProse";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse, jsonLdScript } from "@/lib/seo";
import { useUserStatus } from "@/hooks/useUserStatus";

// /best/<slug> — one programmatically minted ranked collection. SSR'd,
// CDN-cached, ItemList-marked-up: this leaf family is the SEO engine.

export const Route = createFileRoute("/best/$slug")({
  loader: async ({ params }) => {
    await cacheSsrResponse();
    const data = await getCollection({ data: { slug: params.slug } });
    if (!data) throw notFound();
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
        url: `${SITE_ORIGIN}/${i.mediaType === "tv" ? "tv" : "movie"}/${i.id.replace(/^(movie|tv)-/, "")}`,
      })),
    };
    return {
      meta: buildMeta({
        title: `${d.row.title} (${d.row.item_count}) | Balasaur`,
        description: dek.slice(0, 158),
        url,
      }),
      links: [canonicalLink(url)],
      scripts: [jsonLdScript(itemList)],
    };
  },
  component: CollectionPage,
  notFoundComponent: CollectionNotFound,
});

function CollectionPage() {
  const { row, items, related } = Route.useLoaderData();
  const { statuses, isAnonymous, ready } = useUserStatus();
  const [mounted, setMounted] = useState(false);
  const [hideSeen, setHideSeen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const dek = collectionDek(
    row,
    items.slice(0, 3).map((i: MediaItem) => ({ title: i.title, score: i.ratings.balasaur })),
  );
  // The shelf's own refresh stamp (nightly rebuild), not the render date.
  const updated = (row.updated_at ?? "").slice(0, 10);

  const seenCount = items.filter((i: MediaItem) => statuses[i.id]?.status === "seen").length;
  const ranked = items.map((item: MediaItem, idx: number) => ({ item, rank: idx + 1 }));
  const displayItems =
    hideSeen && mounted
      ? ranked.filter(({ item }) => statuses[item.id]?.status !== "seen")
      : ranked;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[1160px] px-4 py-6">
        <nav
          aria-label="Breadcrumb"
          className="mb-3 font-mono text-[10.5px] uppercase tracking-wider text-text-dim"
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
        <p className="mt-2 max-w-[76ch] text-[14px] leading-relaxed text-text">{dek}</p>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <MetaChip>{row.item_count.toLocaleString("en-US")} titles</MetaChip>
          {updated && <MetaChip>Updated {updated}</MetaChip>}
          <Link
            to="/methodology"
            className="rounded-[4px] border border-border bg-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:border-primary hover:text-primary"
          >
            Ranked by Balasaur Score
          </Link>
          {mounted && ready && !isAnonymous && seenCount > 0 && (
            <>
              <MetaChip>
                You have seen {seenCount} of {row.item_count}
              </MetaChip>
              <button
                onClick={() => setHideSeen(!hideSeen)}
                className="rounded-[4px] border border-border bg-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:border-primary hover:text-primary"
              >
                {hideSeen ? "Show seen" : "Hide seen"}
              </button>
            </>
          )}
        </div>

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

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[4px] border border-border bg-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
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
          It may have been retired in a refresh — collections come and go with the catalog.
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
