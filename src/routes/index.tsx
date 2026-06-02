import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Filter } from "lucide-react";
import { TopBar } from "@/components/balasaur/TopBar";
import { MediaGrid } from "@/components/balasaur/MediaGrid";
import { MediaGridSkeleton } from "@/components/balasaur/MediaCardSkeleton";
import { FilterRail } from "@/components/balasaur/FilterRail";
import { ActiveFilters, countActive } from "@/components/balasaur/ActiveFilters";
import { SortControl } from "@/components/balasaur/SortControl";
import { LandingHero } from "@/components/balasaur/LandingHero";
import { DinoMark } from "@/components/balasaur/DinoMark";
import { AuthDialog } from "@/components/balasaur/AuthDialog";
import {
  useCatalogInfinite,
  useCatalogFacets,
  catalogInfiniteOptions,
  catalogFacetsQueryOptions,
  filtersToParams,
} from "@/hooks/useCatalog";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useAuth } from "@/hooks/useAuth";
import { recordForStatus } from "@/lib/userStatus";
import { loadFilters, saveFilters } from "@/lib/filterStorage";
import { defaultFilterState, type FilterState } from "@/types/filters";
import type { MediaItem } from "@/types/media";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { SITE_ORIGIN, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/")({
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
  loader: async ({ context }) => {
    // Prefetch the first page (default filters) + facet stats so the homepage is
    // server-rendered and instant on first paint; the client hydrates from cache.
    // allSettled (not all) so a single prefetch failure can never reject the loader
    // and take down the page — the server fns also fail-soft to empty results.
    await Promise.allSettled([
      context.queryClient.ensureInfiniteQueryData(
        catalogInfiniteOptions(filtersToParams(defaultFilterState())),
      ),
      context.queryClient.ensureQueryData(catalogFacetsQueryOptions),
    ]);
  },
  errorComponent: HomeError,
  component: HomePage,
});

function HomePage() {
  // Init to default for SSR; restore any persisted filters on the client after
  // mount (avoids a hydration mismatch) so returning from a detail page — via the
  // Back button or the logo — keeps your filters instead of resetting them.
  const [filters, setFilters] = useState<FilterState>(() => defaultFilterState());
  const filtersSaveArmed = useRef(false);
  useEffect(() => {
    const saved = loadFilters();
    if (saved) setFilters(saved);
  }, []);
  useEffect(() => {
    // Skip the initial render so we don't overwrite stored filters with defaults
    // before the restore above runs.
    if (!filtersSaveArmed.current) {
      filtersSaveArmed.current = true;
      return;
    }
    saveFilters(filters);
  }, [filters]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const { seenIds, statuses, recordStatus } = useUserStatus();
  const { user } = useAuth();
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
        {/* Desktop rail */}
        <aside className="sticky top-12 hidden h-[calc(100vh-48px)] w-[240px] shrink-0 overflow-y-auto border-r border-border pr-3 md:block">
          <Suspense fallback={<div className="font-mono text-[10px] text-text-dim">…</div>}>
            <RailWithData filters={filters} setFilters={setFilters} />
          </Suspense>
        </aside>

        <main className="min-w-0 flex-1">
          {!user && <LandingHero onBrowse={scrollToGrid} />}
          <div ref={gridRef} tabIndex={-1} className="scroll-mt-16">
            <Suspense fallback={<MediaGridSkeleton />}>
              <GridWithControls
                filters={filters}
                setFilters={setFilters}
                seenIds={seenIds}
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
        <SheetContent side="left" className="w-[300px] overflow-y-auto bg-background p-4">
          <SheetHeader>
            <SheetTitle className="font-mono text-[12px] uppercase tracking-wider">
              Filters
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3">
            <Suspense fallback={<div className="font-mono text-[10px] text-text-dim">…</div>}>
              <RailWithData filters={filters} setFilters={setFilters} />
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
}: {
  filters: FilterState;
  setFilters: (u: (p: FilterState) => FilterState) => void;
}) {
  const { data: facets } = useCatalogFacets();
  return <FilterRail filters={filters} setFilters={setFilters} facets={facets} />;
}

function GridWithControls({
  filters,
  setFilters,
  seenIds,
  onOpenMobileFilters,
  onQuickWatch,
}: {
  filters: FilterState;
  setFilters: (u: (p: FilterState) => FilterState) => void;
  seenIds: Set<string>;
  onOpenMobileFilters: () => void;
  onQuickWatch: (item: MediaItem) => void;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useCatalogInfinite(filters);

  // Flatten loaded pages. "Hide seen" is applied to what's loaded (client-side),
  // so the headline count stays the catalog total for the active filters.
  const items = useMemo(() => {
    const all = data?.pages.flatMap((pg) => pg.items) ?? [];
    return filters.hideSeen ? all.filter((it) => !seenIds.has(it.id)) : all;
  }, [data, filters.hideSeen, seenIds]);
  const total = data?.pages[0]?.total ?? 0;
  const activeCount = countActive(filters);

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
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={onOpenMobileFilters}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-border bg-panel px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-text-bright md:hidden"
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 rounded-[3px] bg-primary px-1 text-[10px] text-primary-foreground">
              {activeCount}
            </span>
          )}
        </button>

        <span className="font-mono text-[11px] text-text-muted">
          <span className="text-text-bright">{total.toLocaleString()}</span> results
        </span>

        <div className="ml-auto flex items-center gap-3">
          <label className="hidden cursor-pointer items-center gap-1.5 sm:flex">
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
