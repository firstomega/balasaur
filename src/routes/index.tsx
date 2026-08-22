import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Filter, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { TopBar } from "@/components/balasaur/TopBar";
import { MediaGrid } from "@/components/balasaur/MediaGrid";
import { MediaGridSkeleton } from "@/components/balasaur/MediaCardSkeleton";
import { FilterRail } from "@/components/balasaur/FilterRail";
import { ActiveFilters, countActive } from "@/components/balasaur/ActiveFilters";
import { AnimatedCount } from "@/components/balasaur/AnimatedCount";
import { SortControl } from "@/components/balasaur/SortControl";
import { LandingHero } from "@/components/balasaur/LandingHero";
import { DinoMark } from "@/components/balasaur/DinoMark";
import { AuthDialog } from "@/components/balasaur/AuthDialog";
import { ShareButton } from "@/components/balasaur/ShareButton";
import {
  PAGE_SIZE,
  useCatalogInfinite,
  useCatalogFacets,
  useViewerCountry,
  viewerCountryOptions,
  catalogInfiniteOptions,
  catalogFacetsOptions,
  homeCollectionsOptions,
  filtersToParams,
  withBoost,
} from "@/hooks/useCatalog";
import { CollectionRail } from "@/components/balasaur/CollectionRail";
import { WatchlistNudge } from "@/components/balasaur/WatchlistNudge";
import { boostBucketsForCountry } from "@/lib/localFirst";
import { ssrBudget } from "@/lib/ssrBudget";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useAuth } from "@/hooks/useAuth";
import {
  isNotInterested,
  primaryOf,
  recordForNotInterested,
  recordForWant,
  recordForWatched,
} from "@/lib/userStatus";
import type { QuickAction } from "@/components/balasaur/MediaCard";
import { loadFilters, saveFilters } from "@/lib/filterStorage";
import {
  filtersToSearch,
  searchToFilters,
  parseFilterSearch,
  hasFilterSearch,
  type FilterSearch,
} from "@/lib/filterSearch";
import { rescueCandidates } from "@/lib/filterRescue";
import { defaultFilterState, type FilterState } from "@/types/filters";
import type { MediaItem } from "@/types/media";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { SITE_ORIGIN, canonicalLink, jsonLdScript } from "@/lib/seo";
import { websiteJsonLd } from "@/lib/jsonld";

/** ?page=N to a row offset. Anything junk reads as page 1, and the ceiling
 *  stops a crawler wandering into an unbounded range of empty pages. */
const MAX_PAGE = 400;
function pageNumber(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 && n <= MAX_PAGE ? n : 1;
}
function pageOffset(raw: string | undefined): number {
  return (pageNumber(raw) - 1) * PAGE_SIZE;
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): FilterSearch => parseFilterSearch(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    // Detect the viewer's country (edge geo header) so the default view can be
    // server-rendered local-first — same value the client reads, so no hydration flip.
    // Guarded + budgeted: a geo hiccup or hang must never take down the loader.
    // 400ms, not 2000ms. This await runs BEFORE the prefetch below, so its
    // budget is added to the document's time to complete, and the LCP image
    // cannot be discovered until the document lands. Geo only decides row
    // ordering: not worth seconds of blank screen. Missing it degrades to the
    // global ordering and the client corrects after mount.
    const country =
      (await ssrBudget(context.queryClient.ensureQueryData(viewerCountryOptions()), 400)) ?? "";
    const boost = boostBucketsForCountry(country).length > 0 ? country : "";
    // Prefetch the URL's filters (so a shared/filtered link is server-rendered, not just
    // the default grid). allSettled so a prefetch failure can never reject
    // the loader, and ssrBudget so a HANGING backend can't stop the document from
    // streaming — the client refetches whatever the prefetch didn't finish.
    //
    // Facet counts are deliberately NOT awaited here. catalog_facets() measured
    // 2,673ms against the live catalog, so it could never finish inside this
    // budget: every request paid the full wait and then rendered without it
    // anyway. That single query was the whole reason the homepage answered in
    // 1.6 to 1.8 seconds while every other page answered in under 300ms. The
    // filter rail fills its counts client-side after mount instead.
    const params = filtersToParams(searchToFilters(deps));
    await ssrBudget(
      Promise.allSettled([
        context.queryClient.ensureInfiniteQueryData(
          catalogInfiniteOptions(withBoost(params, boost), pageOffset(deps.page)),
        ),
        context.queryClient.ensureQueryData(homeCollectionsOptions()),
      ]),
      1500,
    );

    // The Trending rail used to sit above the fold and its first poster was
    // preloaded as the LCP element. The rail is gone (it ran the grid's exact
    // query), and the grid's own first card is rendered from data the loader
    // does not hold, so there is nothing to preload here any more.
    return { lcpPoster: null };
  },
  head: ({ loaderData, match }) => ({
    meta: [
      { title: "Balasaur: Your Personal Entertainment Database" },
      {
        name: "description",
        content:
          "Your personal entertainment database. Discover, track, and rate movies and TV all in one place.",
      },
      { property: "og:title", content: "Balasaur: Your Personal Entertainment Database" },
      {
        property: "og:description",
        content:
          "Your personal entertainment database. Discover, track, and rate movies and TV all in one place.",
      },
      { property: "og:url", content: SITE_ORIGIN + "/" },
    ],
    links: [
      // Page 2 and beyond self-canonicalise: each is a distinct slice of the
      // catalog, not a duplicate of the homepage, and pointing them all at "/"
      // would tell Google to ignore the very links the trail exists to offer.
      canonicalLink(
        SITE_ORIGIN +
          (pageNumber((match?.search as FilterSearch | undefined)?.page) > 1
            ? `/?page=${pageNumber((match?.search as FilterSearch | undefined)?.page)}`
            : "/"),
      ),
      // The first rail poster is the LCP element on mobile. Without this the
      // browser only discovers it after parsing the document, which measured
      // as ~2.9s of "resource load delay" on slow 4G. srcset and sizes mirror
      // MediaCard exactly, so this preloads the same candidate the img picks
      // rather than causing a second download.
      ...(loaderData?.lcpPoster
        ? [
            {
              rel: "preload",
              as: "image",
              href: tmdbImage(loaderData.lcpPoster, "w342"),
              imageSrcSet: tmdbSrcSet(loaderData.lcpPoster, [
                { w: 185, size: "w185" },
                { w: 342, size: "w342" },
                { w: 500, size: "w500" },
              ]),
              imageSizes: "(max-width: 640px) 148px, 170px",
              fetchPriority: "high" as const,
            },
          ]
        : []),
    ],
    scripts: [jsonLdScript(websiteJsonLd())],
  }),
  errorComponent: HomeError,
  component: HomePage,
});

function HomePage() {
  // Init to default for SSR; restore any persisted filters on the client after
  // mount (avoids a hydration mismatch) so returning from a detail page — via the
  // Back button or the logo — keeps your filters instead of resetting them.
  // Filters come from the URL when present (shareable / bookmarkable / linkable), else
  // from the last session. Reading the URL in the initializer on both server and client
  // keeps SSR hydration-safe (same URL → same initial state).
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filters, setFilters] = useState<FilterState>(() =>
    hasFilterSearch(search) ? searchToFilters(search) : defaultFilterState(),
  );
  const filtersSaveArmed = useRef(false);
  useEffect(() => {
    // No URL filters → restore the last session's filters (returning via Back / the logo).
    if (!hasFilterSearch(search)) {
      const saved = loadFilters();
      if (saved) setFilters(saved);
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // Skip the first run so we don't clobber the incoming URL / stored filters, then keep
    // sessionStorage and the URL in sync as filters change.
    if (!filtersSaveArmed.current) {
      filtersSaveArmed.current = true;
      return;
    }
    saveFilters(filters);
    // Changing a filter starts the result set over, so the page resets to 1
    // and ?page drops out of the URL rather than stranding you on page 7 of a
    // list that no longer exists.
    navigate({ search: filtersToSearch(filters), replace: true });
  }, [filters, navigate]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  // Desktop: collapse the whole filter rail to give the grid full width. Persisted
  // so the choice sticks across visits. (Mobile uses the drawer, unaffected.)
  const [railCollapsed, setRailCollapsed] = useState(false);
  useEffect(() => {
    try {
      setRailCollapsed(localStorage.getItem("balasaur:rail-collapsed") === "1");
    } catch {
      // storage unavailable — non-fatal
    }
  }, []);
  const setRail = (v: boolean) => {
    setRailCollapsed(v);
    try {
      localStorage.setItem("balasaur:rail-collapsed", v ? "1" : "0");
    } catch {
      // non-fatal
    }
  };
  const { seenIds, statuses, recordStatus } = useUserStatus();
  const { user } = useAuth();
  // Per-country streaming: filter availability by the viewer's account region.
  // Falls back to US for signed-out visitors / accounts with no region set.
  const region = (user?.user_metadata?.region as string | undefined) || "US";

  // Local-first (silent): on the default view, rank the viewer's home-country titles
  // first — nothing hidden, no UI. Country comes from their account region, else IP geo.
  // Countries outside the origin buckets simply get the normal popularity order.
  const ipCountry = useViewerCountry();
  const homeCountry = (user?.user_metadata?.region as string | undefined) || ipCountry || "";
  const boostCountry = boostBucketsForCountry(homeCountry).length > 0 ? homeCountry : "";

  const gridRef = useRef<HTMLDivElement>(null);

  const scrollToGrid = () => {
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Card quick actions (desktop hover): Save-to-watchlist (primary while
  // browsing) and Watched. Each toggles its own state; Watched preserves any
  // sentiment already on the record.
  const handleQuickAction = (item: MediaItem, action: QuickAction) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    const rec = statuses[item.id];
    if (action === "notInterested") {
      if (isNotInterested(rec)) {
        recordStatus(item.id, null);
        toast(`Restored · ${item.title}`, { duration: 1400 });
      } else {
        recordStatus(item.id, recordForNotInterested(), item);
        toast(`Never · ${item.title}`, {
          duration: 3500,
          action: { label: "Undo", onClick: () => recordStatus(item.id, null) },
        });
      }
      return;
    }
    const current = primaryOf(rec);
    if (current === action) {
      recordStatus(item.id, null); // toggle off
      toast(`Removed · ${item.title}`, { duration: 1400 });
    } else if (action === "want") {
      recordStatus(item.id, recordForWant(), item);
      toast.success(`Watchlist · ${item.title}`, { duration: 1400 });
    } else {
      recordStatus(item.id, recordForWatched(rec), item);
      toast.success(`Watched · ${item.title}`, { duration: 1400 });
    }
  };

  // Watchlist / rejected ids for card states (seenIds already exists for watched).
  const wantIds = useMemo(
    () =>
      new Set(
        Object.entries(statuses)
          .filter(([, v]) => primaryOf(v) === "want")
          .map(([k]) => k),
      ),
    [statuses],
  );
  const rejectedIds = useMemo(
    () =>
      new Set(
        Object.entries(statuses)
          .filter(([, v]) => isNotInterested(v))
          .map(([k]) => k),
      ),
    [statuses],
  );

  // Geo-personalized ranking is silent. It ran with a "Ranked for <country>"
  // chip that let you flip to global; the chip was a label for something the
  // ranking already does well, so it went and the boost stayed.
  const effectiveBoost = boostCountry;

  // Mobile bottom action sheet for a card (hover quick-actions don't exist on touch).
  const [actionItem, setActionItem] = useState<MediaItem | null>(null);

  // The taste ramp is opt-in now. It used to open itself 1.2s after load for
  // anyone with an empty library, which interrupted first-time visitors from
  // search before they had been given anything, and put a pop-up over the
  // content on mobile, which search engines treat as a demotion signal. It
  // stays one tap away from the hero button.

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <div className="mx-auto flex max-w-[1600px] gap-5 px-4 py-5">
        {/* Desktop rail (collapsible) */}
        {!railCollapsed ? (
          <aside className="sticky top-12 hidden h-[calc(100vh-48px)] w-[240px] shrink-0 overflow-y-auto border-r border-border pr-3 [-ms-overflow-style:none] [scrollbar-width:none] md:block [&::-webkit-scrollbar]:hidden">
            <div className="mb-1 flex justify-end">
              <button
                type="button"
                onClick={() => setRail(true)}
                aria-label="Collapse filters"
                title="Collapse filters"
                className="cursor-pointer rounded-[4px] p-1 text-text-muted hover:bg-panel hover:text-text-bright"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <Suspense fallback={<div className="font-mono text-[10px] text-text-dim">…</div>}>
              <RailWithData
                filters={filters}
                setFilters={setFilters}
                region={region}
                onRequireAuth={() => setAuthOpen(true)}
              />
            </Suspense>
          </aside>
        ) : (
          <div className="hidden shrink-0 md:block">
            <button
              type="button"
              onClick={() => setRail(false)}
              aria-label="Show filters"
              title="Show filters"
              className="sticky top-12 flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-border bg-panel px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:border-border-strong hover:text-text-bright"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}

        <main id="main" className="min-w-0 flex-1">
          {!user && <LandingHero onBrowse={scrollToGrid} />}
          <WatchlistNudge wantIds={wantIds} region={region} />
          <div ref={gridRef} tabIndex={-1} className="scroll-mt-16">
            <Suspense fallback={<MediaGridSkeleton />}>
              <GridWithControls
                filters={filters}
                setFilters={setFilters}
                seenIds={seenIds}
                wantIds={wantIds}
                rejectedIds={rejectedIds}
                region={region}
                boostCountry={effectiveBoost}
                onOpenMobileFilters={() => setMobileOpen(true)}
                onQuickAction={handleQuickAction}
                onOpenActions={setActionItem}
                startOffset={pageOffset(search.page)}
                pageNo={pageNumber(search.page)}
              />
            </Suspense>
          </div>
        </main>
      </div>

      {/* Mobile card actions: one tap on the caption's ⋯ opens this. */}
      <Sheet open={actionItem !== null} onOpenChange={(v) => !v && setActionItem(null)}>
        <SheetContent side="bottom" className="border-border bg-panel">
          {actionItem && (
            <>
              <SheetHeader className="pb-2">
                <SheetTitle className="font-mono text-[13px] uppercase tracking-wider text-text-bright">
                  {actionItem.title}
                </SheetTitle>
              </SheetHeader>
              <div className="grid gap-2 pb-4">
                {(
                  [
                    { action: "want", label: "Want to Watch", active: wantIds.has(actionItem.id) },
                    { action: "watched", label: "Watched", active: seenIds.has(actionItem.id) },
                    {
                      action: "notInterested",
                      label: "Never show this",
                      active: rejectedIds.has(actionItem.id),
                    },
                  ] as const
                ).map((a) => (
                  <button
                    key={a.action}
                    type="button"
                    onClick={() => {
                      handleQuickAction(actionItem, a.action);
                      setActionItem(null);
                    }}
                    className={
                      "w-full cursor-pointer rounded-[5px] border px-3 py-2.5 text-left font-mono text-[12px] uppercase tracking-wider transition-colors " +
                      (a.active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-background text-text-bright hover:border-border-strong")
                    }
                  >
                    {a.active ? "✓ " : ""}
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        reason="Sign in to personalize your Balasaur database"
      />

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[300px] overflow-y-auto bg-background p-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle className="font-mono text-[12px] uppercase tracking-wider">
                Filters
              </SheetTitle>
              {countActive(filters) > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(() => defaultFilterState())}
                  className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-text-muted underline hover:text-text-bright"
                >
                  Clear all
                </button>
              )}
            </div>
          </SheetHeader>
          <div className="mt-3 pb-16">
            <Suspense fallback={<div className="font-mono text-[10px] text-text-dim">…</div>}>
              <RailWithData
                filters={filters}
                setFilters={setFilters}
                region={region}
                onRequireAuth={() => setAuthOpen(true)}
              />
            </Suspense>
          </div>
          {/* Live feedback while filtering: the count updates as filters change,
              and one tap closes the drawer to see the matches. */}
          <MobileResultsBar
            filters={filters}
            region={region}
            onClose={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Peak-end for infinite scroll: every N cards, a landmark breaks the wall and
// offers a way to narrow down (or jump back up) instead of scrolling into 65k.
const BROWSE_BREAK_EVERY = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length <= size) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// The crawl trail: real links a search engine can follow.
//
// The grid is infinite scroll, and a crawler does not scroll. Before this,
// Googlebot could reach exactly the 60 titles rendered on the homepage and had
// no path to the 61st, which left most of the catalog reachable only through
// the sitemap and no internal link pointing at it at all.
//
// These are ordinary links in the server-rendered HTML. People never need them
// (scrolling still works exactly as before), so they sit quietly at the end of
// the grid rather than announcing themselves.
function CrawlTrail({
  page,
  hasNext,
  total,
  filters,
}: {
  page: number;
  hasNext: boolean;
  total: number;
  filters: FilterState;
}) {
  const lastPage = Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  if (lastPage <= 1) return null;
  const base = filtersToSearch(filters);
  const to = (n: number): FilterSearch => (n <= 1 ? base : { ...base, page: String(n) });

  // A window around the current page, plus the last one, so a crawler can walk
  // forward without following a chain hundreds of pages long.
  const nums = new Set<number>([1, page - 1, page, page + 1, lastPage]);
  const shown = [...nums].filter((n) => n >= 1 && n <= lastPage).sort((a, b) => a - b);

  return (
    <nav
      aria-label="Catalog pages"
      className="mt-8 flex flex-wrap items-center justify-center gap-1.5 border-t border-border pt-5"
    >
      {page > 1 && (
        <Link
          to="/"
          search={to(page - 1)}
          rel="prev"
          className="rounded-[4px] border border-border px-2.5 py-1 font-mono text-[11px] text-text-muted hover:border-primary hover:text-primary"
        >
          Previous
        </Link>
      )}
      {shown.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && shown[i - 1] !== n - 1 && (
            <span className="font-mono text-[11px] text-text-dim">…</span>
          )}
          <Link
            to="/"
            search={to(n)}
            aria-current={n === page ? "page" : undefined}
            className={
              "rounded-[4px] border px-2.5 py-1 font-mono text-[11px] " +
              (n === page
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-text-muted hover:border-primary hover:text-primary")
            }
          >
            {n}
          </Link>
        </span>
      ))}
      {hasNext && page < lastPage && (
        <Link
          to="/"
          search={to(page + 1)}
          rel="next"
          className="rounded-[4px] border border-border px-2.5 py-1 font-mono text-[11px] text-text-muted hover:border-primary hover:text-primary"
        >
          Next
        </Link>
      )}
    </nav>
  );
}

function BrowseBreak({
  browsed,
  filters,
  setFilters,
  facetGenres,
}: {
  browsed: number;
  filters: FilterState;
  setFilters: (u: (p: FilterState) => FilterState) => void;
  facetGenres?: Record<string, number>;
}) {
  // Top unselected genres under the current filters as one-tap narrowing.
  const suggestions = Object.entries(facetGenres ?? {})
    .filter(([g, c]) => c > 0 && !filters.genres.has(g))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);

  return (
    <div className="my-5 flex flex-wrap items-center gap-2 rounded-[5px] border border-border bg-panel/60 px-3 py-2.5">
      <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-muted">
        {browsed.toLocaleString("en-US")} titles browsed · narrow it down?
      </span>
      {suggestions.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => setFilters((p) => ({ ...p, genres: new Set([...p.genres, g]) }))}
          className="cursor-pointer rounded-[4px] border border-border bg-panel px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-wide text-text-muted transition-colors hover:border-primary hover:text-primary"
        >
          {g}
        </button>
      ))}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="ml-auto cursor-pointer font-mono text-[10px] uppercase tracking-wider text-text-dim hover:text-text-bright"
      >
        Back to top ↑
      </button>
    </div>
  );
}

function MobileResultsBar({
  filters,
  region,
  onClose,
}: {
  filters: FilterState;
  region: string;
  onClose: () => void;
}) {
  const { data: facets } = useCatalogFacets(filters, region);
  return (
    <div className="absolute inset-x-0 bottom-0 border-t border-border bg-background p-3">
      <button
        type="button"
        onClick={onClose}
        className="w-full cursor-pointer rounded-[5px] bg-primary px-3 py-2.5 font-mono text-[11.5px] font-medium uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
      >
        {typeof facets?.total === "number"
          ? `Show ${facets.total.toLocaleString("en-US")} results`
          : "Show results"}
      </button>
    </div>
  );
}

function RailWithData({
  filters,
  setFilters,
  region,
  onRequireAuth,
}: {
  filters: FilterState;
  setFilters: (u: (p: FilterState) => FilterState) => void;
  region: string;
  onRequireAuth?: () => void;
}) {
  const { data: facets } = useCatalogFacets(filters, region);
  return (
    <FilterRail
      filters={filters}
      setFilters={setFilters}
      facets={facets}
      onRequireAuth={onRequireAuth}
    />
  );
}

function GridWithControls({
  filters,
  setFilters,
  seenIds,
  wantIds,
  rejectedIds,
  region,
  boostCountry,
  onOpenMobileFilters,
  onQuickAction,
  onOpenActions,
  startOffset,
  pageNo,
}: {
  filters: FilterState;
  setFilters: (u: (p: FilterState) => FilterState) => void;
  seenIds: Set<string>;
  wantIds: Set<string>;
  rejectedIds: Set<string>;
  region: string;
  boostCountry: string;
  /** The viewer's detected country (pre-toggle) for the geo indicator label. */
  onOpenMobileFilters: () => void;
  onQuickAction: (item: MediaItem, action: QuickAction) => void;
  onOpenActions: (item: MediaItem) => void;
  /** Row offset from a crawlable ?page=N URL. */
  startOffset: number;
  /** Current 1-based page, for the pagination trail. */
  pageNo: number;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching } =
    useCatalogInfinite(filters, region, boostCountry, startOffset);

  // Flatten loaded pages. "Hide seen" is applied to what's loaded (client-side),
  // so the headline count stays the catalog total for the active filters.
  const items = useMemo(() => {
    const all = data?.pages.flatMap((pg) => pg.items) ?? [];
    return filters.hideSeen ? all.filter((it) => !seenIds.has(it.id)) : all;
  }, [data, filters.hideSeen, seenIds]);
  const total = data?.pages[0]?.total ?? 0;
  const activeCount = countActive(filters);
  // A filter changed and fresh results are on the way: keep the stale grid
  // visible but SAY SO — the silent 1-3s freeze read as "broken".
  const refreshing = isFetching && !isFetchingNextPage && !isLoading;
  // Facet counts for the browse-break genre suggestions (already cached — the
  // rail and mobile bar share the same query).
  const { data: facets } = useCatalogFacets(filters, region);

  // Empty-state rescue: when nothing matches, price each "remove one filter group"
  // option by its own result count, so we can suggest the biggest unlockers.
  const rescue = useMemo(
    () => (!isLoading && total === 0 ? rescueCandidates(filters) : []),
    [isLoading, total, filters],
  );
  const rescueQueries = useQueries({
    queries: rescue.map((c) => catalogFacetsOptions(filtersToParams(c.next, region))),
  });
  const suggestions = rescue
    .map((c, i) => ({ ...c, unlock: rescueQueries[i]?.data?.total ?? 0 }))
    .filter((s) => s.unlock > 0)
    .sort((a, b) => b.unlock - a.unlock)
    .slice(0, 3);

  // Infinite scroll: load the next page as the sentinel nears the viewport.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      {/* Curated rails share the default view with the grid; while filtering
          they collapse smoothly instead of popping out of existence — the
          animation itself says where they went, and clearing filters animates
          them back. (An explainer banner tried this job first: too much
          chrome for too little message.) */}
      {(filters.sort === "popular" || filters.sort === "trending") && (
        <div
          aria-hidden={activeCount > 0}
          className={
            "grid transition-all duration-300 ease-out " +
            (activeCount === 0 ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")
          }
        >
          <div
            className={"min-h-0 overflow-hidden" + (activeCount > 0 ? " pointer-events-none" : "")}
          >
            {/* One rail: collections. "What am I in the mood for" is the
                question people arrive with, and a collection is an answer the
                grid cannot give.

                A "Trending This Week" rail sat here and is gone. It ran the
                grid's exact query, rank_score then popularity, so it was the
                first two dozen rows of the grid directly below it, wearing
                rank numerals. A first-time visitor read the same seven posters
                twice and had to work out whether the site was broken. */}
            <div className="mb-6 rounded-[6px] border border-border bg-panel/40 p-3 sm:p-4">
              <CollectionRail />
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={onOpenMobileFilters}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-colors md:hidden ${
            activeCount > 0
              ? "border-primary bg-primary/15 text-primary"
              : "border-border-strong bg-panel text-text-bright hover:border-primary/60"
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="ml-0.5 rounded-[3px] bg-primary px-1 text-[10px] text-primary-foreground">
              {activeCount}
            </span>
          )}
        </button>

        <span className="font-mono text-[11px] text-text-muted">
          <AnimatedCount value={total} className="text-text-bright" /> results
        </span>

        {refreshing && (
          <span
            role="status"
            className="animate-pulse font-mono text-[9.5px] uppercase tracking-wider text-primary"
          >
            Updating…
          </span>
        )}

        {/* Sort lives at the right end of the results bar — where every catalog
            UI puts it (Jakob's law). */}
        <div className="ml-auto flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5">
            <Switch
              checked={filters.hideSeen}
              onCheckedChange={(v) => setFilters((p) => ({ ...p, hideSeen: !!v }))}
            />
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-muted">
              Hide seen
            </span>
          </label>
          <SortControl
            value={filters.sort}
            onChange={(v) => setFilters((p) => ({ ...p, sort: v }))}
          />
          {/* Filters live in the URL, so sharing the page shares this exact view. */}
          <ShareButton title="Balasaur" />
        </div>
      </div>

      {/* Active chips */}
      <div className="mb-3">
        <ActiveFilters filters={filters} setFilters={setFilters} />
      </div>

      {isLoading && items.length === 0 ? (
        <MediaGridSkeleton />
      ) : (
        <>
          {chunk(items, BROWSE_BREAK_EVERY).map((slice, ci, arr) => (
            <div
              key={ci}
              className={
                (ci > 0 ? "mt-5 " : "") +
                (refreshing ? "opacity-60 transition-opacity duration-200" : "transition-opacity")
              }
            >
              <MediaGrid
                items={slice}
                onQuickAction={onQuickAction}
                onOpenActions={onOpenActions}
                savedIds={wantIds}
                watchedIds={seenIds}
                rejectedIds={rejectedIds}
              />
              {ci < arr.length - 1 && (
                <BrowseBreak
                  browsed={(ci + 1) * BROWSE_BREAK_EVERY}
                  filters={filters}
                  setFilters={setFilters}
                  facetGenres={facets?.genres}
                />
              )}
            </div>
          ))}
          {hasNextPage && <div ref={sentinelRef} className="h-12" />}
          <CrawlTrail
            page={pageNo}
            hasNext={hasNextPage}
            total={data?.pages?.[0]?.total ?? 0}
            filters={filters}
          />
          {isFetchingNextPage && (
            <div className="py-6 text-center font-mono text-[11px] uppercase tracking-wider text-text-dim">
              Loading more…
            </div>
          )}
        </>
      )}

      {!isLoading && total === 0 && (
        <div className="mt-10 flex flex-col items-center rounded-[5px] border border-border bg-panel p-8 text-center">
          <DinoMark className="h-8 w-8 text-primary opacity-80" />
          <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-dim">
            No matches
          </p>
          {suggestions.length > 0 ? (
            <>
              <p className="mt-2 text-[13.5px] text-text-bright">
                Nothing fits. Try removing a filter:
              </p>
              <div className="mt-4 flex w-full max-w-xs flex-col gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setFilters(() => s.next)}
                    className="group flex cursor-pointer items-center justify-between gap-3 rounded-[5px] border border-border-strong bg-background px-3 py-2 text-left transition-colors hover:border-primary"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-text-bright">
                      <X className="h-3.5 w-3.5 shrink-0 text-text-muted group-hover:text-primary" />
                      <span className="truncate">{s.label}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-primary">
                      +{s.unlock.toLocaleString("en-US")}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setFilters(() => defaultFilterState())}
                className="mt-4 cursor-pointer font-mono text-[10.5px] uppercase tracking-wider text-text-muted underline hover:text-text-bright"
              >
                Clear all filters
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-[13.5px] text-text-bright">
                Nothing fits the current filters. Try loosening one.
              </p>
              <button
                type="button"
                onClick={() => setFilters(() => defaultFilterState())}
                className="mt-5 cursor-pointer rounded-[5px] border border-primary bg-primary px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function HomeError({ error }: { error: Error }) {
  console.error(error);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto max-w-[1600px] px-4 py-10">
        <div className="rounded-[5px] border border-border bg-panel p-6">
          <h2 className="font-mono text-[12px] uppercase tracking-wider text-text-bright">
            Couldn't load the firehose
          </h2>
          <p className="mt-2 font-mono text-[11px] text-text-muted">
            Something went wrong on our end. Try refreshing in a moment.
          </p>
        </div>
      </main>
    </div>
  );
}
