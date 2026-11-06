import { createFileRoute, Link, type ErrorComponentProps } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  EmptyState,
  EMPTY_ACTION_CLASS,
  EMPTY_ACTION_QUIET_CLASS,
} from "@/components/balasaur/EmptyState";
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
// Tier 2  Walls by intent (occasion / service / genre / country / decade /
//         acclaim): every list of that kind as a tile, none held behind a
//         swipe. Inside a wall the order is alphabetical, because nearly
//         every list holds 60 titles and an order by count was an order by
//         nothing a visitor could see.
// Tier 3  The full index at the bottom: plain text links, grouped, carrying
//         the crawl mesh for every page (genre-service, origin-genre and year
//         lists live ONLY here; they are refinements, not top-level sections).
// The find box filters client side; while searching, tiers 1-2 hide via CSS
// so every link stays in the SSR HTML.

export const Route = createFileRoute("/collections")({
  loader: async () => {
    // Cached only once the lists have been read. A failed read throws to the
    // dead end below, which is sent no-store (src/server.ts).
    const collections = await listCollections();
    await cacheSsrResponse();
    // The month decides which occasions lead. Decided here, once, in UTC, so
    // the cached page and every client's first render agree. Read from the
    // viewer's clock it differed across the month boundary and the server
    // and client rendered different sections.
    return { collections, month: new Date().getUTCMonth() + 1 };
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

/** Alphabetical, locale pinned so the cached SSR order and every client's
 *  hydration order agree. */
const byTitle = (a: CollectionSummary, b: CollectionSummary) =>
  a.title.localeCompare(b.title, "en");

/** The decade lists, newest decade first, the movie list before the show list. */
function byDecade(a: CollectionSummary, b: CollectionSummary) {
  return (decadeWord(b.title) ?? "").localeCompare(decadeWord(a.title) ?? "") || byTitle(a, b);
}

/** The wall's grid: the same columns and gaps as the related collections on
 *  a best-of page, so a tile is one size wherever it appears. */
const WALL = "grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-3.5 lg:grid-cols-4";

/** A run of list tiles, painted together so a tile does not repeat the colour
 *  of the one before it (src/lib/paintWall.ts). */
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

/** A section heading: the label in the display face, the count beside it. */
function SectionHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright md:text-3xl">
        {title}
      </h2>
      <span className="text-sm tabular-nums text-text-dim">
        {count === 1 ? "1 list" : `${count} lists`}
      </span>
    </div>
  );
}

/** One kind of list as a wall of tiles under a plain label. */
function Wall({
  title,
  items,
  progressFor,
}: {
  title: string;
  items: CollectionSummary[];
  progressFor: (c: CollectionSummary) => string | null;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10 md:mt-14">
      <SectionHead title={title} count={items.length} />
      <div className={`mt-3 md:mt-4 ${WALL}`}>
        <ShelfTiles items={items} progressFor={progressFor} />
      </div>
    </section>
  );
}

/** A sub-heading inside the full index. */
const INDEX_H3 = "font-display text-xl font-extrabold leading-none tracking-tight text-text-bright";

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
      <h3 className={`mb-2.5 ${INDEX_H3}`}>{label}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className="w-44 pb-1.5 pr-3" />
              {cols.map((col) => (
                <th
                  key={col}
                  className="px-1 pb-1.5 text-center text-xs font-bold uppercase tracking-wider text-text-dim"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border/60">
                <td className="py-0.5 pr-3 text-sm leading-tight text-text-muted">{r.label}</td>
                {r.cells.map((cell, i) =>
                  cell ? (
                    <td key={i} className="px-0.5 py-0.5 text-center">
                      <Link
                        to="/best/$slug"
                        params={{ slug: cell.slug }}
                        aria-label={cell.title}
                        title={cell.title}
                        className="group/cell inline-flex h-6 w-full min-w-7 items-center justify-center rounded-sm transition-colors hover:bg-panel"
                      >
                        <span className="h-2 w-2 rounded-full bg-text-dim transition-colors group-hover/cell:bg-text-bright" />
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

/** The year a year list covers, from its slug ("best-movies-of-1994"). */
function yearOf(c: CollectionSummary): string | undefined {
  return c.slug.match(/-of-(\d{4})$/)?.[1];
}

// All year lists at once, grouped by decade. Since the v8 media-type split
// each year comes as a movie list and a show list, so a chip is the year plus
// a type dot in the site's media colors (same key as the origin matrix).
function YearIndex({ years }: { years: CollectionSummary[] }) {
  if (years.length === 0) return null;
  const parsed = years
    .map((c) => ({ c, year: yearOf(c) }))
    .filter((p): p is { c: CollectionSummary; year: string } => !!p.year);
  const byDecade = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const dec = `${p.year.slice(0, 3)}0s`;
    byDecade.set(dec, [...(byDecade.get(dec) ?? []), p]);
  }
  const decades = [...byDecade.keys()].sort().reverse();
  return (
    <div className="mt-8">
      <h3 className={`mb-2.5 ${INDEX_H3}`}>By year</h3>
      <div className="space-y-1">
        {decades.map((dec) => (
          <div key={dec} className="flex items-baseline gap-3 border-t border-border/60 py-1">
            <span className="w-14 shrink-0 text-xs font-semibold tabular-nums tracking-wider text-text-dim">
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
                    className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-sm tabular-nums text-text-muted transition-colors hover:bg-panel hover:text-text-bright"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${c.media_type === "tv" ? "bg-swatch-rust" : "bg-swatch-blue"}`}
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
          <span className="w-4 shrink-0 text-sm font-semibold uppercase tracking-wider text-text-dim">
            {letter}
          </span>
          <div className="flex flex-wrap gap-x-1 gap-y-0.5">
            {(byInitial.get(letter) ?? []).map((c) => (
              <Link
                key={c.slug}
                to="/best/$slug"
                params={{ slug: c.slug }}
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-sm text-text-muted transition-colors hover:bg-panel hover:text-text-bright"
              >
                {c.title.replace(/^The Best /, "")}
                <span className="tabular-nums text-text-dim">{c.item_count}</span>
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
        <h3 className={INDEX_H3}>{label}</h3>
        <span className="flex items-center gap-3 text-sm font-semibold text-text-dim">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-swatch-blue" /> Movies
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-swatch-rust" /> Shows
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className="w-44 pb-1.5 pr-3" />
              {cols.map((col) => (
                <th
                  key={col}
                  className="px-1 pb-1.5 text-center text-xs font-bold uppercase tracking-wider text-text-dim"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border/60">
                <td className="py-0.5 pr-3 text-sm leading-tight text-text-muted">{r.label}</td>
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
                            className="inline-flex h-6 w-7 items-center justify-center rounded-sm transition-colors hover:bg-panel"
                          >
                            <span className="h-2 w-2 rounded-full bg-swatch-blue/80 transition-colors hover:bg-swatch-blue" />
                          </Link>
                        )}
                        {cell.tv && (
                          <Link
                            to="/best/$slug"
                            params={{ slug: cell.tv.slug }}
                            aria-label={cell.tv.title}
                            title={cell.tv.title}
                            className="inline-flex h-6 w-7 items-center justify-center rounded-sm transition-colors hover:bg-panel"
                          >
                            <span className="h-2 w-2 rounded-full bg-swatch-rust/80 transition-colors hover:bg-swatch-rust" />
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
      <main id="main" className="mx-auto max-w-content px-4 pb-10 pt-6 md:pt-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-text-bright md:text-[64px]">
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
      {/* Same grid, same tile sizes as the real tiers, so the rows land in the
          boxes they were drawn in instead of shifting the page under a thumb. */}
      <div className="mt-6 grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="min-h-28 animate-pulse rounded-xl bg-panel md:min-h-40 md:rounded-2xl lg:min-h-48"
          />
        ))}
      </div>
      {[0, 1].map((r) => (
        <div key={r} className="mt-10 md:mt-14">
          <div className="h-7 w-52 animate-pulse rounded-sm bg-panel" />
          <div className={`mt-3 md:mt-4 ${WALL}`}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                className="min-h-28 animate-pulse rounded-xl bg-panel md:min-h-40 md:rounded-2xl"
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
  const inSeason = occasions
    .filter((c: CollectionSummary) => c.season_months?.includes(month))
    .sort(byTitle);
  const everyday = occasions
    .filter((c: CollectionSummary) => !c.season_months?.includes(month))
    .sort(byTitle);
  const services = byKind("service").sort(byTitle);
  const genres = byKind("genre").sort(byTitle);
  const origins = byKind("origin").sort(byTitle);
  const decades = byKind("decade").sort(byDecade);
  const acclaim = [...byKind("awards").sort(byTitle), ...byKind("discovery").sort(byTitle)];
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
  const serviceGenrePairs = genreServicePairs(byKind("genre-service"));
  // The count beside "More lists" is the links under it: the two matrices'
  // cells and the year chips, nothing else on the page.
  const indexCount =
    serviceGenrePairs.length + originPairs.length + years.filter((c) => yearOf(c)).length;
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
            className="w-full rounded-full border border-border bg-panel px-4 py-2.5 text-lg text-text-bright placeholder:text-text-dim focus:border-text-bright sm:w-72"
          />
        )
      }
    >
      <>
        {none && <IndexDeadEnd />}

        {matches && (
          <section className="mt-7">
            {matches.length > 0 && <SectionHead title="Matches" count={matches.length} />}
            {matches.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {matches.map((c: CollectionSummary) => (
                  <Link
                    key={c.slug}
                    to="/best/$slug"
                    params={{ slug: c.slug }}
                    className="rounded-full border border-border bg-panel px-3 py-1 text-base text-text-bright transition-colors hover:border-text-bright"
                  >
                    {c.title}
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                variant="inline"
                line={`No collection name contains "${q.trim()}".`}
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
          <div className="mt-6 grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
            <ShelfTiles items={featured} className="lg:min-h-48" />
          </div>

          {/* Tier 2: walls. Occasions lead: they answer "what should I put on
              tonight", which is the question people actually arrive with, and
              the ones in season lead the occasions. */}
          <Wall title="Occasions" items={[...inSeason, ...everyday]} progressFor={progressFor} />
          <Wall title="By service" items={services} progressFor={progressFor} />
          <Wall title="By genre" items={genres} progressFor={progressFor} />
          <Wall title="By country" items={origins} progressFor={progressFor} />
          <Wall title="By decade" items={decades} progressFor={progressFor} />
          <Wall title="Awards & discovery" items={acclaim} progressFor={progressFor} />
          {people.length > 0 && (
            <section className="mt-10 md:mt-14">
              <SectionHead title="People" count={people.length} />
              <PeopleIndex people={people} />
            </section>
          )}

          {/* Tier 3: the full index */}
          <section className="mt-12 border-t border-border pt-7 md:mt-16">
            <SectionHead title="More lists" count={indexCount} />

            <IndexMatrix
              label="Genre × service"
              cols={MATRIX_COLS.map((c) => c.short)}
              rows={buildMatrix(
                serviceGenrePairs,
                MATRIX_COLS.map((c) => c.short),
              )}
            />
            <DualIndexMatrix
              label="Origin × genre"
              cols={originCols}
              rows={buildDualMatrix(originPairs, originCols)}
            />
            <YearIndex years={years} />

            <div className="mt-9 border-t border-border pt-4 pb-2">
              <Link
                to="/methodology"
                className="text-base font-semibold text-text-bright underline underline-offset-2"
              >
                Methodology
              </Link>
            </div>
          </section>
        </div>
      </>
    </CollectionsShell>
  );
}
