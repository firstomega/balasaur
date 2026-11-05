import { createFileRoute, Link, type ErrorComponentProps } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  EmptyState,
  EMPTY_ACTION_CLASS,
  EMPTY_ACTION_QUIET_CLASS,
} from "@/components/balasaur/EmptyState";
import { ScrollRail } from "@/components/balasaur/ScrollRail";
import { ListTile } from "@/components/balasaur/ListTile";
import { paintTiles } from "@/lib/paintWall";
import { listCollections, type CollectionSummary } from "@/lib/collections.functions";
import { SITE_ORIGIN, canonicalLink, buildMeta, cacheSsrResponse } from "@/lib/seo";
import { useCollectionOverlap } from "@/hooks/useCollectionOverlap";
import { collectionProgressLine } from "@/lib/collectionProgress";
import { CATALOG_FLOOR_LABEL } from "@/lib/catalogCount";

// /collections — three tiers, priorities in this order: seduction, navigation,
// completeness.
// Tier 1  Featured: four flagship lists picked by rule (biggest service,
//         latest year, top award, one discovery) as list tiles.
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
    // The month decides which occasions lead. Decided here, once, in UTC, so
    // the cached page and every client's first render agree. Read from the
    // viewer's clock it differed across the month boundary and the server
    // and client rendered different sections.
    return { collections: await listCollections(), month: new Date().getUTCMonth() + 1 };
  },
  head: () => ({
    meta: buildMeta({
      title: "Ranked Movie & TV Collections | Balasaur",
      description: `Ranked lists drawn from more than ${CATALOG_FLOOR_LABEL} titles: by service, decade, genre, and acclaim. Each one is ordered by Balasaur Score and rebuilt nightly.`,
      url: `${SITE_ORIGIN}/collections`,
    }),
    links: [canonicalLink(`${SITE_ORIGIN}/collections`)],
  }),
  // Three states, told apart. Rows in hand: the page. Rows still coming, on a
  // connection slow enough to notice: the shelf outline, which says the click
  // landed. Rows that will not come: the dead end, which says so and offers a
  // way out. Without the first two a visitor waiting on the index was shown a
  // frozen previous page, and a request that failed took the whole site chrome
  // with it, search bar included.
  pendingComponent: CollectionsPending,
  errorComponent: CollectionsError,
  component: CollectionsPage,
});

/** The decade a decade list covers ("The Best of the 1990s" -> "1990s"). */
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

/** A row of list tiles, painted together so neighbours do not repeat a colour
 *  (src/lib/paintWall.ts). Rendered as siblings, so a rail snaps each one. */
/** A list tile's width inside a rail. */
const RAIL_TILE = "w-[168px] shrink-0 md:w-[220px]";

function ShelfTiles({
  items,
  progressFor,
  className,
}: {
  items: CollectionSummary[];
  progressFor?: (c: CollectionSummary) => string | null;
  className?: string;
}) {
  const paint = paintTiles(items.map((c) => c.lead));
  return (
    <>
      {items.map((c, i) => (
        <ListTile
          key={c.slug}
          slug={c.slug}
          title={c.title}
          itemCount={c.item_count}
          lead={c.lead}
          swatch={paint[i]}
          progress={progressFor?.(c)}
          className={className}
        />
      ))}
    </>
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
        <h2 className="text-[19px] font-black tracking-[-0.02em] text-text-bright">{title}</h2>
        {meta && <span className="font-mono text-[12px] tabular-nums text-text-dim">{meta}</span>}
      </div>
      <div className="mt-3.5">
        <ScrollRail label={title}>{children}</ScrollRail>
      </div>
    </section>
  );
}

// ---- Tier 3 index: matrices and a year grid, not link lists. A cross of two
// facets is a table, and 67 years are a timeline; rendering either as a
// truncated list with "+55 more" made the index read as filler. Every cell
// and year below is a real link in the SSR HTML (the crawl mesh), just shaped
// like the data.

const MATRIX_COLS: { slug: string; label: string; short: string }[] = [
  { slug: "netflix", label: "Netflix", short: "NFLX" },
  { slug: "max", label: "Max", short: "MAX" },
  { slug: "prime", label: "Prime", short: "PRIME" },
  { slug: "disney-plus", label: "Disney+", short: "D+" },
  { slug: "apple-tv-plus", label: "Apple TV+", short: "TV+" },
  { slug: "hulu", label: "Hulu", short: "HULU" },
  { slug: "paramount-plus", label: "Paramount+", short: "P+" },
  { slug: "peacock", label: "Peacock", short: "PCK" },
  { slug: "tubi", label: "Tubi", short: "TUBI" },
];

interface MatrixRow {
  label: string;
  cells: (CollectionSummary | null)[];
}

function buildMatrix(
  pairs: { row: string; col: string; c: CollectionSummary }[],
  cols: string[],
): MatrixRow[] {
  const rowLabels = [...new Set(pairs.map((p) => p.row))].sort();
  return rowLabels.map((label) => ({
    label,
    cells: cols.map((col) => pairs.find((p) => p.row === label && p.col === col)?.c ?? null),
  }));
}

function IndexMatrix({ label, cols, rows }: { label: string; cols: string[]; rows: MatrixRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-8">
      <h3 className="mb-2.5 text-[18px] font-black tracking-[-0.02em] text-text-bright">{label}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className="w-36 pb-1.5 pr-3" />
              {cols.map((col) => (
                <th
                  key={col}
                  className="px-1 pb-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-text-dim"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border/60">
                <td className="py-0.5 pr-3 text-[12.5px] leading-tight text-text-muted">
                  {r.label}
                </td>
                {r.cells.map((cell, i) =>
                  cell ? (
                    <td key={i} className="px-0.5 py-0.5 text-center">
                      <Link
                        to="/best/$slug"
                        params={{ slug: cell.slug }}
                        aria-label={cell.title}
                        title={cell.title}
                        className="group/cell inline-flex h-6 w-full min-w-7 items-center justify-center rounded-[3px] transition-colors hover:bg-panel"
                      >
                        <span className="h-2 w-2 rounded-[2px] bg-text-dim transition-colors group-hover/cell:bg-primary" />
                      </Link>
                    </td>
                  ) : (
                    <td key={i} className="px-0.5 py-0.5 text-center">
                      <span className="mx-auto block h-[3px] w-[3px] rounded-full bg-border-strong" />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// All year lists at once, grouped by decade. Since the v8 media-type split
// each year comes as a movie list and a show list, so a chip is the year plus
// a type dot in the site's media colors (same key as the origin matrix).
function YearIndex({ years }: { years: CollectionSummary[] }) {
  if (years.length === 0) return null;
  const parsed = years
    .map((c) => ({ c, year: c.slug.match(/-of-(\d{4})$/)?.[1] }))
    .filter((p): p is { c: CollectionSummary; year: string } => !!p.year);
  const byDecade = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const dec = `${p.year.slice(0, 3)}0s`;
    byDecade.set(dec, [...(byDecade.get(dec) ?? []), p]);
  }
  const decades = [...byDecade.keys()].sort().reverse();
  return (
    <div className="mt-8">
      <h3 className="mb-2.5 text-[18px] font-black tracking-[-0.02em] text-text-bright">By year</h3>
      <div className="space-y-1">
        {decades.map((dec) => (
          <div key={dec} className="flex items-baseline gap-3 border-t border-border/60 py-1">
            <span className="w-14 shrink-0 font-mono text-[11px] tabular-nums tracking-wider text-text-dim">
              {dec}
            </span>
            <div className="flex flex-wrap gap-x-1 gap-y-0.5">
              {(byDecade.get(dec) ?? [])
                .sort(
                  (a, b) =>
                    b.year.localeCompare(a.year) ||
                    (a.c.media_type ?? "").localeCompare(b.c.media_type ?? ""),
                )
                .map(({ c, year }) => (
                  <Link
                    key={c.slug}
                    to="/best/$slug"
                    params={{ slug: c.slug }}
                    aria-label={c.title}
                    title={c.title}
                    className="inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 font-mono text-[11.5px] tabular-nums text-text-muted transition-colors hover:bg-panel hover:text-primary"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-[2px] ${c.media_type === "tv" ? "bg-media-tv" : "bg-media-movie"}`}
                    />
                    {year}
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Every filmography link ships in the HTML. This section is the only place on
// the site that links a person list, so anything held back behind a tap was
// unreachable. A-Z rows, the same row shape the year index uses.
function PeopleIndex({ people }: { people: CollectionSummary[] }) {
  const byInitial = new Map<string, CollectionSummary[]>();
  for (const c of people) {
    const initial = c.title
      .replace(/^The Best /, "")
      .slice(0, 1)
      .toUpperCase();
    byInitial.set(initial, [...(byInitial.get(initial) ?? []), c]);
  }
  // Plain sort, not localeCompare: single letters, and the CDN-cached SSR
  // order has to match every client's hydration order exactly.
  const initials = [...byInitial.keys()].sort();
  return (
    <div className="mt-3.5 space-y-1">
      {initials.map((letter) => (
        <div key={letter} className="flex items-baseline gap-3 border-t border-border/60 py-1">
          <span className="w-4 shrink-0 font-mono text-[12px] uppercase tracking-wider text-text-dim">
            {letter}
          </span>
          <div className="flex flex-wrap gap-x-1 gap-y-0.5">
            {(byInitial.get(letter) ?? []).map((c) => (
              <Link
                key={c.slug}
                to="/best/$slug"
                params={{ slug: c.slug }}
                className="inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[12px] text-text-muted transition-colors hover:bg-panel hover:text-primary"
              >
                {c.title.replace(/^The Best /, "")}
                <span className="font-mono tabular-nums text-text-dim">{c.item_count}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function genreServicePairs(rows: CollectionSummary[]) {
  const out: { row: string; col: string; c: CollectionSummary }[] = [];
  for (const c of rows) {
    const svc = MATRIX_COLS.find((sv) => c.slug.endsWith(`-on-${sv.slug}`));
    if (!svc) continue;
    out.push({ row: c.title.split(" on ")[0], col: svc.short, c });
  }
  return out;
}

// Origin-genre shelves are split by media type (v10), so one (origin, genre)
// cell can hold a Movies list and a Shows list. K-Dramas is Korean tv drama
// under its real category name.
function originGenrePairs(rows: CollectionSummary[]) {
  const out: { row: string; col: string; type: "movie" | "tv"; c: CollectionSummary }[] = [];
  for (const c of rows) {
    if (c.slug === "best-k-dramas") {
      out.push({ row: "Korean", col: "Drama", type: "tv", c });
      continue;
    }
    const m = c.title.match(/^The Best (\S+) (.+) (Movies|Shows)$/);
    if (!m) continue;
    out.push({ row: m[1], col: m[2], type: m[3] === "Movies" ? "movie" : "tv", c });
  }
  return out;
}

interface DualCell {
  movie?: CollectionSummary;
  tv?: CollectionSummary;
}
interface DualMatrixRow {
  label: string;
  cells: (DualCell | null)[];
}

function buildDualMatrix(
  pairs: { row: string; col: string; type: "movie" | "tv"; c: CollectionSummary }[],
  cols: string[],
): DualMatrixRow[] {
  const rowLabels = [...new Set(pairs.map((p) => p.row))].sort();
  return rowLabels.map((label) => ({
    label,
    cells: cols.map((col) => {
      const movie = pairs.find((p) => p.row === label && p.col === col && p.type === "movie")?.c;
      const tv = pairs.find((p) => p.row === label && p.col === col && p.type === "tv")?.c;
      return movie || tv ? { movie, tv } : null;
    }),
  }));
}

// The origin matrix with type-colored dots: gold for a Movies list, blue for
// a Shows list, matching the media tags on every poster card.
function DualIndexMatrix({
  label,
  cols,
  rows,
}: {
  label: string;
  cols: string[];
  rows: DualMatrixRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-8">
      <div className="mb-2.5 flex items-center gap-4">
        <h3 className="text-[18px] font-black tracking-[-0.02em] text-text-bright">{label}</h3>
        <span className="flex items-center gap-3 text-[12px] font-semibold text-text-dim">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-[2px] bg-media-movie" /> Movies
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-[2px] bg-media-tv" /> Shows
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className="w-36 pb-1.5 pr-3" />
              {cols.map((col) => (
                <th
                  key={col}
                  className="px-1 pb-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-text-dim"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border/60">
                <td className="py-0.5 pr-3 text-[12.5px] leading-tight text-text-muted">
                  {r.label}
                </td>
                {r.cells.map((cell, i) => (
                  <td key={i} className="px-0.5 py-0.5 text-center">
                    {cell ? (
                      <span className="inline-flex h-6 items-center justify-center gap-1">
                        {cell.movie && (
                          <Link
                            to="/best/$slug"
                            params={{ slug: cell.movie.slug }}
                            aria-label={cell.movie.title}
                            title={cell.movie.title}
                            className="inline-flex h-6 w-7 items-center justify-center rounded-[3px] transition-colors hover:bg-panel"
                          >
                            <span className="h-2 w-2 rounded-[2px] bg-media-movie/80 transition-colors hover:bg-media-movie" />
                          </Link>
                        )}
                        {cell.tv && (
                          <Link
                            to="/best/$slug"
                            params={{ slug: cell.tv.slug }}
                            aria-label={cell.tv.title}
                            title={cell.tv.title}
                            className="inline-flex h-6 w-7 items-center justify-center rounded-[3px] transition-colors hover:bg-panel"
                          >
                            <span className="h-2 w-2 rounded-[2px] bg-media-tv/80 transition-colors hover:bg-media-tv" />
                          </Link>
                        )}
                      </span>
                    ) : (
                      <span className="mx-auto block h-[3px] w-[3px] rounded-full bg-border-strong" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The page's shell: heading and site chrome, shared by all three states so a
 *  slow request and a failed one still leave the visitor somewhere to go. */
function CollectionsShell({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main id="main" className="mx-auto max-w-content px-5 py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[30px] font-black leading-[1.05] tracking-[-0.02em] text-text-bright">
            Collections
          </h1>
          {aside}
        </div>
        {children}
      </main>
    </div>
  );
}

/** Rows will not come. Said once, used by the failed request and by an index
 *  that came back with nothing, which are the same thing from a chair. */
function IndexDeadEnd() {
  return (
    <EmptyState
      className="mt-9"
      line="The collection index did not load."
      hint="Try again, or start from the catalog."
      action={
        <>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={EMPTY_ACTION_CLASS}
          >
            Try again
          </button>
          <Link to="/" className={EMPTY_ACTION_QUIET_CLASS}>
            Browse the catalog
          </Link>
        </>
      }
    />
  );
}

function CollectionsError({ error }: ErrorComponentProps) {
  console.error(error);
  return (
    <CollectionsShell>
      <IndexDeadEnd />
    </CollectionsShell>
  );
}

/** Rows are still coming. The outline of what is arriving, in the sizes the
 *  real cards use, so nothing jumps when they land. */
function CollectionsPending() {
  return (
    <CollectionsShell>
      {/* Same grid, same card sizes as the real tiers, so the rows land in the
          boxes they were drawn in instead of shifting the page under a thumb. */}
      <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[186px] animate-pulse rounded-[8px] bg-panel" />
        ))}
      </div>
      {[0, 1].map((r) => (
        <div key={r} className="mt-11">
          <div className="h-[19px] w-52 animate-pulse rounded bg-panel" />
          <div className="mt-3.5 flex gap-2 overflow-hidden">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-[190px] w-[196px] shrink-0 animate-pulse rounded-[7px] bg-panel"
              />
            ))}
          </div>
        </div>
      ))}
      <p className="sr-only" role="status">
        Loading collections
      </p>
    </CollectionsShell>
  );
}

function CollectionsPage() {
  const { collections, month } = Route.useLoaderData();
  const [q, setQ] = useState("");
  // Personal, so it arrives after mount: the page itself is cached for six
  // hours and served identically to everyone. Until it lands, and for every
  // shelf the visitor has never touched, the card shows its title count.
  const { overlap } = useCollectionOverlap();
  const progressFor = (c: CollectionSummary) => {
    const o = overlap.get(c.slug);
    return o ? collectionProgressLine({ total: c.item_count, seen: o.seen, want: o.want }) : null;
  };

  const query = q.trim().toLowerCase();
  const matches = useMemo(
    () =>
      query
        ? collections.filter((c: CollectionSummary) => c.title.toLowerCase().includes(query))
        : null,
    [query, collections],
  );

  const featured = useMemo(() => pickFeatured(collections), [collections]);
  const byKind = (k: string) => collections.filter((c: CollectionSummary) => c.kind === k);
  // Occasions are the human-shaped shelves ("Date Night Movies"). Those whose
  // season covers the current month lead, so October surfaces the Halloween
  // list without anyone touching it.
  const occasions = byKind("occasion");
  const inSeason = occasions.filter((c: CollectionSummary) => c.season_months?.includes(month));
  const everyday = occasions.filter((c: CollectionSummary) => !c.season_months?.includes(month));
  const services = byKind("service");
  const genres = byKind("genre");
  const origins = byKind("origin");
  const decades = byKind("decade").sort((a: CollectionSummary, b: CollectionSummary) =>
    b.slug.localeCompare(a.slug),
  );
  const acclaim = [...byKind("awards"), ...byKind("discovery")];
  // Locale pinned so the CDN-cached SSR order and every client's hydration
  // order agree on names with diacritics.
  const people = byKind("person").sort((a: CollectionSummary, b: CollectionSummary) =>
    a.title.localeCompare(b.title, "en"),
  );
  const years = byKind("year").sort((a: CollectionSummary, b: CollectionSummary) =>
    b.slug.localeCompare(a.slug),
  );
  const originPairs = originGenrePairs(byKind("origin-genre"));
  const originCols = [...new Set(originPairs.map((p) => p.col))].sort();
  // Every tier below is guarded on its own kind being non-empty, so a loader
  // that returns nothing used to render the page chrome over a blank viewport
  // with a lone "Every collection 0" in the middle of it. Nothing on the page
  // is usable in that state, including the find box, so the whole body is
  // replaced by the one dead end that has a way out of it.
  const none = collections.length === 0;

  return (
    <CollectionsShell
      aside={
        !none && (
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a collection"
            aria-label="Find a collection"
            className="w-full rounded-[6px] border border-border bg-panel px-3.5 py-2.5 text-[14px] text-text-bright placeholder:text-text-dim focus:border-primary focus:outline-none sm:w-72"
          />
        )
      }
    >
      <>
        {none && <IndexDeadEnd />}

        {matches && (
          <section className="mt-7">
            {matches.length > 0 && (
              <h2 className="text-[18px] font-black tracking-[-0.02em] text-text-bright">
                Matches{" "}
                <span className="font-mono text-[13px] tabular-nums text-text-dim">
                  {matches.length}
                </span>
              </h2>
            )}
            {matches.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {matches.map((c: CollectionSummary) => (
                  <Link
                    key={c.slug}
                    to="/best/$slug"
                    params={{ slug: c.slug }}
                    className="rounded-[4px] border border-border bg-panel px-2.5 py-1 text-[13px] text-text-muted transition-colors hover:border-primary hover:text-primary"
                  >
                    {c.title}
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                variant="inline"
                line={`Nothing matches "${q.trim()}".`}
                hint="Collections are named by genre, service, decade, and year. Try one of those."
                action={
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className={EMPTY_ACTION_QUIET_CLASS}
                  >
                    Clear the search
                  </button>
                }
              />
            )}
          </section>
        )}

        <div className={matches || none ? "hidden" : undefined}>
          {/* Tier 1: featured */}
          <div className="mt-7 grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
            <ShelfTiles items={featured} className="md:min-h-48" />
          </div>

          {/* Tier 2: shelves. Occasions lead: they answer "what should I put on
              tonight", which is the question people actually arrive with. */}
          {occasions.length > 0 && (
            <Shelf
              title="Occasions"
              meta={
                inSeason.length > 0
                  ? `${occasions.length} lists · ${inSeason.length} in season`
                  : `${occasions.length} lists`
              }
            >
              <ShelfTiles
                items={[...inSeason, ...everyday]}
                progressFor={progressFor}
                className={RAIL_TILE}
              />
            </Shelf>
          )}
          {services.length > 0 && (
            <Shelf title="Streaming now" meta={`${services.length} services · updated nightly`}>
              <ShelfTiles items={services} progressFor={progressFor} className={RAIL_TILE} />
            </Shelf>
          )}
          {genres.length > 0 && (
            <Shelf title="By genre" meta={`${genres.length} lists`}>
              <ShelfTiles items={genres} progressFor={progressFor} className={RAIL_TILE} />
            </Shelf>
          )}
          {origins.length > 0 && (
            <Shelf title="By country" meta={`${origins.length} lists`}>
              <ShelfTiles items={origins} progressFor={progressFor} className={RAIL_TILE} />
            </Shelf>
          )}
          {decades.length > 0 && (
            <Shelf
              title="Through the decades"
              meta={`${new Set(decades.map((c: CollectionSummary) => decadeWord(c.title))).size} decades · ${new Set(years.map((c: CollectionSummary) => c.slug.match(/-of-(\d{4})$/)?.[1])).size} years`}
            >
              <ShelfTiles items={decades} progressFor={progressFor} className={RAIL_TILE} />
            </Shelf>
          )}
          {acclaim.length > 0 && (
            <Shelf title="Awards & discovery" meta={`${acclaim.length} lists`}>
              <ShelfTiles items={acclaim} progressFor={progressFor} className={RAIL_TILE} />
            </Shelf>
          )}
          {people.length > 0 && (
            <section className="mt-11">
              <div className="flex items-baseline gap-3">
                <h2 className="text-[19px] font-black tracking-[-0.02em] text-text-bright">
                  People
                </h2>
                <span className="font-mono text-[12px] tabular-nums text-text-dim">
                  {people.length} lists
                </span>
              </div>
              <PeopleIndex people={people} />
            </section>
          )}

          {/* Tier 3: the full index */}
          <section className="mt-13 border-t border-border pt-7">
            <div className="text-[20px] font-black tracking-[-0.02em] text-text-bright">
              Every collection
              {collections.length > 0 && (
                <span className="ml-2 font-mono text-[14px] tabular-nums text-text-dim">
                  {collections.length}
                </span>
              )}
            </div>

            <div className="lg:grid lg:grid-cols-2 lg:gap-x-10">
              <IndexMatrix
                label="Genre × service"
                cols={MATRIX_COLS.map((c) => c.short)}
                rows={buildMatrix(
                  genreServicePairs(byKind("genre-service")),
                  MATRIX_COLS.map((c) => c.short),
                )}
              />
            </div>
            <DualIndexMatrix
              label="Origin × genre"
              cols={originCols}
              rows={buildDualMatrix(originPairs, originCols)}
            />
            <YearIndex years={years} />

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 pb-2">
              <Link
                to="/methodology"
                className="text-[13px] font-semibold text-text-muted hover:text-primary"
              >
                How we rank →
              </Link>
              <span className="text-[13px] text-text-dim">Data: TMDB &amp; OMDb</span>
            </div>
          </section>
        </div>
      </>
    </CollectionsShell>
  );
}
