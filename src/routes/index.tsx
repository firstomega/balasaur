import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
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
import {
  useCatalogInfinite,
  useCatalogFacets,
  useViewerCountry,
  viewerCountryOptions,
  catalogInfiniteOptions,
  catalogFacetsOptions,
  filtersToParams,
  withBoost,
} from "@/hooks/useCatalog";
import { boostBucketsForCountry, localFirstLabel, LOCAL_FIRST_KEY } from "@/lib/localFirst";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useAuth } from "@/hooks/useAuth";
import { recordForStatus } from "@/lib/userStatus";
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
    // Guarded: a geo lookup hiccup must never take down the loader — just skip the boost.
    let country = "";
    try {
      country = await context.queryClient.ensureQueryData(viewerCountryOptions());
    } catch {
      country = "";
    }
    const boost = boostBucketsForCountry(country).length > 0 ? country : "";
    // Prefetch the URL's filters (so a shared/filtered link is server-rendered, not just
    // the default grid) + facet stats. allSettled so a prefetch failure can never reject
    // the loader and take down the page — the server fns also fail-soft to empty results.
    const params = filtersToParams(searchToFilters(deps));
    await Promise.allSettled([
      context.queryClient.ensureInfiniteQueryData(catalogInfiniteOptions(withBoost(params, boost))),
      context.queryClient.ensureQueryData(catalogFacetsOptions(params)),
    ]);
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
  const { seenIds, statuses, recordStatus } = useUserStatus();
  const { user } = useAuth();
  // Per-country streaming: filter availability by the viewer's account region.
  // Falls back to US for signed-out visitors / accounts with no region set.
  const region = (user?.user_metadata?.region as string | undefined) || "US";

  // Local-first: on the default view, rank the viewer's home-country titles first
  // (nothing hidden). Country comes from their account region, else IP geo. Default ON;
  // "weight all regions equally" turns it off (persisted). Init true on both server and
  // client so SSR hydration stays stable; the stored preference is applied post-mount.
  const ipCountry = useViewerCountry();
  const homeCountry = (user?.user_metadata?.region as string | undefined) || ipCountry || "";
  const [localFirst, setLocalFirst] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(LOCAL_FIRST_KEY) === "0") setLocalFirst(false);
    } catch {
      // storage unavailable — non-fatal, stays on
    }
  }, []);
  const boostLabel = localFirstLabel(homeCountry);
  const boostActive = localFirst && !!boostLabel;
  const boostCountry = boostActive ? homeCountry : "";
  const setLocalFirstPref = (on: boolean) => {
    setLocalFirst(on);
    try {
      localStorage.setItem(LOCAL_FIRST_KEY, on ? "1" : "0");
    } catch {
      // non-fatal
    }
  };

  const gridRef = useRef<HTMLDivElement>(null);

  const scrollToGrid = () => {
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Quick-add "Watched" from the grid (desktop hover). Supplements the swipe deck.
  const handleQuickWatch = (item: MediaItem) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (statuses[item.id]?.status === "seen") {
      recordStatus(item.id, null); // toggle off
      toast(`Removed · ${item.title}`, { duration: 1400 });
    } else {
      recordStatus(item.id, recordForStatus("watched"), item);
      toast.success(`Watched · ${item.title}`, { duration: 1400 });
    }
  };

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
          {!user && <LandingHero onBrowse={scrollToGrid} />}
          <div ref={gridRef} tabIndex={-1} className="scroll-mt-16">
            <Suspense fallback={<MediaGridSkeleton />}>
              <GridWithControls
                filters={filters}
                setFilters={setFilters}
                seenIds={seenIds}
                region={region}
                boostCountry={boostCountry}
                boostLabel={boostLabel}
                localFirst={localFirst}
                onSetLocalFirst={setLocalFirstPref}
                onOpenMobileFilters={() => setMobileOpen(true)}
                onQuickWatch={handleQuickWatch}
              />
            </Suspense>
          </div>
        </main>
      </div>

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
          <div className="mt-3">
            <Suspense fallback={<div className="font-mono text-[10px] text-text-dim">…</div>}>
              <RailWithData
                filters={filters}
                setFilters={setFilters}
                region={region}
                onRequireAuth={() => setAuthOpen(true)}
              />
            </Suspense>
          </div>
        </SheetContent>
      </Sheet>
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
  region,
  boostCountry,
  boostLabel,
  localFirst,
  onSetLocalFirst,
  onOpenMobileFilters,
  onQuickWatch,
}: {
  filters: FilterState;
  setFilters: (u: (p: FilterState) => FilterState) => void;
  seenIds: Set<string>;
  region: string;
  boostCountry: string;
  boostLabel: string | null;
  localFirst: boolean;
  onSetLocalFirst: (on: boolean) => void;
  onOpenMobileFilters: () => void;
  onQuickWatch: (item: MediaItem) => void;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useCatalogInfinite(
    filters,
    region,
    boostCountry,
  );

  // The location boost only takes effect on the default popularity sort with no explicit
  // Origin filter (mirrors the server), so only surface the banner when it's really doing
  // something. A dismissed/off state still offers a one-click way to switch it back on.
  const boostApplies =
    !!boostLabel &&
    (filters.sort === "popular" || filters.sort === "trending") &&
    filters.origins.size === 0;

  // Flatten loaded pages. "Hide seen" is applied to what's loaded (client-side),
  // so the headline count stays the catalog total for the active filters.
  const items = useMemo(() => {
    const all = data?.pages.flatMap((pg) => pg.items) ?? [];
    return filters.hideSeen ? all.filter((it) => !seenIds.has(it.id)) : all;
  }, [data, filters.hideSeen, seenIds]);
  const total = data?.pages[0]?.total ?? 0;
  const activeCount = countActive(filters);

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
      {/* Local-first banner: transparent + reversible. Only shown when the boost is
          actually in effect (default sort, no Origin filter). */}
      {boostApplies && localFirst && (
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[5px] border border-border bg-panel px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-text-muted">
          <span>
            Showing <span className="text-text-bright">{boostLabel}</span> titles first
          </span>
          <button
            type="button"
            onClick={() => onSetLocalFirst(false)}
            className="cursor-pointer text-text-dim underline hover:text-text-bright"
          >
            Weight all regions equally
          </button>
        </div>
      )}
      {boostApplies && !localFirst && (
        <div className="mb-2 font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
          <button
            type="button"
            onClick={() => onSetLocalFirst(true)}
            className="cursor-pointer underline hover:text-text-bright"
          >
            Show {boostLabel} titles first
          </button>
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

        <div className="flex items-center gap-3 sm:ml-2">
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
          <MediaGrid items={items} onQuickWatch={onQuickWatch} watchedIds={seenIds} />
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
