import { CalendarClock, Flame, Gem, Sparkles } from "lucide-react";
import { useHomeRails } from "@/hooks/useCatalog";
import type { MediaItem } from "@/types/media";
import { MediaCard } from "./MediaCard";
import { ScrollRail } from "./ScrollRail";

// Curated on-ramps above the grid: horizontal rails so a casual visitor gets
// somewhere to start instead of a wall of 65k posters. Shown only on the
// unfiltered default view (any filter/sort choice means the visitor already
// knows what they're looking for — the rails would just push their results
// below the fold).
//
// Visually distinct from the grid on purpose: the rails live in a bordered
// panel band, each with an accent icon, and carry per-rail poster overlays —
// rank numerals on Trending, release-date chips on New & Noteworthy / Coming
// Soon — so they read as editorial shelves, not more grid.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-28" → "Aug 28" (with year when it isn't the current year). */
function shortDate(iso?: string): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const label = `${MONTHS[m - 1]} ${d}`;
  return y === new Date().getFullYear() ? label : `${label} ${y}`;
}

function DateChip({ iso }: { iso?: string }) {
  const label = shortDate(iso);
  if (!label) return null;
  return (
    <span className="rounded-[4px] bg-background/85 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-text-bright backdrop-blur-sm">
      {label}
    </span>
  );
}

/** Big translucent rank numeral, Netflix-top-10 style. */
function RankNumeral({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="font-mono text-[30px] font-bold leading-none text-white/95 [text-shadow:0_2px_10px_rgba(0,0,0,0.95),0_0_2px_rgba(0,0,0,0.9)]"
    >
      {n}
    </span>
  );
}

const RAILS: Array<{
  key: keyof ReturnType<typeof emptyRails>;
  title: string;
  Icon: typeof Flame;
  iconClass: string;
  overlay?: (item: MediaItem, index: number) => React.ReactNode;
}> = [
  {
    key: "trending",
    title: "Trending This Week",
    Icon: Flame,
    iconClass: "text-orange-400",
    overlay: (_item, i) => <RankNumeral n={i + 1} />,
  },
  {
    key: "newAndNoteworthy",
    title: "New & Noteworthy",
    Icon: Sparkles,
    iconClass: "text-primary",
    overlay: (item) => <DateChip iso={item.releaseDate} />,
  },
  {
    key: "comingSoon",
    title: "Coming Soon",
    Icon: CalendarClock,
    iconClass: "text-media-tv",
    overlay: (item) => <DateChip iso={item.releaseDate} />,
  },
  {
    key: "hiddenGems",
    title: "Hidden Gems",
    Icon: Gem,
    iconClass: "text-rating",
  },
];

function emptyRails() {
  return {
    trending: [] as MediaItem[],
    newAndNoteworthy: [] as MediaItem[],
    comingSoon: [] as MediaItem[],
    hiddenGems: [] as MediaItem[],
  };
}

export function HomeRails({
  boostCountry,
  onQuickWatch,
  watchedIds,
}: {
  boostCountry?: string;
  onQuickWatch?: (item: MediaItem) => void;
  watchedIds?: Set<string>;
}) {
  const { data } = useHomeRails(boostCountry);
  if (!data) return null; // loading or failed — the grid stands on its own

  return (
    <div className="mb-6 space-y-5 rounded-[6px] border border-border bg-panel/40 p-3 sm:p-4">
      {RAILS.map(({ key, title, Icon, iconClass, overlay }) => {
        const items = data[key];
        if (!items || items.length === 0) return null;
        return (
          <section key={key} aria-label={title}>
            <h2 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-bright">
              <Icon className={`h-3.5 w-3.5 ${iconClass}`} aria-hidden="true" />
              {title}
            </h2>
            <ScrollRail className="gap-3">
              {items.map((item, i) => (
                <div key={item.id} className="w-[124px] shrink-0 sm:w-[140px]">
                  <MediaCard
                    item={item}
                    onQuickWatch={onQuickWatch}
                    watched={watchedIds?.has(item.id)}
                    posterOverlay={overlay?.(item, i)}
                  />
                </div>
              ))}
            </ScrollRail>
          </section>
        );
      })}
    </div>
  );
}
