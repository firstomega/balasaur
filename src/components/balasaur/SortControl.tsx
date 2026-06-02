import type { SortKey } from "@/types/filters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Dropdown (not tabs) so the list can grow past a handful of options without
// crowding the toolbar. Rating-based sorts (per-source / Balasaur Score) are
// intentionally held back for a dedicated pass.
const OPTIONS: { value: SortKey; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "topRated", label: "Top rated" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "az", label: "Title A–Z" },
  { value: "za", label: "Title Z–A" },
];

export function SortControl({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  // "trending" is retired and not offered; show it as Popular (its behavior).
  const current = value === "trending" ? "popular" : value;
  return (
    <Select value={current} onValueChange={(v) => onChange(v as SortKey)}>
      <SelectTrigger
        aria-label="Sort"
        className="h-8 w-[136px] rounded-[4px] border-border bg-panel px-2 font-mono text-[10.5px] uppercase tracking-wider text-text-bright"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-border bg-panel">
        {OPTIONS.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="cursor-pointer font-mono text-[10.5px] uppercase tracking-wider text-text-muted focus:text-text-bright"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
