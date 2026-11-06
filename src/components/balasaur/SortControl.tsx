import type { SortKey } from "@/types/filters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Dropdown (not tabs) so the list can grow past a handful of options without
// crowding the toolbar. "Popular" is the blended rank (rank_score) and
// "Top rated" the Balasaur Score; per-source rating sorts are intentionally
// held back for a dedicated pass.
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
  // The label is passed in explicitly. Left empty, Radix fills the box only
  // after the page's script runs, so the server HTML showed a blank sort box
  // on every first load.
  const label = OPTIONS.find((o) => o.value === current)?.label ?? "Popular";
  return (
    <Select value={current} onValueChange={(v) => onChange(v as SortKey)}>
      <SelectTrigger
        aria-label="Sort"
        className="h-8 w-[136px] rounded-full border-border bg-panel px-3 text-base font-semibold text-text-bright"
      >
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent className="rounded-xl border-border bg-background">
        {OPTIONS.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="cursor-pointer text-base font-semibold text-text-muted focus:text-text-bright"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
