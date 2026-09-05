import { cn } from "@/lib/utils";

// The share grid as it looks on screen: the emoji rows from share.ts drawn
// as colored squares, so the player sees exactly what they are about to
// send. Green is a hit, red a miss, black an unused slot, yellow over par or
// a hint. Anything in a row that is not a square (a " +3" overflow count)
// renders as mono text after the squares.

export type GridCell =
  | { kind: "square"; tone: "green" | "red" | "black" | "yellow" }
  | { kind: "text"; text: string };

const SQUARES: Record<string, GridCell> = {
  "🟩": { kind: "square", tone: "green" },
  "🟥": { kind: "square", tone: "red" },
  "⬛": { kind: "square", tone: "black" },
  "🟨": { kind: "square", tone: "yellow" },
  "🟧": { kind: "square", tone: "yellow" },
};

/** Split one share row into squares and leftover text. Pure, tested. */
export function gridCells(row: string): GridCell[] {
  const cells: GridCell[] = [];
  let text = "";
  for (const ch of row) {
    const square = SQUARES[ch];
    if (square) {
      if (text.trim()) cells.push({ kind: "text", text: text.trim() });
      text = "";
      cells.push(square);
    } else {
      text += ch;
    }
  }
  if (text.trim()) cells.push({ kind: "text", text: text.trim() });
  return cells;
}

const TONE_CLASS: Record<Extract<GridCell, { kind: "square" }>["tone"], string> = {
  green: "bg-rating",
  red: "bg-destructive",
  black: "bg-border-strong",
  yellow: "bg-media-movie",
};

export function ResultGrid({
  rows,
  size = 22,
  className,
}: {
  /** The emoji rows exactly as share.ts builds them. */
  rows: string[];
  /** Square size in px. */
  size?: number;
  className?: string;
}) {
  const shown = rows.filter((r) => r.trim().length > 0);
  if (shown.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1", className)} aria-hidden="true">
      {shown.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1">
          {gridCells(row).map((cell, j) =>
            cell.kind === "square" ? (
              <span
                key={j}
                className={cn("inline-block rounded-[4px]", TONE_CLASS[cell.tone])}
                style={{ width: size, height: size }}
              />
            ) : (
              <span key={j} className="ml-1 font-mono text-[12px] tabular-nums text-text-muted">
                {cell.text}
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}
