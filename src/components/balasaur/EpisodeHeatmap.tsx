import { memo, useCallback, useMemo, useState } from "react";
import {
  buildEpisodeHeatmap,
  scaleBand,
  RAMP_STEPS,
  type EpisodeRating,
  type RatingScale,
  type SeasonSize,
} from "@/lib/episodes";
import { cn } from "@/lib/utils";

// One column per season, one cell per episode. The colour is the only thing a
// cell says, so the ramp is printed beside the grid with the rating at each of
// its ends, and every season carries its own average under its column.
// Nothing here animates, so there is nothing for prefers-reduced-motion to
// turn off.

/** Seven steps, dark to bright. The lightness climbs about ten points a step,
 *  which is what makes a 9.3 season read as the strongest column instead of
 *  another patch of yellow-green; it also survives being seen in grey.
 *  These paint the legend. The cells are painted by the `[&_.r0]:bg-[…]` rules
 *  below, which have to spell each hex out literally for Tailwind to see it.
 *  Change a colour in both places. Doing it this way keeps a cell down to
 *  `<span class="r3"></span>`: The Simpsons is 792 cells, and an inline style
 *  on each one was 35 KB of HTML on a page Google is already slow to crawl. */
const RAMP_MASTER = [
  "#6b2f31",
  "#8a4032",
  "#a95c33",
  "#c07f36",
  "#cda63f",
  "#c6cd5b",
  "#a9f78b",
  "#7fe08a",
  "#5fd58c",
] as const;

/**
 * Which seven of the nine the show gets. Hue has to mean the same thing on
 * every page: red is a bad episode, green is a great one. The first version
 * stretched the full red-to-green ramp across whatever range the show happened
 * to occupy, so a show whose worst season still averaged 7.2 was painted in
 * dark red and read as a disaster before the eye reached the legend. The
 * window is chosen from the show's own floor instead, so the seven steps carry
 * position within the show while the colours keep telling the truth about
 * quality. A show that really is bad still starts at red.
 */
export function rampWindow(lo: number): number {
  const start = Math.round(lo) - 3;
  return Math.min(RAMP_MASTER.length - RAMP_STEPS, Math.max(0, start));
}

function rampHex(lo: number): string[] {
  const start = rampWindow(lo);
  return RAMP_MASTER.slice(start, start + RAMP_STEPS) as unknown as string[];
}

const RAMP_CLASS = ["r0", "r1", "r2", "r3", "r4", "r5", "r6"] as const;
const NO_RATING_CLASS = "rx";
const CELL_STYLE =
  "[&_.r0]:bg-[var(--c0)] [&_.r1]:bg-[var(--c1)] [&_.r2]:bg-[var(--c2)] [&_.r3]:bg-[var(--c3)] [&_.r4]:bg-[var(--c4)] [&_.r5]:bg-[var(--c5)] [&_.r6]:bg-[var(--c6)] [&_.rx]:bg-[#1f242c] [&_span:hover]:ring-1 [&_span:hover]:ring-white/70 [&_span]:block [&_span]:h-[var(--cell-h)] [&_span]:rounded-[1px]";

/** The seven window colours as custom properties, set once on the grid. */
function rampVars(lo: number): Record<string, string> {
  const hex = rampHex(lo);
  return Object.fromEntries(hex.map((h, i) => [`--c${i}`, h]));
}

/**
 * Cell width cap, by how many columns there are. Only a cap: the grid tracks
 * are `minmax(8px, cap)`, so a phone shrinks them to fit and a desktop gets
 * the full size. A three-season show would otherwise draw three hairlines on a
 * 700px column, and a thirty-season show would need a scrollbar on both.
 */
function maxCellWidth(seasonCount: number): number {
  if (seasonCount <= 4) return 72;
  if (seasonCount <= 8) return 60;
  if (seasonCount <= 16) return 34;
  return 26;
}

/**
 * The gap between seasons. Without it the columns fuse into one block and the
 * shape of a season stops being a thing you can see. It shrinks as the show
 * gets longer so ten seasons still fit a 390px phone without a scrollbar.
 */
function seasonGap(seasonCount: number): number {
  if (seasonCount <= 8) return 8;
  if (seasonCount <= 12) return 6;
  return 4;
}

/** Past this many columns an average per season stops fitting under one. */
const DENSE_SEASONS = 12;

/** A column is one season: its episodes in order, with a gap where a rating is missing. */
interface Column {
  season: number;
  average: number;
  /** Index into the flat episode list, or null for an episode with no rating. */
  slots: (number | null)[];
}

interface Model {
  columns: Column[];
  episodes: EpisodeRating[];
  cellWidth: number;
  cellHeight: number;
  gap: number;
  gridWidth: number;
  peakSeason: number;
  scale: RatingScale;
  sentence: string;
  rated: number;
  expected: number;
}

/** Longest column, in pixels, before cells start getting shorter than square. */
const GRID_TARGET_HEIGHT = 340;
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
    return { season: s.season, average: s.average, slots };
  });

  const longest = columns.reduce((m, c) => Math.max(m, c.slots.length), 1);
  const cellWidth = maxCellWidth(columns.length);
  const gap = seasonGap(columns.length);
  // Keep the block from becoming a tower. A two-season show is two columns
  // wide, so its cells become bricks rather than 40px squares stacked 300px
  // high; a long-running show is already wide and gets the full height.
  const gridWidth = columns.length * cellWidth + (columns.length - 1) * gap;
  const targetHeight = Math.min(GRID_TARGET_HEIGHT, Math.max(120, Math.round(gridWidth * 1.4)));
  return {
    columns,
    episodes,
    cellWidth,
    cellHeight: Math.max(4, Math.min(cellWidth, Math.floor(targetHeight / longest))),
    gap,
    gridWidth,
    peakSeason: map.peak.season,
    scale: map.scale,
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
 * beside the grid, and a long-running show is a thousand cells to re-render.
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
      className={cn("grid justify-start", CELL_STYLE)}
      style={
        {
          gridTemplateColumns: `repeat(${model.columns.length}, minmax(8px, ${model.cellWidth}px))`,
          columnGap: `${model.gap}px`,
          "--cell-h": `${model.cellHeight}px`,
          ...rampVars(model.scale.lo),
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
                i === null
                  ? NO_RATING_CLASS
                  : RAMP_CLASS[scaleBand(model.episodes[i].rating, model.scale)]
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

  const count = model.columns.length;
  const dense = count > DENSE_SEASONS;
  const columnTemplate = `repeat(${count}, minmax(8px, ${model.cellWidth}px))`;
  const ep = active === null ? null : (model.episodes[active] ?? null);
  const peakIndex = model.columns.findIndex((c) => c.season === model.peakSeason);
  const ramp = rampHex(model.scale.lo);
  const topHex = ramp[RAMP_STEPS - 1];

  return (
    <section className={cn(className)}>
      <h2 className="mb-3 text-[18px] font-black tracking-[-0.02em] text-text-bright">
        Episode ratings
      </h2>

      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
        <div
          className="min-w-0 overflow-x-auto pb-1 md:shrink-0"
          style={{ maxWidth: `${model.gridWidth}px` }}
        >
          <Cells
            model={model}
            onPick={setActive}
            onClear={clear}
            label={`Episode ratings by season. ${model.sentence}`}
          />
          {/* The season axis. Each column carries its own average, which is the
              number the caption's claim is made of, and the strongest season
              gets the bar and the bright type so it is found before the caption
              is read. */}
          <div
            aria-hidden="true"
            className="mt-1.5 grid justify-start"
            style={{ gridTemplateColumns: columnTemplate, columnGap: `${model.gap}px` }}
          >
            {model.columns.map((c, i) => {
              const peak = c.season === model.peakSeason;
              const label = axisLabel(c.season, i, count, dense, peak, peakIndex);
              return (
                <div key={c.season} className={cn("min-w-0", label.align)}>
                  <div
                    className="h-[3px] rounded-[1px]"
                    style={{ background: peak ? topHex : "transparent" }}
                  />
                  <div
                    className={cn(
                      "mt-1 whitespace-nowrap text-[10px] leading-[13px]",
                      peak ? "font-bold text-text-bright" : "text-text-dim",
                    )}
                  >
                    {label.number ? label.text : ""}
                  </div>
                  <div
                    className={cn(
                      "whitespace-nowrap font-mono text-[11px] leading-[15px] tabular-nums",
                      peak ? "font-bold text-text-bright" : "text-text-muted",
                    )}
                  >
                    {label.average ? c.average.toFixed(1) : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {/* One slot, two jobs: the ramp until a cell is picked, then that
              episode. Its height is fixed so a long episode title does not
              shove the caption down the page. */}
          <div className="min-h-[52px]">
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
                <div className="flex max-w-[220px] gap-[2px]">
                  {ramp.map((hex) => (
                    <span
                      key={hex}
                      className="h-[10px] flex-1 rounded-[1px]"
                      style={{ background: hex }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex max-w-[220px] justify-between font-mono text-[11px] tabular-nums text-text-dim">
                  <span>{model.scale.lo.toFixed(1)}</span>
                  <span>{model.scale.hi.toFixed(1)}</span>
                </div>
                <p className="mt-2 font-mono text-[11px] tabular-nums text-text-dim">
                  {model.rated.toLocaleString("en-US")} of {model.expected.toLocaleString("en-US")}{" "}
                  episodes rated on TMDB
                </p>
              </>
            )}
          </div>

          <p className="mt-3 max-w-[46ch] text-[14px] leading-relaxed text-text-muted">
            {model.sentence}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * What fits under one column. Every season is named while the labels fit. Past
 * that only the first, the last, the peak and every fifth are, a tick that
 * would land on top of one of those is dropped, and the averages go with them.
 * The peak keeps its number and its average no matter how long the show ran.
 */
function axisLabel(
  season: number,
  i: number,
  count: number,
  dense: boolean,
  peak: boolean,
  peakIndex: number,
): { number: boolean; average: boolean; align: string; text: string } {
  if (!dense || peak) {
    return { number: true, average: true, align: "text-center", text: `S${season}` };
  }
  const text = String(season);
  const clearOfPeak = Math.abs(i - peakIndex) > 1;
  if (i === 0) {
    return { number: clearOfPeak, average: false, align: "text-left", text };
  }
  if (i === count - 1) {
    return { number: clearOfPeak, average: false, align: "text-right", text };
  }
  return {
    number: clearOfPeak && i > 1 && i < count - 2 && season % 5 === 0,
    average: false,
    align: "text-center",
    text,
  };
}
