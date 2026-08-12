import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Filter, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { TopBar } from "@/components/balasaur/TopBar";
import { MediaGrid } from "@/components/balasaur/MediaGrid";
import { MediaGridSkeleton } from "@/components/balasaur/MediaCardSkeleton";
import { FilterRail } from "@/components/balasaur/FilterRail";
import { ActiveFilters, countActive } from "@/components/balasaur/ActiveFilters";
import { AnimatedCount } from "@/components/balasaur/AnimatedCount";
import { Breadcrumbs } from "@/components/balasaur/Breadcrumbs";
import { SortControl } from "@/components/balasaur/SortControl";
import { LandingHero } from "@/components/balasaur/LandingHero";
import { DinoMark } from "@/components/balasaur/DinoMark";
import { AuthDialog } from "@/components/balasaur/AuthDialog";
import { TasteRamp, tasteRampSeen } from "@/components/balasaur/TasteRamp";
import { ShareButton } from "@/components/balasaur/ShareButton";
import {
  useCatalogInfinite,
  useCatalogFacets,
  useViewerCountry,
  viewerCountryOptions,
  catalogInfiniteOptions,
  catalogFacetsOptions,
  homeRailsOptions,
  filtersToParams,
  withBoost,
} from "@/hooks/useCatalog";
import { HomeRails } from "@/components/balasaur/HomeRails";
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
import {
  labelForFilters,
  recordView,
  clearTrail,
  type BreadcrumbEntry,
} from "@/lib/breadcrumbTrail";
import { rescueCandidates } from "@/lib/filterRescue";
import { defaultFilterState, type FilterState } from "@/types/filters";
import type { MediaItem } from "@/types/media";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { SITE_ORIGIN, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): FilterSearch => parseFilterSearch(search),
  loaderDeps: ({ search }) => search,
  head: () => ({
    meta: [
      { title: "Balasaur — Your personal entertainment database" },
      {
        name: "description",
        content:
          "Your personal entertainment database. Discover, track, and rate movies and TV all in one place.",
      },
      { property: "og:title", content: "Balasaur — Your personal entertainment database" },
      {
        property: "og:description",
        content:
          "Your personal entertainment database. Discover, track, and rate movies and TV all in one place.",
      },
      { property: "og:url", content: SITE_ORIGIN + "/" },
    ],
    links: [canonicalLink(SITE_ORIGIN + "/")],
  }),
  loader: async ({ context, deps }) => {
    // Detect the viewer's country (edge geo header) so the default view can be
    // server-rendered local-first — same value the client reads, so no hydration flip.
    // Guarded + budgeted: a geo hiccup or hang must never take down the loader.
    const country =
      (await ssrBudget(context.queryClient.ensureQueryData(viewerCountryOptions()), 2000)) ?? "";
    const boost = boostBucketsForCountry(country).length > 0 ? country : "";
    // Prefetch the URL's filters (so a shared/filtered link is server-rendered, not just
    // the default grid) + facet stats. allSettled so a prefetch failure can never reject
    // the loader, and ssrBudget so a HANGING backend can't stop the document from
    // streaming — the client refetches whatever the prefetch didn't finish.
    const params = filtersToParams(searchToFilters(deps));
    await ssrBudget(
      Promise.allSettled([
        context.queryClient.ensureInfiniteQueryData(
          catalogInfiniteOptions(withBoost(params, boost)),
        ),
        context.queryClient.ensureQueryData(catalogFacetsOptions(params)),
        context.queryClient.ensureQueryData(homeRailsOptions(boost)),
      ]),
      5000,
    );
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
  const { seenIds, statuses, recordStatus, ready, count } = useUserStatus();
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
        toast(`Not interested · ${item.title}`, {
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

  // "Ranked for <country>" escape hatch: geo-personalized ranking is visible
  // and reversible instead of silent (visibility of system status). Persisted
  // per device.
  const [globalRank, setGlobalRank] = useState(false);
  useEffect(() => {
    try {
      setGlobalRank(localStorage.getItem("balasaur:globalRank") === "1");
    } catch {
      // storage unavailable — non-fatal
    }
  }, []);
  const toggleGlobalRank = () => {
    setGlobalRank((v) => {
      const next = !v;
      try {
        localStorage.setItem("balasaur:globalRank", next ? "1" : "0");
      } catch {
        // non-fatal
      }
      return next;
    });
  };
  const effectiveBoost = globalRank ? "" : boostCountry;

  // Mobile bottom action sheet for a card (hover quick-actions don't exist on touch).
  const [actionItem, setActionItem] = useState<MediaItem | null>(null);

  // First-visit taste ramp: auto-open once per device for visitors with an
  // empty library. Always skippable; picks migrate to the account on sign-in.
  const [rampOpen, setRampOpen] = useState(false);
  useEffect(() => {
    if (!ready || count > 0 || rampOpen || tasteRampSeen()) return;
    const t = window.setTimeout(() => setRampOpen(true), 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, count]);

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

        <main className="min-w-0 flex-1">
          {!user && (
            <LandingHero onBrowse={scrollToGrid} onPickFavorites={() => setRampOpen(true)} />
          )}
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
                geoBase={boostCountry}
                globalRank={globalRank}
                onToggleGlobalRank={toggleGlobalRank}
                onOpenMobileFilters={() => setMobileOpen(true)}
                onQuickAction={handleQuickAction}
                onOpenActions={setActionItem}
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
                      label: "Not interested",
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

      <TasteRamp
        open={rampOpen}
        onOpenChange={setRampOpen}
        boostCountry={boostCountry}
        recordStatus={recordStatus}
        onComplete={(n) => {
          if (n > 0) {
            toast.success(`Saved ${n} favorite${n === 1 ? "" : "s"}`, { duration: 2000 });
            if (!user) setAuthOpen(true);
          }
        }}
      />

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

// Region code -> readable name for the geo-ranking indicator ("US" -> "United States").
let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
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
        {browsed.toLocaleString()} titles browsed · narrow it down?
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
          ? `Show ${facets.total.toLocaleString()} results`
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
  geoBase,
  globalRank,
  onToggleGlobalRank,
  onOpenMobileFilters,
  onQuickAction,
  onOpenActions,
}: {
  filters: FilterState;
  setFilters: (u: (p: FilterState) => FilterState) => void;
  seenIds: Set<string>;
  wantIds: Set<string>;
  rejectedIds: Set<string>;
  region: string;
  boostCountry: string;
  /** The viewer's detected country (pre-toggle) for the geo indicator label. */
  geoBase: string;
  globalRank: boolean;
  onToggleGlobalRank: () => void;
  onOpenMobileFilters: () => void;
  onQuickAction: (item: MediaItem, action: QuickAction) => void;
  onOpenActions: (item: MediaItem) => void;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching } =
    useCatalogInfinite(filters, region, boostCountry);

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

  // Breadcrumb trail: record each distinct view (session-persisted) so wandering from
  // detail-page links (or filter changes) can be jumped back to instead of hammering Back.
  const [trail, setTrail] = useState<BreadcrumbEntry[]>([]);
  useEffect(() => {
    setTrail(recordView({ label: labelForFilters(filters), search: filtersToSearch(filters) }));
  }, [filters]);

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
      {/* Curated rails: only on the untouched default view — any filter means
          the visitor is searching, and the rails would push their results down. */}
      {/* When filtering, the rails give way to results — but say where they
          went instead of vanishing (only power users deduce "clear = rails"). */}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={() =>
            setFilters((p) => ({ ...defaultFilterState(), sort: p.sort, hideSeen: p.hideSeen }))
          }
          className="mb-3 flex w-full cursor-pointer items-center gap-2 rounded-[5px] border border-border bg-panel/50 px-3 py-2 text-left transition-colors hover:border-border-strong"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-wider text-text-dim">
            Trending, New &amp; Noteworthy and other rails are hidden while filters are active
          </span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-primary">
            Clear filters to bring them back
          </span>
        </button>
      )}
      {activeCount === 0 && (filters.sort === "popular" || filters.sort === "trending") && (
        <HomeRails
          boostCountry={boostCountry}
          onQuickAction={onQuickAction}
          savedIds={wantIds}
          watchedIds={seenIds}
          rejectedIds={rejectedIds}
        />
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

        {/* Geo-personalized ranking is visible and one tap reversible, not silent. */}
        {geoBase && activeCount === 0 && filters.sort === "popular" && (
          <button
            type="button"
            onClick={onToggleGlobalRank}
            title={
              globalRank
                ? "Showing the global ranking — switch back to your local one"
                : `Home-country titles ranked first for ${countryName(geoBase)} — switch to global`
            }
            className="cursor-pointer rounded-[4px] border border-border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-text-dim transition-colors hover:border-border-strong hover:text-text-muted"
          >
            {globalRank ? "\u{1F310} Global ranking" : `Ranked for ${countryName(geoBase)}`}
          </button>
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

      <Breadcrumbs trail={trail} onClear={() => setTrail(clearTrail())} />

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
                Nothing fits — try removing a filter:
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
                      +{s.unlock.toLocaleString()}
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
                Nothing fits the current filters — try loosening one.
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
      <main className="mx-auto max-w-[1600px] px-4 py-10">
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
