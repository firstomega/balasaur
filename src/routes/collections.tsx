import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { listCollections, type CollectionSummary } from "@/lib/collections.functions";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse } from "@/lib/seo";
import { tmdbImage } from "@/lib/tmdbImage";

// /collections — the library front door: a dashboard of programmatically
// minted ranked shelves. Tiles for the browsable kinds; compact link grids for
// the long-tail kinds (years, genre×decade, genre×service) so all ~350 pages
// get a crawlable sitewide link without 350 collages.

export const Route = createFileRoute("/collections")({
  loader: async () => {
    await cacheSsrResponse();
    return listCollections();
  },
  head: () => ({
    meta: buildMeta({
      title: "Ranked Movie & TV Collections | Balasaur",
      description:
        "Ranked lists drawn from 65,000 titles: by service, decade, genre, and acclaim. Each one is ordered by Balasaur Score and rebuilt nightly.",
      url: `${SITE_ORIGIN}/collections`,
    }),
    links: [canonicalLink(`${SITE_ORIGIN}/collections`)],
  }),
  component: CollectionsPage,
});

const TILE_SECTIONS: { kinds: string[]; label: string }[] = [
  { kinds: ["service"], label: "By service" },
  { kinds: ["origin-genre"], label: "By origin" },
  { kinds: ["genre"], label: "By genre" },
  { kinds: ["decade"], label: "By decade" },
  { kinds: ["awards", "discovery"], label: "Acclaim & discovery" },
];

const LINK_SECTIONS: { kind: string; label: string }[] = [
  { kind: "genre-service", label: "Genre × service" },
  { kind: "genre-decade", label: "Genre × decade" },
  { kind: "year", label: "By year" },
];

function Tile({ c }: { c: CollectionSummary }) {
  return (
    <Link
      to="/best/$slug"
      params={{ slug: c.slug }}
      className="group overflow-hidden rounded-[6px] border border-border bg-panel transition-all hover:-translate-y-0.5 hover:border-primary"
    >
      <span className="grid aspect-video grid-cols-2 gap-[2px] bg-border">
        {c.posters.slice(0, 4).map((p, i) => (
          <img
            key={i}
            src={tmdbImage(p, "w185")}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ))}
      </span>
      <span className="block px-3 py-2.5">
        <span className="block text-[13px] font-semibold leading-tight text-text-bright group-hover:text-primary">
          {c.title}
        </span>
        <span className="mt-1 flex gap-2.5 font-mono text-[10px] text-text-dim">
          <span>{c.item_count.toLocaleString()} titles</span>
          {typeof c.top_score === "number" && (
            <span className="text-rating">top {c.top_score}</span>
          )}
        </span>
      </span>
    </Link>
  );
}

function CollectionsPage() {
  const collections = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[1160px] px-4 py-6">
        <h1 className="text-[24px] font-bold tracking-tight text-text-bright">Collections</h1>
        <p className="mt-1 max-w-[72ch] text-[13.5px] text-text-muted">
          Ranked lists drawn from 65,000 titles: by service, decade, genre, and acclaim. Each one is
          ordered by Balasaur Score and rebuilt nightly.
        </p>

        {TILE_SECTIONS.map(({ kinds, label }) => {
          const rows = collections.filter((c: CollectionSummary) => kinds.includes(c.kind));
          if (rows.length === 0) return null;
          return (
            <section key={label} className="mt-7">
              <div className="mb-3 flex items-baseline gap-2 border-b border-border pb-1.5">
                <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-text-bright">
                  {label}
                </h2>
                <span className="font-mono text-[10px] text-text-dim">{rows.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
                {rows.map((c: CollectionSummary) => (
                  <Tile key={c.slug} c={c} />
                ))}
              </div>
            </section>
          );
        })}

        {LINK_SECTIONS.map(({ kind, label }) => {
          const rows = collections
            .filter((c: CollectionSummary) => c.kind === kind)
            .sort((a: CollectionSummary, b: CollectionSummary) => a.title.localeCompare(b.title));
          if (rows.length === 0) return null;
          return (
            <section key={kind} className="mt-7">
              <div className="mb-3 flex items-baseline gap-2 border-b border-border pb-1.5">
                <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-text-bright">
                  {label}
                </h2>
                <span className="font-mono text-[10px] text-text-dim">{rows.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {rows.map((c: CollectionSummary) => (
                  <Link
                    key={c.slug}
                    to="/best/$slug"
                    params={{ slug: c.slug }}
                    className="rounded-[4px] border border-border bg-panel px-2 py-[3px] font-mono text-[10.5px] text-text-muted transition-colors hover:border-primary hover:text-primary"
                  >
                    {c.title}
                    <span className="ml-1 text-text-dim">{c.item_count}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
