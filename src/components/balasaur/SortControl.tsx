import type { SortKey } from "@/types/filters";

const OPTIONS: { value: SortKey; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
  { value: "topRated", label: "Top rated" },
];

export function SortControl({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  return (
    <div className="inline-flex rounded-[4px] border border-border bg-panel p-[2px]">
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              "cursor-pointer rounded-[3px] px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-wider transition-colors " +
              (active
                ? "bg-accent text-text-bright"
                : "text-text-muted hover:text-text-bright")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}