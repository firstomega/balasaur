import { memo, useCallback, useMemo, useState } from "react";
import {
  buildEpisodeHeatmap,
  ratingBand,
  type EpisodeRating,
  type SeasonSize,
} from "@/lib/episodes";
import { cn } from "@/lib/utils";

// One column per season, one cell per episode. The colour is the only thing a
// cell says, so the scale is printed under the grid: five swatches with the
// rating each band starts at. Nothing here animates, so there is nothing for
// prefers-reduced-motion to turn off.

/** Five steps, low to high: red, orange, amber, yellow-green, then the site's rating green.
 *  These paint the legend swatches. The cells themselves are painted by the
 *  `[&_.b0]:bg-[…]` rules on the grid below, which have to spell each hex out
 *  literally for Tailwind to see it. Change a colour in both places. Doing it
 *  this way keeps a cell down to `<span class="b3"></span>`: The Simpsons is
 *  792 cells, and an inline style on each one was 35 KB of HTML on a page
 *  Google is already slow to crawl. */
const BAND_HEX = ["#d1584f", "#e0955a", "#e8c96a", "#c6df85", "#9fe6a0"] as const;
const BAND_CLASS = ["b0", "b1", "b2", "b3", "b4"] as const;
/** The rating each band starts at, in the same order. */
const BAND_FLOOR = ["<6", "6", "7", "8", "9"] as const;
/** An episode nobody rated. Neutral on purpose: a grey cell is not a bad episode. */
const NO_RATING_CLASS = "bx";
const CELL_STYLE =
  "[&_.b0]:bg-[#d1584f] [&_.b1]:bg-[#e0955a] [&_.b2]:bg-[#e8c96a] [&_.b3]:bg-[#c6df85] [&_.b4]:bg-[#9fe6a0] [&_.bx]:bg-[#1f242c] [&_span:hover]:ring-1 [&_span:hover]:ring-white/70 [&_span]:block [&_span]:h-[var(--cell-h)] [&_span]:rounded-[1px]";

/**
 * Cell width cap, by how many columns there are. Only a cap: the grid tracks
 * are `minmax(8px, cap)`, so a phone shrinks them to fit and a desktop gets
 * the full size. A three-season show would otherwise draw three hairlines on a
 * 700px column, and a thirty-season show would need a scrollbar on both.
 */
function maxCellWidth(seasonCount: number): number {
  if (seasonCount <= 4) return 64;
  if (seasonCount <= 8) return 48;
  if (seasonCount <= 16) return 34;
  return 26;
}

/** Every season is labelled while the labels fit; past that, every fifth. */
function labelStep(seasonCount: number): number {
  return seasonCount <= 12 ? 1 : 5;
}

/**
 * Which seasons get a number under their column, and how it sits in a column
 * that may be 8px wide. The first and last are always named, pinned to their
 * outside edges so they overflow inwards over empty columns instead of being
 * clipped by the scroll box. A tick landing next to either one is dropped
 * rather than printed on top of it.
 */
function columnLabel(
  season: number,
  i: number,
  count: number,
  step: number,
): { show: boolean; align: string } {
  if (step === 1) return { show: true, align: "text-center" };
  if (i === 0) return { show: true, align: "text-left" };
  if (i === count - 1) return { show: true, align: "text-right" };
  return { show: i > 1 && i < count - 2 && season % step === 0, align: "text-center" };
}

/** A column is one season: its episodes in order, with a gap where a rating is missing. */
interface Column {
  season: number;
  /** Index into the flat episode list, or null for an episode with no rating. */
  slots: (number | null)[];
}

interface Model {
  columns: Column[];
  episodes: EpisodeRating[];
  cellWidth: number;
  cellHeight: number;
  sentence: string;
  rated: number;
  expected: number;
}

/** Longest column, in pixels, before cells start getting shorter than square. */
const GRID_TARGET_HEIGHT = 320;
/** A column stops here. Nothing in the catalog reaches it; a bad episode number would. */
const MAX_COLUMN = 300;

function buildModel(rows: EpisodeRating[], seasons: SeasonSize[]): Model | null {
  const map = buildEpisodeHeatmap(rows, seasons);
  if (!map) return null;

  const episodes: EpisodeRating[] = [];
  const columns: Column[] = map.seasons.map((s) => {
    const byNumber = new Map(s.episodes.map((e) => [e.episode, e]));
    const first = s.episodes[0].episode;
    const last = s.episodes[s.episodes.length - 1].episode;
    const end = Math.min(last, first + MAX_COLUMN - 1);
    const slots: (number | null)[] = [];
    for (let n = first; n <= end; n++) {
      const ep = byNumber.get(n);
      if (!ep) {
        slots.push(null);
        continue;
      }
      slots.push(episodes.push(ep) - 1);
    }
    return { season: s.season, slots };
  });

  const longest = columns.reduce((m, c) => Math.max(m, c.slots.length), 1);
  const cellWidth = maxCellWidth(columns.length);
  // Keep the block from becoming a tower. A two-season show is two columns
  // wide, so its cells become bricks rather than 40px squares stacked 300px
  // high; a long-running show is already wide and gets the full height.
  const gridWidth = columns.length * cellWidth + (columns.length - 1) * 2;
  const targetHeight = Math.min(GRID_TARGET_HEIGHT, Math.max(120, Math.round(gridWidth * 1.4)));
  return {
    columns,
    episodes,
    cellWidth,
    cellHeight: Math.max(4, Math.min(cellWidth, Math.floor(targetHeight / longest))),
    sentence: map.sentence,
    rated: map.rated,
    expected: map.expected,
  };
}

let dateFmt: Intl.DateTimeFormat | null = null;
function airDateLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  try {
    dateFmt ??= new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    return dateFmt.format(d);
  } catch {
    return iso;
  }
}

function episodeTitle(ep: EpisodeRating): string {
  return ep.name?.trim() || `Episode ${ep.episode}`;
}

/**
 * The cells. Split out and memoized because hovering changes only the line
 * under the grid, and a long-running show is a thousand cells to re-render.
 * One listener on the container reads the cell index off the target, so a cell
 * carries no handlers of its own.
 */
const Cells = memo(function Cells({
  model,
  onPick,
  onClear,
  label,
}: {
  model: Model;
  onPick: (index: number | null) => void;
  onClear: () => void;
  label: string;
}) {
  // A cell carries no id: its column is its position in the grid and its row is
  // its position in that column, which is two array lookups and keeps the cell
  // markup to a class name.
  const pick = useCallback(
    (e: { target: EventTarget | null }) => {
      const cell = e.target as HTMLElement;
      const column = cell.parentElement;
      const grid = column?.parentElement;
      if (cell.tagName !== "SPAN" || !column || !grid) return;
      const ci = Array.prototype.indexOf.call(grid.children, column);
      const ri = Array.prototype.indexOf.call(column.children, cell);
      onPick(model.columns[ci]?.slots[ri] ?? null);
    },
    [model, onPick],
  );

  // A finger gets the same readout as a cursor, but only a cursor takes it
  // away: a touch pointer is destroyed the moment it lifts, and clearing on
  // that wiped the line a tap had just filled in.
  const leave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse") onClear();
    },
    [onClear],
  );

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("grid justify-start gap-[2px]", CELL_STYLE)}
      style={
        {
          gridTemplateColumns: `repeat(${model.columns.length}, minmax(8px, ${model.cellWidth}px))`,
          "--cell-h": `${model.cellHeight}px`,
        } as React.CSSProperties
      }
      onMouseOver={pick}
      onPointerDown={pick}
      onPointerLeave={leave}
    >
      {model.columns.map((c) => (
        <div key={c.season} className="flex flex-col gap-[2px]">
          {c.slots.map((i, idx) => (
            <span
              key={idx}
              className={
                i === null ? NO_RATING_CLASS : BAND_CLASS[ratingBand(model.episodes[i].rating)]
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
});

export interface EpisodeHeatmapProps {
  /** Every stored episode rating for the show, in any order. */
  rows: EpisodeRating[];
  /** Season sizes from the catalog row, the denominator for the coverage gate. */
  seasons: SeasonSize[];
  className?: string;
}

/**
 * Renders nothing unless the show has ratings for at least 60% of its episodes
 * across at least two seasons. That gate lives in `buildEpisodeHeatmap`; a
 * partial grid would be a lie about the show.
 */
export function EpisodeHeatmap({ rows, seasons, className }: EpisodeHeatmapProps) {
  const [active, setActive] = useState<number | null>(null);
  const model = useMemo(() => buildModel(rows, seasons), [rows, seasons]);
  const clear = useCallback(() => setActive(null), []);
  if (!model) return null;

  const step = labelStep(model.columns.length);
  const columnTemplate = `repeat(${model.columns.length}, minmax(8px, ${model.cellWidth}px))`;
  const ep = active === null ? null : (model.episodes[active] ?? null);

  return (
    <section className={cn(className)}>
      <h2 className="mb-2 text-[18px] font-black tracking-[-0.02em] text-text-bright">
        Episode ratings
      </h2>

      <div className="overflow-x-auto pb-1">
        <Cells
          model={model}
          onPick={setActive}
          onClear={clear}
          label={`Episode ratings by season. ${model.sentence}`}
        />
        <div
          className="mt-1 grid justify-start gap-[2px]"
          style={{ gridTemplateColumns: columnTemplate }}
        >
          {model.columns.map((c, i) => {
            const label = columnLabel(c.season, i, model.columns.length, step);
            return (
              <div
                key={c.season}
                aria-hidden="true"
                className={cn(
                  "whitespace-nowrap font-mono text-[9px] leading-4 text-text-dim",
                  label.align,
                )}
              >
                {label.show ? c.season : ""}
              </div>
            );
          })}
        </div>
      </div>

      {/* One slot, two jobs: the scale until a cell is picked, then that
          episode. Its height is fixed at two lines so a long episode title
          does not shove the sentence below it down the page. */}
      <div className="mt-2 flex min-h-[44px] flex-wrap items-start gap-x-4 gap-y-1">
        {ep ? (
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] text-text-bright">
            <span className="font-mono text-[11px] tabular-nums text-text-dim">
              S{ep.season}E{ep.episode}
            </span>
            <span>{episodeTitle(ep)}</span>
            <span className="font-mono text-[11px] tabular-nums text-rating">
              {ep.rating.toFixed(1)}
            </span>
            {ep.airDate ? (
              <span className="font-mono text-[11px] text-text-dim">
                {airDateLabel(ep.airDate)}
              </span>
            ) : null}
          </p>
        ) : (
          <>
            <div className="flex items-end gap-[3px]">
              {BAND_HEX.map((hex, i) => (
                <div key={hex}>
                  <span
                    className="block h-[10px] w-[18px] rounded-[1px]"
                    style={{ background: hex }}
                  />
                  <span className="mt-0.5 block text-center font-mono text-[9px] tabular-nums text-text-dim">
                    {BAND_FLOOR[i]}
                  </span>
                </div>
              ))}
            </div>
            <p className="font-mono text-[11px] tabular-nums text-text-dim">
              {model.rated.toLocaleString("en-US")} of {model.expected.toLocaleString("en-US")}{" "}
              episodes rated on TMDB
            </p>
          </>
        )}
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-text-muted">{model.sentence}</p>
    </section>
  );
}
