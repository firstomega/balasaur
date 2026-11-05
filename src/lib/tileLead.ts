import type { SwatchKey } from "./posterSwatch";
import type { MediaItem } from "@/types/media";

/**
 * The list's leading title, the first one with a poster: its poster is the one
 * that peeks on the list's tile, and its swatch paints the tile. A tile whose
 * neighbour already has that colour takes swatchAlt; with neither, it sits on
 * the neutral paper tile (see paintWall.ts).
 */
export interface TileLead {
  id: string;
  posterUrl: string;
  swatch: SwatchKey | null;
  swatchAlt: SwatchKey | null;
  /** The leading title's name, for the tile's "{title} leads at {score}". */
  title: string;
  /** Its trusted Balasaur Score, or null when the trust rule hides it. */
  score: number | null;
  /** True when this title holds the list's first place. A list whose first
   *  title has no poster peeks its second, and that one does not "lead". */
  first: boolean;
}

/** The first card in list order that has a poster, as a tile lead. */
export function leadOfItems(items: MediaItem[]): TileLead | null {
  const at = items.findIndex((i) => !!i.posterUrl);
  if (at < 0) return null;
  const it = items[at];
  return {
    id: it.id,
    posterUrl: it.posterUrl,
    swatch: it.swatch ?? null,
    swatchAlt: it.swatchAlt ?? null,
    title: it.title,
    score: typeof it.ratings.balasaur === "number" ? it.ratings.balasaur : null,
    first: at === 0,
  };
}

/** The line under a list tile's name: who leads it and at what score, when that
 *  score may be shown; otherwise how many titles it holds. */
export function tileFactLine(lead: TileLead | null, itemCount: number): string {
  if (lead && lead.first && lead.score !== null) return `${lead.title} leads at ${lead.score}`;
  const n = Math.max(0, Math.floor(itemCount));
  return `${n.toLocaleString("en-US")} ${n === 1 ? "title" : "titles"}`;
}
