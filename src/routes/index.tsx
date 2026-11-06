import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, type ErrorComponentProps } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { MediaGrid } from "@/components/balasaur/MediaGrid";
import { MediaGridSkeleton } from "@/components/balasaur/MediaCardSkeleton";
import { FilterRail } from "@/components/balasaur/FilterRail";
import { ActiveFilters, countActive } from "@/components/balasaur/ActiveFilters";
import { AnimatedCount } from "@/components/balasaur/AnimatedCount";
import { SortControl } from "@/components/balasaur/SortControl";
import { MobileFilterStrip } from "@/components/balasaur/MobileFilterStrip";
import { LandingHero } from "@/components/balasaur/LandingHero";
import { EmptyState, EMPTY_ACTION_QUIET_CLASS } from "@/components/balasaur/EmptyState";
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
  homeLeadersOptions,
  filtersToParams,
  withBoost,
} from "@/hooks/useCatalog";
import { CollectionRail } from "@/components/balasaur/CollectionRail";
import { WatchlistNudge } from "@/components/balasaur/WatchlistNudge";
import { boostBucketsForCountry } from "@/lib/localFirst";
import { ssrBudget } from "@/lib/ssrBudget";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { SITE_ORIGIN, canonicalLink, jsonLdScript, noindexMeta } from "@/lib/seo";
import { MAX_PAGE, canonicalPath, homeIsIndexable, isFiltered, pageNumber } from "@/lib/homePaging";
import { websiteJsonLd } from "@/lib/jsonld";
import { HOME_TITLE, homeDescription, type HomeLeaders } from "@/lib/homeSnippet";

function pageOffset(raw: string | undefined): number {
  return (pageNumber(raw) - 1) * PAGE_SIZE;
}

const BASE_TITLE = HOME_TITLE;

/** Page 2 and beyond say so, rather than 400 URLs sharing one title. */
function pageTitle(search: FilterSearch | undefined): string {
  if (isFiltered(search)) return BASE_TITLE;
  const n = pageNumber(search?.page);
  return n > 1 ? `${BASE_TITLE} (Page ${n})` : BASE_TITLE;
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
        context.queryClient.ensureQueryData(homeLeadersOptions()),
      ]),
      1500,
    );

    // The Trending rail used to sit above the fold and its first poster was
    // preloaded as the LCP element. The rail is gone (it ran the grid's exact
    // query), and the grid's own first card is rendered from data the loader
    // does not hold, so there is nothing to preload here any more.

    // The search-result description names the Top rated leaders. Read from
    // the cache the prefetch above filled: null when that read failed or ran
    // past the budget, and the description falls back to the site's own.
    const leaders: HomeLeaders | null =
      context.queryClient.getQueryData(homeLeadersOptions().queryKey) ?? null;
    return { leaders };
  },
  head: ({ match, loaderData }) => {
    const title = pageTitle(match?.search as FilterSearch | undefined);
    const description = homeDescription(loaderData?.leaders);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        // The root's share tags read "Balasaur" and the site description; a
        // card shared from home should carry what the search result carries.
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { property: "og:url", content: SITE_ORIGIN + "/" },
        ...(homeIsIndexable(match?.search as FilterSearch | undefined) ? [] : [noindexMeta()]),
      ],
      links: [
        // Page 2 and beyond self-canonicalise and say "noindex, follow" (see
        // homeIsIndexable): pointing them at "/" would tell Google to ignore
        // the very links the trail exists to offer, and indexing them spent
        // crawl budget on 400 slices of one grid.
        //
        // A FILTERED view is the opposite case and used to be handled wrong.
        // /?genre=Horror&page=3 canonicalised to /?page=3, which is a different
        // set of titles, so the page claimed to be a page it was not. Filters
        // produce hundreds of near-duplicate slices of one catalog and none of
        // them is the canonical home for anything, so they all consolidate to "/"
        // and the crawl budget goes to the kept title pages instead.
        canonicalLink(SITE_ORIGIN + canonicalPath(match?.search as FilterSearch | undefined)),
      ],
      scripts: [jsonLdScript(websiteJsonLd())],
    };
  },
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

  // Card quick actions (desktop hover): Save-to-watchlist (primary while
  // browsing) and Watched. Each toggles its own state; Watched preserves any
  // sentiment already on the record.
  // No sign-in gate here. Saving works signed out: useUserStatus keeps an
  // anonymous pick in localStorage and moves it into the account on sign-in.
  const handleQuickAction = (item: MediaItem, action: QuickAction) => {
    const rec = statuses[item.id];
    if (action === "notInterested") {
      if (isNotInterested(rec)) {
        recordStatus(item.id, null);
        toast(`Restored · ${item.title}`, { duration: 1400 });
      } else {
        recordStatus(item.id, recordForNotInterested(), item);
        toast(`Hidden · ${item.title}`, {
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
      toast.success(`Seen · ${item.title}`, { duration: 1400 });
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

  // The taste ramp is opt-in now. It used to open itself 1.2s after load for
  // anyone with an empty library, which interrupted first-time visitors from
  // search before they had been given anything, and put a pop-up over the
  // content on mobile, which search engines treat as a demotion signal. It
  // stays one tap away from the hero button.

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main id="main" className="mx-auto max-w-content px-4 py-5">
        {/* Signed out, the hero carries the page heading. Signed in the hero is
            gone and the tiles and grid speak for themselves, so the heading is
            for screen readers and crawlers only. Exactly one either way. */}
        {user && <h1 className="sr-only">Movies and TV ranked by the Balasaur Score</h1>}
        {!user && <LandingHero />}
        <WatchlistNudge wantIds={wantIds} region={region} />

        {/* The list tiles sit above the catalog and stay put while filtering.
            They used to live inside the grid column and fold away whenever a
            filter was on, which moved everything under the visitor's pointer;
            above the browse row they are not in the way of any result. */}
        <div className="mb-8 md:mb-10">
          <CollectionRail />
        </div>

        {/* The catalog: filters beside the grid on desktop, a drawer on phones. */}
        <div className="flex gap-5">
          {!railCollapsed ? (
            <aside className="sticky top-12 hidden h-[calc(100vh-48px)] w-[240px] shrink-0 overflow-y-auto border-r border-border pr-3 [-ms-overflow-style:none] [scrollbar-width:none] md:block [&::-webkit-scrollbar]:hidden">
              <div className="mb-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setRail(true)}
                  aria-label="Collapse filters"
                  title="Collapse filters"
                  className="cursor-pointer rounded-full p-1.5 text-text-muted hover:bg-panel hover:text-text-bright"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
              <Suspense fallback={<div className="text-base text-text-dim">…</div>}>
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
                className="sticky top-14 flex cursor-pointer items-center rounded-full border border-border-strong bg-background p-2 text-text-muted hover:border-text-bright hover:text-text-bright"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* No tabIndex here. Nothing ever moved focus to this container, but a
              click anywhere in it did, and the next key pressed lit a
              full-width focus ring around the whole results region. */}
          <div className="min-w-0 flex-1 scroll-mt-16">
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
                startOffset={pageOffset(search.page)}
                pageNo={pageNumber(search.page)}
              />
            </Suspense>
          </div>
        </div>
      </main>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        reason="Saved filters are kept with an account."
      />

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[300px] overflow-y-auto bg-background p-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle className="font-display text-2xl font-extrabold leading-none tracking-tight">
                Filters
              </SheetTitle>
              {countActive(filters) > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(() => defaultFilterState())}
                  className="cursor-pointer text-base font-semibold text-text-muted underline hover:text-text-bright"
                >
                  Clear all
                </button>
              )}
            </div>
          </SheetHeader>
          <div className="mt-3 pb-16">
            <Suspense fallback={<div className="text-base text-text-dim">…</div>}>
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
        <Link to="/" search={to(page - 1)} rel="prev" className={TRAIL_PILL}>
          Previous
        </Link>
      )}
      {shown.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && shown[i - 1] !== n - 1 && (
            <span className="font-mono text-sm text-text-dim">…</span>
          )}
          <Link
            to="/"
            search={to(n)}
            aria-current={n === page ? "page" : undefined}
            className={
              "rounded-full border px-3 py-1 font-mono text-sm tabular-nums " +
              (n === page
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong text-text-muted hover:border-text-bright hover:text-text-bright")
            }
          >
            {n}
          </Link>
        </span>
      ))}
      {hasNext && page < lastPage && (
        <Link to="/" search={to(page + 1)} rel="next" className={TRAIL_PILL}>
          Next
        </Link>
      )}
    </nav>
  );
}

const TRAIL_PILL =
  "rounded-full border border-border-strong px-3 py-1 text-base font-semibold text-text-muted hover:border-text-bright hover:text-text-bright";

function BrowseBreak({
  browsed,
  total,
  filters,
  setFilters,
  facetGenres,
}: {
  browsed: number;
  total: number;
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
    <div className="my-5 flex flex-wrap items-center gap-2 rounded-xl bg-panel px-3 py-2.5 md:px-4">
      <span className="text-base text-text-muted">
        <span className="font-mono tabular-nums text-text-bright">
          {browsed.toLocaleString("en-US")}
        </span>{" "}
        of {total.toLocaleString("en-US")} titles
      </span>
      {suggestions.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => setFilters((p) => ({ ...p, genres: new Set([...p.genres, g]) }))}
          className="cursor-pointer rounded-full border border-border-strong bg-background px-3 py-1 text-base font-semibold text-text-bright transition-colors hover:border-text-bright"
        >
          {g}
        </button>
      ))}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="ml-auto cursor-pointer text-base font-semibold text-text-muted hover:text-text-bright"
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
        className="w-full cursor-pointer rounded-full bg-primary px-3 py-2.5 text-lg font-bold tabular-nums text-primary-foreground hover:bg-primary/85"
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
      {/* The mobile filter strip replaces the old Filters pill: chips wear
          their values, the first chip is the live count, and each opens a
          bottom sheet with just that control. Desktop keeps the sidebar. */}
      <MobileFilterStrip
        filters={filters}
        setFilters={setFilters}
        total={total}
        activeCount={activeCount}
        onOpenAllFilters={onOpenMobileFilters}
      />

      {/* Toolbar. The count is the catalog's heading: a plain label that is
          also the one figure the grid answers to. On a phone the filter strip
          above already leads with the same count, so the heading is visible
          from md up and read out at every width. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <h2 className="sr-only font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright md:not-sr-only md:text-3xl">
          {isLoading ? (
            "Titles"
          ) : (
            <>
              <AnimatedCount value={total} className="tabular-nums" /> titles
            </>
          )}
        </h2>

        {refreshing && (
          <span role="status" className="animate-pulse text-base font-semibold text-text-muted">
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
            <span className="text-base font-semibold text-text-muted">Hide seen</span>
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
        <div className="hidden md:block">
          <ActiveFilters filters={filters} setFilters={setFilters} />
        </div>
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
                savedIds={wantIds}
                watchedIds={seenIds}
                rejectedIds={rejectedIds}
                // Top rated orders by a vote-confidence-shrunk score, so the
                // number on the card does not explain the order on its own.
                // The rating count does. Same reason /best/$slug prints it.
                showVotes={filters.sort === "topRated"}
              />
              {ci < arr.length - 1 && (
                <BrowseBreak
                  browsed={(ci + 1) * BROWSE_BREAK_EVERY}
                  total={total}
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
            <div className="py-6 text-center text-base text-text-dim">Loading more…</div>
          )}
        </>
      )}

      {!isLoading && total === 0 && (
        <div className="mt-10">
          <EmptyState
            line="No title matches every filter at once."
            hint={suggestions.length > 0 ? "Titles back with one filter removed:" : undefined}
            action={
              <>
                {suggestions.length > 0 && (
                  <div className="flex w-full max-w-xs flex-col gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setFilters(() => s.next)}
                        className="group flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border-strong bg-background px-3 py-2 text-left transition-colors hover:border-text-bright"
                      >
                        <span className="flex min-w-0 items-center gap-1.5 text-base font-semibold text-text-bright">
                          <X className="h-3.5 w-3.5 shrink-0 text-text-muted group-hover:text-text-bright" />
                          <span className="truncate">{s.label}</span>
                        </span>
                        <span className="shrink-0 font-mono text-sm tabular-nums text-text-bright">
                          +{s.unlock.toLocaleString("en-US")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setFilters(() => defaultFilterState())}
                  className={EMPTY_ACTION_QUIET_CLASS}
                >
                  Clear all filters
                </button>
              </>
            }
          />
        </div>
      )}
    </>
  );
}

function HomeError({ error }: ErrorComponentProps) {
  console.error(error);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main id="main" className="mx-auto max-w-content px-4 py-10">
        <div className="rounded-2xl bg-panel p-6">
          <h2 className="font-display text-3xl font-extrabold leading-none tracking-tight text-text-bright">
            The catalog did not load
          </h2>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 cursor-pointer rounded-full bg-primary px-5 py-2.5 text-base font-bold text-primary-foreground hover:bg-primary/85"
          >
            Reload
          </button>
        </div>
      </main>
    </div>
  );
}
