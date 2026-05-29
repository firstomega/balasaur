import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { MediaItem, MediaType } from "@/types/media";
import type { FilterState } from "@/types/filters";
import {
  IMDB_BOUNDS,
  META_BOUNDS,
  RT_BOUNDS,
  STREAMING_OPTIONS,
  YEAR_BOUNDS,
} from "@/types/filters";
import { UNIFIED_GENRES } from "@/lib/genres";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { searchPeople } from "@/lib/filterMedia";

interface Props {
  filters: FilterState;
  setFilters: (updater: (prev: FilterState) => FilterState) => void;
  allItems: MediaItem[];
}

const groupLabelClass =
  "font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-bright";

const pillBase =
  "cursor-pointer select-none rounded-[4px] border px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-wide transition-colors";

function Pill({
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
      onClick={onClick}
      className={
        pillBase +
        " " +
        (active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-panel text-text-muted hover:border-border-strong hover:text-text-bright")
      }
    >
      {children}
    </button>
  );
}

export function FilterRail({ filters, setFilters, allItems }: Props) {
  const toggleSet = <T,>(key: keyof FilterState, value: T) => {
    setFilters((prev) => {
      const set = new Set(prev[key] as unknown as Set<T>);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, [key]: set };
    });
  };

  return (
    <div className="space-y-1">
      <Accordion type="multiple" defaultValue={["media-type", "genre"]} className="w-full">
        {/* Media Type */}
        <AccordionItem value="media-type" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>Media Type</AccordionTrigger>
          <AccordionContent className="pb-3 pt-1">
            <div className="space-y-2">
              {(
                [
                  { value: "movie" as MediaType, label: "Movies" },
                  { value: "tv" as MediaType, label: "TV" },
                ]
              ).map((opt) => (
                <label key={opt.value} className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={filters.mediaTypes.has(opt.value)}
                    onCheckedChange={() => toggleSet<MediaType>("mediaTypes", opt.value)}
                  />
                  <span className="font-mono text-[11.5px] text-text-bright">{opt.label}</span>
                </label>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Genre */}
        <AccordionItem value="genre" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>Genre</AccordionTrigger>
          <AccordionContent className="pb-3 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {UNIFIED_GENRES.map((g) => (
                <Pill
                  key={g}
                  active={filters.genres.has(g)}
                  onClick={() => toggleSet<string>("genres", g)}
                >
                  {g}
                </Pill>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Streaming */}
        <AccordionItem value="streaming" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>Streaming Service</AccordionTrigger>
          <AccordionContent className="pb-3 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {STREAMING_OPTIONS.map((s) => (
                <Pill
                  key={s}
                  active={filters.streaming.has(s)}
                  onClick={() => toggleSet<string>("streaming", s)}
                >
                  {s}
                </Pill>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Released */}
        <AccordionItem value="released" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>Released</AccordionTrigger>
          <AccordionContent className="pb-4 pt-2">
            <div className="px-1">
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

        {/* Rating */}
        <AccordionItem value="rating" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>Rating</AccordionTrigger>
          <AccordionContent className="pb-4 pt-2">
            <RatingSliders filters={filters} setFilters={setFilters} />
          </AccordionContent>
        </AccordionItem>

        {/* By Person */}
        <AccordionItem value="people" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>By Person</AccordionTrigger>
          <AccordionContent className="pb-3 pt-1">
            <PeoplePicker filters={filters} setFilters={setFilters} allItems={allItems} />
          </AccordionContent>
        </AccordionItem>

        {/* Accolades */}
        <AccordionItem value="accolades" className="border-border">
          <AccordionTrigger className={groupLabelClass + " py-2.5"}>Accolades</AccordionTrigger>
          <AccordionContent className="pb-3 pt-1">
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={filters.awardWinners}
                  onCheckedChange={(v) =>
                    setFilters((prev) => ({ ...prev, awardWinners: !!v }))
                  }
                />
                <span className="font-mono text-[11.5px] text-text-bright">Award winners</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={filters.nominated}
                  onCheckedChange={(v) =>
                    setFilters((prev) => ({ ...prev, nominated: !!v }))
                  }
                />
                <span className="font-mono text-[11.5px] text-text-bright">Nominated</span>
              </label>
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
}: {
  filters: FilterState;
  setFilters: Props["setFilters"];
}) {
  const rows: {
    label: string;
    key: "imdbRange" | "rtRange" | "metaRange";
    bounds: [number, number];
    step: number;
    suffix?: string;
  }[] = [
    { label: "IMDb", key: "imdbRange", bounds: IMDB_BOUNDS, step: 0.1 },
    { label: "Rotten Tomatoes", key: "rtRange", bounds: RT_BOUNDS, step: 1, suffix: "%" },
    { label: "Metacritic", key: "metaRange", bounds: META_BOUNDS, step: 1 },
  ];

  return (
    <div className="space-y-4 px-1">
      {rows.map((row) => {
        const value = filters[row.key];
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
          </div>
        );
      })}
    </div>
  );
}

function PeoplePicker({
  filters,
  setFilters,
  allItems,
}: {
  filters: FilterState;
  setFilters: Props["setFilters"];
  allItems: MediaItem[];
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () => (query.trim() ? searchPeople(allItems, query, filters.people) : []),
    [query, allItems, filters.people],
  );

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