import { Suspense, useMemo, useRef, useState } from "react";
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
import { mediaItemsQueryOptions, useMediaItems } from "@/hooks/useMediaItems";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useAuth } from "@/hooks/useAuth";
import { applyFilters } from "@/lib/filterMedia";
import { defaultFilterState, type FilterState } from "@/types/filters";
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
  loader: ({ context }) => context.queryClient.ensureQueryData(mediaItemsQueryOptions),
  errorComponent: HomeError,
  component: HomePage,
});

function HomePage() {
  const [filters, setFilters] = useState<FilterState>(() => defaultFilterState());
  const [mobileOpen, setMobileOpen] = useState(false);
  const { seenIds } = useUserStatus();
  const { user } = useAuth();
  const gridRef = useRef<HTMLDivElement>(null);

  const scrollToGrid = () => {
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
              />
            </Suspense>
          </div>
        </main>
      </div>

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
  const { data } = useMediaItems();
  return <FilterRail filters={filters} setFilters={setFilters} allItems={data} />;
}

function GridWithControls({
  filters,
  setFilters,
  seenIds,
  onOpenMobileFilters,
}: {
  filters: FilterState;
  setFilters: (u: (p: FilterState) => FilterState) => void;
  seenIds: Set<string>;
  onOpenMobileFilters: () => void;
}) {
  const { data } = useMediaItems();
  const filtered = useMemo(() => applyFilters(data, filters, seenIds), [data, filters, seenIds]);
  const activeCount = countActive(filters);

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
          <span className="text-text-bright">{filtered.length.toLocaleString()}</span> results
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

      <MediaGrid items={filtered} />

      {filtered.length === 0 && (
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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-4 py-10">
        <div className="rounded-[5px] border border-border bg-panel p-6">
          <h2 className="font-mono text-[12px] uppercase tracking-wider text-text-bright">
            Couldn't load the firehose
          </h2>
          <p className="mt-2 font-mono text-[11px] text-text-muted">{error.message}</p>
        </div>
      </main>
    </div>
  );
}
