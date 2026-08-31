import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { getWatchlistAvailability } from "@/lib/catalog.functions";

// "3 titles on your watchlist are streaming now" — the reason to come back.
// Renders nothing until the viewer has a watchlist with matches in their region.
export function WatchlistNudge({ wantIds, region }: { wantIds: Set<string>; region: string }) {
  const ids = useMemo(() => [...wantIds].sort(), [wantIds]);

  const { data } = useQuery({
    queryKey: ["watchlist-availability", ids.join(","), region],
    queryFn: () => getWatchlistAvailability({ data: { ids, region } }),
    enabled: ids.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  if (!data || data.total === 0) return null;

  const names = data.items.map((i) => i.title);
  const providers = [...new Set(data.items.flatMap((i) => i.providers))].slice(0, 3);
  const shown = names.slice(0, 2).join(", ");
  const rest = data.total - Math.min(2, names.length);

  return (
    <Link
      to="/lists"
      className="mb-4 flex items-center gap-2.5 rounded-[5px] border border-[#e8b84b]/40 bg-[#e8b84b]/10 px-3 py-2.5 transition-colors hover:border-[#e8b84b]/70"
    >
      <Play className="h-3.5 w-3.5 shrink-0 text-[#e8b84b]" />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-wider text-text-bright">
        {data.total === 1
          ? `${shown} from your watchlist is streaming now`
          : `${data.total} watchlist titles streaming now · ${shown}${rest > 0 ? ` +${rest}` : ""}`}
        {providers.length > 0 && (
          <span className="ml-1.5 text-text-muted">on {providers.join(", ")}</span>
        )}
      </span>
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-[#e8b84b]">
        View →
      </span>
    </Link>
  );
}
