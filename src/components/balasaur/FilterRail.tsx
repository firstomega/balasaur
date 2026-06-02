import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import type { FilterState } from "@/types/filters";
import {
  AWARD_OPTIONS,
  IMDB_BOUNDS,
  META_BOUNDS,
  RT_BOUNDS,
  STREAMING_OPTIONS,
  YEAR_BOUNDS,
  defaultFilterState,
} from "@/types/filters";
import { UNIFIED_GENRES } from "@/lib/genres";
import { ORIGIN_OPTIONS } from "@/lib/origins";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { searchCast, type CatalogFacets } from "@/lib/catalog.functions";
import { catalogFacetsOptions, filtersToParams } from "@/hooks/useCatalog";
import { getProviderLogos } from "@/lib/media.functions";
import { ProviderIcon, type ProviderName } from "./ProviderIcon";
import { MediaTypeSwitch, modeFromSet, setFromMode } from "./MediaTypeSwitch";

interface Props {
  filters: FilterState;
  setFilters: (updater: (prev: FilterState) => FilterState) => void;
  facets: CatalogFacets | undefined;
}

// Order chips by count, descending, with the original list order as a stable
// tiebreaker. Used to surface the most-populated genres / origins first.
function sortByCount<T extends string>(
  options: readonly T[],
  counts: Record<string, number> | undefined,
): T[] {
  const base = [...options];
  if (!counts) return base;
  const idx = new Map<T, number>(base.map((o, i) => [o, i]));
  return base.sort(
    (a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || (idx.get(a) ?? 0) - (idx.get(b) ?? 0),
  );
}

const groupLabelClass = "font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-bright";

const pillBase =
  "cursor-pointer select-none rounded-[4px] border px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-wide transition-colors";

function Pill({
  active,
  onClick,
  children,
  disabled = false,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  count?: number;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        pillBase +
        " " +
        (disabled
          ? "cursor-not-allowed border-border/50 bg-panel/40 text-text-dim"
          : active
            ? "border-primary bg-primary/15 text-primary"
            : "border-border bg-panel text-text-muted hover:border-border-strong hover:text-text-bright")
      }
    >
      {children}
      {count !== undefined && (
        <span className={"ml-1 tabular-nums " + (active ? "text-primary/70" : "text-text-dim")}>
          {count}
        </span>
      )}
    </button>
  );
}

function TriggerLabel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {children}
      {active && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          aria-label="active filters"
        />
      )}
    </span>
  );
}

// Per-category reset, shown inside a group's content only when it's active.
function GroupClear({ show, onClear }: { show: boolean; onClear: () => void }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClear}
      className="mb-2 inline-flex cursor-pointer items-center gap-1 font-mono text-[9.5px] uppercase tracking-wider text-text-muted hover:text-text-bright"
    >
      <X className="h-2.5 w-2.5" />
      Clear
    </button>
  );
}

export function FilterRail({ filters, setFilters, facets }: Props) {
  // Origin facet stats come from a cheap cached global aggregate rather than the
  // full catalog. Counts let us grey out origins with no data; when origins haven't
  // been populated yet every count is 0 → chips disable, reading as "no origin
  // data" instead of a click landing on a blank grid.
  const genreCounts = facets?.genres ?? {};
  const originCounts = facets?.origins ?? {};
  const originTagged = facets?.tagged ?? 0;
  const catalogTotal = facets?.total ?? 0;

  // Chip display order: sort genre/origin by OVERALL catalog popularity (the global,
  // unfiltered counts — already prefetched for the homepage, so a cache hit) rather
  // than the live faceted counts. The most-populated options sit first, but the order
  // stays put as you change other filters instead of reshuffling on every count change;
  // only the numbers on each chip update live.
  const { data: globalFacets } = useQuery(
    catalogFacetsOptions(filtersToParams(defaultFilterState())),
  );
  const genreOrder = useMemo(
    () => sortByCount(UNIFIED_GENRES, globalFacets?.genres),
    [globalFacets?.genres],
  );
  const originOrder = useMemo(
    () => sortByCount(ORIGIN_OPTIONS, globalFacets?.origins),
    [globalFacets?.origins],
  );

  // Official provider logos (cached a day; empty → ProviderIcon shows its glyph).
  const { data: providerLogos } = useQuery({
    queryKey: ["provider-logos"],
    queryFn: () => getProviderLogos(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const toggleSet = <T,>(key: keyof FilterState, value: T) => {
    setFilters((prev) => {
      const set = new Set(prev[key] as unknown as Set<T>);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, [key]: set };
    });
  };

  // Per-award accolade state: each award is Off ("any"), Nominated, or Won.
  const setAward = (key: string, status: "any" | "nominated" | "won") => {
    setFilters((prev) => {
      const won = new Set(prev.awardsWon);
      const nom = new Set(prev.awardsNominated);
      won.delete(key);
      nom.delete(key);
      if (status === "won") won.add(key);
      else if (status === "nominated") nom.add(key);
      return { ...prev, awardsWon: won, awardsNominated: nom };
    });
  };

  // Reset a single filter group back to its default, leaving everything else.
  const clearGroup = (group: string) => {
    const d = defaultFilterState();
    setFilters((prev) => {
      switch (group) {
        case "media-type":
          return { ...prev, mediaTypes: d.mediaTypes };
        case "genre":
          return { ...prev, genres: d.genres };
        case "origin":
          return { ...prev, origins: d.origins };
        case "streaming":
          return { ...prev, streaming: d.streaming };
        case "released":
          return { ...prev, yearRange: d.yearRange };
        case "rating":
          return {
            ...prev,
            imdbRange: d.imdbRange,
            rtRange: d.rtRange,
            metaRange: d.metaRange,
            includeUnratedImdb: d.includeUnratedImdb,
            includeUnratedRt: d.includeUnratedRt,
            includeUnratedMeta: d.includeUnratedMeta,
          };
        case "people":
          return { ...prev, people: d.people };
        case "accolades":
          return {
            ...prev,
            awardWinners: d.awardWinners,
            nominated: d.nominated,
            awardsWon: d.awardsWon,
            awardsNominated: d.awardsNominated,
          };
        default:
          return prev;
      }
    });
  };

  const activeGroups = useMemo(() => {
    const s = new Set<string>();
    if (filters.mediaTypes.size !== 2) s.add("media-type");
    if (filters.genres.size > 0) s.add("genre");
    if (filters.origins.size > 0) s.add("origin");
    if (filters.streaming.size > 0) s.add("streaming");
    if (filters.yearRange[0] !== YEAR_BOUNDS[0] || filters.yearRange[1] !== YEAR_BOUNDS[1])
      s.add("released");
    if (
      filters.imdbRange[0] !== IMDB_BOUNDS[0] ||
      filters.imdbRange[1] !== IMDB_BOUNDS[1] ||
      filters.rtRange[0] !== RT_BOUNDS[0] ||
      filters.rtRange[1] !== RT_BOUNDS[1] ||
      filters.metaRange[0] !== META_BOUNDS[0] ||
      filters.metaRange[1] !== META_BOUNDS[1]
    )
      s.add("rating");
    if (filters.people.length > 0) s.add("people");
    if (
      filters.awardWinners ||
      filters.nominated ||
      filters.awardsWon.size > 0 ||
      filters.awardsNominated.size > 0
    )
      s.add("accolades");
    return s;
  }, [filters]);

  return (
    <div className="space-y-1">
      <Accordion
        type="multiple"
        defaultValue={["media-type", "streaming", "genre"]}
        className="w-full"
      >
        {/* Media Type */}
        <AccordionItem value="media-type" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>
            <TriggerLabel active={activeGroups.has("media-type")}>Media Type</TriggerLabel>
          </AccordionTrigger>
          <AccordionContent className="pb-3 pt-1">
            <MediaTypeSwitch
              mode={modeFromSet(filters.mediaTypes)}
              onChange={(m) => setFilters((prev) => ({ ...prev, mediaTypes: setFromMode(m) }))}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Streaming — positioned #2, open by default */}
        <AccordionItem value="streaming" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>
            <TriggerLabel active={activeGroups.has("streaming")}>Streaming Service</TriggerLabel>
          </AccordionTrigger>
          <AccordionContent className="pb-3 pt-1">
            <GroupClear
              show={activeGroups.has("streaming")}
              onClear={() => clearGroup("streaming")}
            />
            <div className="flex flex-wrap gap-2">
              {STREAMING_OPTIONS.map((s) => (
                <ProviderIcon
                  key={s}
                  provider={s as ProviderName}
                  logoUrl={providerLogos?.[s]}
                  selected={filters.streaming.has(s)}
                  onClick={() => toggleSet<string>("streaming", s)}
                  size={38}
                />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Genre */}
        <AccordionItem value="genre" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>
            <TriggerLabel active={activeGroups.has("genre")}>Genre</TriggerLabel>
          </AccordionTrigger>
          <AccordionContent className="pb-3 pt-1">
            <GroupClear show={activeGroups.has("genre")} onClear={() => clearGroup("genre")} />
            <div className="flex flex-wrap gap-1.5">
              {genreOrder.map((g) => {
                const count = genreCounts[g] ?? 0;
                const active = filters.genres.has(g);
                return (
                  <Pill
                    key={g}
                    active={active}
                    count={count}
                    disabled={count === 0 && !active}
                    onClick={() => toggleSet<string>("genres", g)}
                  >
                    {g}
                  </Pill>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Released */}
        <AccordionItem value="released" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>
            <TriggerLabel active={activeGroups.has("released")}>Released</TriggerLabel>
          </AccordionTrigger>
          <AccordionContent className="pb-4 pt-2">
            <div className="px-1">
              <GroupClear
                show={activeGroups.has("released")}
                onClear={() => clearGroup("released")}
              />
              <div className="mb-2 flex justify-between font-mono text-[10.5px] text-text-muted">
                <span>{filters.yearRange[0]}</span>
                <span>{filters.yearRange[1]}</span>
              </div>
              <Slider
                min={YEAR_BOUNDS[0]}
                max={YEAR_BOUNDS[1]}
                step={1}
                value={filters.yearRange}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, yearRange: [v[0], v[1]] as [number, number] }))
                }
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Origin — placed after Released per product preference */}
        <AccordionItem value="origin" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>
            <TriggerLabel active={activeGroups.has("origin")}>Origin</TriggerLabel>
          </AccordionTrigger>
          <AccordionContent className="pb-3 pt-1">
            <GroupClear show={activeGroups.has("origin")} onClear={() => clearGroup("origin")} />
            <div className="flex flex-wrap gap-1.5">
              {originOrder.map((o) => {
                const count = originCounts[o] ?? 0;
                const active = filters.origins.has(o);
                return (
                  <Pill
                    key={o}
                    active={active}
                    count={count}
                    disabled={count === 0 && !active}
                    onClick={() => toggleSet<string>("origins", o)}
                  >
                    {o}
                  </Pill>
                );
              })}
            </div>
            <div className="mt-2 font-mono text-[10px] text-text-dim">
              {originTagged.toLocaleString()} of {catalogTotal.toLocaleString()} tagged
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Rating */}
        <AccordionItem value="rating" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>
            <TriggerLabel active={activeGroups.has("rating")}>Rating</TriggerLabel>
          </AccordionTrigger>
          <AccordionContent className="pb-4 pt-2">
            <div className="px-1">
              <GroupClear show={activeGroups.has("rating")} onClear={() => clearGroup("rating")} />
            </div>
            <RatingSliders filters={filters} setFilters={setFilters} facets={facets} />
          </AccordionContent>
        </AccordionItem>

        {/* By Person */}
        <AccordionItem value="people" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>
            <TriggerLabel active={activeGroups.has("people")}>By Person</TriggerLabel>
          </AccordionTrigger>
          <AccordionContent className="pb-3 pt-1">
            <GroupClear show={activeGroups.has("people")} onClear={() => clearGroup("people")} />
            <PeoplePicker filters={filters} setFilters={setFilters} />
          </AccordionContent>
        </AccordionItem>

        {/* Accolades */}
        <AccordionItem value="accolades" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>
            <TriggerLabel active={activeGroups.has("accolades")}>Accolades</TriggerLabel>
          </AccordionTrigger>
          <AccordionContent className="pb-3 pt-1">
            <GroupClear
              show={activeGroups.has("accolades")}
              onClear={() => clearGroup("accolades")}
            />
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={filters.awardWinners}
                  onCheckedChange={(v) => setFilters((prev) => ({ ...prev, awardWinners: !!v }))}
                />
                <span className="font-mono text-[11.5px] text-text-bright">Award winners</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={filters.nominated}
                  onCheckedChange={(v) => setFilters((prev) => ({ ...prev, nominated: !!v }))}
                />
                <span className="font-mono text-[11.5px] text-text-bright">Nominated</span>
              </label>
            </div>

            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <div className="font-mono text-[9.5px] uppercase tracking-wider text-text-dim">
                By award
              </div>
              {AWARD_OPTIONS.map((a) => {
                const status = filters.awardsWon.has(a.key)
                  ? "won"
                  : filters.awardsNominated.has(a.key)
                    ? "nominated"
                    : "any";
                return (
                  <div key={a.key} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-text-muted">{a.label}</span>
                    <div className="inline-flex rounded-[4px] border border-border bg-panel p-[2px]">
                      {(["any", "nominated", "won"] as const).map((s) => {
                        const active = status === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setAward(a.key, s)}
                            className={
                              "cursor-pointer rounded-[3px] px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-wider transition-colors " +
                              (active
                                ? "bg-accent text-text-bright"
                                : "text-text-muted hover:text-text-bright")
                            }
                          >
                            {s === "any" ? "Any" : s === "nominated" ? "Nom." : "Won"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function RatingSliders({
  filters,
  setFilters,
  facets,
}: {
  filters: FilterState;
  setFilters: Props["setFilters"];
  facets: CatalogFacets | undefined;
}) {
  const rows: {
    label: string;
    key: "imdbRange" | "rtRange" | "metaRange";
    includeKey: "includeUnratedImdb" | "includeUnratedRt" | "includeUnratedMeta";
    scoredKey: "imdb" | "rt" | "meta";
    bounds: [number, number];
    step: number;
    suffix?: string;
  }[] = [
    {
      label: "IMDb",
      key: "imdbRange",
      includeKey: "includeUnratedImdb",
      scoredKey: "imdb",
      bounds: IMDB_BOUNDS,
      step: 0.1,
    },
    {
      label: "Rotten Tomatoes",
      key: "rtRange",
      includeKey: "includeUnratedRt",
      scoredKey: "rt",
      bounds: RT_BOUNDS,
      step: 1,
      suffix: "%",
    },
    {
      label: "Metacritic",
      key: "metaRange",
      includeKey: "includeUnratedMeta",
      scoredKey: "meta",
      bounds: META_BOUNDS,
      step: 1,
    },
  ];

  const total = facets?.total ?? 0;

  return (
    <div className="space-y-4 px-1">
      {rows.map((row) => {
        const value = filters[row.key];
        const covered = facets?.scored[row.scoredKey] ?? 0;
        return (
          <div key={row.key}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-muted">
                {row.label}
              </span>
              <span className="font-mono text-[10.5px] text-text-bright">
                {value[0]}
                {row.suffix ?? ""} – {value[1]}
                {row.suffix ?? ""}
              </span>
            </div>
            <Slider
              min={row.bounds[0]}
              max={row.bounds[1]}
              step={row.step}
              value={value}
              onValueChange={(v) =>
                setFilters((prev) => ({ ...prev, [row.key]: [v[0], v[1]] as [number, number] }))
              }
            />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-1.5">
                <Checkbox
                  checked={filters[row.includeKey]}
                  onCheckedChange={(v) =>
                    setFilters((prev) => ({ ...prev, [row.includeKey]: !!v }))
                  }
                />
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Include unrated
                </span>
              </label>
              <span className="font-mono text-[10px] text-text-dim">
                {covered} of {total} scored
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PeoplePicker({
  filters,
  setFilters,
}: {
  filters: FilterState;
  setFilters: Props["setFilters"];
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<string[]>([]);
  const search = useServerFn(searchCast);

  // Debounced server-side cast/crew search (replaces scanning the in-memory catalog).
  useEffect(() => {
    const qq = query.trim();
    if (!qq) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await search({ data: { query: qq, exclude: filters.people } });
        if (!cancelled) setMatches(res);
      } catch {
        if (!cancelled) setMatches([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, filters.people, search]);

  const add = (name: string) => {
    setFilters((prev) =>
      prev.people.includes(name) ? prev : { ...prev, people: [...prev.people, name] },
    );
    setQuery("");
  };

  const remove = (name: string) => {
    setFilters((prev) => ({ ...prev, people: prev.people.filter((p) => p !== name) }));
  };

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a name…"
        className="h-8 w-full rounded-[4px] border border-border bg-panel px-2 font-mono text-[11.5px] text-foreground placeholder:text-text-dim focus:border-border-strong focus:outline-none"
      />
      {matches.length > 0 && (
        <ul className="rounded-[4px] border border-border bg-panel">
          {matches.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => add(name)}
                className="block w-full cursor-pointer px-2 py-1 text-left font-mono text-[11px] text-text-bright hover:bg-accent"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {filters.people.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.people.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 rounded-[4px] border border-primary bg-primary/15 px-1.5 py-[2px] font-mono text-[10.5px] text-primary"
            >
              {p}
              <button
                type="button"
                onClick={() => remove(p)}
                className="cursor-pointer hover:text-text-bright"
                aria-label={`Remove ${p}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
