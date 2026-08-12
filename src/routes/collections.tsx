import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TopBar } from "@/components/balasaur/TopBar";
import { listCollections, type CollectionSummary } from "@/lib/collections.functions";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse } from "@/lib/seo";
import { tmdbImage } from "@/lib/tmdbImage";

// /collections — the library front door. Hub redesign notes:
// - One focal point per collection: the cover is the #1 title's poster on a
//   stacked deck (the old 2x2 collages read as an undifferentiated 8-column
//   poster wall).
// - Hero tier: "By service" gets rich deck tiles; every other browsable kind
//   compresses to list rows so the page reads like a table of contents.
// - Capped sections: overflow items stay in the SSR HTML (CSS-hidden until
//   expanded) so all ~350 pages keep a crawlable sitewide link.
// - Type-to-jump box filters all collections client-side; the full layout
//   stays in the DOM while searching for the same reason.

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

const ROW_SECTIONS: { kinds: string[]; label: string; cap: number }[] = [
  { kinds: ["origin-genre"], label: "By origin", cap: 12 },
  { kinds: ["genre"], label: "By genre", cap: 12 },
  { kinds: ["decade"], label: "By decade", cap: 12 },
  { kinds: ["awards", "discovery"], label: "Acclaim & discovery", cap: 12 },
];

const CHIP_SECTIONS: { kind: string; label: string; cap: number }[] = [
  { kind: "genre-service", label: "Genre × service", cap: 36 },
  { kind: "genre-decade", label: "Genre × decade", cap: 36 },
  { kind: "year", label: "By year", cap: 36 },
];

// The #1 title's poster on a fanned stack of card edges: one visual object
// that says "a ranked pile of titles" without four competing focal points.
function DeckTile({ c, hidden }: { c: CollectionSummary; hidden?: boolean }) {
  const cover = c.posters[0];
  return (
    <Link
      to="/best/$slug"
      params={{ slug: c.slug }}
      className={`group block ${hidden ? "hidden" : ""}`}
    >
      <span className="relative block aspect-[2/3]">
        <span
          aria-hidden="true"
          className="absolute inset-0 rotate-[2.5deg] rounded-[6px] border border-border bg-panel transition-transform duration-150 group-hover:translate-x-1 group-hover:rotate-[5deg]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 rotate-[1deg] rounded-[6px] border border-border bg-border/60 transition-transform duration-150 group-hover:rotate-[2.5deg]"
        />
        {cover ? (
          <img
            src={tmdbImage(cover, "w342")}
            alt=""
            loading="lazy"
            decoding="async"
            className="relative h-full w-full rounded-[6px] border border-border object-cover transition-transform duration-150 group-hover:-translate-y-1"
          />
        ) : (
          <span className="relative block h-full w-full rounded-[6px] border border-border bg-panel" />
        )}
      </span>
      <span className="mt-2 block text-[13.5px] font-semibold leading-tight text-text-bright group-hover:text-primary">
        {c.title}
      </span>
      <span className="mt-0.5 flex gap-2 font-mono text-[10px] text-text-dim">
        <span>{c.item_count} titles</span>
        {typeof c.top_score === "number" && <span className="text-rating">top {c.top_score}</span>}
      </span>
    </Link>
  );
}

// Table-of-contents row: mini cover, title, stats. Low visual weight on
// purpose; these sections are for scanning, not browsing.
function RowLink({ c, hidden }: { c: CollectionSummary; hidden?: boolean }) {
  const cover = c.posters[0];
  return (
    <Link
      to="/best/$slug"
      params={{ slug: c.slug }}
      className={`group flex items-center gap-3 rounded-[6px] border border-border bg-panel px-3 py-2 transition-colors hover:border-primary ${hidden ? "hidden" : ""}`}
    >
      {cover ? (
        <img
          src={tmdbImage(cover, "w92")}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-12 w-8 shrink-0 rounded-[3px] object-cover"
        />
      ) : (
        <span className="h-12 w-8 shrink-0 rounded-[3px] bg-border" />
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-tight text-text-bright group-hover:text-primary">
        {c.title}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-text-dim">
        {c.item_count}
        {typeof c.top_score === "number" && (
          <span className="text-rating"> · top {c.top_score}</span>
        )}
      </span>
    </Link>
  );
}

function ChipLink({ c, hidden }: { c: CollectionSummary; hidden?: boolean }) {
  return (
    <Link
      to="/best/$slug"
      params={{ slug: c.slug }}
      className={`rounded-[4px] border border-border bg-panel px-2 py-[3px] font-mono text-[10.5px] text-text-muted transition-colors hover:border-primary hover:text-primary ${hidden ? "hidden" : ""}`}
    >
      {c.title}
      <span className="ml-1 text-text-dim">{c.item_count}</span>
    </Link>
  );
}

function SectionHeader({
  label,
  count,
  open,
  cap,
  onToggle,
}: {
  label: string;
  count: number;
  open: boolean;
  cap: number;
  onToggle: () => void;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-2 border-b border-border pb-1.5">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-text-bright">
        {label}
      </h2>
      <span className="font-mono text-[10px] text-text-dim">{count}</span>
      {count > cap && (
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-primary"
        >
          {open ? "Show fewer" : `All ${count}`}
        </button>
      )}
    </div>
  );
}

function CollectionsPage() {
  const collections = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggle = (label: string) => setOpenSections((s) => ({ ...s, [label]: !s[label] }));

  const query = q.trim().toLowerCase();
  const matches = useMemo(
    () =>
      query
        ? collections
            .filter((c: CollectionSummary) => c.title.toLowerCase().includes(query))
            .slice(0, 40)
        : null,
    [query, collections],
  );

  const services = collections.filter((c: CollectionSummary) => c.kind === "service");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[1160px] px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-bold tracking-tight text-text-bright">Collections</h1>
            <p className="mt-1 max-w-[62ch] text-[13.5px] text-text-muted">
              Ranked lists drawn from 65,000 titles: by service, decade, genre, and acclaim. Each
              one is ordered by Balasaur Score and rebuilt nightly.
            </p>
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a collection"
            aria-label="Find a collection"
            className="w-full rounded-[5px] border border-border bg-panel px-3 py-2 font-mono text-[12px] text-text-bright placeholder:text-text-dim focus:border-primary focus:outline-none sm:w-64"
          />
        </div>

        {/* Jump results: shown while typing; the full directory below stays in
            the DOM (CSS-hidden) so crawlers always see every link. */}
        {matches && (
          <section className="mt-6">
            <div className="mb-3 flex items-baseline gap-2 border-b border-border pb-1.5">
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-text-bright">
                Matches
              </h2>
              <span className="font-mono text-[10px] text-text-dim">{matches.length}</span>
            </div>
            {matches.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {matches.map((c: CollectionSummary) => (
                  <ChipLink key={c.slug} c={c} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-text-muted">
                Nothing matches "{q.trim()}". Try a genre, service, decade, or year.
              </p>
            )}
          </section>
        )}

        <div className={matches ? "hidden" : undefined}>
          {/* Hero tier: services are what people actually browse by. */}
          {services.length > 0 && (
            <section className="mt-7">
              <div className="mb-3 flex items-baseline gap-2 border-b border-border pb-1.5">
                <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-text-bright">
                  By service
                </h2>
                <span className="font-mono text-[10px] text-text-dim">{services.length}</span>
              </div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {services.map((c: CollectionSummary) => (
                  <DeckTile key={c.slug} c={c} />
                ))}
              </div>
            </section>
          )}

          {ROW_SECTIONS.map(({ kinds, label, cap }) => {
            const rows = collections.filter((c: CollectionSummary) => kinds.includes(c.kind));
            if (rows.length === 0) return null;
            const open = !!openSections[label];
            return (
              <section key={label} className="mt-7">
                <SectionHeader
                  label={label}
                  count={rows.length}
                  open={open}
                  cap={cap}
                  onToggle={() => toggle(label)}
                />
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {rows.map((c: CollectionSummary, i: number) => (
                    <RowLink key={c.slug} c={c} hidden={!open && i >= cap} />
                  ))}
                </div>
              </section>
            );
          })}

          {CHIP_SECTIONS.map(({ kind, label, cap }) => {
            const rows = collections
              .filter((c: CollectionSummary) => c.kind === kind)
              .sort((a: CollectionSummary, b: CollectionSummary) => a.title.localeCompare(b.title));
            if (rows.length === 0) return null;
            const open = !!openSections[label];
            return (
              <section key={kind} className="mt-7">
                <SectionHeader
                  label={label}
                  count={rows.length}
                  open={open}
                  cap={cap}
                  onToggle={() => toggle(label)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {rows.map((c: CollectionSummary, i: number) => (
                    <ChipLink key={c.slug} c={c} hidden={!open && i >= cap} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
