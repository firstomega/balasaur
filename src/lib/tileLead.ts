import type { SwatchKey } from "./posterSwatch";
import type { MediaItem } from "@/types/media";

/**
 * The list's leading title, the first one with a poster: its poster is the one
 * that peeks on the list's tile, and its swatch paints the tile. A tile whose
 * neighbour already has that colour takes swatchAlt; with neither, it sits on
 * the neutral paper tile.
 */
export interface TileLead {
  id: string;
  posterUrl: string;
  swatch: SwatchKey | null;
  swatchAlt: SwatchKey | null;
}

/** The first card in list order that has a poster, as a tile lead. */
export function leadOfItems(items: MediaItem[]): TileLead | null {
  const it = items.find((i) => !!i.posterUrl);
  if (!it) return null;
  return {
    id: it.id,
    posterUrl: it.posterUrl,
    swatch: it.swatch ?? null,
    swatchAlt: it.swatchAlt ?? null,
  };
}
