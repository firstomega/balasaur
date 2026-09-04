import { cn } from "@/lib/utils";

// The end-screen board: top five rows, then your row below a separator if
// you placed outside them. Mono table, no avatars. Every row shows rank,
// name, score, and time, so the order is reconstructable from the page.

export interface SnippetRow {
  rank: number;
  name: string;
  score: number;
  durationMs: number;
}

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function BoardRow({ row, you = false }: { row: SnippetRow; you?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-2 py-1 font-mono text-[12.5px]",
        you ? "text-primary" : "text-text",
      )}
    >
      <span className={cn("w-6 shrink-0 tabular-nums", you ? "text-primary" : "text-text-dim")}>
        {row.rank}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {row.name}
        {you ? " (you)" : ""}
      </span>
      <span className="shrink-0 tabular-nums">{row.score}</span>
      <span className={cn("w-10 shrink-0 text-right tabular-nums", you ? "" : "text-text-dim")}>
        {fmtTime(row.durationMs)}
      </span>
    </div>
  );
}

export function LeaderboardSnippet({
  rows,
  you,
}: {
  rows: SnippetRow[];
  /** Your row, rendered below a separator when it is not already in the
   *  top five. */
  you?: SnippetRow | null;
}) {
  const top = rows.slice(0, 5);
  if (top.length === 0 && !you) return null;
  const youShownAbove = !!you && top.some((r) => r.rank === you.rank);

  return (
    <div>
      {top.map((row) => (
        <BoardRow key={row.rank} row={row} you={!!you && row.rank === you.rank} />
      ))}
      {you && !youShownAbove && (
        <>
          {top.length > 0 && <div className="my-1 border-t border-border" aria-hidden="true" />}
          <BoardRow row={you} you />
        </>
      )}
    </div>
  );
}
