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
 * colour, it takes the leader's second swatch instead. Otherwise it gets null,
 * the neutral paper tile: a leader with no swatch, a tile with no leader, and a
 * repeat whose leader has no second swatch. Paper never borrows a colour the
 * poster does not have, and it breaks a run (The Godfather and The Return of
 * the King both read noir and lead many lists, with no second swatch).
 *
 * Pure and width-free: the same list paints the same way at every screen width
 * and for every visitor, so it is safe in cached server HTML.
 */
export function paintTiles(leads: readonly (PaintLead | null | undefined)[]): (SwatchKey | null)[] {
  const out: (SwatchKey | null)[] = [];
  let prev: SwatchKey | null = null;
  for (const lead of leads) {
    let pick: SwatchKey | null = lead?.swatch ?? null;
    if (pick !== null && pick === prev) pick = lead?.swatchAlt ?? null;
    out.push(pick);
    prev = pick;
  }
  return out;
}
