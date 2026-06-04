import { X } from "lucide-react";
import type { FilterState } from "@/types/filters";
import {
  AWARD_OPTIONS,
  FILM_LENGTH_BUCKETS,
  IMDB_BOUNDS,
  META_BOUNDS,
  RT_BOUNDS,
  YEAR_BOUNDS,
  defaultFilterState,
} from "@/types/filters";

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

export function buildChips(
  filters: FilterState,
  setFilters: (u: (p: FilterState) => FilterState) => void,
): Chip[] {
  const chips: Chip[] = [];

  // Media types: only show if not the default (both selected)
  if (filters.mediaTypes.size !== 2) {
    for (const t of filters.mediaTypes) {
      chips.push({
        key: `mt-${t}`,
        label: t === "movie" ? "Movies only" : "TV only",
        onRemove: () =>
          setFilters((p) => {
            const next = new Set(p.mediaTypes);
            next.delete(t);
            if (next.size === 0) {
              next.add("movie");
              next.add("tv");
            }
            return { ...p, mediaTypes: next };
          }),
      });
    }
  }

  for (const g of filters.genres) {
    chips.push({
      key: `g-${g}`,
      label: g,
      onRemove: () =>
        setFilters((p) => {
          const next = new Set(p.genres);
          next.delete(g);
          return { ...p, genres: next };
        }),
    });
  }

  for (const sg of filters.subGenres) {
    chips.push({
      key: `sg-${sg}`,
      label: sg,
      onRemove: () =>
        setFilters((p) => {
          const next = new Set(p.subGenres);
          next.delete(sg);
          return { ...p, subGenres: next };
        }),
    });
  }

  for (const th of filters.themes) {
    chips.push({
      key: `th-${th}`,
      label: th,
      onRemove: () =>
        setFilters((p) => {
          const next = new Set(p.themes);
          next.delete(th);
          return { ...p, themes: next };
        }),
    });
  }

  for (const au of filters.audience) {
    chips.push({
      key: `au-${au}`,
      label: au,
      onRemove: () =>
        setFilters((p) => {
          const next = new Set(p.audience);
          next.delete(au);
          return { ...p, audience: next };
        }),
    });
  }

  for (const fl of filters.filmLength) {
    chips.push({
      key: `fl-${fl}`,
      label: FILM_LENGTH_BUCKETS.find((b) => b.key === fl)?.label ?? fl,
      onRemove: () =>
        setFilters((p) => {
          const next = new Set(p.filmLength);
          next.delete(fl);
          return { ...p, filmLength: next };
        }),
    });
  }

  for (const cs of filters.completion) {
    chips.push({
      key: `cs-${cs}`,
      label: cs,
      onRemove: () =>
        setFilters((p) => {
          const next = new Set(p.completion);
          next.delete(cs);
          return { ...p, completion: next };
        }),
    });
  }

  for (const o of filters.origins) {
    chips.push({
      key: `o-${o}`,
      label: o,
      onRemove: () =>
        setFilters((p) => {
          const next = new Set(p.origins);
          next.delete(o);
          return { ...p, origins: next };
        }),
    });
  }

  for (const s of filters.streaming) {
    chips.push({
      key: `s-${s}`,
      label: s,
      onRemove: () =>
        setFilters((p) => {
          const next = new Set(p.streaming);
          next.delete(s);
          return { ...p, streaming: next };
        }),
    });
  }

  if (filters.yearRange[0] !== YEAR_BOUNDS[0] || filters.yearRange[1] !== YEAR_BOUNDS[1]) {
    chips.push({
      key: "year",
      label: `${filters.yearRange[0]}–${filters.yearRange[1]}`,
      onRemove: () => setFilters((p) => ({ ...p, yearRange: [...YEAR_BOUNDS] })),
    });
  }

  if (filters.imdbRange[0] !== IMDB_BOUNDS[0] || filters.imdbRange[1] !== IMDB_BOUNDS[1]) {
    chips.push({
      key: "imdb",
      label: `IMDb ${filters.imdbRange[0]}–${filters.imdbRange[1]}`,
      onRemove: () => setFilters((p) => ({ ...p, imdbRange: [...IMDB_BOUNDS] })),
    });
  }
  if (filters.rtRange[0] !== RT_BOUNDS[0] || filters.rtRange[1] !== RT_BOUNDS[1]) {
    chips.push({
      key: "rt",
      label: `RT ${filters.rtRange[0]}%–${filters.rtRange[1]}%`,
      onRemove: () => setFilters((p) => ({ ...p, rtRange: [...RT_BOUNDS] })),
    });
  }
  if (filters.metaRange[0] !== META_BOUNDS[0] || filters.metaRange[1] !== META_BOUNDS[1]) {
    chips.push({
      key: "meta",
      label: `MC ${filters.metaRange[0]}–${filters.metaRange[1]}`,
      onRemove: () => setFilters((p) => ({ ...p, metaRange: [...META_BOUNDS] })),
    });
  }

  for (const p of filters.people) {
    chips.push({
      key: `p-${p}`,
      label: p,
      onRemove: () =>
        setFilters((prev) => ({ ...prev, people: prev.people.filter((x) => x !== p) })),
    });
  }

  if (filters.awardWinners) {
    chips.push({
      key: "winners",
      label: "Award winners",
      onRemove: () => setFilters((p) => ({ ...p, awardWinners: false })),
    });
  }
  if (filters.nominated) {
    chips.push({
      key: "nominated",
      label: "Nominated",
      onRemove: () => setFilters((p) => ({ ...p, nominated: false })),
    });
  }

  const awardLabel = (k: string) => AWARD_OPTIONS.find((a) => a.key === k)?.label ?? k;
  for (const k of filters.awardsWon) {
    chips.push({
      key: `aw-${k}`,
      label: `${awardLabel(k)}: Won`,
      onRemove: () =>
        setFilters((p) => {
          const next = new Set(p.awardsWon);
          next.delete(k);
          return { ...p, awardsWon: next };
        }),
    });
  }
  for (const k of filters.awardsNominated) {
    chips.push({
      key: `an-${k}`,
      label: `${awardLabel(k)}: Nominated`,
      onRemove: () =>
        setFilters((p) => {
          const next = new Set(p.awardsNominated);
          next.delete(k);
          return { ...p, awardsNominated: next };
        }),
    });
  }

  return chips;
}

export function countActive(filters: FilterState): number {
  return buildChips(filters, () => undefined as never).length;
}

export function ActiveFilters({
  filters,
  setFilters,
}: {
  filters: FilterState;
  setFilters: (u: (p: FilterState) => FilterState) => void;
}) {
  const chips = buildChips(filters, setFilters);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-[4px] border border-border-strong bg-panel px-1.5 py-[3px] font-mono text-[10.5px] text-text-bright"
        >
          {c.label}
          <button
            type="button"
            onClick={c.onRemove}
            className="cursor-pointer text-text-muted hover:text-text-bright"
            aria-label={`Remove ${c.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => setFilters(() => defaultFilterState())}
        className="cursor-pointer font-mono text-[10.5px] uppercase tracking-wider text-text-muted underline-offset-2 hover:text-text-bright hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
