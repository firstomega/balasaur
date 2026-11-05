import type { SwatchKey } from "./posterSwatch";

/** What a tile needs to be painted: its leading title's two swatches. */
export interface PaintLead {
  swatch: SwatchKey | null;
  swatchAlt: SwatchKey | null;
}

/**
 * The colour of each tile in a row or grid of list tiles, in order.
 *
 * A tile takes its leading title's swatch, so its colour can be explained from
 * the poster peeking on it. When the tile right before it was painted the same
 * colour, it takes the leader's second swatch instead. A leader with no second
 * swatch keeps the repeat: painting it a colour its poster does not have would
 * break that explanation. A leader with no swatch at all, or a tile with no
 * leader, gets null, the neutral paper tile.
 *
 * Pure and width-free: the same list paints the same way at every screen width
 * and for every visitor, so it is safe in cached server HTML.
 */
export function paintTiles(leads: readonly (PaintLead | null | undefined)[]): (SwatchKey | null)[] {
  const out: (SwatchKey | null)[] = [];
  let prev: SwatchKey | null = null;
  for (const lead of leads) {
    let pick: SwatchKey | null = lead?.swatch ?? null;
    if (pick !== null && pick === prev && lead?.swatchAlt) pick = lead.swatchAlt;
    out.push(pick);
    prev = pick;
  }
  return out;
}
