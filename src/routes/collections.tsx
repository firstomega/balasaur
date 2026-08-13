import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TopBar } from "@/components/balasaur/TopBar";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { listCollections, type CollectionSummary } from "@/lib/collections.functions";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse } from "@/lib/seo";
import { tmdbImage } from "@/lib/tmdbImage";

// /collections — three tiers, priorities in this order: seduction, navigation,
// completeness.
// Tier 1  Featured: four flagship lists picked by rule (biggest service,
//         latest year, top award, one discovery) as large poster-fan cards.
// Tier 2  Shelves by intent (streaming / genre / decades / acclaim) on the
//         same ScrollRail pattern Browse uses.
// Tier 3  The full index at the bottom: plain text links, grouped, carrying
//         the crawl mesh for all ~350 pages (genre-service and genre-decade
//         live ONLY here; they are refinements, not top-level sections).
// The find box filters client side; while searching, tiers 1-2 hide via CSS
// so every link stays in the SSR HTML.

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

// Deterministic brand chips for service cards (no logo fetch, no CLS).
const PROVIDER_CHIP: { name: string; label: string; className: string }[] = [
  { name: "Netflix", label: "N", className: "bg-[#e50914] text-white" },
  { name: "Max", label: "max", className: "bg-[#2723a6] text-white" },
  { name: "Prime", label: "prime", className: "bg-[#0f79af] text-white" },
  { name: "Disney+", label: "D+", className: "bg-[#0e2a72] text-white" },
  { name: "Apple TV+", label: "tv+", className: "border border-[#3a3a3a] bg-black text-white" },
  { name: "Hulu", label: "hulu", className: "bg-[#1ce783] text-[#04210f]" },
  { name: "Paramount+", label: "P+", className: "bg-[#0064ff] text-white" },
  {
    name: "Peacock",
    label: "pck",
    className: "bg-gradient-to-br from-[#7b2ff7] to-[#f107a3] text-white",
  },
  { name: "Tubi", label: "tubi", className: "bg-[#fa382f] text-white" },
];

function providerChip(title: string) {
  return PROVIDER_CHIP.find((p) => title.includes(p.name));
}

/** Big-numeral overlay for decade cards ("The Best of the 1990s" -> "1990s"). */
function decadeWord(title: string): string | null {
  return title.match(/\d{4}s/)?.[0] ?? null;
}

// Featured picks, by rule (never hand-curated): the biggest service list, the
// latest year list, the biggest award list, and one discovery list. Backfilled
// from the largest remaining lists if a rule comes up empty.
function pickFeatured(all: CollectionSummary[]): CollectionSummary[] {
  const used = new Set<string>();
  const take = (c: CollectionSummary | undefined) => {
    if (c && !used.has(c.slug)) {
      used.add(c.slug);
      return c;
    }
    return null;
  };
  const years = all
    .filter((c: CollectionSummary) => c.kind === "year")
    .sort((a: CollectionSummary, b: CollectionSummary) => b.slug.localeCompare(a.slug));
  const awards = all
    .filter((c: CollectionSummary) => c.kind === "awards")
    .sort((a: CollectionSummary, b: CollectionSummary) => b.item_count - a.item_count);
  const picks = [
    take(all.find((c: CollectionSummary) => c.kind === "service")),
    take(years[0]),
    take(awards[0]),
    take(all.find((c: CollectionSummary) => c.kind === "discovery")),
  ].filter(Boolean) as CollectionSummary[];
  for (const c of all) {
    if (picks.length >= 4) break;
    if (!used.has(c.slug)) {
      picks.push(c);
      used.add(c.slug);
    }
  }
  return picks.slice(0, 4);
}

// Hover spread per fan position (Tailwind needs literal class names).
const SPREAD = [
  "",
  "group-hover:translate-x-[6px]",
  "group-hover:translate-x-[12px]",
  "group-hover:translate-x-[18px]",
  "group-hover:translate-x-[24px]",
];

function Fan({
  posters,
  count,
  width,
  height,
  overlap,
  size,
}: {
  posters: string[];
  count: number;
  width: string;
  height: string;
  overlap: string;
  size: string;
}) {
  return (
    <span className="flex">
      {posters.slice(0, count).map((p, i) => (
        <img
          key={i}
          src={tmdbImage(p, size)}
          alt=""
          loading="lazy"
          decoding="async"
          className={`${width} ${height} flex-none rounded-[5px] object-cover shadow-[-14px_0_22px_-12px_rgba(0,0,0,0.85)] ring-1 ring-white/10 transition-transform duration-150 ${
            i > 0 ? overlap : ""
          } ${SPREAD[i]}`}
        />
      ))}
    </span>
  );
}

function FeaturedCard({ c }: { c: CollectionSummary }) {
  const chip = c.kind === "service" ? providerChip(c.title) : null;
  return (
    <Link
      to="/best/$slug"
      params={{ slug: c.slug }}
      className="group block rounded-[8px] bg-gradient-to-b from-panel to-panel/40 p-4 transition-colors hover:bg-[#1c2129] sm:p-5"
    >
      <Fan
        posters={c.posters}
        count={5}
        width="w-[86px] sm:w-[106px]"
        height="h-[129px] sm:h-[159px]"
        overlap="ml-[-36px] sm:ml-[-45px]"
        size="w342"
      />
      <span className="mt-3.5 block text-[19px] font-semibold leading-tight tracking-tight text-text-bright group-hover:text-primary sm:text-[21px]">
        {chip && (
          <span
            className={`mr-2 inline-grid h-5 place-items-center rounded-[4px] px-1.5 align-[2px] font-mono text-[10px] font-bold ${chip.className}`}
          >
            {chip.label}
          </span>
        )}
        {c.title}
      </span>
      <span className="mt-1 block font-mono text-[11px] text-text-dim">
        {typeof c.top_score === "number" && (
          <>
            Top pick scores <span className="text-rating">{c.top_score}</span>
          </>
        )}
        {c.item_count < 60 && <> · {c.item_count} titles cleared the bar</>}
      </span>
    </Link>
  );
}

function ShelfCard({ c }: { c: CollectionSummary }) {
  const chip = c.kind === "service" ? providerChip(c.title) : null;
  const era = c.kind === "decade" ? decadeWord(c.title) : null;
  return (
    <Link
      to="/best/$slug"
      params={{ slug: c.slug }}
      className="group block w-[196px] flex-none rounded-[7px] p-3 transition-colors hover:bg-panel"
    >
      <span className="relative block w-max">
        {chip && (
          <span
            className={`absolute -left-1.5 -top-1.5 z-10 grid h-6 min-w-6 place-items-center rounded-[5px] px-1.5 font-mono text-[11px] font-bold shadow-[0_3px_10px_rgba(0,0,0,0.6)] ${chip.className}`}
          >
            {chip.label}
          </span>
        )}
        <Fan
          posters={c.posters}
          count={3}
          width="w-[78px]"
          height="h-[117px]"
          overlap="ml-[-33px]"
          size="w185"
        />
        {era && (
          <span className="absolute bottom-2 left-2.5 z-10 font-mono text-[22px] font-bold tracking-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.95)]">
            {era}
          </span>
        )}
      </span>
      <span className="mt-2.5 block text-[14px] font-semibold leading-snug text-text-bright group-hover:text-primary">
        {c.title}
      </span>
      {typeof c.top_score === "number" && (
        <span className="mt-0.5 block font-mono text-[10px] text-text-dim">
          top <span className="text-rating">{c.top_score}</span>
        </span>
      )}
    </Link>
  );
}

function Shelf({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-11">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-text-bright">{title}</h2>
        {meta && <span className="font-mono text-[10.5px] text-text-dim">{meta}</span>}
      </div>
      <div className="mt-3.5">
        <ScrollRail className="gap-2">{children}</ScrollRail>
      </div>
    </section>
  );
}

// One index column: all links stay in the HTML; past the cap they collapse via
// CSS until expanded.
function IndexColumn({ label, rows }: { label: string; rows: CollectionSummary[] }) {
  const CAP = 12;
  const [open, setOpen] = useState(false);
  return (
    <div>
      <h3 className="mb-2 border-b border-border pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-dim">
        {label} · {rows.length}
      </h3>
      {rows.map((c: CollectionSummary, i: number) => (
        <Link
          key={c.slug}
          to="/best/$slug"
          params={{ slug: c.slug }}
          className={`block py-[2.5px] text-[12.5px] leading-snug text-text-muted hover:text-primary ${
            !open && i >= CAP ? "hidden" : ""
          }`}
        >
          {c.title}
        </Link>
      ))}
      {rows.length > CAP && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-1.5 font-mono text-[10.5px] text-text-dim transition-colors hover:text-primary"
        >
          {open ? "Show fewer" : `+ ${rows.length - CAP} more`}
        </button>
      )}
    </div>
  );
}

function CollectionsPage() {
  const collections = Route.useLoaderData();
  const [q, setQ] = useState("");

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

  const featured = useMemo(() => pickFeatured(collections), [collections]);
  const byKind = (k: string) => collections.filter((c: CollectionSummary) => c.kind === k);
  const services = byKind("service");
  const genres = byKind("genre");
  const decades = byKind("decade").sort((a: CollectionSummary, b: CollectionSummary) =>
    b.slug.localeCompare(a.slug),
  );
  const acclaim = [...byKind("awards"), ...byKind("discovery")];
  const years = byKind("year").sort((a: CollectionSummary, b: CollectionSummary) =>
    b.slug.localeCompare(a.slug),
  );
  const alpha = (rows: CollectionSummary[]) =>
    [...rows].sort((a: CollectionSummary, b: CollectionSummary) => a.title.localeCompare(b.title));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[1240px] px-5 py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[29px] font-bold leading-tight tracking-tight text-text-bright">
              Collections
            </h1>
            <p className="mt-1.5 max-w-[58ch] text-[13.5px] text-text-muted">
              Ranked lists drawn from 65,000 titles. Ordered by Balasaur Score, rebuilt nightly.
            </p>
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a collection"
            aria-label="Find a collection"
            className="w-full rounded-[6px] border border-border bg-panel px-3.5 py-2.5 font-mono text-[12px] text-text-bright placeholder:text-text-dim focus:border-primary focus:outline-none sm:w-72"
          />
        </div>

        {matches && (
          <section className="mt-7">
            <h2 className="text-[15px] font-semibold text-text-bright">
              Matches{" "}
              <span className="font-mono text-[10.5px] text-text-dim">{matches.length}</span>
            </h2>
            {matches.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {matches.map((c: CollectionSummary) => (
                  <Link
                    key={c.slug}
                    to="/best/$slug"
                    params={{ slug: c.slug }}
                    className="rounded-[4px] border border-border bg-panel px-2.5 py-1 font-mono text-[11px] text-text-muted transition-colors hover:border-primary hover:text-primary"
                  >
                    {c.title}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-text-muted">
                Nothing matches "{q.trim()}". Try a genre, service, decade, or year.
              </p>
            )}
          </section>
        )}

        <div className={matches ? "hidden" : undefined}>
          {/* Tier 1: featured */}
          <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {featured.map((c) => (
              <FeaturedCard key={c.slug} c={c} />
            ))}
          </div>

          {/* Tier 2: shelves */}
          {services.length > 0 && (
            <Shelf title="Streaming now" meta={`${services.length} services · updated nightly`}>
              {services.map((c: CollectionSummary) => (
                <ShelfCard key={c.slug} c={c} />
              ))}
            </Shelf>
          )}
          {genres.length > 0 && (
            <Shelf title="By genre" meta={`${genres.length} lists`}>
              {genres.map((c: CollectionSummary) => (
                <ShelfCard key={c.slug} c={c} />
              ))}
            </Shelf>
          )}
          {decades.length > 0 && (
            <Shelf
              title="Through the decades"
              meta={`${decades.length} decades · ${years.length} years`}
            >
              {decades.map((c: CollectionSummary) => (
                <ShelfCard key={c.slug} c={c} />
              ))}
            </Shelf>
          )}
          {acclaim.length > 0 && (
            <Shelf title="Acclaimed & curated" meta={`${acclaim.length} lists`}>
              {acclaim.map((c: CollectionSummary) => (
                <ShelfCard key={c.slug} c={c} />
              ))}
            </Shelf>
          )}

          {/* Tier 3: the full index */}
          <section className="mt-13 border-t border-border pt-7">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
              Every collection
            </div>
            <p className="mt-1 text-[12px] text-text-dim">
              The complete index, {collections.length} lists. Or type in the box above to jump
              straight to one.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-7 md:grid-cols-4">
              <IndexColumn label="Genre × service" rows={alpha(byKind("genre-service"))} />
              <IndexColumn label="Genre × decade" rows={alpha(byKind("genre-decade"))} />
              <IndexColumn label="By year" rows={years} />
              <IndexColumn label="By origin" rows={alpha(byKind("origin-genre"))} />
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 pb-2">
              <Link
                to="/methodology"
                className="font-mono text-[10.5px] text-text-muted hover:text-primary"
              >
                How we rank →
              </Link>
              <span className="font-mono text-[10.5px] text-text-dim">Rebuilt nightly</span>
              <span className="font-mono text-[10.5px] text-text-dim">Data: TMDB &amp; OMDb</span>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
