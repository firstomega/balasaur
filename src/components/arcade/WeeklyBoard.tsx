import { Avatar } from "@/components/balasaur/Avatar";
import type { WeeklyBoardRow } from "@/lib/arcade";
import { cn } from "@/lib/utils";
import { CometMark } from "./CometChip";

// The weekly comet board's rows, shared by the hub teaser and the full
// board. Every row shows rank, face, name and the comet count, so the order
// is reconstructable from the page. The viewer's own row is lit and tagged.
// Public profiles live at /@handle, a literal prefix the typed router would
// percent-encode, so the name is a plain anchor.

export function WeeklyRow({
  row,
  you = false,
  showCountry = false,
}: {
  row: WeeklyBoardRow;
  you?: boolean;
  showCountry?: boolean;
}) {
  const name = row.display_name?.trim() || row.username;
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 py-1.5 text-[13.5px]",
        you ? "text-text-bright" : "text-text",
      )}
    >
      <span
        className={cn(
          "w-6 shrink-0 font-mono text-[12px] tabular-nums",
          you ? "text-primary" : "text-text-dim",
        )}
      >
        {row.rank}
      </span>
      <Avatar
        username={row.username}
        displayName={row.display_name}
        preset={row.avatar_preset}
        size={26}
      />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <a href={`/@${row.username}`} className="truncate hover:text-primary hover:underline">
          {name}
        </a>
        {you && (
          <span className="shrink-0 rounded-full border border-primary/50 px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-primary">
            you
          </span>
        )}
        {showCountry && row.country && (
          <span className="shrink-0 font-mono text-[10.5px] uppercase text-text-dim">
            {row.country}
          </span>
        )}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[13px] tabular-nums">
        <CometMark className="h-3.5 w-3.5 text-primary" />
        {row.comets}
      </span>
    </div>
  );
}

/** The rows, with the viewer's row pinned under a rule when it sits past
 *  `limit`. `me` is the viewer's username, null when signed out. */
export function WeeklyBoardList({
  rows,
  me,
  limit,
  showCountry = false,
  className,
}: {
  rows: WeeklyBoardRow[];
  me: string | null;
  /** Show only the first N rows; the viewer's row is pinned below if later. */
  limit?: number;
  showCountry?: boolean;
  className?: string;
}) {
  const top = limit ? rows.slice(0, limit) : rows;
  const mine = me ? rows.find((r) => r.username === me) : undefined;
  const pinned = mine && !top.some((r) => r.username === mine.username) ? mine : null;
  return (
    <div className={className}>
      {top.map((row) => (
        <WeeklyRow
          key={row.username}
          row={row}
          you={row.username === me}
          showCountry={showCountry}
        />
      ))}
      {pinned && (
        <>
          <div className="my-1 border-t border-border" aria-hidden="true" />
          <WeeklyRow row={pinned} you showCountry={showCountry} />
        </>
      )}
    </div>
  );
}
