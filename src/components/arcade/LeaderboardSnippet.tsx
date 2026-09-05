import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/balasaur/Avatar";
import { cn } from "@/lib/utils";
import { CometMark } from "./CometChip";

// A short board: top five rows, then your row below a separator if you
// placed outside them. Avatar, name linked to the public profile when the
// row carries a handle, the number, and the time. Every row shows rank,
// name and score, so the order is reconstructable from the page.

export interface SnippetRow {
  rank: number;
  /** Display name, or the handle when there is no display name. */
  name: string;
  score: number;
  durationMs: number;
  /** Public profile handle; the name links to /<handle> when present. */
  handle?: string;
  /** Avatar preset key, when the profile has one. */
  avatarPreset?: string | null;
}

/** The label a row shows. The viewer's own row reads "You" when it has no
 *  real name, and "<name>" plus a small "you" tag when it does; never both. */
export function rowLabel(row: SnippetRow, you: boolean): { name: string; tag: boolean } {
  const name = row.name.trim();
  if (!you) return { name: name || row.handle || "", tag: false };
  if (!name || name.toLowerCase() === "you") return { name: "You", tag: false };
  return { name, tag: true };
}

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function BoardRow({
  row,
  you = false,
  unit,
  showTime,
}: {
  row: SnippetRow;
  you?: boolean;
  unit: "comets" | "score";
  showTime: boolean;
}) {
  const label = rowLabel(row, you);
  const handle = row.handle;
  const name = handle ? (
    <Link
      to="/$handle"
      params={{ handle }}
      className="truncate hover:text-[var(--game,var(--primary))] hover:underline"
    >
      {label.name}
    </Link>
  ) : (
    <span className="truncate">{label.name}</span>
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 py-1.5 text-[13px]",
        you ? "text-text-bright" : "text-text",
      )}
    >
      <span
        className={cn(
          "w-5 shrink-0 font-mono text-[12px] tabular-nums",
          you ? "text-[var(--game,var(--primary))]" : "text-text-dim",
        )}
      >
        {row.rank}
      </span>
      <Avatar
        username={handle ?? row.name}
        displayName={row.name}
        preset={row.avatarPreset}
        size={24}
      />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {name}
        {label.tag && (
          <span className="shrink-0 rounded-full border border-[color-mix(in_oklab,var(--game,var(--primary))_50%,transparent)] px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-[var(--game,var(--primary))]">
            you
          </span>
        )}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[12.5px] tabular-nums">
        {unit === "comets" && (
          <CometMark className="h-3.5 w-3.5 text-[var(--game,var(--primary))]" />
        )}
        {row.score}
      </span>
      {showTime && (
        <span
          className={cn(
            "w-10 shrink-0 text-right font-mono text-[12px] tabular-nums",
            you ? "" : "text-text-dim",
          )}
        >
          {fmtTime(row.durationMs)}
        </span>
      )}
    </div>
  );
}

export function LeaderboardSnippet({
  rows,
  you,
  unit = "score",
  showTime = true,
}: {
  rows: SnippetRow[];
  /** Your row, rendered below a separator when it is not already in the
   *  top five. */
  you?: SnippetRow | null;
  /** "comets" draws the comet mark beside the number (weekly boards). */
  unit?: "comets" | "score";
  showTime?: boolean;
}) {
  const top = rows.slice(0, 5);
  if (top.length === 0 && !you) return null;
  const youShownAbove = !!you && top.some((r) => r.rank === you.rank);

  return (
    <div>
      {top.map((row) => (
        <BoardRow
          key={row.rank}
          row={row}
          you={!!you && row.rank === you.rank}
          unit={unit}
          showTime={showTime}
        />
      ))}
      {you && !youShownAbove && (
        <>
          {top.length > 0 && <div className="my-1 border-t border-border" aria-hidden="true" />}
          <BoardRow row={you} you unit={unit} showTime={showTime} />
        </>
      )}
    </div>
  );
}
