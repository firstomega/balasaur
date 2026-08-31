import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { AnimatedCount } from "./AnimatedCount";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { BALASAUR_BOUNDS, STREAMING_OPTIONS, YEAR_BOUNDS, type FilterState } from "@/types/filters";
import type { MediaType } from "@/types/media";
import { UNIFIED_GENRES } from "@/lib/genres";

// The mobile filter strip: filtering as the product, not a drawer.
//
// One horizontally scrollable row directly above the grid. The first chip is
// the live result count, the needle every control moves; the rest are the
// four filters people actually use, each opening a bottom sheet with just
// that control. A chip wears its VALUE when active (SCORE 70+, NETFLIX,
// 2010S), so the strip is also the active-filter display, and the old
// "Filters" pill plus the separate active-chip row both retire on mobile.
//
// Chips are buttons, never links: filter state serializes to the URL
// elsewhere, and the homepage canonical ignores it, so nothing here mints a
// crawlable URL. Every sheet writes straight into the shared FilterState, so
// the count ticks while you adjust; "Show N results" just closes the sheet.
// Desktop is untouched: the persistent FilterRail sidebar already does this
// job at ≥768px, and this whole component is md:hidden.

type SheetKey = "type" | "score" | "genre" | "streaming" | "year" | null;

const DECADES: { label: string; range: [number, number] }[] = [
  { label: "2020s", range: [2020, YEAR_BOUNDS[1]] },
  { label: "2010s", range: [2010, 2019] },
  { label: "2000s", range: [2000, 2009] },
  { label: "90s", range: [1990, 1999] },
  { label: "80s", range: [1980, 1989] },
  { label: "Older", range: [YEAR_BOUNDS[0], 1979] },
];

function sameRange(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function MobileFilterStrip({
  filters,
  setFilters,
  total,
  activeCount,
  onOpenAllFilters,
}: {
  filters: FilterState;
  setFilters: (updater: (prev: FilterState) => FilterState) => void;
  total: number;
  activeCount: number;
  onOpenAllFilters: () => void;
}) {
  const [open, setOpen] = useState<SheetKey>(null);

  // Chip labels state their value, not their name, once a value is chosen.
  const typeLabel = filters.mediaTypes.has("movie")
    ? filters.mediaTypes.has("tv")
      ? "All"
      : "Movies"
    : filters.mediaTypes.has("tv")
      ? "TV"
      : "All";
  const scoreActive = filters.balasaurRange[0] > BALASAUR_BOUNDS[0];
  const scoreLabel = scoreActive ? `Score ${filters.balasaurRange[0]}+` : "Score";
  const genreLabel =
    filters.genres.size === 0
      ? "Genre"
      : filters.genres.size === 1
        ? [...filters.genres][0]
        : `${[...filters.genres][0]} +${filters.genres.size - 1}`;
  const svcLabel =
    filters.streaming.size === 0
      ? "Streaming"
      : filters.streaming.size === 1
        ? [...filters.streaming][0]
        : `${[...filters.streaming][0]} +${filters.streaming.size - 1}`;
  const decadeMatch = DECADES.find((d) => sameRange(filters.yearRange, d.range));
  const yearActive = !sameRange(filters.yearRange, YEAR_BOUNDS);
  const yearLabel = decadeMatch
    ? decadeMatch.label
    : yearActive
      ? `${filters.yearRange[0]}–${filters.yearRange[1]}`
      : "Year";

  return (
    <>
      <div className="sticky top-12 z-20 -mx-4 mb-3 border-b border-border bg-background px-4 py-2 md:hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 whitespace-nowrap font-mono text-[12px] uppercase tracking-wider text-text-muted">
            <AnimatedCount value={total} className="text-text-bright" /> titles
          </span>
          <StripChip active={typeLabel !== "All"} onClick={() => setOpen("type")}>
            {typeLabel === "All" ? "Type" : typeLabel}
          </StripChip>
          <StripChip active={scoreActive} onClick={() => setOpen("score")}>
            {scoreLabel}
          </StripChip>
          <StripChip active={filters.genres.size > 0} onClick={() => setOpen("genre")}>
            {genreLabel}
          </StripChip>
          <StripChip active={filters.streaming.size > 0} onClick={() => setOpen("streaming")}>
            {svcLabel}
          </StripChip>
          <StripChip active={yearActive} onClick={() => setOpen("year")}>
            {yearLabel}
          </StripChip>
          <button
            type="button"
            onClick={onOpenAllFilters}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-[4px] border border-border-strong bg-panel px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-bright"
          >
            <SlidersHorizontal className="h-3 w-3" />
            All
            {activeCount > 0 && (
              <span className="rounded-[3px] bg-primary px-1 text-[11px] text-primary-foreground">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="bottom" className="rounded-t-[10px] bg-background px-4 pb-4 pt-3">
          <SheetHeader>
            <SheetTitle className="text-left font-mono text-[12px] uppercase tracking-wider">
              {open === "type" && "Type"}
              {open === "score" && "Balasaur Score"}
              {open === "genre" && "Genre"}
              {open === "streaming" && "Streaming service"}
              {open === "year" && "From when"}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-3 max-h-[45vh] overflow-y-auto">
            {open === "type" && (
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { label: "All", types: ["movie", "tv"] },
                    { label: "Movies", types: ["movie"] },
                    { label: "TV", types: ["tv"] },
                  ] as { label: string; types: MediaType[] }[]
                ).map(({ label, types }) => (
                  <SheetChip
                    key={label}
                    active={
                      types.length === filters.mediaTypes.size &&
                      types.every((t) => filters.mediaTypes.has(t))
                    }
                    onClick={() => setFilters((p) => ({ ...p, mediaTypes: new Set(types) }))}
                  >
                    {label}
                  </SheetChip>
                ))}
              </div>
            )}

            {open === "score" && (
              <div className="px-1">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="font-mono text-[12px] text-text-muted">Minimum score</span>
                  <span className="font-mono text-[15px] text-text-bright">
                    {filters.balasaurRange[0]}
                  </span>
                </div>
                <Slider
                  min={BALASAUR_BOUNDS[0]}
                  max={95}
                  step={5}
                  value={[filters.balasaurRange[0]]}
                  onValueChange={([v]) =>
                    setFilters((p) => ({ ...p, balasaurRange: [v, p.balasaurRange[1]] }))
                  }
                />
                <div className="mt-2 flex justify-between font-mono text-[11px] text-text-dim">
                  <span>Any</span>
                  <span>95</span>
                </div>
              </div>
            )}

            {open === "genre" && (
              <div className="flex flex-wrap gap-1.5">
                {UNIFIED_GENRES.map((g) => (
                  <SheetChip
                    key={g}
                    active={filters.genres.has(g)}
                    onClick={() =>
                      setFilters((p) => {
                        const next = new Set(p.genres);
                        if (next.has(g)) next.delete(g);
                        else next.add(g);
                        return { ...p, genres: next };
                      })
                    }
                  >
                    {g}
                  </SheetChip>
                ))}
              </div>
            )}

            {open === "streaming" && (
              <div className="flex flex-wrap gap-1.5">
                {STREAMING_OPTIONS.map((s) => (
                  <SheetChip
                    key={s}
                    active={filters.streaming.has(s)}
                    onClick={() =>
                      setFilters((p) => {
                        const next = new Set(p.streaming);
                        if (next.has(s)) next.delete(s);
                        else next.add(s);
                        return { ...p, streaming: next };
                      })
                    }
                  >
                    {s}
                  </SheetChip>
                ))}
              </div>
            )}

            {open === "year" && (
              <div className="flex flex-wrap gap-1.5">
                <SheetChip
                  active={!yearActive}
                  onClick={() => setFilters((p) => ({ ...p, yearRange: [...YEAR_BOUNDS] }))}
                >
                  Any
                </SheetChip>
                {DECADES.map((d) => (
                  <SheetChip
                    key={d.label}
                    active={sameRange(filters.yearRange, d.range)}
                    onClick={() => setFilters((p) => ({ ...p, yearRange: [...d.range] }))}
                  >
                    {d.label}
                  </SheetChip>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            {open === "score" && scoreActive && (
              <button
                type="button"
                onClick={() =>
                  setFilters((p) => ({
                    ...p,
                    balasaurRange: [BALASAUR_BOUNDS[0], p.balasaurRange[1]],
                  }))
                }
                className="cursor-pointer rounded-[5px] border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-text-muted"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="flex-1 cursor-pointer rounded-[5px] bg-primary px-3 py-2.5 text-center text-[13px] font-medium text-primary-foreground"
            >
              Show <AnimatedCount value={total} /> results
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function StripChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 cursor-pointer whitespace-nowrap rounded-[4px] border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-panel text-text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function SheetChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`cursor-pointer rounded-[5px] border px-3 py-2 text-[13px] transition-colors ${
        active ? "border-primary bg-primary/15 text-primary" : "border-border bg-panel text-text"
      }`}
    >
      {children}
    </button>
  );
}
